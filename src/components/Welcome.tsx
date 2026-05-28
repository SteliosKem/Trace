type RecentItem = { name: string; path: string };

const recent: RecentItem[] = [
  { name: "Full Adder", path: "~/Dev/Trace/projects/full-adder" },
  { name: "4-bit Counter", path: "~/Dev/Trace/projects/counter-4bit" },
  { name: "ALU Prototype", path: "~/Dev/Trace/projects/alu-proto" },
  { name: "physics-engine", path: "~/Dev/physics-engine" },
  { name: "playground", path: "~/Desktop/playground" },
];

export function Welcome() {
  return (
    <section className="welcome">
      <div className="welcome-inner">
        <header className="welcome-header">
          <div className="welcome-logo">
            <LogoMark />
          </div>
          <h1 className="welcome-title">Trace</h1>
          <p className="welcome-subtitle">
            Design, simulate, and visualize digital logic.
          </p>
        </header>

        <div className="welcome-grid">
          <div className="welcome-col">
            <h2 className="welcome-section">Start</h2>
            <ActionRow icon={<NewIcon />} label="New project" hint="⌘N" />
            <ActionRow icon={<FolderOpenIcon />} label="Open project…" hint="⌘O" />
            <ActionRow icon={<FileIcon />} label="Open file…" hint="⇧⌘O" />
            <ActionRow icon={<GitIcon />} label="Clone from Git…" />

            <h2 className="welcome-section spaced">Learn</h2>
            <ActionRow icon={<BookIcon />} label="Get started" />
            <ActionRow icon={<KeyIcon />} label="Keyboard shortcuts" hint="⌘?" />
            <ActionRow icon={<SparkleIcon />} label="What's new" />
          </div>

          <div className="welcome-col">
            <h2 className="welcome-section">Recent</h2>
            <ul className="welcome-recent">
              {recent.map((r) => (
                <li key={r.path} className="welcome-recent-item">
                  <span className="welcome-recent-name">{r.name}</span>
                  <span className="welcome-recent-path">{r.path}</span>
                </li>
              ))}
            </ul>
            <button className="welcome-more">More…</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionRow({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button className="welcome-action">
      <span className="welcome-action-icon">{icon}</span>
      <span className="welcome-action-label">{label}</span>
      {hint && <span className="welcome-action-hint">{hint}</span>}
    </button>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 48 48" width="56" height="56" fill="none">
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="1.5"
        fill="rgba(255,255,255,0.02)"
      />
      <path
        d="M12 18h6a8 8 0 0 1 8 8v0a8 8 0 0 1-8 8h-6"
        stroke="#3ecf6a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="26" r="2" fill="#3ecf6a" />
      <path d="M34 26h6" stroke="#3ecf6a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7v5M5.5 9.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function FolderOpenIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M1.5 4.2c0-.6.4-1 1-1h3.3l1.2 1.3h6.5c.6 0 1 .4 1 1V7H1.5V4.2z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M1 13l1.8-5h12L13 13H1z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path d="M4 2h5l3 3v9H4V2z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function GitIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <circle cx="4" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.8v4.4M5.8 4.3c4 0 4.4 3.7 4.4 3.7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M2.5 3h4.5a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H2.5V3zM13.5 3H9a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5h5V3z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <rect x="1.5" y="4.5" width="13" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 7h.5M7 7h.5M10 7h.5M4.5 9.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
      <path
        d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
