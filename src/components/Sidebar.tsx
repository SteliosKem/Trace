import { SearchIcon, FolderIconSm, NewFileIcon, NewFolderIcon, RefreshIcon, ChevronIcon } from "./Icons";

const folders = ["dist", "docs", "node_modules", "public", "src", "src-tauri"];
const files = [
    "CHANGELOG.md",
    "CLAUDE.md",
    "components.json",
    "CONTRIBUTING.md",
    "index.html",
    "LICENSE",
    "package.json",
    "pnpm-lock.yaml",
    "README.md",
    "SECURITY.md",
    "settings.html",
    "terax-icon.png",
    "TERAX.md",
    "tsconfig.json",
    "tsconfig.node.json",
    "tsconfig.node.tsbuildinfo",
    "vite.config.ts",
];
export default function Sidebar() {
    return (
        <aside className="sidebar" >
            <div className="sidebar-head" data-tauri-drag-region>
                <FolderIconSm />
                <span className="sidebar-title">Terax</span>
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
                    <button className="icon-btn sm" aria-label="Refresh">
                        <RefreshIcon />
                    </button>
                </div>
            </div>

            <div className="tree">
                {folders.map((name, i) => (
                    <div key={name} className="tree-row folder">
                        <ChevronIcon />
                        <FolderIconSm />
                        <span>{name}</span>
                        {i === 5 && <span className="tag-dot" />}
                    </div>
                ))}
                {files.map((name) => (
                    <div key={name} className="tree-row file">
                        <FileGlyph name={name} />
                        <span>{name}</span>
                    </div>
                ))}
            </div>
        </aside>
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