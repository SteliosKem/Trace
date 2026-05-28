import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    readDir,
    watchImmediate,
    writeTextFile,
    mkdir,
    remove,
    rename,
    exists,
    type DirEntry,
    type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { ask, message } from "@tauri-apps/plugin-dialog";
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
    width?: number;
    onOpenFile: (entry: DirEntry, fullPath: string) => void;
    onPathDeleted?: (path: string) => void;
    onPathRenamed?: (oldPath: string, newPath: string) => void;
}

type DraftKind = "file" | "folder";
type Draft = { parentPath: string; kind: DraftKind };
type MenuState = {
    x: number;
    y: number;
    path: string;
    name: string;
    isDirectory: boolean;
};

interface SidebarCtxValue {
    rootPath: string;
    selected: string | null;
    selectPath: (p: string | null) => void;
    draft: Draft | null;
    setDraft: (d: Draft | null) => void;
    commitDraft: (name: string) => Promise<void>;
    renamingPath: string | null;
    beginRename: (path: string) => void;
    commitRename: (path: string, newName: string) => Promise<void>;
    cancelRename: () => void;
    openMenu: (m: MenuState) => void;
    confirmDelete: (path: string, name: string) => Promise<void>;
    reloadKey: number;
    bumpReload: () => void;
    handleRowClick: (
        path: string,
        isDirectory: boolean,
        toggleFolder: () => void,
    ) => void;
}

const SidebarCtx = createContext<SidebarCtxValue | null>(null);
const useSidebar = () => {
    const v = useContext(SidebarCtx);
    if (!v) throw new Error("SidebarCtx missing");
    return v;
};

function dirname(p: string) {
    const s = sep();
    const i = p.lastIndexOf(s);
    return i > 0 ? p.slice(0, i) : p;
}

