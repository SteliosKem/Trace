import "./App.css";
import TitleBar, { type Tab } from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import { Welcome } from "./components/Welcome";
import { useState } from "react";

const tabs: Tab[] = [
  { id: "FullAdder", label: "Full Adder", icon: "doc" },
  { id: "preview", label: "preview", icon: "preview" },
  { id: "terax", label: "Trace", icon: "folder", active: true },
  { id: "physics", label: "physics-engine", icon: "folder" },
];


function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);

  if (projectPath)
    return (
      <div className="app">
        <TitleBar tabs={tabs} />
        <div className="body">
          <Sidebar path={projectPath} />
          <Terminal />
        </div>
        <StatusBar />
      </div>
    );

  return (
    <div className="app">
      <TitleBar empty={true} />
      <div className="body">
        <Welcome onChooseDirectory={setProjectPath} />
      </div>
    </div>
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

export default App;
