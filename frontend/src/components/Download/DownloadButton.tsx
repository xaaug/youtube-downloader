import { useState, useRef, useEffect } from "react";

interface Props {
  url: string;
  quality: string;
  format: "mp4" | "mp3";
  isPlaylist: boolean;
}

interface Progress {
  status?: string;
  percent?: number;
  speed?: string;
  eta?: string;
  item?: string;
}

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

// Simple UUID v4 generator (no dependency needed)
const genId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const getDownloadUrl = (
  url: string,
  quality: string,
  format: "mp4" | "mp3",
  downloadId: string
) =>
  `${BASE}/?action=download&url=${encodeURIComponent(url)}&quality=${quality}&format=${format}&downloadId=${downloadId}`;

const DownloadButton: React.FC<Props> = ({ url, quality, format, isPlaylist }) => {
  const [state, setState] = useState<"idle" | "active" | "done" | "error">("idle");
  const [progress, setProgress] = useState<Progress>({});
  const sseRef = useRef<EventSource | null>(null);

  const cleanup = () => {
    sseRef.current?.close();
    sseRef.current = null;
  };

  useEffect(() => cleanup, []);

  // Reset on input change
  useEffect(() => {
    setState("idle");
    setProgress({});
    cleanup();
  }, [url, format, quality]);

  const handleDownload = () => {
    if (state === "active") return;

    // 1. Generate ID here so we can subscribe to SSE before the download starts
    const downloadId = genId();

    setState("active");
    setProgress({ status: "starting", percent: 0 });

    // 2. Subscribe to SSE immediately
    const sse = new EventSource(`${BASE}/progress/${downloadId}`);
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const data: Progress = JSON.parse(e.data);

        // Always update if we got a real status (ignore empty {})
        if (Object.keys(data).length > 0) {
          setProgress(data);
        }

        if (data.status === "completed") {
          setState("done");
          cleanup();
          setTimeout(() => setState("idle"), 5000);
        } else if (data.status === "error" || data.status === "failed") {
          setState("error");
          cleanup();
          setTimeout(() => setState("idle"), 4000);
        }
      } catch {}
    };

    sse.onerror = () => {
      // SSE errors are normal after stream ends — don't treat as failure
    };

    // 3. Trigger browser download via hidden anchor
    const dlUrl = getDownloadUrl(url, quality, format, downloadId);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pct = Number(progress.percent || 0);
  const isIndeterminate =
    progress.status === "starting" ||
    progress.status === "merging" ||
    progress.status === "sending" ||
    progress.status === "zipping";

  const progressLabel = () => {
    switch (progress.status) {
      case "starting":     return "Initializing...";
      case "downloading":
        return progress.item
          ? `Item ${progress.item}`
          : `Downloading`;
      case "merging":      return "Merging video + audio";
      case "sending":      return "Sending file";
      case "zipping":      return "Creating archive";
      default:             return progress.status || "Working...";
    }
  };

  const btnLabel = () => {
    if (state === "done")  return "✓ Complete";
    if (state === "error") return "✗ Failed — click to retry";
    if (state === "active") return progressLabel();
    return isPlaylist
      ? `↓ Download Playlist · ${format.toUpperCase()}`
      : `↓ Download · ${format.toUpperCase()}`;
  };

  return (
    <div>
      <button
        className={`download-btn${state === "active" ? " downloading" : ""}`}
        onClick={handleDownload}
        disabled={state === "active" || state === "done"}
      >
        {state === "active" && <span className="spinner" />}
        {btnLabel()}
      </button>

      {state === "active" && (
        <div className="progress-section fade-in">
          <div className="progress-header">
            <span className="progress-status">{progressLabel()}</span>
            {!isIndeterminate && pct > 0 && (
              <span className="progress-pct">{pct.toFixed(1)}%</span>
            )}
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill${isIndeterminate ? " indeterminate" : ""}`}
              style={!isIndeterminate ? { width: `${Math.min(pct, 100)}%` } : undefined}
            />
          </div>
          {(progress.speed || progress.eta) && (
            <div className="progress-meta">
              {progress.speed && <span>{progress.speed}</span>}
              {progress.eta && <span>ETA {progress.eta}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DownloadButton;