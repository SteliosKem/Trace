import { HomeIcon, ChatIcon, GearIcon } from "./Icons";

export default function StatusBar() {
    return (
        <footer className="statusbar">
            <div className="breadcrumb">
                <HomeIcon /> <span className="crumb">Home</span>
                <span className="sep">›</span>
                <span className="crumb">dev</span>
                <span className="sep">›</span>
                <span className="crumb active">Trace</span>
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