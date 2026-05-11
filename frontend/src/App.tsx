import { useState } from "react";
import Nav from "./components/Nav";
import YouTubePage from "./pages/YouTubePage";
import SpotifyPage from "./pages/SpotifyPage";

type Tab = "youtube" | "spotify";

const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("youtube");
  return (
    <div className="app">
      <Nav tab={tab} onTab={setTab} />
      <main className="main">
        {tab === "youtube" && <YouTubePage />}
        {tab === "spotify" && <SpotifyPage />}
      </main>
    </div>
  );
};

export default App;