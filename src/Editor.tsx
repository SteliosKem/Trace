import "./App.css";
import { useState } from "react";
import TitleBar, { type Tab } from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import { type DirEntry } from "@tauri-apps/plugin-fs";

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
                    <Sidebar path={projectPath} onOpenFile={openFile} />
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
