import { useRef, useState } from "react";

export type GateKind = "not" | "and" | "or";

interface NodeProps {
    kind: GateKind;
    x: number;
    y: number;
    scale: number;
    onMove?: (x: number, y: number) => void;
}

export default function Node({ kind, x, y, scale, onMove }: NodeProps) {
    const config = GATES[kind];
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<{
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
    } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: x,
            startY: y,
        };
        setIsDragging(true);
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const d = dragRef.current;
        if (!d) return;
        e.stopPropagation();
        const dx = (e.clientX - d.startClientX) / scale;
        const dy = (e.clientY - d.startClientY) / scale;
        onMove?.(d.startX + dx, d.startY + dy);
    }

    function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragRef.current) return;
        e.stopPropagation();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        dragRef.current = null;
        setIsDragging(false);
    }

    return (
        <div
            className={"node" + (isDragging ? " dragging" : "")}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <svg
                className="node-svg"
                width={config.width / 4}
                height={config.height / 4}
                viewBox={`0 0 ${config.width} ${config.height}`}
            >
                <path
                    d={config.path}
                    fill="rgba(255, 255, 255, 0.10)"
                    stroke="rgba(220, 224, 232, 0.85)"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                />
                {config.inputs.map((pin, i) => (
                    <circle
                        key={`in-${i}`}
                        cx={pin.x}
                        cy={pin.y}
                        r="2.5"
                        fill="#d0d4dc"
                    />
                ))}
                <circle
                    cx={config.output.x}
                    cy={config.output.y}
                    r="2.5"
                    fill="#d0d4dc"
                />
            </svg>
        </div>
    );
}

interface Pin {
    x: number;
    y: number;
}

interface GateConfig {
    width: number;
    height: number;
    path: string;
    inputs: Pin[];
    output: Pin;
    label: string;
}

const GATES: Record<GateKind, GateConfig> = {
    not: {
        width: 60,
        height: 40,
        // triangle with inverter bubble
        path: "M 10 8 L 10 32 L 38 20 Z M 44 20 a 3 3 0 1 1 -6 0 a 3 3 0 1 1 6 0",
        inputs: [{ x: 6, y: 20 }],
        output: { x: 50, y: 20 },
        label: "NOT",
    },
    and: {
        width: 60,
        height: 40,
        // D-shape: flat back, rounded front
        path: "M 10 8 L 28 8 A 12 12 0 0 1 28 32 L 10 32 Z",
        inputs: [
            { x: 6, y: 14 },
            { x: 6, y: 26 },
        ],
        output: { x: 44, y: 20 },
        label: "AND",
    },
    or: {
        width: 60,
        height: 40,
        // concave back, pointed front
        path:
            "M 8 8 Q 18 20 8 32 Q 22 32 42 20 Q 22 8 8 8 Z",
        inputs: [
            { x: 9, y: 14 },
            { x: 9, y: 26 },
        ],
        output: { x: 44, y: 20 },
        label: "OR",
    },
};
