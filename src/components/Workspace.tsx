import { useRef, useState } from "react";

export default function Workspace() {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<{
        startClientX: number;
        startClientY: number;
        startOffsetX: number;
        startOffsetY: number;
    } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLElement>) {
        // only primary button (left mouse / single touch)
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

    return (
        <section
            className={"workspace" + (isDragging ? " dragging" : "")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <div
                className="workspace-grid"
                style={{ backgroundPosition: `${offset.x}px ${offset.y}px` }}
            />
            <div
                className="workspace-content"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
                {/* nodes & cables will live here */}
            </div>
            <div className="workspace-vignette" />
        </section>
    );
}
