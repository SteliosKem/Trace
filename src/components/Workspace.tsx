import { useEffect, useRef, useState } from "react";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import Node, {
    GATES,
    SVG_SCALE,
    type GateKind,
    type PinKind,
} from "./Node";
import Toolbar, { type Tool } from "./Toolbar";

const FILE_VERSION = 1;

interface WorkspaceProps {
    filePath: string;
    active: boolean;
}

type SaveData = {
    version: number;
    nodes: NodeInstance[];
    connections: Connection[];
    junctions: Junction[];
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const GRID_SIZE = 5;

type NodeInstance = { id: string; kind: GateKind; x: number; y: number };
type PinEndpoint = { type: "pin"; nodeId: string; pinKind: PinKind; pinIndex: number };
type JunctionEndpoint = { type: "junction"; junctionId: string };
type Endpoint = PinEndpoint | JunctionEndpoint;
type PinRef = PinEndpoint; // alias for pending (always starts from a pin)
type Connection = {
    id: string;
    from: Endpoint;
    to: Endpoint;
    midX?: number;
    midY?: number;
};
type Pending = { from: PinRef; cursor: { x: number; y: number } };
type Junction = {
    id: string;
    hostCableId: string;
    segmentIdx: 0 | 1 | 2; // 0=h1, 1=vertical, 2=h2 of the Z-route
    t: number; // 0..1 along the chosen segment
};
type ClipboardData = {
    nodes: { kind: GateKind; x: number; y: number }[];
    edges: {
        fromIdx: number;
        fromPin: number;
        toIdx: number;
        toPin: number;
        midX?: number;
    }[];
    junctions: {
        hostEdgeIdx: number;
        segmentIdx: 0 | 1 | 2;
        t: number;
    }[];
    junctionEdges: {
        fromIdx: number;
        fromPin: number;
        toJunctionIdx: number;
        midX?: number;
        midY?: number;
    }[];
};

export default function Workspace({ filePath, active }: WorkspaceProps) {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(MAX_SCALE);
    const [isDragging, setIsDragging] = useState(false);
    const [nodes, setNodes] = useState<NodeInstance[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [pending, setPending] = useState<Pending | null>(null);
    const pendingFinishedRef = useRef(false);
    const nextJunctionIdRef = useRef(0);
    const midDragRef = useRef<{ id: string } | null>(null);
    const junctionDragRef = useRef<{
        id: string;
        startClient: { x: number; y: number };
        moved: boolean;
    } | null>(null);
    const [selectedJunctionIds, setSelectedJunctionIds] = useState<string[]>([]);
    const selectedJunctionSet = new Set(selectedJunctionIds);

    function deleteJunctions(ids: string[]) {
        if (ids.length === 0) return;
        const set = new Set(ids);
        setJunctions((prev) => prev.filter((j) => !set.has(j.id)));
        setConnections((prev) =>
            prev.filter((c) => {
                if (c.from.type === "junction" && set.has(c.from.junctionId)) return false;
                if (c.to.type === "junction" && set.has(c.to.junctionId)) return false;
                return true;
            }),
        );
        setSelectedJunctionIds((prev) => prev.filter((id) => !set.has(id)));
    }
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
    const nextIdRef = useRef(1);
    const nextConnIdRef = useRef(0);

    function deleteConnection(id: string) {
        setConnections((prev) => prev.filter((c) => c.id !== id));
    }

    function deleteNodes(ids: string[]) {
        if (ids.length === 0) return;
        const set = new Set(ids);
        setNodes((prev) => prev.filter((n) => !set.has(n.id)));
        setConnections((prev) =>
            prev.filter((c) => {
                const fromGone = c.from.type === "pin" && set.has(c.from.nodeId);
                const toGone = c.to.type === "pin" && set.has(c.to.nodeId);
                return !fromGone && !toGone;
            }),
        );
        setSelectedIds((prev) => prev.filter((id) => !set.has(id)));
    }

    function gatherSelection(ids: string[]): ClipboardData {
        const set = new Set(ids);
        const items = nodes.filter((n) => set.has(n.id));
        const idToIdx = new Map(items.map((n, i) => [n.id, i] as const));

        const pinEdges = connections.filter(
            (c) =>
                c.from.type === "pin" &&
                c.to.type === "pin" &&
                idToIdx.has(c.from.nodeId) &&
                idToIdx.has(c.to.nodeId),
        );
        const cableIdToIdx = new Map(
            pinEdges.map((c, i) => [c.id, i] as const),
        );

        const hostedJunctions = junctions.filter((j) =>
            cableIdToIdx.has(j.hostCableId),
        );
        const junctionIdToIdx = new Map(
            hostedJunctions.map((j, i) => [j.id, i] as const),
        );

        const junctionFeeders = connections.filter(
            (c) =>
                c.from.type === "pin" &&
                c.to.type === "junction" &&
                idToIdx.has(c.from.nodeId) &&
                junctionIdToIdx.has(c.to.junctionId),
        );

        return {
            nodes: items.map((n) => ({ kind: n.kind, x: n.x, y: n.y })),
            edges: pinEdges.map((c) => {
                const from = c.from as PinEndpoint;
                const to = c.to as PinEndpoint;
                return {
                    fromIdx: idToIdx.get(from.nodeId)!,
                    fromPin: from.pinIndex,
                    toIdx: idToIdx.get(to.nodeId)!,
                    toPin: to.pinIndex,
                    midX: c.midX,
                };
            }),
            junctions: hostedJunctions.map((j) => ({
                hostEdgeIdx: cableIdToIdx.get(j.hostCableId)!,
                segmentIdx: j.segmentIdx,
                t: j.t,
            })),
            junctionEdges: junctionFeeders.map((c) => {
                const from = c.from as PinEndpoint;
                const to = c.to as JunctionEndpoint;
                return {
                    fromIdx: idToIdx.get(from.nodeId)!,
                    fromPin: from.pinIndex,
                    toJunctionIdx: junctionIdToIdx.get(to.junctionId)!,
                    midX: c.midX,
                    midY: c.midY,
                };
            }),
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
                type: "pin",
                nodeId: fresh[e.fromIdx].id,
                pinKind: "output",
                pinIndex: e.fromPin,
            },
            to: {
                type: "pin",
                nodeId: fresh[e.toIdx].id,
                pinKind: "input",
                pinIndex: e.toPin,
            },
            midX: e.midX,
        }));
        const freshJunctions: Junction[] = data.junctions.map((j) => ({
            id: `j${nextJunctionIdRef.current++}`,
            hostCableId: freshEdges[j.hostEdgeIdx].id,
            segmentIdx: j.segmentIdx,
            t: j.t,
        }));
        const freshJunctionEdges: Connection[] = data.junctionEdges.map((e) => ({
            id: `c${nextConnIdRef.current++}`,
            from: {
                type: "pin",
                nodeId: fresh[e.fromIdx].id,
                pinKind: "output",
                pinIndex: e.fromPin,
            },
            to: {
                type: "junction",
                junctionId: freshJunctions[e.toJunctionIdx].id,
            },
            midX: e.midX,
            midY: e.midY,
        }));
        setNodes((prev) => [...prev, ...fresh]);
        const allFreshEdges = [...freshEdges, ...freshJunctionEdges];
        if (allFreshEdges.length) {
            setConnections((prev) => [...prev, ...allFreshEdges]);
        }
        if (freshJunctions.length) {
            setJunctions((prev) => [...prev, ...freshJunctions]);
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

    // load file contents into workspace on mount / when file path changes
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const text = await readTextFile(filePath);
                if (cancelled) return;
                if (!text.trim()) {
                    setNodes([]);
                    setConnections([]);
                    setJunctions([]);
                    nextIdRef.current = 1;
                    nextConnIdRef.current = 0;
                    nextJunctionIdRef.current = 0;
                    return;
                }
                const data = JSON.parse(text) as Partial<SaveData>;
                const loadedNodes = data.nodes ?? [];
                const loadedConns = data.connections ?? [];
                const loadedJuncs = data.junctions ?? [];
                setNodes(loadedNodes);
                setConnections(loadedConns);
                setJunctions(loadedJuncs);
                let maxN = 0;
                for (const n of loadedNodes) {
                    const m = parseInt(n.id, 10);
                    if (!isNaN(m) && m > maxN) maxN = m;
                }
                let maxC = -1;
                for (const c of loadedConns) {
                    const m = parseInt(c.id.replace(/^c/, ""), 10);
                    if (!isNaN(m) && m > maxC) maxC = m;
                }
                let maxJ = -1;
                for (const j of loadedJuncs) {
                    const m = parseInt(j.id.replace(/^j/, ""), 10);
                    if (!isNaN(m) && m > maxJ) maxJ = m;
                }
                nextIdRef.current = maxN + 1;
                nextConnIdRef.current = maxC + 1;
                nextJunctionIdRef.current = maxJ + 1;
            } catch (err) {
                console.error("workspace load failed:", err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [filePath]);

    // keyboard shortcuts (delete/copy/paste/duplicate + shift-to-select)
    const stateRef = useRef({
        nodes,
        connections,
        junctions,
        selectedIds,
        selectedJunctionIds,
        clipboard,
        tool,
    });
    stateRef.current = {
        nodes,
        connections,
        junctions,
        selectedIds,
        selectedJunctionIds,
        clipboard,
        tool,
    };

    async function saveFile() {
        const data: SaveData = {
            version: FILE_VERSION,
            nodes: stateRef.current.nodes,
            connections: stateRef.current.connections,
            junctions: stateRef.current.junctions,
        };
        try {
            await writeTextFile(filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error("workspace save failed:", err);
        }
    }

    const activeRef = useRef(active);
    activeRef.current = active;
    const opsRef = useRef({
        copy: copyNodes,
        paste: pasteClipboard,
        duplicate: duplicateNodes,
        deleteIds: deleteNodes,
        deleteJunctionIds: deleteJunctions,
    });
    opsRef.current = {
        copy: copyNodes,
        paste: pasteClipboard,
        duplicate: duplicateNodes,
        deleteIds: deleteNodes,
        deleteJunctionIds: deleteJunctions,
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

            const { selectedIds, selectedJunctionIds } = stateRef.current;
            const mod = e.metaKey || e.ctrlKey;
            const k = e.key.toLowerCase();
            const hasNodes = selectedIds.length > 0;
            const hasJunctions = selectedJunctionIds.length > 0;
            const hasAny = hasNodes || hasJunctions;

            if (mod && k === "s") {
                if (!activeRef.current) return;
                e.preventDefault();
                saveFile();
                return;
            }

            if (hasAny && (e.key === "Backspace" || e.key === "Delete")) {
                e.preventDefault();
                if (hasNodes) opsRef.current.deleteIds(selectedIds);
                if (hasJunctions)
                    opsRef.current.deleteJunctionIds(selectedJunctionIds);
            } else if (mod && k === "c" && hasNodes) {
                e.preventDefault();
                opsRef.current.copy(selectedIds);
            } else if (mod && k === "v") {
                e.preventDefault();
                opsRef.current.paste();
            } else if (mod && k === "d" && hasNodes) {
                e.preventDefault();
                opsRef.current.duplicate(selectedIds);
            } else if (e.key === "Escape") {
                setSelectedIds([]);
                setSelectedJunctionIds([]);
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
        const target = nodes.find((n) => n.id === id);
        if (!target) return;
        const dx = x - target.x;
        const dy = y - target.y;
        const sel = stateRef.current.selectedIds;

        if (sel.length > 1 && sel.includes(id)) {
            const set = new Set(sel);
            setNodes((prev) =>
                prev.map((n) =>
                    set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
                ),
            );

            // Shift the custom bends of cables whose endpoints are
            // entirely inside the selection. For a pin→junction cable, the
            // junction itself follows automatically (it's anchored to its
            // host cable's geometry), but only if that host cable is also
            // entirely inside the selection — so check that too.
            const cableInSelection = new Map<string, boolean>();
            const isPinSelected = (ep: Endpoint) =>
                ep.type === "pin" && set.has(ep.nodeId);
            for (const c of connections) {
                if (isPinSelected(c.from) && isPinSelected(c.to)) {
                    cableInSelection.set(c.id, true);
                }
            }
            const isInSelection = (c: Connection): boolean => {
                if (!isPinSelected(c.from)) return false;
                if (c.to.type === "pin") return set.has(c.to.nodeId);
                const jid = c.to.junctionId;
                const j = junctions.find((jj) => jj.id === jid);
                if (!j) return false;
                return cableInSelection.get(j.hostCableId) === true;
            };

            setConnections((cs) =>
                cs.map((c) => {
                    if (!isInSelection(c)) return c;
                    if (c.midX === undefined && c.midY === undefined) return c;
                    return {
                        ...c,
                        midX: c.midX !== undefined ? c.midX + dx : undefined,
                        midY: c.midY !== undefined ? c.midY + dy : undefined,
                    };
                }),
            );
            return;
        }

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

    function endpointWorldPos(ep: Endpoint): { x: number; y: number } | null {
        if (ep.type === "pin") {
            const node = nodes.find((n) => n.id === ep.nodeId);
            if (!node) return null;
            return pinWorldPos(node, ep.pinKind, ep.pinIndex);
        }
        const j = junctions.find((jj) => jj.id === ep.junctionId);
        if (!j) return null;
        return junctionWorldPos(j);
    }

    function cablePathKind(c: Connection, depth = 0): "hvh" | "vhv" {
        if (depth > 10) return "hvh"; // safety against pathological loops
        if (c.to.type !== "junction") return "hvh";
        const jid = c.to.junctionId;
        const j = junctions.find((jj) => jj.id === jid);
        if (!j) return "hvh";
        const host = connections.find((cc) => cc.id === j.hostCableId);
        if (!host) return "hvh";
        const hostKind = cablePathKind(host, depth + 1);
        // Is junction sitting on a horizontal piece of the host?
        const onHorizontal =
            (hostKind === "hvh" && (j.segmentIdx === 0 || j.segmentIdx === 2)) ||
            (hostKind === "vhv" && j.segmentIdx === 1);
        // Approach is perpendicular: horizontal host → vertical approach → vhv;
        //                            vertical host   → horizontal approach → hvh.
        return onHorizontal ? "vhv" : "hvh";
    }

    function cableDefaults(c: Connection, p1: { x: number; y: number }, p2: { x: number; y: number }) {
        const isJunction = c.to.type === "junction";
        const midX = c.midX ?? (isJunction ? p1.x : (p1.x + p2.x) / 2);
        const midY = c.midY ?? p1.y;
        return { midX, midY };
    }

    function junctionWorldPos(j: Junction): { x: number; y: number } | null {
        const host = connections.find((c) => c.id === j.hostCableId);
        if (!host) return null;
        const p1 = endpointWorldPos(host.from);
        const p2 = endpointWorldPos(host.to);
        if (!p1 || !p2) return null;
        const { midX, midY } = cableDefaults(host, p1, p2);
        return computeOnSegment(
            cablePathKind(host),
            j.segmentIdx,
            j.t,
            p1,
            p2,
            midX,
            midY,
        );
    }

    function computeOnSegment(
        pathKind: "hvh" | "vhv",
        segIdx: 0 | 1 | 2,
        t: number,
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        midX: number,
        midY: number,
    ): { x: number; y: number } {
        if (pathKind === "hvh") {
            if (segIdx === 0) return { x: p1.x + (midX - p1.x) * t, y: p1.y };
            if (segIdx === 1) return { x: midX, y: p1.y + (p2.y - p1.y) * t };
            return { x: midX + (p2.x - midX) * t, y: p2.y };
        }
        // vhv
        if (segIdx === 0) return { x: p1.x, y: p1.y + (midY - p1.y) * t };
        if (segIdx === 1) return { x: p1.x + (p2.x - p1.x) * t, y: midY };
        return { x: p2.x, y: midY + (p2.y - midY) * t };
    }

    function projectToCable(
        pathKind: "hvh" | "vhv",
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        midX: number,
        midY: number,
        wx: number,
        wy: number,
    ): { segmentIdx: 0 | 1 | 2; t: number } {
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        if (pathKind === "hvh") {
            const h1Dist = Math.abs(wy - p1.y);
            const vDist = Math.abs(wx - midX);
            const h2Dist = Math.abs(wy - p2.y);
            if (h1Dist <= vDist && h1Dist <= h2Dist) {
                const len = midX - p1.x;
                return {
                    segmentIdx: 0,
                    t: len === 0 ? 0 : clamp((wx - p1.x) / len),
                };
            }
            if (vDist <= h2Dist) {
                const len = p2.y - p1.y;
                return {
                    segmentIdx: 1,
                    t: len === 0 ? 0 : clamp((wy - p1.y) / len),
                };
            }
            const len = p2.x - midX;
            return {
                segmentIdx: 2,
                t: len === 0 ? 0 : clamp((wx - midX) / len),
            };
        }
        // vhv
        const v1Dist = Math.abs(wx - p1.x);
        const hDist = Math.abs(wy - midY);
        const v2Dist = Math.abs(wx - p2.x);
        if (v1Dist <= hDist && v1Dist <= v2Dist) {
            const len = midY - p1.y;
            return {
                segmentIdx: 0,
                t: len === 0 ? 0 : clamp((wy - p1.y) / len),
            };
        }
        if (hDist <= v2Dist) {
            const len = p2.x - p1.x;
            return {
                segmentIdx: 1,
                t: len === 0 ? 0 : clamp((wx - p1.x) / len),
            };
        }
        const len = p2.y - midY;
        return {
            segmentIdx: 2,
            t: len === 0 ? 0 : clamp((wy - midY) / len),
        };
    }

    function dropOnCable(
        cable: Connection,
        clientX: number,
        clientY: number,
    ) {
        if (!pending) return false;
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        const wx = (clientX - rect.left - offset.x) / scale;
        const wy = (clientY - rect.top - offset.y) / scale;
        const p1 = endpointWorldPos(cable.from);
        const p2 = endpointWorldPos(cable.to);
        if (!p1 || !p2) return false;
        const { midX, midY } = cableDefaults(cable, p1, p2);
        const proj = projectToCable(
            cablePathKind(cable),
            p1,
            p2,
            midX,
            midY,
            wx,
            wy,
        );
        const jid = `j${nextJunctionIdRef.current++}`;
        setJunctions((js) => [
            ...js,
            {
                id: jid,
                hostCableId: cable.id,
                segmentIdx: proj.segmentIdx,
                t: proj.t,
            },
        ]);
        setConnections((cs) => [
            ...cs,
            {
                id: `c${nextConnIdRef.current++}`,
                from: pending.from,
                to: { type: "junction", junctionId: jid },
            },
        ]);
        pendingFinishedRef.current = true;
        setPending(null);
        return true;
    }

    function startConnection(nodeId: string, kind: PinKind, idx: number) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const pos = pinWorldPos(node, kind, idx);
        setPending({
            from: { type: "pin", nodeId, pinKind: kind, pinIndex: idx },
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
                    : { type: "pin", nodeId, pinKind: "output", pinIndex: idx };
            const to: PinRef =
                p.from.pinKind === "input"
                    ? p.from
                    : { type: "pin", nodeId, pinKind: "input", pinIndex: idx };

            setConnections((cs) => {
                const exists = cs.some(
                    (c) =>
                        c.from.type === "pin" &&
                        c.to.type === "pin" &&
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
                setSelectedJunctionIds([]);
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
                        const p1 = endpointWorldPos(c.from);
                        const p2 = endpointWorldPos(c.to);
                        if (!p1 || !p2) return null;
                        // pathKind: hvh = h-v-h (mid is vertical at midX);
                        //           vhv = v-h-v (mid is horizontal at midY)
                        let pathKind: "hvh" | "vhv" = "hvh";
                        if (c.to.type === "junction") {
                            const j = junctions.find(
                                (jj) => jj.id === (c.to as JunctionEndpoint).junctionId,
                            );
                            pathKind = j && j.segmentIdx === 1 ? "hvh" : "vhv";
                        }
                        const defaultMidX =
                            c.to.type === "junction" ? p1.x : (p1.x + p2.x) / 2;
                        const defaultMidY = p1.y;
                        const midX = c.midX ?? defaultMidX;
                        const midY = c.midY ?? defaultMidY;
                        const d =
                            pathKind === "hvh"
                                ? orthPath(p1.x, p1.y, p2.x, p2.y, midX)
                                : vhvPath(p1.x, p1.y, p2.x, p2.y, midY);
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
                                        if (pending) return;
                                        e.stopPropagation();
                                        deleteConnection(c.id);
                                    }}
                                    onPointerUp={(e) => {
                                        if (!pending) return;
                                        e.stopPropagation();
                                        dropOnCable(c, e.clientX, e.clientY);
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
                                {(() => {
                                    const horizSpan = Math.abs(p2.x - p1.x);
                                    const vertSpan = Math.abs(p2.y - p1.y);
                                    if (pathKind === "hvh") {
                                        if (vertSpan < 0.001) return null;
                                        return (
                                            <line
                                                className="cable-mid-handle"
                                                x1={midX}
                                                y1={Math.min(p1.y, p2.y)}
                                                x2={midX}
                                                y2={Math.max(p1.y, p2.y)}
                                                stroke="transparent"
                                                strokeWidth="1.6"
                                                pointerEvents="stroke"
                                                style={{ cursor: pending ? "pointer" : "ew-resize" }}
                                                onPointerDown={(e) => {
                                                    if (pending) return;
                                                    e.stopPropagation();
                                                    (e.currentTarget as SVGLineElement).setPointerCapture(e.pointerId);
                                                    midDragRef.current = { id: c.id };
                                                }}
                                                onPointerMove={(e) => {
                                                    if (!midDragRef.current) return;
                                                    e.stopPropagation();
                                                    const rect = canvasRef.current?.getBoundingClientRect();
                                                    if (!rect) return;
                                                    const wx = (e.clientX - rect.left - offset.x) / scale;
                                                    const cid = c.id;
                                                    setConnections((cs) =>
                                                        cs.map((con) =>
                                                            con.id === cid ? { ...con, midX: wx } : con,
                                                        ),
                                                    );
                                                }}
                                                onPointerUp={(e) => {
                                                    if (pending) {
                                                        e.stopPropagation();
                                                        dropOnCable(c, e.clientX, e.clientY);
                                                        return;
                                                    }
                                                    if (!midDragRef.current) return;
                                                    e.stopPropagation();
                                                    if ((e.currentTarget as SVGLineElement).hasPointerCapture(e.pointerId)) {
                                                        (e.currentTarget as SVGLineElement).releasePointerCapture(e.pointerId);
                                                    }
                                                    midDragRef.current = null;
                                                }}
                                            />
                                        );
                                    }
                                    if (horizSpan < 0.001) return null;
                                    return (
                                        <line
                                            className="cable-mid-handle"
                                            x1={Math.min(p1.x, p2.x)}
                                            y1={midY}
                                            x2={Math.max(p1.x, p2.x)}
                                            y2={midY}
                                            stroke="transparent"
                                            strokeWidth="1.6"
                                            pointerEvents="stroke"
                                            style={{ cursor: pending ? "pointer" : "ns-resize" }}
                                            onPointerDown={(e) => {
                                                if (pending) return;
                                                e.stopPropagation();
                                                (e.currentTarget as SVGLineElement).setPointerCapture(e.pointerId);
                                                midDragRef.current = { id: c.id };
                                            }}
                                            onPointerMove={(e) => {
                                                if (!midDragRef.current) return;
                                                e.stopPropagation();
                                                const rect = canvasRef.current?.getBoundingClientRect();
                                                if (!rect) return;
                                                const wy = (e.clientY - rect.top - offset.y) / scale;
                                                const cid = c.id;
                                                setConnections((cs) =>
                                                    cs.map((con) =>
                                                        con.id === cid ? { ...con, midY: wy } : con,
                                                    ),
                                                );
                                            }}
                                            onPointerUp={(e) => {
                                                if (pending) {
                                                    e.stopPropagation();
                                                    dropOnCable(c, e.clientX, e.clientY);
                                                    return;
                                                }
                                                if (!midDragRef.current) return;
                                                e.stopPropagation();
                                                if ((e.currentTarget as SVGLineElement).hasPointerCapture(e.pointerId)) {
                                                    (e.currentTarget as SVGLineElement).releasePointerCapture(e.pointerId);
                                                }
                                                midDragRef.current = null;
                                            }}
                                        />
                                    );
                                })()}
                            </g>
                        );
                    })}
                    {junctions.map((j) => {
                        const pos = junctionWorldPos(j);
                        if (!pos) return null;
                        const isSelected = selectedJunctionSet.has(j.id);
                        return (
                            <circle
                                key={j.id}
                                cx={pos.x}
                                cy={pos.y}
                                r={isSelected ? "0.9" : "0.7"}
                                fill={
                                    isSelected
                                        ? "var(--accent, #8ab4ff)"
                                        : "rgba(220, 224, 232, 0.95)"
                                }
                                stroke="rgba(15, 17, 20, 0.6)"
                                strokeWidth="0.2"
                                style={{ cursor: "grab" }}
                                onPointerDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    (
                                        e.currentTarget as SVGCircleElement
                                    ).setPointerCapture(e.pointerId);
                                    junctionDragRef.current = {
                                        id: j.id,
                                        startClient: { x: e.clientX, y: e.clientY },
                                        moved: false,
                                    };
                                }}
                                onPointerMove={(e) => {
                                    const d = junctionDragRef.current;
                                    if (!d || d.id !== j.id) return;
                                    e.stopPropagation();
                                    const dx = e.clientX - d.startClient.x;
                                    const dy = e.clientY - d.startClient.y;
                                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
                                    const host = connections.find(
                                        (cc) => cc.id === j.hostCableId,
                                    );
                                    if (!host) return;
                                    const hp1 = endpointWorldPos(host.from);
                                    const hp2 = endpointWorldPos(host.to);
                                    if (!hp1 || !hp2) return;
                                    const { midX: hmx, midY: hmy } = cableDefaults(host, hp1, hp2);
                                    const rect = canvasRef.current?.getBoundingClientRect();
                                    if (!rect) return;
                                    const wx = (e.clientX - rect.left - offset.x) / scale;
                                    const wy = (e.clientY - rect.top - offset.y) / scale;
                                    const proj = projectToCable(
                                        cablePathKind(host),
                                        hp1,
                                        hp2,
                                        hmx,
                                        hmy,
                                        wx,
                                        wy,
                                    );
                                    setJunctions((js) =>
                                        js.map((jj) =>
                                            jj.id === j.id
                                                ? { ...jj, segmentIdx: proj.segmentIdx, t: proj.t }
                                                : jj,
                                        ),
                                    );
                                }}
                                onPointerUp={(e) => {
                                    const d = junctionDragRef.current;
                                    if (!d || d.id !== j.id) return;
                                    e.stopPropagation();
                                    if (
                                        (e.currentTarget as SVGCircleElement).hasPointerCapture(
                                            e.pointerId,
                                        )
                                    ) {
                                        (
                                            e.currentTarget as SVGCircleElement
                                        ).releasePointerCapture(e.pointerId);
                                    }
                                    if (!d.moved) {
                                        // click → select just this junction
                                        setSelectedIds([]);
                                        setSelectedJunctionIds([j.id]);
                                    }
                                    junctionDragRef.current = null;
                                }}
                            />
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

function vhvPath(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    midY: number,
): string {
    const r = 1;
    if (Math.abs(x2 - x1) < 0.001 || Math.abs(y2 - y1) < 0.001) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const signY1 = Math.sign(midY - y1) || 1;
    const signY2 = Math.sign(y2 - midY) || 1;
    const signX = Math.sign(x2 - x1) || 1;
    const leg1 = Math.abs(midY - y1);
    const leg2 = Math.abs(y2 - midY);
    const cr = Math.min(r, leg1 / 2, leg2 / 2, Math.abs(x2 - x1) / 2);
    return [
        `M ${x1} ${y1}`,
        `L ${x1} ${midY - signY1 * cr}`,
        `Q ${x1} ${midY} ${x1 + signX * cr} ${midY}`,
        `L ${x2 - signX * cr} ${midY}`,
        `Q ${x2} ${midY} ${x2} ${midY + signY2 * cr}`,
        `L ${x2} ${y2}`,
    ].join(" ");
}

function orthPath(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    midX?: number,
): string {
    const r = 1; // corner radius in world units
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (Math.abs(dy) < 0.001) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (Math.abs(dx) < 0.001) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const m = midX ?? x1 + dx / 2;
    const signX1 = Math.sign(m - x1) || 1;
    const signX2 = Math.sign(x2 - m) || 1;
    const signY = Math.sign(dy);
    const leg1 = Math.abs(m - x1);
    const leg2 = Math.abs(x2 - m);
    const cr = Math.min(r, leg1 / 2, leg2 / 2, Math.abs(dy) / 2);

    return [
        `M ${x1} ${y1}`,
        `L ${m - signX1 * cr} ${y1}`,
        `Q ${m} ${y1} ${m} ${y1 + signY * cr}`,
        `L ${m} ${y2 - signY * cr}`,
        `Q ${m} ${y2} ${m + signX2 * cr} ${y2}`,
        `L ${x2} ${y2}`,
    ].join(" ");
}
