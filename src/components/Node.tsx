import { useRef, useState } from "react";

export type GateKind = "not" | "and" | "or";
export type PinKind = "input" | "output";

// SVG viewBox units → world units divisor.
// (SVG width is config.width / SVG_SCALE in world coords.)
export const SVG_SCALE = 4;

interface NodeProps {
    kind: GateKind;
    x: number;
    y: number;
    scale: number;
    selected?: boolean;
    onMove?: (x: number, y: number) => void;
    onSelect?: () => void;
    onPinDown?: (pinKind: PinKind, pinIndex: number) => void;
    onPinUp?: (pinKind: PinKind, pinIndex: number) => void;
    onNodeContextMenu?: (clientX: number, clientY: number) => void;
}

export default function Node({
    kind,
    x,
    y,
    scale,
    selected,
    onMove,
    onSelect,
    onPinDown,
    onPinUp,
    onNodeContextMenu,
}: NodeProps) {
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
        onSelect?.();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: x,
            startY: y,
        };
        setIsDragging(true);
    }

    function onContextMenu(e: React.MouseEvent<HTMLDivElement>) {
        e.preventDefault();
        e.stopPropagation();
        onSelect?.();
        onNodeContextMenu?.(e.clientX, e.clientY);
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

    function pinHandlers(pinKind: PinKind, pinIndex: number) {
        return {
            onPointerDown: (e: React.PointerEvent<SVGCircleElement>) => {
                e.stopPropagation();
                onPinDown?.(pinKind, pinIndex);
            },
            onPointerUp: (e: React.PointerEvent<SVGCircleElement>) => {
                e.stopPropagation();
                onPinUp?.(pinKind, pinIndex);
            },
        };
    }

    return (
        <div
            className={
                "node" +
                (isDragging ? " dragging" : "") +
                (selected ? " selected" : "")
            }
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={onContextMenu}
        >
            <svg
                className="node-svg"
                width={config.width / SVG_SCALE}
                height={config.height / SVG_SCALE}
                viewBox={`0 0 ${config.width} ${config.height}`}
            >
                <path
                    d={config.path}
                    fill="rgba(255, 255, 255, 0.10)"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                />
                {config.inputs.map((pin, i) => (
                    <g key={`in-${i}`} {...pinHandlers("input", i)}>
                        <circle
                            cx={pin.x}
                            cy={pin.y}
                            r="6"
                            fill="transparent"
                            className="node-pin-hit"
                        />
                        <circle
                            cx={pin.x}
                            cy={pin.y}
                            r="2.5"
                            fill="#d0d4dc"
                            pointerEvents="none"
                        />
                    </g>
                ))}
                <g {...pinHandlers("output", 0)}>
                    <circle
                        cx={config.output.x}
                        cy={config.output.y}
                        r="6"
                        fill="transparent"
                        className="node-pin-hit"
                    />
                    <circle
                        cx={config.output.x}
                        cy={config.output.y}
                        r="2.5"
                        fill="#d0d4dc"
                        pointerEvents="none"
                    />
                </g>
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

export const GATES: Record<GateKind, GateConfig> = {
    not: {
        width: 60,
        height: 40,
        path: "M 10 8 L 10 32 L 38 20 Z M 44 20 a 3 3 0 1 1 -6 0 a 3 3 0 1 1 6 0",
        inputs: [{ x: 6, y: 20 }],
        output: { x: 50, y: 20 },
        label: "NOT",
    },
    and: {
        width: 60,
        height: 40,
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
        path: "M 8 8 Q 18 20 8 32 Q 22 32 42 20 Q 22 8 8 8 Z",
        inputs: [
            { x: 9, y: 14 },
            { x: 9, y: 26 },
        ],
        output: { x: 44, y: 20 },
        label: "OR",
    },
};
