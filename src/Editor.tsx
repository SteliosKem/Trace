import "./App.css";
import { useEffect, useRef, useState } from "react";
import TitleBar, { type Tab } from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import Workspace from "./components/Workspace";
import {
    exists,
    watchImmediate,
    type DirEntry,
    type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { message } from "@tauri-apps/plugin-dialog";
import { sep } from "@tauri-apps/api/path";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 520;
const SIDEBAR_WIDTH_KEY = "trace.sidebarWidth";

function readStoredSidebarWidth(): number {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 240;
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
}

export default function Editor({ projectPath }: { projectPath: string }) {
    const [openTabs, setOpenTabs] = useState<Tab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);

    useEffect(() => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    }, [sidebarWidth]);

    function openFile(entry: DirEntry, fullPath: string) {
        if (entry.isDirectory) return;
        if (!entry.name.toLowerCase().endsWith(".comp")) {
            message("Only .comp files can be opened in the workspace.", {
                title: "Unsupported file",
                kind: "info",
            });
            return;
        }
        const id = fullPath;
        setActiveId(id);
        setOpenTabs((prev) => {
            if (prev.some((t) => t.id === id)) return prev;
            return [...prev, { id, label: entry.name, icon: "doc" }];
        });
    }

    function activateTab(id: string) {
        setActiveId(id);
    }

    function closeTab(id: string) {
        setOpenTabs((prev) => {
            const next = prev.filter((t) => t.id !== id);
            if (activeId === id) {
                // pick the tab to the left of the closed one, else first remaining, else null
                const closedIdx = prev.findIndex((t) => t.id === id);
                const fallback = next[closedIdx - 1] ?? next[0] ?? null;
                setActiveId(fallback ? fallback.id : null);
            }
            return next;
        });
    }

    function onPathDeleted(deletedPath: string) {
        const prefix = deletedPath + sep();
        setOpenTabs((prev) => {
            const next = prev.filter(
                (t) => t.id !== deletedPath && !t.id.startsWith(prefix),
            );
            if (next.length !== prev.length) {
                setActiveId((cur) => {
                    if (cur === null) return null;
                    if (cur === deletedPath || cur.startsWith(prefix)) {
                        return next[next.length - 1]?.id ?? null;
                    }
                    return cur;
                });
            }
            return next;
        });
    }

    function onPathRenamed(oldPath: string, newPath: string) {
        const oldPrefix = oldPath + sep();
        setOpenTabs((prev) =>
            prev.map((t) => {
                if (t.id === oldPath) {
                    const label = newPath.split(sep()).pop() ?? newPath;
                    return { ...t, id: newPath, label };
                }
                if (t.id.startsWith(oldPrefix)) {
                    const newId = newPath + t.id.slice(oldPath.length);
                    return { ...t, id: newId };
                }
                return t;
            }),
        );
        setActiveId((cur) => {
            if (cur === null) return null;
            if (cur === oldPath) return newPath;
            if (cur.startsWith(oldPrefix)) {
                return newPath + cur.slice(oldPath.length);
            }
            return cur;
        });
    }

    // external delete watcher — drop tabs for files that vanish on disk
    const openTabsRef = useRef(openTabs);
    openTabsRef.current = openTabs;
    useEffect(() => {
        let unwatch: UnwatchFn | undefined;
        let cancelled = false;
        let pending = false;
        async function reconcile() {
            if (pending) return;
            pending = true;
            try {
                const tabs = openTabsRef.current;
                const checks = await Promise.all(
                    tabs.map(async (t) => ({ id: t.id, alive: await exists(t.id) })),
                );
                const dead = checks.filter((c) => !c.alive).map((c) => c.id);
                for (const id of dead) onPathDeleted(id);
            } finally {
                pending = false;
            }
        }
        watchImmediate(projectPath, reconcile, { recursive: true })
            .then((fn) => {
                if (cancelled) fn();
                else unwatch = fn;
            })
            .catch((err) => console.error("editor watch failed:", err));
        return () => {
            cancelled = true;
            unwatch?.();
        };
    }, [projectPath]);

    const decoratedTabs = openTabs.map((t) => ({ ...t, active: t.id === activeId }));

    return (
        <div className="editor">
            <div className="app">
                <TitleBar
                    tabs={decoratedTabs}
                    onActivateTab={activateTab}
                    onCloseTab={closeTab}
                />
                <div className="body">
                    <Sidebar
                        path={projectPath}
                        width={sidebarWidth}
                        onOpenFile={openFile}
                        onPathDeleted={onPathDeleted}
                        onPathRenamed={onPathRenamed}
                    />
                    <ResizeHandle
                        width={sidebarWidth}
                        setWidth={setSidebarWidth}
                        min={SIDEBAR_MIN}
                        max={SIDEBAR_MAX}
                    />
                    {openTabs.length === 0 ? (
                        <EmptyWorkspace />
                    ) : (
                        openTabs.map((t) => (
                            <div
                                key={t.id}
                                className="workspace-host"
                                style={{
                                    display: t.id === activeId ? "flex" : "none",
                                }}
                            >
                                <Workspace filePath={t.id} active={t.id === activeId} />
                            </div>
                        ))
                    )}
                </div>
                <StatusBar />
            </div>
        </div>
    );
}

function ResizeHandle({
    width,
    setWidth,
    min,
    max,
}: {
    width: number;
    setWidth: (w: number) => void;
    min: number;
    max: number;
}) {
    const dragRef = useRef<{ startX: number; startW: number } | null>(null);

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startW: width };
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const d = dragRef.current;
        if (!d) return;
        const w = Math.max(min, Math.min(max, d.startW + (e.clientX - d.startX)));
        setWidth(w);
    }

    function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragRef.current) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        dragRef.current = null;
    }

    return (
        <div
            className="resize-handle"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        />
    );
}

function EmptyWorkspace() {
    return (
        <section className="workspace-empty">
            <div className="workspace-empty-inner">
                <EmptyIcon />
                <p className="workspace-empty-title">No file open</p>
                <p className="workspace-empty-hint">
                    Open a file from the sidebar to start designing.
                </p>
            </div>
        </section>
    );
}

function EmptyIcon() {
    return (
        <svg viewBox="0 0 48 48" width="44" height="44" fill="none">
            <rect
                x="9"
                y="6"
                width="22"
                height="36"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.45"
            />
            <path
                d="M27 6 v6 h6"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.45"
            />
        </svg>
    );
}