function sortEntries(es: DirEntry[]): DirEntry[] {
    return [...es].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

export default function Sidebar({
    path,
    width,
    onOpenFile,
    onPathDeleted,
    onPathRenamed,
}: SideBarProps) {
    const [entries, setEntries] = useState<DirEntry[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [menu, setMenu] = useState<MenuState | null>(null);

    const lastClickRef = useRef<{ path: string; time: number }>({
        path: "",
        time: 0,
    });

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

    const selectPath = useCallback((p: string | null) => setSelected(p), []);
    const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

    function resolveCreationParent(): string {
        if (!selected) return path;
        if (selected.startsWith(path) === false) return path;
        // If we know it's a directory based on entries... we don't have that here.
        // We rely on selectedIsDirectory captured at selection time via menu/row.
        // Conservative: use dirname unless selected ends with no extension AND is folder.
        // Simpler: track selectedIsDir via a ref.
        return selectedIsDirRef.current ? selected : dirname(selected);
    }

    const selectedIsDirRef = useRef(false);

    const handleRowClick = useCallback(
        (rowPath: string, isDirectory: boolean, toggleFolder: () => void) => {
            const now = Date.now();
            const prev = lastClickRef.current;
            const wasSelected = selected === rowPath;
            lastClickRef.current = { path: rowPath, time: now };

            // slow second click on same item → rename
            if (
                wasSelected &&
                prev.path === rowPath &&
                now - prev.time > 500 &&
                now - prev.time < 2000
            ) {
                setRenamingPath(rowPath);
                return;
            }

            setSelected(rowPath);
            selectedIsDirRef.current = isDirectory;
            if (isDirectory) toggleFolder();
        },
        [selected],
    );

    const commitDraft = useCallback(
        async (name: string) => {
            const d = draft;
            setDraft(null);
            if (!d) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            const finalName =
                d.kind === "file" && !trimmed.includes(".")
                    ? `${trimmed}.comp`
                    : trimmed;
            try {
                const full = await join(d.parentPath, finalName);
                if (await exists(full)) {
                    await message(
                        `A ${d.kind} named "${finalName}" already exists in this location.`,
                        { title: "Cannot create", kind: "error" },
                    );
                    return;
                }
                if (d.kind === "file") {
                    await writeTextFile(full, "");
                } else {
                    await mkdir(full);
                }
                setSelected(full);
                selectedIsDirRef.current = d.kind === "folder";
            } catch (err) {
                console.error("create failed:", err);
                await message(String(err), {
                    title: "Cannot create",
                    kind: "error",
                });
            }
        },
        [draft],
    );

    const beginRename = useCallback((p: string) => setRenamingPath(p), []);
    const cancelRename = useCallback(() => setRenamingPath(null), []);

    const commitRename = useCallback(
        async (oldPath: string, newName: string) => {
            setRenamingPath(null);
            const trimmed = newName.trim();
            if (!trimmed) return;
            const parent = dirname(oldPath);
            const newPath = `${parent}${sep()}${trimmed}`;
            if (newPath === oldPath) return;
            try {
                await rename(oldPath, newPath);
                if (selected === oldPath) setSelected(newPath);
                onPathRenamed?.(oldPath, newPath);
            } catch (err) {
                console.error("rename failed:", err);
            }
        },
        [selected, onPathRenamed],
    );

    const confirmDelete = useCallback(
        async (target: string, name: string) => {
            const yes = await ask(`Delete "${name}"?`, {
                title: "Confirm delete",
                kind: "warning",
                okLabel: "Delete",
                cancelLabel: "Cancel",
            });
            if (!yes) return;
            try {
                await remove(target, { recursive: true });
                if (selected === target) setSelected(null);
                onPathDeleted?.(target);
            } catch (err) {
                console.error("remove failed:", err);
            }
        },
        [selected, onPathDeleted],
    );

    const openMenu = useCallback((m: MenuState) => setMenu(m), []);

    function startCreate(kind: DraftKind) {
        const parent = resolveCreationParent();
        setDraft({ parentPath: parent, kind });
        // ensure user can see the input — for nested parents, the TreeNode
        // auto-expands when draft.parentPath matches its fullPath.
    }

    function onSidebarKeyDown(e: React.KeyboardEvent) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT") return;
        if (!selected) return;
        if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            const name = selected.split(sep()).pop() ?? selected;
            confirmDelete(selected, name);
        }
    }

    function onBackgroundClick() {
        setSelected(null);
        selectedIsDirRef.current = false;
    }

    const ctx: SidebarCtxValue = {
        rootPath: path,
        selected,
        selectPath,
        draft,
        setDraft,
        commitDraft,
        renamingPath,
        beginRename,
        commitRename,
        cancelRename,
        openMenu,
        confirmDelete,
        reloadKey,
        bumpReload,
        handleRowClick,
    };

    return (
        <SidebarCtx.Provider value={ctx}>
            <aside
                className="sidebar"
                tabIndex={0}
                onKeyDown={onSidebarKeyDown}
                style={width !== undefined ? { width } : undefined}
            >
                <div className="sidebar-head" data-tauri-drag-region>
                    <FolderIconSm />
                    <span className="sidebar-title">{projectName}</span>
                    <div className="sidebar-actions">
                        <button className="icon-btn sm" aria-label="Search">
                            <SearchIcon />
                        </button>
                        <button
                            className="icon-btn sm"
                            aria-label="New File"
                            onClick={() => startCreate("file")}
                        >
                            <NewFileIcon />
                        </button>
                        <button
                            className="icon-btn sm"
                            aria-label="New Folder"
                            onClick={() => startCreate("folder")}
                        >
                            <NewFolderIcon />
                        </button>
                        <button
                            className="icon-btn sm"
                            aria-label="Refresh"
                            onClick={bumpReload}
                        >
                            <RefreshIcon />
                        </button>
                    </div>
                </div>

                <div className="tree" onClick={onBackgroundClick}>
                    {draft?.parentPath === path && (
                        <DraftRow depth={0} kind={draft.kind} />
                    )}
                    {entries.map((e) => (
                        <TreeNode
                            key={e.name}
                            entry={e}
                            parentPath={path}
                            depth={0}
                            onOpenFile={onOpenFile}
                        />
                    ))}
                </div>
            </aside>

            {menu && (
                <ContextMenu
                    menu={menu}
                    onClose={() => setMenu(null)}
                    onRename={() => {
                        setRenamingPath(menu.path);
                        setMenu(null);
                    }}
                    onDelete={() => {
                        confirmDelete(menu.path, menu.name);
                        setMenu(null);
                    }}
                />
            )}
        </SidebarCtx.Provider>
    );
}

