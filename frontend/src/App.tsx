import { useState, useEffect, useRef } from "react";
import Nav from "./components/Nav";
import YouTubePage from "./pages/YouTubePage";
import SpotifyPage from "./pages/SpotifyPage";
import HistoryPanel from "./components/HistoryPanel";
import ClipboardToast from "./components/ClipboardToast";

type Tab = "youtube" | "spotify";

export type HistoryItem = {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  format: string;
  date: number;
};

const HISTORY_KEY = "dl_history";

export const loadHistory = (): HistoryItem[] => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
};

export const saveHistory = (items: HistoryItem[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 100)));
};

export const addToHistory = (item: Omit<HistoryItem, "id" | "date">) => {
  const items = loadHistory();
  const entry = { ...item, id: Math.random().toString(36).slice(2), date: Date.now() };
  saveHistory([entry, ...items.filter(i => i.url !== item.url)]);
};

export default function App() {
  const [tab,         setTab]         = useState<Tab>("youtube");
  const [histOpen,    setHistOpen]    = useState(false);
  const [ambientUrl,  setAmbientUrl]  = useState<string | null>(null);
  const [clipToast,   setClipToast]   = useState<string | null>(null);
  const lastClip      = useRef("");

  // Clipboard detection
  useEffect(() => {
    const check = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (
          text !== lastClip.current &&
          (text.includes("youtube.com/watch") ||
           text.includes("youtu.be/") ||
           text.includes("open.spotify.com"))
        ) {
          lastClip.current = text;
          setClipToast(text);
        }
      } catch {}
    };
    const iv = setInterval(check, 2000);
    return () => clearInterval(iv);
  }, []);

  const handleClipUse = (url: string) => {
    if (url.includes("spotify.com")) setTab("spotify");
    else setTab("youtube");
    setClipToast(null);
    // signal to pages via custom event
    window.dispatchEvent(new CustomEvent("dl:paste-url", { detail: url }));
  };

  return (
    <>
      {/* Ambient BG */}
      <div
        className={`ambient-bg${ambientUrl ? " visible" : ""}`}
        style={ambientUrl ? { backgroundImage: `url(${ambientUrl})` } : undefined}
      />

      <div className="app">
        <Nav
          tab={tab}
          onTab={setTab}
          onHistory={() => setHistOpen(v => !v)}
        />

        <main className="main">
          {tab === "youtube" && (
            <YouTubePage onAmbient={setAmbientUrl} />
          )}
          {tab === "spotify" && (
            <SpotifyPage onAmbient={setAmbientUrl} />
          )}
        </main>
      </div>

      <HistoryPanel
        open={histOpen}
        onClose={() => setHistOpen(false)}
        onReuse={url => handleClipUse(url)}
      />

      {clipToast && (
        <ClipboardToast
          url={clipToast}
          onUse={() => handleClipUse(clipToast)}
          onDismiss={() => setClipToast(null)}
        />
      )}
    </>
  );
}