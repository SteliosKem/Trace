import { getCurrentWindow } from "@tauri-apps/api/window";
import { SearchIcon, ChipIcon, GearIcon, PlayIcon, StopIcon, FolderIconSm, EyeIcon, DiffIcon, RustIcon, CodeIcon, DocIcon } from "./Icons";

export type Tab = { id: string; label: string; icon: TabIcon; active?: boolean };
export type TabIcon = "doc" | "preview" | "folder" | "diff" | "rust" | "code";


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

function TabChip({ tab }: { tab: Tab }) {
    return (
        <div className={"tab" + (tab.active ? " active" : "")}>
            <TabIconEl kind={tab.icon} />
            <span className="tab-label">{tab.label}</span>
            <span className="tab-close">×</span>
        </div>
    );
}
interface TitleBarProps {
    tabs?: Tab[];
    empty?: boolean;
}

function TitleBar({ tabs = [], empty = false }: TitleBarProps) {
    const appWindow = getCurrentWindow();

    function minimize() { appWindow.minimize(); }

    async function maximize() {
        await appWindow.toggleMaximize();
    }

    function close() { appWindow.close(); }

    if (empty) return (
        <header className="titlebar" data-tauri-drag-region>
            <div className="traffic">
                <span onClick={close} className="dot close" />
                <span onClick={minimize} className="dot min" />
                <span onClick={maximize} className="dot max" />
            </div>
        </header>
    )

    return (
        <header className="titlebar" data-tauri-drag-region>
            <div className="traffic">
                <span onClick={close} className="dot close" />
                <span onClick={minimize} className="dot min" />
                <span onClick={maximize} className="dot max" />
            </div>
            <div className="tabs" data-tauri-drag-region>
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



export default TitleBar;