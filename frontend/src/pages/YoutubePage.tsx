import { useState, useRef } from "react";
import Trimmer from "../components/Trimmer";
import { isValidYouTubeUrl } from "../utils/validateYoutubeUrl";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${m}:${String(ss).padStart(2,"0")}`;
};

const fmtViews = (n: number) => {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n/1_000).toFixed(0)}K views`;
  return `${n} views`;
};

const genId = () => crypto.randomUUID ? crypto.randomUUID() :
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    return (c==="x"?r:(r&0x3|0x8)).toString(16);
  });

type Format = { format_id: string; quality: string; height: number; ext: string; filesize: number | null };
type Meta = { title: string; thumbnail: string; duration: number; uploader: string | null; view_count: number | null; formats: Format[]; is_playlist: boolean };
type DlState = "idle" | "active" | "done" | "error";
type Prog = { status?: string; percent?: number; speed?: string; eta?: string };

export default function YouTubePage() {
  const [url, setUrl]           = useState("");
  const [fetching, setFetching] = useState(false);
  const [meta, setMeta]         = useState<Meta | null>(null);
  const [fetchErr, setFetchErr] = useState("");

  const [format, setFormat]     = useState<"mp4"|"mp3">("mp4");
  const [quality, setQuality]   = useState("720p");

  const [trimEnabled, setTrimEnabled] = useState(false);
  const [startTime, setStartTime]     = useState(0);
  const [endTime, setEndTime]         = useState(0);

  const [dlState, setDlState]   = useState<DlState>("idle");
  const [prog, setProg]         = useState<Prog>({});
  const sseRef                  = useRef<EventSource | null>(null);

  const invalid = url.length > 0 && !isValidYouTubeUrl(url);
  const canFetch = url.length > 0 && !invalid && !fetching;

  const loadMeta = async () => {
    if (!canFetch) return;
    setFetching(true); setMeta(null); setFetchErr(""); setTrimEnabled(false); setDlState("idle"); setProg({});
    try {
      const r = await fetch(`${BASE}/?action=metadata&url=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error("Failed");
      const d: Meta = await r.json();
      setMeta(d);
      if (d.formats?.length) setQuality(d.formats[0].quality);
      setStartTime(0); setEndTime(d.duration || 0);
    } catch { setFetchErr("Couldn't fetch — check the URL"); }
    finally { setFetching(false); }
  };

  const handleDownload = () => {
    if (dlState === "active" || !meta) return;
    const id = genId();
    setDlState("active"); setProg({ status: "starting", percent: 0 });

    const sse = new EventSource(`${BASE}/progress/${id}`);
    sseRef.current = sse;
    sse.onmessage = e => {
      try {
        const d: Prog = JSON.parse(e.data);
        if (Object.keys(d).length) setProg(d);
        if (d.status === "completed") { setDlState("done"); sse.close(); setTimeout(() => setDlState("idle"), 5000); }
        if (d.status === "error" || d.status === "failed") { setDlState("error"); sse.close(); setTimeout(() => setDlState("idle"), 4000); }
      } catch {}
    };

    const params = new URLSearchParams({
      action: "download",
      url,
      quality,
      format,
      downloadId: id,
      ...(trimEnabled && startTime > 0     ? { startTime: String(startTime) } : {}),
      ...(trimEnabled && endTime < (meta.duration||0) ? { endTime:   String(endTime) } : {}),
    });

    const a = document.createElement("a");
    a.href = `${BASE}/?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pct = Number(prog.percent || 0);
  const isPulse = ["starting","merging","processing","sending"].includes(prog.status||"");

  const btnLabel = () => {
    if (dlState === "done")  return "✓ Done";
    if (dlState === "error") return "✗ Failed";
    if (dlState === "active") {
      if (prog.status === "starting") return "Preparing...";
      if (prog.status === "merging")  return "Merging...";
      if (prog.status === "sending")  return "Sending...";
      return `${pct.toFixed(0)}%`;
    }
    return `Download ${format.toUpperCase()}`;
  };

  return (
    <>
      <div className="page-head">
        <p className="page-head__eyebrow">YouTube</p>
        <h1 className="page-head__title"><span className="text-gray-600">Download</span> <em>anything.</em></h1>
        <p className="page-head__sub">Video, audio, playlists. Paste a link and go.</p>
      </div>

      {/* URL */}
      <label className="field-label">URL</label>
      <div className={`url-bar${invalid ? " error" : ""}`}>
        <input
          className="url-bar__input"
          placeholder="https://youtube.com/watch?v=..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && loadMeta()}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="url-bar__btn" onClick={loadMeta} disabled={!canFetch}>
          {fetching ? <><span className="spin" />Fetching</> : "Fetch →"}
        </button>
      </div>
      {invalid   && <p className="url-bar__err">✗ Not a valid YouTube URL</p>}
      {fetchErr  && <p className="url-bar__err">✗ {fetchErr}</p>}

      {/* ── RESULTS ── */}
      {meta && !meta.is_playlist && (
        <div className="fade-up">

          {/* VIDEO CARD */}
          <div className="video-card">
            <div className="video-card__thumb">
              <img src={meta.thumbnail} alt="" />
              {meta.duration > 0 && <span className="video-card__dur">{fmt(meta.duration)}</span>}
            </div>
            <div className="video-card__info">
              <span className="video-card__badge">● Video</span>
              <p className="video-card__title">{meta.title}</p>
              <p className="video-card__meta">
                {meta.uploader}{meta.view_count ? ` · ${fmtViews(meta.view_count)}` : ""}
              </p>
            </div>
          </div>

          {/* FORMAT */}
          <label className="field-label">Format</label>
          <div className="format-pills" style={{ marginBottom: 20 }}>
            {(["mp4","mp3"] as const).map(f => (
              <button key={f} className={`format-pill${format===f?" active":""}`} onClick={() => setFormat(f)}>
                {f === "mp4" ? "▶ MP4" : "♪ MP3"}
              </button>
            ))}
          </div>

          {/* QUALITY — only mp4 */}
          {format === "mp4" && (
            <>
              <label className="field-label">Quality</label>
              <div className="quality-row">
                {meta.formats.map((f, i) => (
                  <button
                    key={f.quality}
                    className={`q-chip${quality===f.quality?" active":""}${i===0?" best":""}`}
                    onClick={() => setQuality(f.quality)}
                  >
                    {f.quality}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* TRIM TOGGLE */}
          {meta.duration > 0 && (
            <div style={{ marginBottom: 20 }}>
              <button
                className="field-label"
                style={{ cursor: "pointer", color: trimEnabled ? "var(--green)" : undefined, transition: "color 120ms" }}
                onClick={() => setTrimEnabled(v => !v)}
              >
                {trimEnabled ? "✂ Trim enabled — click to disable" : "✂ Trim clip (optional)"}
              </button>
            </div>
          )}

          {/* TRIMMER */}
          {trimEnabled && meta.duration > 0 && (
            <Trimmer
              duration={meta.duration}
              startTime={startTime}
              endTime={endTime}
              onChange={(s, e) => { setStartTime(s); setEndTime(e); }}
            />
          )}

          {/* DOWNLOAD */}
          <button
            className={`dl-btn${dlState==="active"?" busy":""}${dlState==="done"?" done":""}`}
            onClick={handleDownload}
            disabled={dlState==="active"||dlState==="done"}
          >
            {dlState === "active" && <span className="spin" />}
            {btnLabel()}
          </button>

          {/* PROGRESS */}
          {dlState === "active" && (
            <div className="prog">
              <div className="prog__row">
                <span>{prog.status || "working"}</span>
                {!isPulse && pct > 0 && <span className="prog__pct">{pct.toFixed(1)}%</span>}
              </div>
              <div className="prog__track">
                <div className={`prog__fill${isPulse?" pulse":""}`} style={!isPulse ? { width: `${pct}%` } : undefined} />
              </div>
              {(prog.speed || prog.eta) && (
                <div className="prog__meta">
                  {prog.speed && <span>{prog.speed}</span>}
                  {prog.eta   && <span>eta {prog.eta}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}