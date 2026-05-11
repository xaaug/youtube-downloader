// spotify.js — Spotify → YouTube → download with embedded metadata
require("dotenv").config();
const express = require("express");
const { spawn } = require("child_process");
const { promisify } = require("util");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const execAsync = promisify(exec);

// ── In-memory progress store ──────────────────────────────────────────────
const progressStore = new Map();

// ── Spotify auth ──────────────────────────────────────────────────────────
let _token = null,
  _expiry = 0;

const getToken = async () => {
  if (_token && Date.now() < _expiry) return _token;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const sec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !sec)
    throw new Error(
      "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set in .env",
    );
  const creds = Buffer.from(`${id}:${sec}`).toString("base64");
  const { stdout } = await execAsync(
    `curl -s -X POST https://accounts.spotify.com/api/token -H "Authorization: Basic ${creds}" -d "grant_type=client_credentials"`,
  );
  const d = JSON.parse(stdout);
  if (!d.access_token) throw new Error(`Spotify auth failed: ${stdout}`);
  _token = d.access_token;
  _expiry = Date.now() + (d.expires_in - 60) * 1000;
  return _token;
};

const spotifyGet = async (endpoint) => {
  const tok = await getToken();
  const { stdout } = await execAsync(
    `curl -s -H "Authorization: Bearer ${tok}" "https://api.spotify.com/v1${endpoint}"`,
    { maxBuffer: 1024 * 1024 * 20 },
  );
  const d = JSON.parse(stdout);
  if (d.error) throw new Error(d.error.message || "Spotify API error");
  return d;
};

// ── Parse Spotify URL ─────────────────────────────────────────────────────
const parseSpotifyUrl = (url) => {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("spotify.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // e.g. ["playlist","abc"] or ["track","xyz"] or ["album","xyz"]
    const type = parts[parts.length - 2];
    const id = parts[parts.length - 1].split("?")[0];
    if (!type || !id) return null;
    return { type, id };
  } catch {
    return null;
  }
};

// ── Normalize a track item from Spotify API ───────────────────────────────
const normalizeTrack = (t, albumOverride) => ({
  id: t.id,
  name: t.name,
  artist: (t.artists || []).map((a) => a.name).join(", "),
  album: albumOverride || t.album?.name || "",
  duration: Math.round((t.duration_ms || 0) / 1000),
  artwork: (t.album?.images || albumOverride?.images || [])[0]?.url || null,
  artworkSmall:
    (t.album?.images || albumOverride?.images || [])[2]?.url ||
    (t.album?.images || albumOverride?.images || [])[0]?.url ||
    null,
});

// ── Fetch single track ────────────────────────────────────────────────────
const fetchTrack = async (id) => {
  const t = await spotifyGet(`/tracks/${id}`);
  return {
    name: t.name,
    owner: t.artists?.[0]?.name || "",
    art: t.album?.images?.[0]?.url || null,
    total: 1,
    isSingle: true,
    tracks: [normalizeTrack(t)],
  };
};

// ── Fetch playlist (paginated) ────────────────────────────────────────────
const fetchPlaylist = async (id) => {
  const pl = await spotifyGet(
    `/playlists/${id}?fields=name,images,owner,tracks.total`,
  );
  const tracks = [];
  let offset = 0;
  while (true) {
    const page = await spotifyGet(
      `/playlists/${id}/tracks?limit=50&offset=${offset}&fields=items(track(id,name,duration_ms,artists,album(name,images)))`,
    );
    const items = (page.items || [])
      .filter((i) => i.track?.id)
      .map((i) => normalizeTrack(i.track));
    tracks.push(...items);
    if ((page.items?.length || 0) < 50) break;
    offset += 50;
  }
  return {
    name: pl.name,
    owner: pl.owner?.display_name || "",
    art: pl.images?.[0]?.url || null,
    total: tracks.length,
    isSingle: false,
    tracks,
  };
};

