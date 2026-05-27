import "./App.css";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";

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

function Terminal() {
  return (
    <section className="terminal">
      <div className="term-inner">
      </div>
    </section>
  );
}

export default App;
