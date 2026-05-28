import "./App.css";
import { useEffect, useRef, useState } from "react";
import TitleBar, { type Tab } from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import {
    exists,
    watchImmediate,
    type DirEntry,
    type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { sep } from "@tauri-apps/api/path";

export default function Editor({ projectPath }: { projectPath: string }) {
    const [openTabs, setOpenTabs] = useState<Tab[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const activeTab = openTabs.find((t) => t.id === activeId) ?? null;

    function openFile(entry: DirEntry, fullPath: string) {
        if (entry.isDirectory) return;
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
                        onOpenFile={openFile}
                        onPathDeleted={onPathDeleted}
                        onPathRenamed={onPathRenamed}
                    />
                    <Terminal activeTab={activeTab} />
                </div>
                <StatusBar />
            </div>
        </div>
    );
}

function Terminal({ activeTab }: { activeTab: Tab | null }) {
    return (
        <section className="terminal">
            <div className="term-inner">
                {activeTab ? activeTab.label : null}
            </div>
        </section>
    );
}
