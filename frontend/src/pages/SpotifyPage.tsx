import { useState, useRef, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

const genId = () => crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const fmtDur = (s: number) => {
  const m = Math.floor(s/60), ss = s%60;
  return `${m}:${String(ss).padStart(2,"0")}`;
};

type SpTrack = {
  id: string; name: string; artist: string; album: string;
  duration: number; artwork: string|null; artworkSmall: string|null;
};

type Playlist = {
  name: string; owner: string; art: string|null; total: number; tracks: SpTrack[];
};

type TrackStatus = "idle"|"queued"|"searching"|"downloading"|"tagging"|"done"|"error";

type TrackState = {
  status:   TrackStatus;
  ytUrl?:   string|null;
  percent?: number;
  error?:   string;
};

const isValidSpotifyUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.hostname.includes("spotify.com") &&
      (url.pathname.includes("/playlist/") || url.pathname.includes("/album/"));
  } catch { return false; }
};

export default function SpotifyPage() {
  const [url,     setUrl]     = useState("");
  const [fetching,setFetching]= useState(false);
  const [playlist,setPlaylist]= useState<Playlist|null>(null);
  const [fetchErr,setFetchErr]= useState("");

  const [format,  setFormat]  = useState<"mp3"|"m4a">("mp3");
  const [selected,setSelected]= useState<Set<string>>(new Set());
  const [states,  setStates]  = useState<Record<string,TrackState>>({});
  const [running, setRunning] = useState(false);

  const sseRefs = useRef<Record<string,EventSource>>({});

  const invalid = url.length > 0 && !isValidSpotifyUrl(url);
  const canFetch = url.length > 0 && !invalid && !fetching;

  // ── Fetch playlist ───────────────────────────────────────
  const loadPlaylist = async () => {
    if (!canFetch) return;
    setFetching(true); setPlaylist(null); setFetchErr(""); setSelected(new Set()); setStates({});
    try {
      const r = await fetch(`${BASE}/spotify/playlist?url=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error(await r.text());
      const d: Playlist = await r.json();
      setPlaylist(d);
      setSelected(new Set(d.tracks.map(t => t.id)));
    } catch (e: any) {
      setFetchErr(e.message || "Failed to fetch playlist");
    } finally { setFetching(false); }
  };

  // ── Selection ────────────────────────────────────────────
  const toggleTrack = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = () => {
    if (!playlist) return;
    const allIds = playlist.tracks.map(t => t.id);
    setSelected(prev =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  };

  // ── Download single track ────────────────────────────────
  const downloadOne = useCallback(async (track: SpTrack) => {
    const dlId = genId();

    // 1. Search YouTube
    setState(track.id, { status: "searching" });
    let ytUrl: string|null = null;
    try {
      const r = await fetch(
        `${BASE}/spotify/search?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`
      );
      const d = await r.json();
      ytUrl = d.url;
    } catch {
      setState(track.id, { status: "error", error: "YouTube search failed" });
      return;
    }

    if (!ytUrl) {
      setState(track.id, { status: "error", error: "No match found" });
      return;
    }

    setState(track.id, { status: "downloading", ytUrl, percent: 0 });

    // 2. Subscribe SSE
    const sse = new EventSource(`${BASE}/spotify/progress/${dlId}`);
    sseRefs.current[track.id] = sse;

    sse.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (!Object.keys(d).length) return;
        if (d.status === "downloading") setState(track.id, { status: "downloading", percent: d.percent, ytUrl });
        if (d.status === "tagging")     setState(track.id, { status: "tagging", percent: 100, ytUrl });
        if (d.status === "completed")   { setState(track.id, { status: "done", percent: 100, ytUrl }); sse.close(); }
        if (d.status === "error")       { setState(track.id, { status: "error", error: d.error, ytUrl }); sse.close(); }
      } catch {}
    };

    // 3. Trigger download
    const params = new URLSearchParams({
      trackJson:  encodeURIComponent(JSON.stringify(track)),
      ytUrl,
      format,
      downloadId: dlId,
    });
    const a = document.createElement("a");
    a.href = `${BASE}/spotify/download?${params}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [format]);

  const setState = (id: string, patch: Partial<TrackState>) =>
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } as TrackState }));

  // ── Batch download ───────────────────────────────────────
  const downloadSelected = async () => {
    if (!playlist || running) return;
    setRunning(true);

    const queue = playlist.tracks.filter(t => selected.has(t.id));

    // Mark all queued
    const initStates: Record<string,TrackState> = {};
    queue.forEach(t => { initStates[t.id] = { status: "queued" }; });
    setStates(prev => ({ ...prev, ...initStates }));

    // Sequential downloads (avoids hammering yt-dlp + bandwidth)
    for (const track of queue) {
      await downloadOne(track);
      // small gap between downloads
      await new Promise(r => setTimeout(r, 800));
    }

    setRunning(false);
  };

  const doneCount  = Object.values(states).filter(s => s.status === "done").length;
  const errorCount = Object.values(states).filter(s => s.status === "error").length;
  const total      = selected.size;

  return (
    <>
      <div className="page-head">
        <p className="page-head__eyebrow">Spotify</p>
        <h1 className="page-head__title">Playlist <em>to files.</em></h1>
        <p className="page-head__sub">
          Paste a Spotify playlist or album URL. Tracks are matched on YouTube,
          downloaded, and tagged with Spotify artwork and metadata.
        </p>
      </div>

      {/* URL */}
      <label className="field-label">Spotify URL</label>
      <div className={`url-bar${invalid?" error":""}`}>
        <input
          className="url-bar__input"
          placeholder="https://open.spotify.com/playlist/..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && loadPlaylist()}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="url-bar__btn" onClick={loadPlaylist} disabled={!canFetch}>
          {fetching ? <><span className="spin" />Loading</> : "Fetch →"}
        </button>
      </div>
      {invalid  && <p className="url-bar__err">✗ Paste a Spotify playlist or album URL</p>}
      {fetchErr && <p className="url-bar__err">✗ {fetchErr}</p>}

      {/* FORMAT */}
      {playlist && (
        <div className="fade-up">
          {/* PLAYLIST CARD */}
          <div className="sp-playlist-card">
            {playlist.art && <img className="sp-playlist-card__art" src={playlist.art} alt="" />}
            <div className="sp-playlist-card__info">
              <p className="sp-playlist-card__name">{playlist.name}</p>
              <p className="sp-playlist-card__meta">
                {playlist.owner && `${playlist.owner} · `}{playlist.total} tracks
              </p>
            </div>
          </div>

          {/* FORMAT TOGGLE */}
          <label className="field-label">Format</label>
          <div className="format-pills" style={{ marginBottom: 24 }}>
            {(["mp3","m4a"] as const).map(f => (
              <button key={f} className={`format-pill${format===f?" active":""}`} onClick={() => setFormat(f)}>
                {f === "mp3" ? "♪ MP3" : "◈ M4A"}
              </button>
            ))}
          </div>

          {/* TRACK LIST */}
          <div className="track-list-head">
            <div className="track-list-head__left">
              <span className="track-list-head__count">{selected.size} / {playlist.total} selected</span>
              <button className="select-all-btn" onClick={toggleAll}>
                {selected.size === playlist.total ? "Deselect all" : "Select all"}
              </button>
            </div>
          </div>

          <div className="track-rows">
            {playlist.tracks.map((t, i) => {
              const s = states[t.id];
              const sel = selected.has(t.id);
              return (
                <div
                  key={t.id}
                  className={`track-row${sel?" selected":""}`}
                  onClick={() => !running && toggleTrack(t.id)}
                >
                  {/* Checkbox */}
                  <div className="track-row__check">{sel && "✓"}</div>
                  <span className="track-row__num">{i+1}</span>
                  {t.artworkSmall
                    ? <img className="track-row__art" src={t.artworkSmall} alt="" loading="lazy" />
                    : <div className="track-row__art" />
                  }
                  <div className="track-row__info">
                    <div className="track-row__name">{t.name}</div>
                    <div className="track-row__artist">{t.artist}</div>
                  </div>
                  <span className="track-row__dur">{fmtDur(t.duration)}</span>
                  <div className="track-row__status">
                    <TrackStatusBadge state={s} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER */}
          <div className="sp-footer">
            <span className="sp-footer__selected">
              {running
                ? `${doneCount}/${total} done${errorCount > 0 ? ` · ${errorCount} failed` : ""}`
                : `${selected.size} track${selected.size !== 1 ? "s" : ""} selected`}
            </span>
            <button
              className="sp-dl-btn"
              onClick={downloadSelected}
              disabled={selected.size === 0 || running}
            >
              {running ? <><span className="spin" />Downloading...</> : `↓ Download ${format.toUpperCase()}`}
            </button>
          </div>

          {/* BATCH PROGRESS */}
          {running && (
            <div className="batch-prog">
              <div className="batch-prog__label">
                <span>Overall progress</span>
                <span>{doneCount} / {total}</span>
              </div>
              <div className="batch-prog__track">
                <div className="batch-prog__fill" style={{ width: `${total > 0 ? (doneCount/total)*100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {!playlist && !fetching && (
        <div className="empty">
          <div className="empty__icon">♪</div>
          <p>Paste a Spotify playlist or album URL above</p>
          <p style={{ marginTop: 4, fontSize: 11 }}>
            Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in your .env
          </p>
        </div>
      )}
    </>
  );
}

// ── Per-track status badge ───────────────────────────────────────────────────
function TrackStatusBadge({ state }: { state?: TrackState }) {
  if (!state || state.status === "idle") return null;

  const map: Record<string, string> = {
    queued:      "queued",
    searching:   "active",
    downloading: "active",
    tagging:     "active",
    done:        "done",
    error:       "error",
  };

  const label: Record<string, string> = {
    queued:      "queued",
    searching:   "searching",
    downloading: state.percent ? `${Math.round(state.percent)}%` : "dl...",
    tagging:     "tagging",
    done:        "✓ done",
    error:       "✗ error",
  };

  const cls = map[state.status] || "idle";
  return (
    <span className={`track-status ${cls}`}>
      {state.status === "downloading" || state.status === "searching"
        ? <><span className="spin" style={{ marginRight: 4 }} />{label[state.status]}</>
        : label[state.status]
      }
    </span>
  );
}