// ── Fetch album ───────────────────────────────────────────────────────────
const fetchAlbum = async (id) => {
  const al = await spotifyGet(`/albums/${id}`);
  const tracks = (al.tracks?.items || []).map((t) => normalizeTrack(t, al));
  return {
    name: al.name,
    owner: al.artists?.[0]?.name || "",
    art: al.images?.[0]?.url || null,
    total: tracks.length,
    isSingle: false,
    tracks,
  };
};

// ── YouTube search via yt-dlp ─────────────────────────────────────────────
const searchYouTube = async (track, artist) => {
  const query = `${track} ${artist} audio`.replace(/"/g, "").replace(/'/g, "");
  const { stdout } = await execAsync(
    `yt-dlp "ytsearch1:${query}" --dump-single-json --no-playlist`,
    { maxBuffer: 1024 * 1024 * 5 },
  );
  const d = JSON.parse(stdout);

  // ytsearch returns a container with entries[], OR a single video object
  const entry = d.entries?.[0] ?? d;
  const videoId = entry?.id;
  if (!videoId || videoId.length < 5) throw new Error("No YouTube result found");

  return `https://www.youtube.com/watch?v=${videoId}`;
};

// ── Sanitize ──────────────────────────────────────────────────────────────
const sanitize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\/:*?"<>|\r\n]+/g, "")
    .trim()
    .slice(0, 180);

// ── Spawn helper (returns stdout buffer) ──────────────────────────────────
const spawnAsync = (cmd, args, onStderr) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const out = [];
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => onStderr && onStderr(d.toString()));
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${cmd} exited ${code}`)),
    );
  });

// ── Download + tag one track ──────────────────────────────────────────────
const downloadTrack = async (track, ytUrl, fmt, dlId) => {
  const tmpDir = path.join("/tmp", `sp-${dlId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext = fmt === "m4a" ? "m4a" : "mp3";

  try {
    progressStore.set(dlId, {
      status: "downloading",
      percent: 0,
      name: track.name,
    });

    // 1. Download audio via yt-dlp
    const outTpl = path.join(tmpDir, "raw.%(ext)s");
    const ytArgs =
      fmt === "m4a"
        ? [
            "--no-playlist",
            "-f",
            "bestaudio[ext=m4a]/bestaudio",
            "--remux-video",
            "m4a",
            "-o",
            outTpl,
            ytUrl,
          ]
        : [
            "--no-playlist",
            "-f",
            "bestaudio/best",
            "--extract-audio",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "-o",
            outTpl,
            ytUrl,
          ];

    await spawnAsync("yt-dlp", ytArgs, (log) => {
      const m = log.match(/\[download\]\s+(\d+\.\d+)%/);
      if (m)
        progressStore.set(dlId, {
          status: "downloading",
          percent: parseFloat(m[1]),
          name: track.name,
        });
    });

    // Find raw file
    const rawFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (!rawFiles.length) throw new Error("yt-dlp produced no file");
    const rawFile = path.join(tmpDir, rawFiles[0]);

    progressStore.set(dlId, {
      status: "tagging",
      percent: 100,
      name: track.name,
    });

    // 2. Download artwork
    const artFile = path.join(tmpDir, "art.jpg");
    let hasArt = false;
    if (track.artwork) {
      try {
        await spawnAsync("curl", ["-sL", track.artwork, "-o", artFile]);
        hasArt = fs.existsSync(artFile) && fs.statSync(artFile).size > 0;
      } catch {}
    }

    // 3. Tag with ffmpeg via spawn (handles special chars in metadata safely)
    const taggedFile = path.join(tmpDir, `tagged.${ext}`);
    const ffArgs = [
      "-i",
      rawFile,
      ...(hasArt ? ["-i", artFile] : []),
      ...(hasArt
        ? [
            "-map",
            "0:a",
            "-map",
            "1:0",
            "-c:v",
            "mjpeg",
            "-disposition:v:0",
            "attached_pic",
          ]
        : []),
      "-metadata",
      `title=${track.name}`,
      "-metadata",
      `artist=${track.artist}`,
      "-metadata",
      `album=${track.album}`,
      "-c:a",
      "copy",
      "-id3v2_version",
      "3",
      "-y",
      taggedFile,
    ];

    await spawnAsync("ffmpeg", ffArgs);

    const finalFile = fs.existsSync(taggedFile) ? taggedFile : rawFile;
    const size = fs.statSync(finalFile).size;
    progressStore.set(dlId, {
      status: "done",
      percent: 100,
      name: track.name,
      size,
    });
    return { file: finalFile, tmpDir, size };
  } catch (err) {
    progressStore.set(dlId, {
      status: "error",
      error: err.message,
      name: track.name,
    });
    throw err;
  }
};

