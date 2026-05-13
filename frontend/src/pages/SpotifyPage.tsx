import { useState, useEffect, useCallback } from "react";
import { addToHistory } from "../App";
import { CheckIcon, XIcon } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const fmtDur = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const isSpotUrl = (u: string) => {
  try {
    const x = new URL(u);
    return (
      x.hostname.includes("spotify.com") &&
      (x.pathname.includes("/playlist/") ||
        x.pathname.includes("/album/") ||
        x.pathname.includes("/track/"))
    );
  } catch {
    return false;
  }
};

type SpTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string | null;
  artworkSmall: string | null;
};
type SpData = {
  name: string;
  owner: string;
  art: string | null;
  total: number;
  isSingle: boolean;
  tracks: SpTrack[];
};
type TStatus =
  | "idle"
  | "queued"
  | "searching"
  | "downloading"
  | "tagging"
  | "done"
  | "error";
type TState = { status: TStatus; percent?: number; error?: string };

interface Props {
  onAmbient: (url: string | null) => void;
}

export default function SpotifyPage({ onAmbient }: Props) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [data, setData] = useState<SpData | null>(null);
  const [fetchErr, setFetchErr] = useState("");

  const [format, setFormat] = useState<"mp3" | "m4a">("mp3");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, TState>>({});
  const [running, setRunning] = useState(false);

  // Listen for clipboard paste
  useEffect(() => {
    const h = (e: Event) => {
      const u = (e as CustomEvent).detail as string;
      if (isSpotUrl(u)) {
        setUrl(u);
        setData(null);
        setFetchErr("");
      }
    };
    window.addEventListener("dl:paste-url", h);
    return () => window.removeEventListener("dl:paste-url", h);
  }, []);

  const invalid = url.length > 0 && !isSpotUrl(url);
  const canFetch = url.length > 0 && !invalid && !fetching;

  const load = async () => {
    if (!canFetch) return;
    setFetching(true);
    setData(null);
    setFetchErr("");
    setSelected(new Set());
    setStates({});
    onAmbient(null);
    try {
      const r = await fetch(
        `${BASE}/spotify/fetch?url=${encodeURIComponent(url)}`,
      );
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      const d: SpData = await r.json();
      console.log(d)
      setData(d);
      setSelected(new Set(d.tracks.map((t) => t.id)));
      onAmbient(d.art || d.tracks[0]?.artwork || null);
    } catch (e: any) {
      setFetchErr(e.message?.slice(0, 120) || "Failed to fetch from Spotify");
    } finally {
      setFetching(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = () => {
    if (!data) return;
    setSelected((p) =>
      p.size === data.tracks.length
        ? new Set()
        : new Set(data.tracks.map((t) => t.id)),
    );
  };

  const patchState = (id: string, patch: Partial<TState>) =>
    setStates((p) => ({
      ...p,
      [id]: { ...(p[id] || {}), ...patch } as TState,
    }));

  const downloadOne = useCallback(
    async (track: SpTrack) => {
      // 1. Search
      patchState(track.id, { status: "searching" });
      let ytUrl: string;
      try {
        const r = await fetch(
          `${BASE}/spotify/search?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`,
        );
        const d = await r.json();
        if (!d.url) throw new Error("No result");
        ytUrl = d.url;
      } catch {
        patchState(track.id, {
          status: "error",
          error: "YouTube search failed",
        });
        return;
      }

      // 2. Set up SSE BEFORE triggering download
      const dlId = genId();
      patchState(track.id, { status: "downloading", percent: 0 });

      const sse = new EventSource(`${BASE}/spotify/progress/${dlId}`);
      await new Promise<void>((resolve) => {
        sse.onmessage = () => {
          sse.onmessage = null;
          resolve();
        };
      });

      sse.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (!Object.keys(d).length) return;
          if (d.status === "downloading")
            patchState(track.id, { status: "downloading", percent: d.percent });
          if (d.status === "tagging")
            patchState(track.id, { status: "tagging", percent: 100 });
          if (d.status === "completed") {
            patchState(track.id, { status: "done", percent: 100 });
            sse.close();
            addToHistory({
              title: `${track.artist} - ${track.name}`,
              url,
              thumbnail: track.artworkSmall || undefined,
              format,
            });
          }
          if (d.status === "error") {
            patchState(track.id, { status: "error", error: d.error });
            sse.close();
          }
        } catch {}
      };

      // 3. Trigger browser download
      const params = new URLSearchParams({
        track: JSON.stringify(track),
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

      // 4. Wait for completion or error
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          setStates((p) => {
            const s = p[track.id]?.status;
            if (s === "done" || s === "error") {
              clearInterval(check);
              resolve();
            }
            return p;
          });
        }, 500);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 300_000); // 5min timeout
      });
    },
    [format, url],
  );

  const downloadSelected = async () => {
    if (!data || running) return;
    setRunning(true);
    const queue = data.tracks.filter((t) => selected.has(t.id));
    queue.forEach((t) => patchState(t.id, { status: "queued" }));
    for (const track of queue) {
      await downloadOne(track);
      await new Promise((r) => setTimeout(r, 600));
    }
    setRunning(false);
  };

  const doneCount = Object.values(states).filter(
    (s) => s.status === "done",
  ).length;
  const errorCount = Object.values(states).filter(
    (s) => s.status === "error",
  ).length;

  return (
    <>
      <div className="pg-head">
        <p className="pg-head__eye">Spotify</p>
        <h1 className="pg-head__h1">
          Playlist <em>to files.</em>
        </h1>
        <p className="pg-head__sub">
          Paste a playlist, album, or track link.
        </p>
      </div>

      <span className="lbl">Spotify URL</span>
      <div className={`url-bar${invalid ? " err" : ""}`}>
        <input
          className="url-bar__in"
          placeholder="https://open.spotify.com/playlist/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        <button className="url-bar__go" onClick={load} disabled={!canFetch}>
          {fetching ? (
            <>
              <span className="spin" /> Loading
            </>
          ) : (
            "Fetch →"
          )}
        </button>
      </div>
      {invalid && (
        <p className="url-err">Paste a Spotify playlist, album, or track URL</p>
      )}
      {fetchErr && <p className="url-err">{fetchErr}</p>}

      {data && (
        <div>
          {/* COLLECTION CARD */}
          <div className="sp-card anim-up">
            {/* {data.art && <img className="sp-card__art" src={data.art} alt="" />}
            <div className="sp-card__info">
              <p className="sp-card__name">{data.name}</p>
              <p className="sp-card__meta">
                {data.owner && `${data.owner} · `}
                {data.isSingle ? "Single track" : `${data.total} tracks`}
              </p>
            </div> */}
           
            {!data.isSingle ? <>
              {data.art && <img className="sp-card__art" src={data.art} alt="" />}
            <div className="sp-card__info">
              <p className="sp-card__name">{data.name}</p>
              <p className="sp-card__meta">
                {data.owner && `${data.owner} · `}
                {data.isSingle ? "Single track" : `${data.total} tracks`}
              </p>
            </div></> :  <iframe
              data-testid="embed-iframe"
              style={{ borderRadius: "none" }}
              src={`https://open.spotify.com/embed/track/${data.tracks[0].id}?utm_source=generator`}
              width="100%"
              height="152"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            ></iframe>}
          </div>

          {/* FORMAT */}
          <span className="lbl anim-up-2">Format</span>
          <div className="pills anim-up-2" style={{ marginBottom: 20 }}>
            {(["mp3", "m4a"] as const).map((f) => (
              <button
                key={f}
                className={`pill${format === f ? " on" : ""}`}
                onClick={() => setFormat(f)}
              >
                {f === "mp3" ? "MP3" : "M4A"}
              </button>
            ))}
          </div>

          {/* TRACK LIST */}
          {!data.isSingle && (
            <div className="anim-up-3">
              <div className="tl-head">
                <span className="tl-count">
                  {selected.size} / {data.total} selected
                </span>
                <button className="tl-sel-all" onClick={toggleAll}>
                  {selected.size === data.total ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="track-rows">
                {data.tracks.map((t, i) => {
                  const s = states[t.id];
                  const sel = selected.has(t.id);
                  return (
                    <>
                      <div
                        key={t.id}
                        className={`tr${sel ? " sel" : ""}`}
                        onClick={() => !running && toggle(t.id)}
                      >
                        <div className="tr__chk">{sel && <XIcon />}</div>
                        <span className="tr__n">{i + 1}</span>
                        {t.artworkSmall ? (
                          <img
                            className="tr__art"
                            src={t.artworkSmall}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <div className="tr__art" />
                        )}
                        <div className="tr__info">
                          <div className="tr__name">{t.name}</div>
                          <div className="tr__artist">{t.artist}</div>
                        </div>
                        <span className="tr__dur">{fmtDur(t.duration)}</span>
                        <div className="tr__status">
                          <TrackBadge state={s} />
                        </div>
                      </div>
                      <iframe
                        data-testid="embed-iframe"
                        style={{ borderRadius: "none" }}
                        src={`https://open.spotify.com/embed/track/${t.id}?utm_source=generator`}
                        width="100%"
                        height="152"
                        frameBorder="0"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                      ></iframe>
                    </>
                  );
                })}
              </div>
            </div>
          )}

          {/* FOOTER */}
          <div className="sp-foot anim-up-4">
            <span className="sp-foot__info">
              {running
                ? `${doneCount}/${selected.size} done${errorCount > 0 ? ` · ${errorCount} failed` : ""}`
                : data.isSingle
                  ? "Ready to download"
                  : `${selected.size} track${selected.size !== 1 ? "s" : ""} selected`}
            </span>
            <button
              className="sp-dl-btn"
              onClick={downloadSelected}
              disabled={selected.size === 0 || running}
            >
              {running ? (
                <>
                  <span className="spin" />
                  Downloading…
                </>
              ) : (
                `↓ ${format.toUpperCase()}`
              )}
            </button>
          </div>

          {running && (
            <div className="batch-bar anim-in">
              <div className="batch-bar__row">
                <span>Progress</span>
                <span>
                  {doneCount} / {selected.size}
                </span>
              </div>
              <div className="batch-bar__track">
                <div
                  className="batch-bar__fill"
                  style={{
                    width: `${selected.size > 0 ? (doneCount / selected.size) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* {!data && !fetching && (
        <div className="empty">
          <p>Paste a Spotify URL above to get started</p>
        </div>
      )} */}
    </>
  );
}

function TrackBadge({ state }: { state?: TState }) {
  if (!state || state.status === "idle") return null;
  const isActive =
    state.status === "searching" ||
    state.status === "downloading" ||
    state.status === "tagging";
  const label =
    {
      queued: "queued",
      searching: "searching",
      downloading: state.percent ? `${Math.round(state.percent)}%` : "...",
      tagging: "tagging",
      done: <CheckIcon />,
      error: <XIcon />,
    }[state.status] || "";
  const cls =
    state.status === "done"
      ? "done"
      : state.status === "error"
        ? "error"
        : isActive
          ? "active"
          : "queued";
  return (
    <span className={`ts ${cls}`}>
      {isActive && <span className="spin" style={{ marginRight: 3 }} />}
      {label}
    </span>
  );
}
