import "./App.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Tab = { id: string; label: string; icon: TabIcon; active?: boolean };
type TabIcon = "doc" | "preview" | "folder" | "diff" | "rust" | "code";

const tabs: Tab[] = [
  { id: "FullAdder", label: "Full Adder", icon: "doc" },
  { id: "preview", label: "preview", icon: "preview" },
  { id: "terax", label: "Trace", icon: "folder", active: true },
  { id: "physics", label: "physics-engine", icon: "folder" },
];

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

function App() {
  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <Terminal />
      </div>
      <StatusBar />
    </div>
  );
}


function TitleBar() {
  const appWindow = getCurrentWindow();

  function minimize() { appWindow.minimize(); }

  async function maximize() {
    await appWindow.toggleMaximize();
  }

  function close() { appWindow.close(); }
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="traffic">
        <span onClick={close} className="dot close" />
        <span onClick={minimize} className="dot min" />
        <span onClick={maximize} className="dot max" />
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <TabChip key={t.id} tab={t} />
        ))}
        <button className="tab-add" aria-label="New tab">
          +
        </button>
      </div>
      <div className="titlebar-right">
        <button className="play-btn" aria-label="Run">
          <PlayIcon />
        </button>
        <button className="stop-btn" aria-label="Stop">
          <StopIcon />
        </button>
        <div className="search">
          <SearchIcon />
          <span>Search</span>
        </div>
        <button className="icon-btn" aria-label="Extensions">
          <ChipIcon />
        </button>
        <button className="icon-btn" aria-label="Settings">
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function TabChip({ tab }: { tab: Tab }) {
  return (
    <div className={"tab" + (tab.active ? " active" : "")}>
      <TabIconEl kind={tab.icon} />
      <span className="tab-label">{tab.label}</span>
      <span className="tab-close">×</span>
    </div>
  );
}

function TabIconEl({ kind }: { kind: TabIcon }) {
  switch (kind) {
    case "folder":
      return <FolderIconSm />;
    case "preview":
      return <EyeIcon />;
    case "diff":
      return <DiffIcon />;
    case "rust":
      return <RustIcon />;
    case "code":
      return <CodeIcon />;
    default:
      return <DocIcon />;
  }
}

function Sidebar() {
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

function Terminal() {
  return (
    <section className="terminal">
      <div className="term-inner">
      </div>
    </section>
  );
}

function StatusBar() {
  return (
    <footer className="statusbar">
      <div className="breadcrumb">
        <HomeIcon /> <span className="crumb">Home</span>
        <span className="sep">›</span>
        <span className="crumb">dev</span>
        <span className="sep">›</span>
        <span className="crumb active">Terax</span>
      </div>
      <div className="status-right">
        <button className="status-btn">
          <span>Simulating</span> <span className="tag-dot" />
        </button>
        <span className="kbd-hint">⌘I</span>
        <button className="icon-btn"><ChatIcon /></button>
        <button className="icon-btn"><GearIcon /></button>
      </div>
    </footer>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function ChipIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="6" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 1v2M8 1v2M11 1v2M5 13v2M8 13v2M11 13v2M1 5h2M1 8h2M1 11h2M13 5h2M13 8h2M13 11h2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function FolderIconSm() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path
        d="M1.5 4.2c0-.6.4-1 1-1h3.3l1.2 1.3h6.5c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4.2z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="rgba(255,255,255,0.04)"
      />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function DiffIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path d="M3 2h6l4 4v8H3V2z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function RustIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8h4.5a1.5 1.5 0 0 0 0-3H6v6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path d="m5 5-3 3 3 3M11 5l3 3-3 3M9 4 7 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path d="M4 2h6l2.5 2.5V14H4V2z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
      <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function NewFileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
      <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 8v4M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function NewFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
      <path d="M1.5 4.2c0-.6.4-1 1-1h3.3l1.2 1.3h6.5c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H2.5c-.6 0-1-.4-1-1V4.2z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 7.5v3M6.5 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
      <path d="M13 8a5 5 0 1 1-1.7-3.8M13 2v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
      <path d="M2 8 8 3l6 5v6H2V8z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="24" height="24">
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="24" height="24">
      <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
      <path d="M2 4a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 4v5a1.5 1.5 0 0 1-1.5 1.5H6L3 13V10.5H2V4z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default App;