// ══════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /spotify/fetch?url=...  (playlist, album, or single track)
router.get("/fetch", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });
  const parsed = parseSpotifyUrl(url);
  if (!parsed) return res.status(400).json({ error: "Invalid Spotify URL" });
  try {
    let data;
    if (parsed.type === "playlist") data = await fetchPlaylist(parsed.id);
    else if (parsed.type === "album") data = await fetchAlbum(parsed.id);
    else if (parsed.type === "track") data = await fetchTrack(parsed.id);
    else
      return res
        .status(400)
        .json({ error: `Unsupported type: ${parsed.type}` });
    res.json(data);
  } catch (err) {
    console.error("Spotify fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /spotify/search?track=...&artist=...
router.get("/search", async (req, res) => {
  const { track, artist } = req.query;
  if (!track) return res.status(400).json({ error: "Missing track" });
  try {
    const url = await searchYouTube(track, artist || "");
    res.json({ url });
  } catch (err) {
    console.error("YouTube search error:", err.message);
    res.status(500).json({ error: "YouTube search failed" });
  }
});

// GET /spotify/progress/:id  (SSE)
router.get("/progress/:id", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  progressStore.set(req.params.id, { status: "starting", percent: 0 });
  const iv = setInterval(() => {
    const p = progressStore.get(req.params.id);
    res.write(`data: ${JSON.stringify(p || {})}\n\n`);
  }, 400);
  req.on("close", () => clearInterval(iv));
});

// GET /spotify/download?track=<json>&ytUrl=...&format=...&downloadId=...
router.get("/download", async (req, res) => {
  let { track: trackRaw, ytUrl, format, downloadId } = req.query;
  if (!trackRaw || !ytUrl || !downloadId) {
    return res.status(400).json({ error: "Missing params" });
  }
  if (!ytUrl.includes("youtube.com/watch?v=") && !ytUrl.includes("youtu.be/")) {
    return res.status(400).json({ error: `Invalid ytUrl: ${ytUrl}` });
  }
  let track;
  try {
    track = JSON.parse(trackRaw);
  } catch {
    return res.status(400).json({ error: "Invalid track JSON" });
  }

  const fmt = format === "m4a" ? "m4a" : "mp3";
  progressStore.set(downloadId, {
    status: "starting",
    percent: 0,
    name: track.name,
  });

  let result;
  try {
    result = await downloadTrack(track, ytUrl, fmt, downloadId);
  } catch (err) {
    console.error("Track download error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    return;
  }

  const safe = sanitize(`${track.artist} - ${track.name}`);
  const enc = encodeURIComponent(`${safe}.${fmt}`);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safe}.${fmt}"; filename*=UTF-8''${enc}`,
  );
  res.setHeader("Content-Type", fmt === "m4a" ? "audio/mp4" : "audio/mpeg");
  res.setHeader("Content-Length", result.size);

  const stream = fs.createReadStream(result.file);
  stream.on("end", () => {
    progressStore.set(downloadId, {
      status: "completed",
      percent: 100,
      name: track.name,
    });
    setTimeout(() => {
      progressStore.delete(downloadId);
      try {
        fs.rmSync(result.tmpDir, { recursive: true, force: true });
      } catch {}
    }, 30000);
  });
  stream.pipe(res);
});

module.exports = { router, progressStore };
