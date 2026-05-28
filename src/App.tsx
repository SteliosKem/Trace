import "./App.css";
import TitleBar from "./components/TitleBar";
import { Welcome } from "./components/Welcome";
import { useState } from "react";
import Editor from "./Editor";

function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);

  if (projectPath)
    return (
      <Editor projectPath={projectPath} />
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


export default App;
