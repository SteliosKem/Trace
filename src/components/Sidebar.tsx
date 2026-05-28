import { useCallback, useEffect, useState } from "react";
import {
    readDir,
    watchImmediate,
    type DirEntry,
    type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { join, sep } from "@tauri-apps/api/path";
import {
    SearchIcon,
    FolderIconSm,
    NewFileIcon,
    NewFolderIcon,
    RefreshIcon,
    ChevronIcon,
} from "./Icons";

interface SideBarProps {
    path: string;
}

export default function Sidebar({ path }: SideBarProps) {
    const [entries, setEntries] = useState<DirEntry[]>([]);
    const [reloadKey, setReloadKey] = useState(0);

    const projectName = path.split(sep()).filter(Boolean).pop() ?? path;

    const loadRoot = useCallback(async () => {
        try {
            setEntries(sortEntries(await readDir(path)));
        } catch (err) {
            console.error("readDir failed:", err);
            setEntries([]);
        }
    }, [path]);

    useEffect(() => {
        loadRoot();
    }, [loadRoot, reloadKey]);

    useEffect(() => {
        let unwatch: UnwatchFn | undefined;
        let cancelled = false;
        watchImmediate(path, () => setReloadKey((k) => k + 1), {
            recursive: true,
        })
            .then((fn) => {
                if (cancelled) fn();
                else unwatch = fn;
            })
            .catch((err) => console.error("watch failed:", err));
        return () => {
            cancelled = true;
            unwatch?.();
        };
    }, [path]);

    return (
        <aside className="sidebar">
            <div className="sidebar-head" data-tauri-drag-region>
                <FolderIconSm />
                <span className="sidebar-title">{projectName}</span>
                <div className="sidebar-actions">
                    <button className="icon-btn sm" aria-label="Search">
                        <SearchIcon />
                    </button>
                    <button className="icon-btn sm" aria-label="New File">
                        <NewFileIcon />
                    </button>
                    <button className="icon-btn sm" aria-label="New Folder">
                        <NewFolderIcon />
                    </button>
                    <button
                        className="icon-btn sm"
                        aria-label="Refresh"
                        onClick={() => setReloadKey((k) => k + 1)}
                    >
                        <RefreshIcon />
                    </button>
                </div>
            </div>

            <div className="tree">
                {entries.map((e) => (
                    <TreeNode
                        key={e.name}
                        entry={e}
                        parentPath={path}
                        depth={0}
                        reloadKey={reloadKey}
                    />
                ))}
            </div>
        </aside>
    );
}

function TreeNode({
    entry,
    parentPath,
    depth,
    reloadKey,
}: {
    entry: DirEntry;
    parentPath: string;
    depth: number;
    reloadKey: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<DirEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const indent = 14 + depth * 12;

    const loadChildren = useCallback(async () => {
        if (!entry.isDirectory) return;
        setLoading(true);
        try {
            const full = await join(parentPath, entry.name);
            setChildren(sortEntries(await readDir(full)));
        } catch (err) {
            console.error("readDir failed:", err);
            setChildren([]);
        } finally {
            setLoading(false);
        }
    }, [entry.isDirectory, entry.name, parentPath]);

    useEffect(() => {
        if (expanded) loadChildren();
    }, [reloadKey, expanded, loadChildren]);

    function toggle() {
        if (!entry.isDirectory) return;
        setExpanded((e) => !e);
    }

    if (entry.isDirectory) {
        return (
            <>
                <div
                    className="tree-row folder"
                    style={{ paddingLeft: indent }}
                    onClick={toggle}
                >
                    <span
                        className="tree-chevron"
                        style={{
                            transform: expanded ? "rotate(90deg)" : "none",
                            display: "inline-flex",
                            transition: "transform 0.12s ease",
                        }}
                    >
                        <ChevronIcon />
                    </span>
                    <FolderIconSm />
                    <span>{entry.name}</span>
                </div>
                {expanded &&
                    !loading &&
                    children?.map((c) => (
                        <TreeNode
                            key={c.name}
                            entry={c}
                            parentPath={`${parentPath}${sep()}${entry.name}`}
                            depth={depth + 1}
                            reloadKey={reloadKey}
                        />
                    ))}
            </>
        );
    }

    return (
        <div
            className="tree-row file"
            style={{ paddingLeft: indent + 12 }}
        >
            <FileGlyph name={entry.name} />
            <span>{entry.name}</span>
        </div>
    );
}

function sortEntries(es: DirEntry[]): DirEntry[] {
    return [...es].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function FileGlyph({ name }: { name: string }) {
    const ext = name.split(".").pop() ?? "";
    const color =
        ext === "md"
            ? "#5aa6ff"
            : ext === "json"
                ? "#e8c468"
                : ext === "html"
                    ? "#e57a4d"
                    : ext === "yaml"
                        ? "#c97a7a"
                        : ext === "ts" || ext === "tsx"
                            ? "#3da9fc"
                            : ext === "png"
                                ? "#9b8cff"
                                : ext === "tsbuildinfo"
                                    ? "#7a8aa1"
                                    : "#9aa1ad";
    return (
        <span className="file-glyph" style={{ background: color }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path
                    d="M3 2h7l3 3v9H3V2z"
                    fill="none"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="1.4"
                />
            </svg>
        </span>
    );
}
