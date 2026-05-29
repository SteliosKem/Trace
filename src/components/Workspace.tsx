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
const DND_MIME = "application/x-trace-gate";

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
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tool, setTool] = useState<Tool>("pan");
    const [clipboard, setClipboard] = useState<
        { kind: GateKind; x: number; y: number } | null
    >(null);
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

    function deleteNode(id: string) {
        setNodes((prev) => prev.filter((n) => n.id !== id));
        setConnections((prev) =>
            prev.filter(
                (c) => c.from.nodeId !== id && c.to.nodeId !== id,
            ),
        );
        setSelectedId((s) => (s === id ? null : s));
    }

    function copyNode(id: string) {
        const n = nodes.find((nn) => nn.id === id);
        if (n) setClipboard({ kind: n.kind, x: n.x, y: n.y });
    }

    function duplicateNode(id: string) {
        const n = nodes.find((nn) => nn.id === id);
        if (!n) return;
        const newId = String(nextIdRef.current++);
        setNodes((prev) => [
            ...prev,
            { id: newId, kind: n.kind, x: n.x + 4, y: n.y + 4 },
        ]);
        setSelectedId(newId);
    }

    function pasteClipboard(at?: { x: number; y: number }) {
        if (!clipboard) return;
        const cfg = GATES[clipboard.kind];
        const newId = String(nextIdRef.current++);
        const w = cfg.width / SVG_SCALE;
        const h = cfg.height / SVG_SCALE;
        const x = at ? at.x - w / 2 : clipboard.x + 4;
        const y = at ? at.y - h / 2 : clipboard.y + 4;
        setNodes((prev) => [...prev, { id: newId, kind: clipboard.kind, x, y }]);
        setSelectedId(newId);
    }

    // keyboard shortcuts (delete/copy/paste/duplicate)
    const stateRef = useRef({ nodes, selectedId, clipboard });
    stateRef.current = { nodes, selectedId, clipboard };
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
            if (t.closest(".sidebar")) return; // sidebar owns its own delete handling

            const { selectedId, clipboard, nodes } = stateRef.current;
            const mod = e.metaKey || e.ctrlKey;
            const k = e.key.toLowerCase();

            if (selectedId && (e.key === "Backspace" || e.key === "Delete")) {
                e.preventDefault();
                deleteNode(selectedId);
            } else if (mod && k === "c" && selectedId) {
                e.preventDefault();
                copyNode(selectedId);
            } else if (mod && k === "v") {
                e.preventDefault();
                pasteClipboard();
            } else if (mod && k === "d" && selectedId) {
                e.preventDefault();
                duplicateNode(selectedId);
            } else if (e.key === "Escape") {
                setSelectedId(null);
                setMenu(null);
            }
            void nodes; void clipboard;
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
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
        setSelectedId(id);
    }

    function addNode(kind: GateKind) {
        if (!menu) return;
        addNodeAt(kind, menu.worldX, menu.worldY);
        setMenu(null);
    }

    function clientToWorld(rect: DOMRect, clientX: number, clientY: number) {
        return {
            x: (clientX - rect.left - offset.x) / scale,
            y: (clientY - rect.top - offset.y) / scale,
        };
    }

    function onDragOver(e: React.DragEvent<HTMLDivElement>) {
        if (!Array.from(e.dataTransfer.types).includes(DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }

    function onDrop(e: React.DragEvent<HTMLDivElement>) {
        const kind = e.dataTransfer.getData(DND_MIME) as GateKind;
        if (!kind) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const w = clientToWorld(rect, e.clientX, e.clientY);
        addNodeAt(kind, w.x, w.y);
    }

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
        setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
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

    function onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        if (pending) return; // don't pan while wiring
        setSelectedId(null); // clicked empty workspace → deselect
        e.currentTarget.setPointerCapture(e.pointerId);
        panDragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
        };
        setIsDragging(true);
    }

    function onPointerMove(e: React.PointerEvent<HTMLElement>) {
        // pan
        const d = panDragRef.current;
        if (d) {
            setOffset({
                x: d.startOffsetX + (e.clientX - d.startClientX),
                y: d.startOffsetY + (e.clientY - d.startClientY),
            });
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

    function onPointerUp(e: React.PointerEvent<HTMLElement>) {
        if (panDragRef.current) {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            panDragRef.current = null;
            setIsDragging(false);
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
        <section className={"workspace" + (isDragging ? " dragging" : "")}>
            <Toolbar tool={tool} onToolChange={setTool} />
            <div
                className="workspace-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
                onContextMenu={onContextMenu}
                onDragOver={onDragOver}
                onDrop={onDrop}
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
                        selected={selectedId === n.id}
                        onSelect={() => setSelectedId(n.id)}
                        onMove={(x, y) => moveNode(n.id, x, y)}
                        onPinDown={(kind, idx) => startConnection(n.id, kind, idx)}
                        onPinUp={(kind, idx) => tryFinishConnection(n.id, kind, idx)}
                        onNodeContextMenu={(cx, cy) => openNodeMenu(n.id, cx, cy)}
                    />
                ))}
            </div>
            <div className="workspace-vignette" />
            </div>
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
                            copyNode(menu.targetNodeId!);
                            setMenu(null);
                        }}
                    >
                        Copy
                    </button>
                    <button
                        className="ctx-item"
                        onClick={() => {
                            duplicateNode(menu.targetNodeId!);
                            setMenu(null);
                        }}
                    >
                        Duplicate
                    </button>
                    <button
                        className="ctx-item danger"
                        onClick={() => {
                            deleteNode(menu.targetNodeId!);
                            setMenu(null);
                        }}
                    >
                        Delete
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
                                Paste {clipboard.kind.toUpperCase()}
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
