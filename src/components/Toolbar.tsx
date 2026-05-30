import { GATES, type GateKind } from "./Node";

export type Tool = "pan" | "select";

interface ToolbarProps {
    tool: Tool;
    onToolChange: (t: Tool) => void;
    onStartGateDrag: (kind: GateKind, clientX: number, clientY: number) => void;
}

export default function Toolbar({
    tool,
    onToolChange,
    onStartGateDrag,
}: ToolbarProps) {
    return (
        <div
            className="toolbar"
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <button
                className={"tool-btn" + (tool === "pan" ? " active" : "")}
                onClick={() => onToolChange("pan")}
                title="Pan"
            >
                <HandIcon />
            </button>
            <button
                className={"tool-btn" + (tool === "select" ? " active" : "")}
                onClick={() => onToolChange("select")}
                title="Select"
            >
                <PointerIcon />
            </button>

            <div className="toolbar-divider" />

            {(["not", "and", "or"] as GateKind[]).map((kind) => (
                <button
                    key={kind}
                    className="tool-btn gate-chip"
                    title={`Drag to add ${kind.toUpperCase()} gate`}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        onStartGateDrag(kind, e.clientX, e.clientY);
                    }}
                >
                    <GateMini kind={kind} />
                </button>
            ))}
        </div>
    );
}

function GateMini({ kind }: { kind: GateKind }) {
    const cfg = GATES[kind];
    return (
        <svg
            width={cfg.width / 3}
            height={cfg.height / 3}
            viewBox={`0 0 ${cfg.width} ${cfg.height}`}
        >
            <path
                d={cfg.path}
                fill="rgba(255, 255, 255, 0.05)"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function HandIcon() {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
                d="M6 8V3.5a1 1 0 0 1 2 0V8M8 8V3a1 1 0 0 1 2 0v5M10 8V4a1 1 0 0 1 2 0v6.5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a1 1 0 0 1 2 0v2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function PointerIcon() {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
                d="M3 2 v10 l3-2.5 2 4 1.5-0.8-2-4 4-0.5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}
