import { useState, useEffect, useRef } from "react";
import Trimmer from "../components/Trimmer";
import { addToHistory } from "../App";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

const fmt = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
};
const fmtViews = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M views`
    : n >= 1e3
      ? `${(n / 1e3).toFixed(0)}K views`
      : `${n} views`;
const fmtSize = (b: number | null) =>
  b ? `${(b / 1024 / 1024).toFixed(0)}MB` : "";
const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const isYtUrl = (u: string) => {
  try {
    const x = new URL(u);
    return (
      x.hostname.includes("youtube.com") || x.hostname.includes("youtu.be")
    );
  } catch {
    return false;
  }
};

type Fmt = {
  format_id: string;
  quality: string;
  height: number;
  ext: string;
  filesize: number | null;
};
type Meta = {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string | null;
  view_count: number | null;
  formats: Fmt[];
  is_playlist: boolean;
};
type Prog = { status?: string; percent?: number; speed?: string; eta?: string };

const MAX_RETRY = 3;

interface Props {
  onAmbient: (url: string | null) => void;
}

export default function YouTubePage({ onAmbient }: Props) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState("");

  const [format, setFormat] = useState<"mp4" | "mp3">("mp4");
  const [quality, setQuality] = useState("720p");
  const [trimOn, setTrimOn] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  const [dlState, setDlState] = useState<"idle" | "active" | "done" | "error">(
    "idle",
  );
  const [prog, setProg] = useState<Prog>({});
  const [retries, setRetries] = useState(0);
  const sseRef = useRef<EventSource | null>(null);
  const lastId = useRef("");

  // Listen for clipboard paste events from App
  useEffect(() => {
    const handler = (e: Event) => {
      const u = (e as CustomEvent).detail as string;
      if (isYtUrl(u)) {
        setUrl(u);
        setMeta(null);
        setErr("");
      }
    };
    window.addEventListener("dl:paste-url", handler);
    return () => window.removeEventListener("dl:paste-url", handler);
  }, []);

  const invalid = url.length > 0 && !isYtUrl(url);
  const canFetch = url.length > 0 && !invalid && !fetching;

  const loadMeta = async () => {
    if (!canFetch) return;
    setFetching(true);
    setMeta(null);
    setErr("");
    setTrimOn(false);
    setDlState("idle");
    setProg({});
    onAmbient(null);
    try {
      const r = await fetch(
        `${BASE}/?action=metadata&url=${encodeURIComponent(url)}`,
      );
      if (!r.ok) throw new Error("Failed to fetch");
      const d: Meta = await r.json();
      setMeta(d);
      setQuality(d.formats?.[0]?.quality || "720p");
      setStart(0);
      setEnd(d.duration || 0);
      onAmbient(d.thumbnail || null);
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setFetching(false);
    }
  };

  const startDownload = (retryCount = 0) => {
    if (!meta) return;
    const id = genId();
    lastId.current = id;
    setDlState("active");
    setProg({ status: "starting", percent: 0 });
    setRetries(retryCount);

    sseRef.current?.close();
    const sse = new EventSource(`${BASE}/progress/${id}`);
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const d: Prog = JSON.parse(e.data);
        if (!Object.keys(d).length) return;
        setProg(d);
        if (d.status === "completed") {
          setDlState("done");
          sse.close();
          addToHistory({
            title: meta.title,
            url,
            thumbnail: meta.thumbnail,
            format,
          });
          setTimeout(() => setDlState("idle"), 6000);
        }
        if (d.status === "error" || d.status === "failed") {
          sse.close();
          if (retryCount < MAX_RETRY) {
            setTimeout(
              () => startDownload(retryCount + 1),
              1500 * (retryCount + 1),
            );
          } else {
            setDlState("error");
            setTimeout(() => setDlState("idle"), 5000);
          }
        }
      } catch {}
    };

    const params = new URLSearchParams({
      action: "download",
      url,
      quality,
      format,
      downloadId: id,
      ...(trimOn && start > 0 ? { startTime: String(start) } : {}),
      ...(trimOn && end < (meta.duration || 0) ? { endTime: String(end) } : {}),
    });

    const a = document.createElement("a");
    a.href = `${BASE}/?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pct = Number(prog.percent || 0);
  const isPulse = ["starting", "merging", "processing", "sending"].includes(
    prog.status || "",
  );

  const btnLabel = () => {
    if (dlState === "done") return " Downloaded";
    if (dlState === "error")
      return retries > 0
        ? `✗ Failed after ${retries} retries`
        : "✗ Failed — click to retry";
    if (dlState === "active") {
      if (retries > 0) return `Retry ${retries}/${MAX_RETRY}...`;
      if (prog.status === "starting") return "Preparing...";
      if (prog.status === "merging") return "Merging...";
      if (prog.status === "sending") return "Sending...";
      return `${pct.toFixed(0)}%`;
    }
    return `Download ${format.toUpperCase()}`;
  };

  return (
    <>
      <div className="pg-head">
        <p className="pg-head__eye">YouTube</p>
        <h1 className="pg-head__h1">
          Download <em>anything.</em>
        </h1>
        <p className="pg-head__sub">
          Video, audio, playlists — trimmed to exactly what you need.
        </p>
      </div>

      <span className="lbl">URL</span>
      <div className={`url-bar${invalid ? " err" : ""}`}>
        <input
          className="url-bar__in"
          placeholder="https://youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadMeta()}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="url-bar__go" onClick={loadMeta} disabled={!canFetch}>
          {fetching ? (
            <>
              <span className="spin" /> Fetching
            </>
          ) : (
            "Fetch "
          )}
        </button>
      </div>
      {invalid && <p className="url-err">Not a valid YouTube URL</p>}
      {err && <p className="url-err">{err}</p>}

      {meta && (
        <>
          {/* VIDEO CARD */}
          <div className="v-card anim-up">
            <div className="v-card__thumb">
              <img src={meta.thumbnail} alt="" />
              {meta.duration > 0 && (
                <span className="v-card__dur">{fmt(meta.duration)}</span>
              )}
            </div>
            <div className="v-card__info">
              <span className="v-card__badge">
                {meta.is_playlist ? "Playlist" : "Video"}
              </span>
              <p className="v-card__title">{meta.title}</p>
              <p className="v-card__meta">
                {meta.uploader}
                {meta.view_count ? ` · ${fmtViews(meta.view_count)}` : ""}
              </p>
            </div>
          </div>

          {/* FORMAT */}
          <span className="lbl anim-up-2">Format</span>
          <div className="pills anim-up-2">
            {(["mp4", "mp3"] as const).map((f) => (
              <button
                key={f}
                className={`pill${format === f ? " on" : ""}`}
                onClick={() => setFormat(f)}
              >
                {f === "mp4" ? "MP4 Video" : "MP3 Audio"}
              </button>
            ))}
          </div>

          {/* QUALITY */}
          {format === "mp4" && (
            <>
              <span className="lbl anim-up-3">Quality</span>
              <div className="chips anim-up-3">
                {meta.formats.map((f, i) => (
                  <button
                    key={f.quality}
                    className={`chip${quality === f.quality ? " on" : ""}${i === 0 ? " best" : ""}`}
                    onClick={() => setQuality(f.quality)}
                  >
                    {f.quality}
                    {f.filesize && (
                      <span className="size-badge">{fmtSize(f.filesize)}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* TRIM TOGGLE */}
          {meta.duration > 0 && (
            <button
              className={`trim-toggle anim-up-4${trimOn ? " on" : ""}`}
              onClick={() => setTrimOn((v) => !v)}
            >
              {trimOn ? "Trim enabled" : "Add trim"}
            </button>
          )}

          {/* TRIMMER */}
          {trimOn && meta.duration > 0 && (
            <Trimmer
              duration={meta.duration}
              startTime={start}
              endTime={end}
              onChange={(s, e) => {
                setStart(s);
                setEnd(e);
              }}
            />
          )}

          {/* DOWNLOAD BTN */}
          <button
            className={`dl-btn${dlState === "active" ? " busy" : dlState === "done" ? " done" : dlState === "error" ? " fail" : ""}`}
            onClick={() =>
              dlState === "error"
                ? startDownload(0)
                : dlState === "idle"
                  ? startDownload(0)
                  : undefined
            }
            disabled={dlState === "active" || dlState === "done"}
          >
            {dlState === "active" && <span className="spin" />}
            {btnLabel()}
          </button>

          {/* PROGRESS */}
          {dlState === "active" && (
            <div className="prog anim-in">
              <div className="prog__row">
                <span>
                  {prog.status || "working"}
                  {retries > 0 ? ` · retry ${retries}` : ""}
                </span>
                {!isPulse && pct > 0 && (
                  <span className="prog__pct">{pct.toFixed(1)}%</span>
                )}
              </div>
              <div className="prog__bar">
                <div
                  className={`prog__fill${isPulse ? " pulse" : ""}`}
                  style={!isPulse ? { width: `${pct}%` } : undefined}
                />
              </div>
              {(prog.speed || prog.eta) && (
                <div className="prog__meta">
                  {prog.speed && <span>{prog.speed}</span>}
                  {prog.eta && <span>eta {prog.eta}</span>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
