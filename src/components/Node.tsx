export type GateKind = "not" | "and" | "or";

interface NodeProps {
    kind: GateKind;
    x: number;
    y: number;
}

export default function Node({ kind, x, y }: NodeProps) {
    const config = GATES[kind];

    return (
        <div
            className="node"
            style={{
                transform: `translate(${x}px, ${y}px)`,
            }}
        >
            <svg
                className="node-svg"
                width={config.width / 4}
                height={config.height / 4}
                viewBox={`0 0 ${config.width} ${config.height}`}
            >
                <path
                    d={config.path}
                    fill="rgba(255, 255, 255, 0.02)"
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
