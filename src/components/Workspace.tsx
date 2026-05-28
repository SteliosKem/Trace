import { useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const GRID_SIZE = 5;

export default function Workspace() {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(MAX_SCALE);
    const [isDragging, setIsDragging] = useState(false);

    const dragRef = useRef<{
        startClientX: number;
        startClientY: number;
        startOffsetX: number;
        startOffsetY: number;
    } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
        };
        setIsDragging(true);
    }

    function onPointerMove(e: React.PointerEvent<HTMLElement>) {
        const d = dragRef.current;
        if (!d) return;
        setOffset({
            x: d.startOffsetX + (e.clientX - d.startClientX),
            y: d.startOffsetY + (e.clientY - d.startClientY),
        });
    }

    function onPointerUp(e: React.PointerEvent<HTMLElement>) {
        if (!dragRef.current) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        dragRef.current = null;
        setIsDragging(false);
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

        // keep the world-point under the cursor stationary
        const k = newScale / scale;
        setOffset({
            x: mx - (mx - offset.x) * k,
            y: my - (my - offset.y) * k,
        });
        setScale(newScale);
    }

    return (
        <section
            className={"workspace" + (isDragging ? " dragging" : "")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
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
                {/* nodes & cables will live here */}
            </div>
            <div className="workspace-vignette" />
        </section>
    );
}
