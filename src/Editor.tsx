import "./App.css";
import { useState } from "react";
import TitleBar, { type Tab } from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import { type DirEntry } from "@tauri-apps/plugin-fs";

export default function Editor({ projectPath }: { projectPath: string }) {
    const [openTabs, setOpenTabs] = useState<Tab[]>([]);

    function openFile(entry: DirEntry, fullPath: string) {
        if (entry.isDirectory) return;
        const id = fullPath;
        setOpenTabs((prev) => {
            if (prev.some((t) => t.id === id)) {
                return prev.map((t) => ({ ...t, active: t.id === id }));
            }
            const cleared = prev.map((t) => ({ ...t, active: false }));
            return [...cleared, { id, label: entry.name, icon: "doc", active: true }];
        });
    }

    return (
        <div className="editor">
            <div className="app">
                <TitleBar tabs={openTabs} />
                <div className="body">
                    <Sidebar path={projectPath} onOpenFile={openFile} />
                    <Terminal />
                </div>
                <StatusBar />
            </div>
        </div>
    );
}

function Terminal() {
    return (
        <section className="terminal">
            <div className="term-inner"></div>
        </section>
    );
}
