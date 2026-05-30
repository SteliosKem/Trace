import { useEffect, useRef, useState } from "react";
import Node, {
    GATES,
    SVG_SCALE,
    type GateKind,
    type PinKind,
} from "./Node";
import Toolbar, { type Tool } from "./Toolbar";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const GRID_SIZE = 5;

type NodeInstance = { id: string; kind: GateKind; x: number; y: number };
type PinRef = { nodeId: string; pinKind: PinKind; pinIndex: number };
type Connection = { id: string; from: PinRef; to: PinRef }; // from = output, to = input
type Pending = { from: PinRef; cursor: { x: number; y: number } };
type ClipboardData = {
    nodes: { kind: GateKind; x: number; y: number }[];
    edges: {
        fromIdx: number;
        fromPin: number;
        toIdx: number;
        toPin: number;
    }[];
};

export default function Workspace() {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(MAX_SCALE);
    const [isDragging, setIsDragging] = useState(false);
    const [nodes, setNodes] = useState<NodeInstance[]>([
        { id: "1", kind: "not", x: 30, y: 30 },
        { id: "2", kind: "and", x: 60, y: 30 },
        { id: "3", kind: "or", x: 90, y: 30 },
    ]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [pending, setPending] = useState<Pending | null>(null);
    const pendingFinishedRef = useRef(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [tool, setTool] = useState<Tool>("pan");
    const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
    const [ghostDrag, setGhostDrag] = useState<{
        kind: GateKind;
        screenX: number;
        screenY: number;
    } | null>(null);
    const [marquee, setMarquee] = useState<{
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    } | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const selectedIdSet = new Set(selectedIds);
    const [menu, setMenu] = useState<{
        screenX: number;
        screenY: number;
        worldX: number;
        worldY: number;
        targetNodeId: string | null;
    } | null>(null);
    const nextIdRef = useRef(4);
    const nextConnIdRef = useRef(0);

    function deleteConnection(id: string) {
        setConnections((prev) => prev.filter((c) => c.id !== id));
    }

    function deleteNodes(ids: string[]) {
        if (ids.length === 0) return;
        const set = new Set(ids);
        setNodes((prev) => prev.filter((n) => !set.has(n.id)));
        setConnections((prev) =>
            prev.filter(
                (c) => !set.has(c.from.nodeId) && !set.has(c.to.nodeId),
            ),
        );
        setSelectedIds((prev) => prev.filter((id) => !set.has(id)));
    }

    function gatherSelection(ids: string[]): ClipboardData {
        const set = new Set(ids);
        const items = nodes.filter((n) => set.has(n.id));
        const idToIdx = new Map(items.map((n, i) => [n.id, i] as const));
        const edges = connections
            .filter(
                (c) => idToIdx.has(c.from.nodeId) && idToIdx.has(c.to.nodeId),
            )
            .map((c) => ({
                fromIdx: idToIdx.get(c.from.nodeId)!,
                fromPin: c.from.pinIndex,
                toIdx: idToIdx.get(c.to.nodeId)!,
                toPin: c.to.pinIndex,
            }));
        console.log("[gatherSelection]", {
            ids,
            allNodes: nodes.map((n) => n.id),
            allConnections: connections.map((c) => ({
                from: c.from.nodeId,
                to: c.to.nodeId,
            })),
            pickedNodes: items.map((n) => n.id),
            pickedEdges: edges,
        });
        return {
            nodes: items.map((n) => ({ kind: n.kind, x: n.x, y: n.y })),
            edges,
        };
    }

    function copyNodes(ids: string[]) {
        const data = gatherSelection(ids);
        if (data.nodes.length === 0) return;
        setClipboard(data);
    }

    function spawnClipboard(data: ClipboardData, dx: number, dy: number) {
        const fresh: NodeInstance[] = data.nodes.map((n) => ({
            id: String(nextIdRef.current++),
            kind: n.kind,
            x: n.x + dx,
            y: n.y + dy,
        }));
        const freshEdges: Connection[] = data.edges.map((e) => ({
            id: `c${nextConnIdRef.current++}`,
            from: {
                nodeId: fresh[e.fromIdx].id,
                pinKind: "output",
                pinIndex: e.fromPin,
            },
            to: {
                nodeId: fresh[e.toIdx].id,
                pinKind: "input",
                pinIndex: e.toPin,
            },
        }));
        console.log("[spawnClipboard]", {
            dataNodes: data.nodes.length,
            dataEdges: data.edges.length,
            freshNodes: fresh.map((n) => n.id),
            freshEdges: freshEdges.map((e) => ({
                from: e.from.nodeId,
                to: e.to.nodeId,
            })),
        });
        setNodes((prev) => [...prev, ...fresh]);
        if (freshEdges.length) {
            setConnections((prev) => {
                console.log("[setConnections]", {
                    prev: prev.length,
                    adding: freshEdges.length,
                    next: prev.length + freshEdges.length,
                });
                return [...prev, ...freshEdges];
            });
        }
        setSelectedIds(fresh.map((n) => n.id));
    }

    function duplicateNodes(ids: string[]) {
        const data = gatherSelection(ids);
        if (data.nodes.length === 0) return;
        spawnClipboard(data, 4, 4);
    }

    function pasteClipboard(at?: { x: number; y: number }) {
        if (!clipboard || clipboard.nodes.length === 0) return;
        let dx: number, dy: number;
        if (at) {
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const item of clipboard.nodes) {
                const cfg = GATES[item.kind];
                const w = cfg.width / SVG_SCALE;
                const h = cfg.height / SVG_SCALE;
                if (item.x < minX) minX = item.x;
                if (item.y < minY) minY = item.y;
                if (item.x + w > maxX) maxX = item.x + w;
                if (item.y + h > maxY) maxY = item.y + h;
            }
            dx = at.x - (minX + maxX) / 2;
            dy = at.y - (minY + maxY) / 2;
        } else {
            dx = 4;
            dy = 4;
        }
        spawnClipboard(clipboard, dx, dy);
    }

    // keyboard shortcuts (delete/copy/paste/duplicate + shift-to-select)
    const stateRef = useRef({ nodes, selectedIds, clipboard, tool });
    stateRef.current = { nodes, selectedIds, clipboard, tool };
    const opsRef = useRef({
        copy: copyNodes,
        paste: pasteClipboard,
        duplicate: duplicateNodes,
        deleteIds: deleteNodes,
    });
    opsRef.current = {
        copy: copyNodes,
        paste: pasteClipboard,
        duplicate: duplicateNodes,
        deleteIds: deleteNodes,
    };
    useEffect(() => {
        let shiftPrevTool: Tool | null = null;

        function isInputLike(t: HTMLElement | null) {
            if (!t) return false;
            return (
                t.tagName === "INPUT" ||
                t.tagName === "TEXTAREA" ||
                t.isContentEditable
            );
        }

        function isEditing(t: HTMLElement | null) {
            if (!t) return false;
            if (isInputLike(t)) return true;
            if (t.closest(".sidebar")) return true;
            return false;
        }

        function onKey(e: KeyboardEvent) {
            // Shift → temporary marquee/select tool.
            // Block only if a text input is focused; allow even when sidebar tree-row has focus.
            if (e.key === "Shift" && !e.repeat) {
                if (isInputLike(e.target as HTMLElement)) return;
                if (shiftPrevTool === null) {
                    shiftPrevTool = stateRef.current.tool;
                    setTool("select");
                }
                return;
            }

            if (isEditing(e.target as HTMLElement)) return;

            const { selectedIds } = stateRef.current;
            const mod = e.metaKey || e.ctrlKey;
            const k = e.key.toLowerCase();
            const hasSel = selectedIds.length > 0;

            if (hasSel && (e.key === "Backspace" || e.key === "Delete")) {
                e.preventDefault();
                opsRef.current.deleteIds(selectedIds);
            } else if (mod && k === "c" && hasSel) {
                e.preventDefault();
                opsRef.current.copy(selectedIds);
            } else if (mod && k === "v") {
                e.preventDefault();
                opsRef.current.paste();
            } else if (mod && k === "d" && hasSel) {
                e.preventDefault();
                opsRef.current.duplicate(selectedIds);
            } else if (e.key === "Escape") {
                setSelectedIds([]);
                setMenu(null);
            }
        }

        function onKeyUp(e: KeyboardEvent) {
            if (e.key === "Shift" && shiftPrevTool !== null) {
                setTool(shiftPrevTool);
                shiftPrevTool = null;
            }
        }

        document.addEventListener("keydown", onKey);
        document.addEventListener("keyup", onKeyUp);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("keyup", onKeyUp);
        };
    }, []);

    function onContextMenu(e: React.MouseEvent<HTMLElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const wx = (e.clientX - rect.left - offset.x) / scale;
        const wy = (e.clientY - rect.top - offset.y) / scale;
        setMenu({
            screenX: e.clientX,
            screenY: e.clientY,
            worldX: wx,
            worldY: wy,
            targetNodeId: null,
        });
    }

    function openNodeMenu(nodeId: string, clientX: number, clientY: number) {
        setMenu({
            screenX: clientX,
            screenY: clientY,
            worldX: 0,
            worldY: 0,
            targetNodeId: nodeId,
        });
    }

    function addNodeAt(kind: GateKind, worldX: number, worldY: number) {
        const cfg = GATES[kind];
        const id = String(nextIdRef.current++);
        const x = worldX - cfg.width / SVG_SCALE / 2;
        const y = worldY - cfg.height / SVG_SCALE / 2;
        setNodes((prev) => [...prev, { id, kind, x, y }]);
        setSelectedIds([id]);
    }

    function startGateDrag(kind: GateKind, clientX: number, clientY: number) {
        setGhostDrag({ kind, screenX: clientX, screenY: clientY });
    }

    function addNode(kind: GateKind) {
        if (!menu) return;
        addNodeAt(kind, menu.worldX, menu.worldY);
        setMenu(null);
    }

    // ghost-drag effect: runs while a gate chip is being dragged from the toolbar
    const offsetRef = useRef(offset);
    offsetRef.current = offset;
    const scaleRef = useRef(scale);
    scaleRef.current = scale;
    useEffect(() => {
        if (!ghostDrag) return;
        const startKind = ghostDrag.kind;
        function onMove(e: MouseEvent) {
            setGhostDrag((g) =>
                g ? { ...g, screenX: e.clientX, screenY: e.clientY } : null,
            );
        }
        function onUp(e: MouseEvent) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                if (
                    e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom
                ) {
                    const wx =
                        (e.clientX - rect.left - offsetRef.current.x) /
                        scaleRef.current;
                    const wy =
                        (e.clientY - rect.top - offsetRef.current.y) /
                        scaleRef.current;
                    addNodeAt(startKind, wx, wy);
                }
            }
            setGhostDrag(null);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
    }, [ghostDrag?.kind]);

    useEffect(() => {
        if (!menu) return;
        function onDown(e: MouseEvent) {
            if (!(e.target as HTMLElement).closest(".ctx-menu")) setMenu(null);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setMenu(null);
        }
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menu]);

    function moveNode(id: string, x: number, y: number) {
        setNodes((prev) => {
            const target = prev.find((n) => n.id === id);
            if (!target) return prev;
            const dx = x - target.x;
            const dy = y - target.y;
            const sel = stateRef.current.selectedIds;
            if (sel.length > 1 && sel.includes(id)) {
                const set = new Set(sel);
                return prev.map((n) =>
                    set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
                );
            }
            return prev.map((n) => (n.id === id ? { ...n, x, y } : n));
        });
    }

    function pinWorldPos(node: NodeInstance, kind: PinKind, idx: number) {
        const cfg = GATES[node.kind];
        const pin = kind === "input" ? cfg.inputs[idx] : cfg.output;
        return {
            x: node.x + pin.x / SVG_SCALE,
            y: node.y + pin.y / SVG_SCALE,
        };
    }

    function startConnection(nodeId: string, kind: PinKind, idx: number) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const pos = pinWorldPos(node, kind, idx);
        setPending({
            from: { nodeId, pinKind: kind, pinIndex: idx },
            cursor: pos,
        });
        pendingFinishedRef.current = false;
    }

    function tryFinishConnection(nodeId: string, kind: PinKind, idx: number) {
        setPending((p) => {
            if (!p) return null;
            if (p.from.nodeId === nodeId && p.from.pinKind === kind && p.from.pinIndex === idx) return null;
            if (p.from.pinKind === kind) return null; // both same kind
            if (p.from.nodeId === nodeId) return null; // self-loop

            const from: PinRef =
                p.from.pinKind === "output"
                    ? p.from
                    : { nodeId, pinKind: "output", pinIndex: idx };
            const to: PinRef =
                p.from.pinKind === "input"
                    ? p.from
                    : { nodeId, pinKind: "input", pinIndex: idx };

            setConnections((cs) => {
                const exists = cs.some(
                    (c) =>
                        c.from.nodeId === from.nodeId &&
                        c.from.pinIndex === from.pinIndex &&
                        c.to.nodeId === to.nodeId &&
                        c.to.pinIndex === to.pinIndex,
                );
                return exists
                    ? cs
                    : [...cs, { id: `c${nextConnIdRef.current++}`, from, to }];
            });
            pendingFinishedRef.current = true;
            return null;
        });
    }

    const panDragRef = useRef<{
        startClientX: number;
        startClientY: number;
        startOffsetX: number;
        startOffsetY: number;
    } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        if (pending) return; // don't pan while wiring
        e.currentTarget.setPointerCapture(e.pointerId);
        if (tool === "select") {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
        } else {
            panDragRef.current = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                startOffsetX: offset.x,
                startOffsetY: offset.y,
            };
            setIsDragging(true);
        }
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        // pan
        const d = panDragRef.current;
        if (d) {
            setOffset({
                x: d.startOffsetX + (e.clientX - d.startClientX),
                y: d.startOffsetY + (e.clientY - d.startClientY),
            });
            return;
        }
        // marquee — update bottom-right
        if (marquee) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setMarquee((m) => (m ? { ...m, currentX: x, currentY: y } : null));
            return;
        }
        // pending connection — update cursor in world coords
        if (pending) {
            const rect = e.currentTarget.getBoundingClientRect();
            const wx = (e.clientX - rect.left - offset.x) / scale;
            const wy = (e.clientY - rect.top - offset.y) / scale;
            setPending((p) => (p ? { ...p, cursor: { x: wx, y: wy } } : null));
        }
    }

    function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (panDragRef.current) {
            const d = panDragRef.current;
            const moved =
                Math.abs(e.clientX - d.startClientX) > 2 ||
                Math.abs(e.clientY - d.startClientY) > 2;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            panDragRef.current = null;
            setIsDragging(false);
            if (!moved) {
                // it was a plain click on empty canvas → deselect
                setSelectedIds([]);
            }
            return;
        }
        if (marquee) {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            const left = Math.min(marquee.startX, marquee.currentX);
            const top = Math.min(marquee.startY, marquee.currentY);
            const right = Math.max(marquee.startX, marquee.currentX);
            const bottom = Math.max(marquee.startY, marquee.currentY);
            const wl = (left - offset.x) / scale;
            const wt = (top - offset.y) / scale;
            const wr = (right - offset.x) / scale;
            const wb = (bottom - offset.y) / scale;
            const matched: string[] = [];
            for (const n of nodes) {
                const cfg = GATES[n.kind];
                const nw = cfg.width / SVG_SCALE;
                const nh = cfg.height / SVG_SCALE;
                if (
                    n.x + nw > wl &&
                    n.x < wr &&
                    n.y + nh > wt &&
                    n.y < wb
                ) {
                    matched.push(n.id);
                }
            }
            setSelectedIds(matched);
            setMarquee(null);
            return;
        }
        if (pending && !pendingFinishedRef.current) {
            setPending(null);
        }
        pendingFinishedRef.current = false;
    }

    function onWheel(e: React.WheelEvent<HTMLElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const zoomFactor = Math.exp(-e.deltaY * 0.0015);
        const newScale = Math.max(
            MIN_SCALE,
            Math.min(MAX_SCALE, scale * zoomFactor),
        );
        if (newScale === scale) return;

        const k = newScale / scale;
        setOffset({
            x: mx - (mx - offset.x) * k,
            y: my - (my - offset.y) * k,
        });
        setScale(newScale);
    }

    return (
        <section
            className={
                "workspace" +
                (isDragging ? " dragging" : "") +
                (tool === "select" ? " tool-select" : "")
            }
        >
            <Toolbar
                tool={tool}
                onToolChange={setTool}
                onStartGateDrag={startGateDrag}
            />
            <div
                className="workspace-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
                onContextMenu={onContextMenu}
                ref={canvasRef}
            >
            <div
                className="workspace-grid"
                style={{
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
                }}
            />
            <div
                className="workspace-content"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                }}
            >
                <svg
                    className="cables"
                    width="1"
                    height="1"
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        overflow: "visible",
                    }}
                >
                    {connections.map((c) => {
                        const fromNode = nodes.find((n) => n.id === c.from.nodeId);
                        const toNode = nodes.find((n) => n.id === c.to.nodeId);
                        if (!fromNode || !toNode) return null;
                        const p1 = pinWorldPos(fromNode, "output", c.from.pinIndex);
                        const p2 = pinWorldPos(toNode, "input", c.to.pinIndex);
                        const d = orthPath(p1.x, p1.y, p2.x, p2.y);
                        return (
                            <g key={c.id} className="cable">
                                <path
                                    d={d}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth="1.6"
                                    pointerEvents="stroke"
                                    style={{ cursor: "pointer" }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteConnection(c.id);
                                    }}
                                />
                                <path
                                    className="cable-line"
                                    d={d}
                                    fill="none"
                                    stroke="rgba(220, 224, 232, 0.75)"
                                    strokeWidth="0.35"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    pointerEvents="none"
                                />
                            </g>
                        );
                    })}
                    {pending &&
                        (() => {
                            const fromNode = nodes.find(
                                (n) => n.id === pending.from.nodeId,
                            );
                            if (!fromNode) return null;
                            const p1 = pinWorldPos(
                                fromNode,
                                pending.from.pinKind,
                                pending.from.pinIndex,
                            );
                            return (
                                <path
                                    d={orthPath(p1.x, p1.y, pending.cursor.x, pending.cursor.y)}
                                    fill="none"
                                    stroke="rgba(220, 224, 232, 0.55)"
                                    strokeWidth="0.35"
                                    strokeDasharray="1 0.5"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            );
                        })()}
                </svg>
                {nodes.map((n) => (
                    <Node
                        key={n.id}
                        kind={n.kind}
                        x={n.x}
                        y={n.y}
                        scale={scale}
                        selected={selectedIdSet.has(n.id)}
                        onSelect={() => setSelectedIds([n.id])}
                        onMove={(x, y) => moveNode(n.id, x, y)}
                        onPinDown={(kind, idx) => startConnection(n.id, kind, idx)}
                        onPinUp={(kind, idx) => tryFinishConnection(n.id, kind, idx)}
                        onNodeContextMenu={(cx, cy) => openNodeMenu(n.id, cx, cy)}
                    />
                ))}
            </div>
            <div className="workspace-vignette" />
            {marquee && (
                <div
                    className="marquee"
                    style={{
                        left: Math.min(marquee.startX, marquee.currentX),
                        top: Math.min(marquee.startY, marquee.currentY),
                        width: Math.abs(marquee.currentX - marquee.startX),
                        height: Math.abs(marquee.currentY - marquee.startY),
                    }}
                />
            )}
            </div>
            {ghostDrag && (() => {
                const cfg = GATES[ghostDrag.kind];
                const w = (cfg.width / SVG_SCALE) * scale;
                const h = (cfg.height / SVG_SCALE) * scale;
                return (
                    <div
                        className="gate-ghost"
                        style={{
                            position: "fixed",
                            left: ghostDrag.screenX - w / 2,
                            top: ghostDrag.screenY - h / 2,
                            width: w,
                            height: h,
                            pointerEvents: "none",
                            zIndex: 2000,
                        }}
                    >
                        <svg
                            width={w}
                            height={h}
                            viewBox={`0 0 ${cfg.width} ${cfg.height}`}
                        >
                            <path
                                d={cfg.path}
                                fill="rgba(255, 255, 255, 0.12)"
                                stroke="rgba(138, 180, 255, 0.85)"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                );
            })()}
            {menu && menu.targetNodeId && (
                <div
                    className="ctx-menu"
                    style={{ top: menu.screenY, left: menu.screenX }}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        className="ctx-item"
                        onClick={() => {
                            copyNodes(selectedIds);
                            setMenu(null);
                        }}
                    >
                        Copy{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
                    </button>
                    <button
                        className="ctx-item"
                        onClick={() => {
                            duplicateNodes(selectedIds);
                            setMenu(null);
                        }}
                    >
                        Duplicate{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
                    </button>
                    <button
                        className="ctx-item danger"
                        onClick={() => {
                            deleteNodes(selectedIds);
                            setMenu(null);
                        }}
                    >
                        Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}
                    </button>
                </div>
            )}
            {menu && !menu.targetNodeId && (
                <div
                    className="ctx-menu"
                    style={{ top: menu.screenY, left: menu.screenX }}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="ctx-section">Add gate</div>
                    <button className="ctx-item" onClick={() => addNode("not")}>
                        NOT
                    </button>
                    <button className="ctx-item" onClick={() => addNode("and")}>
                        AND
                    </button>
                    <button className="ctx-item" onClick={() => addNode("or")}>
                        OR
                    </button>
                    {clipboard && (
                        <>
                            <div className="ctx-section">Clipboard</div>
                            <button
                                className="ctx-item"
                                onClick={() => {
                                    pasteClipboard({ x: menu.worldX, y: menu.worldY });
                                    setMenu(null);
                                }}
                            >
                                Paste{clipboard.nodes.length > 1 ? ` (${clipboard.nodes.length})` : ""}
                            </button>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}

function orthPath(x1: number, y1: number, x2: number, y2: number): string {
    const r = 1; // corner radius in world units
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (Math.abs(dy) < 0.001) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (Math.abs(dx) < 0.001) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const midX = x1 + dx / 2;
    const signX = Math.sign(dx);
    const signY = Math.sign(dy);
    const cr = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 2);

    return [
        `M ${x1} ${y1}`,
        `L ${midX - signX * cr} ${y1}`,
        `Q ${midX} ${y1} ${midX} ${y1 + signY * cr}`,
        `L ${midX} ${y2 - signY * cr}`,
        `Q ${midX} ${y2} ${midX + signX * cr} ${y2}`,
        `L ${x2} ${y2}`,
    ].join(" ");
}