function TreeNode({
    entry,
    parentPath,
    depth,
    onOpenFile,
}: {
    entry: DirEntry;
    parentPath: string;
    depth: number;
    onOpenFile: (entry: DirEntry, fullPath: string) => void;
}) {
    const {
        selected,
        renamingPath,
        commitRename,
        cancelRename,
        draft,
        openMenu,
        reloadKey,
        handleRowClick,
    } = useSidebar();

    const fullPath = `${parentPath}${sep()}${entry.name}`;
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<DirEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const indent = 14 + depth * 12;

    const isSelected = selected === fullPath;
    const isRenaming = renamingPath === fullPath;

    const loadChildren = useCallback(async () => {
        if (!entry.isDirectory) return;
        setLoading(true);
        try {
            setChildren(sortEntries(await readDir(fullPath)));
        } catch (err) {
            console.error("readDir failed:", err);
            setChildren([]);
        } finally {
            setLoading(false);
        }
    }, [entry.isDirectory, fullPath]);

    // auto-expand if a draft is being created under this folder
    useEffect(() => {
        if (draft?.parentPath === fullPath && !expanded) {
            setExpanded(true);
        }
    }, [draft, fullPath, expanded]);

    useEffect(() => {
        if (expanded) loadChildren();
    }, [reloadKey, expanded, loadChildren]);

    function toggleFolder() {
        setExpanded((e) => !e);
    }

    function onClick(e: React.MouseEvent) {
        e.stopPropagation();
        if (isRenaming) return;
        handleRowClick(fullPath, entry.isDirectory, toggleFolder);
    }

    function onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        openMenu({
            x: e.clientX,
            y: e.clientY,
            path: fullPath,
            name: entry.name,
            isDirectory: entry.isDirectory,
        });
    }

    if (entry.isDirectory) {
        return (
            <>
                <div
                    className={"tree-row folder" + (isSelected ? " selected" : "")}
                    style={{ paddingLeft: indent }}
                    onClick={onClick}
                    onContextMenu={onContextMenu}
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
                    {isRenaming ? (
                        <NameInput
                            initial={entry.name}
                            onCommit={(name) => commitRename(fullPath, name)}
                            onCancel={cancelRename}
                        />
                    ) : (
                        <span>{entry.name}</span>
                    )}
                </div>
                {expanded && !loading && (
                    <>
                        {draft?.parentPath === fullPath && (
                            <DraftRow
                                depth={depth + 1}
                                kind={draft.kind}
                            />
                        )}
                        {children?.map((c) => (
                            <TreeNode
                                key={c.name}
                                entry={c}
                                parentPath={fullPath}
                                depth={depth + 1}
                                onOpenFile={onOpenFile}
                            />
                        ))}
                    </>
                )}
            </>
        );
    }

    return (
        <div
            className={"tree-row file" + (isSelected ? " selected" : "")}
            style={{ paddingLeft: indent + 12 }}
            onClick={onClick}
            onDoubleClick={() => onOpenFile(entry, fullPath)}
            onContextMenu={onContextMenu}
        >
            <FileGlyph name={entry.name} />
            {isRenaming ? (
                <NameInput
                    initial={entry.name}
                    onCommit={(name) => commitRename(fullPath, name)}
                    onCancel={cancelRename}
                />
            ) : (
                <span>{entry.name}</span>
            )}
        </div>
    );
}

function DraftRow({ depth, kind }: { depth: number; kind: DraftKind }) {
    const { commitDraft, setDraft } = useSidebar();
    const indent = 14 + depth * 12 + (kind === "folder" ? 0 : 12);

    return (
        <div
            className="tree-row draft"
            style={{ paddingLeft: indent }}
            onClick={(e) => e.stopPropagation()}
        >
            {kind === "folder" ? (
                <>
                    <span className="tree-chevron" style={{ visibility: "hidden" }}>
                        <ChevronIcon />
                    </span>
                    <FolderIconSm />
                </>
            ) : (
                <FileGlyph name="new.comp" />
            )}
            <NameInput
                initial=""
                placeholder={kind === "file" ? "new-component" : "new-folder"}
                onCommit={(name) => commitDraft(name)}
                onCancel={() => setDraft(null)}
            />
        </div>
    );
}

function NameInput({
    initial,
    placeholder,
    onCommit,
    onCancel,
}: {
    initial: string;
    placeholder?: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(initial);
    const ref = useRef<HTMLInputElement>(null);
    const committedRef = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        // select name without extension for rename ergonomics
        const dot = initial.lastIndexOf(".");
        if (dot > 0) el.setSelectionRange(0, dot);
        else el.select();
    }, [initial]);

    function commit() {
        if (committedRef.current) return;
        committedRef.current = true;
        onCommit(value);
    }

    function cancel() {
        if (committedRef.current) return;
        committedRef.current = true;
        onCancel();
    }

    return (
        <input
            ref={ref}
            className="tree-rename-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                }
            }}
            onBlur={commit}
        />
    );
}

function ContextMenu({
    menu,
    onClose,
    onRename,
    onDelete,
}: {
    menu: MenuState;
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
}) {
    useEffect(() => {
        function onDown(e: MouseEvent) {
            if (!(e.target as HTMLElement).closest(".ctx-menu")) onClose();
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div
            className="ctx-menu"
            style={{ top: menu.y, left: menu.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <button className="ctx-item" onClick={onRename}>
                Rename
            </button>
            <button className="ctx-item danger" onClick={onDelete}>
                Delete
            </button>
        </div>
    );
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
                                : ext === "comp"
                                    ? "#3ecf6a"
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
