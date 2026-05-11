// spotify.js — Spotify → YouTube → download with embedded metadata
// Add to server.js or mount as a separate Express router

const express  = require("express");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const { v4: uuidv4 } = require("uuid");

const router   = express.Router();
const execAsync = promisify(exec);

// ── Spotify client credentials token ───────────────────────────────────────
// Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env
let _spotifyToken = null;
let _tokenExpiry  = 0;

const getSpotifyToken = async () => {
  if (_spotifyToken && Date.now() < _tokenExpiry) return _spotifyToken;

  const creds = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const { stdout } = await execAsync(
    `curl -s -X POST https://accounts.spotify.com/api/token \
     -H "Authorization: Basic ${creds}" \
     -d "grant_type=client_credentials"`
  );

  const data = JSON.parse(stdout);
  _spotifyToken = data.access_token;
  _tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000;
  return _spotifyToken;
};

const spotifyFetch = async (endpoint) => {
  const token = await getSpotifyToken();
  const { stdout } = await execAsync(
    `curl -s -H "Authorization: Bearer ${token}" "https://api.spotify.com/v1${endpoint}"`
  );
  return JSON.parse(stdout);
};

// ── Parse Spotify URL → playlist/album/track ID ────────────────────────────
const parseSpotifyUrl = (url) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // parts: ["playlist","37i9dQZF1DXcBWIGoYBM5M"]
    if (parts.length >= 2) {
      return { type: parts[parts.length - 2], id: parts[parts.length - 1].split("?")[0] };
    }
  } catch {}
  return null;
};

// ── Fetch all tracks from playlist (handles pagination) ────────────────────
const fetchPlaylistTracks = async (playlistId) => {
  const playlist = await spotifyFetch(`/playlists/${playlistId}?fields=name,description,images,owner,tracks.total`);

  let tracks = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyFetch(
      `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,duration_ms,artists,album(name,images)))`
    );
    const items = (page.items || [])
      .filter(i => i.track && i.track.id)
      .map(i => ({
        id:       i.track.id,
        name:     i.track.name,
        artist:   i.track.artists.map(a => a.name).join(", "),
        album:    i.track.album.name,
        duration: Math.round(i.track.duration_ms / 1000),
        artwork:  i.track.album.images?.[0]?.url || null,
        artworkSmall: i.track.album.images?.[2]?.url || i.track.album.images?.[0]?.url || null,
      }));
    tracks = tracks.concat(items);
    if (page.items?.length < limit) break;
    offset += limit;
  }

  return {
    name:  playlist.name,
    owner: playlist.owner?.display_name || "",
    art:   playlist.images?.[0]?.url || null,
    total: tracks.length,
    tracks,
  };
};

// ── Fetch album tracks ─────────────────────────────────────────────────────
const fetchAlbumTracks = async (albumId) => {
  const album  = await spotifyFetch(`/albums/${albumId}`);
  const tracks = (album.tracks?.items || []).map(t => ({
    id:       t.id,
    name:     t.name,
    artist:   t.artists.map(a => a.name).join(", "),
    album:    album.name,
    duration: Math.round(t.duration_ms / 1000),
    artwork:  album.images?.[0]?.url || null,
    artworkSmall: album.images?.[2]?.url || album.images?.[0]?.url || null,
  }));
  return {
    name:  album.name,
    owner: album.artists?.[0]?.name || "",
    art:   album.images?.[0]?.url || null,
    total: tracks.length,
    tracks,
  };
};

// ── YouTube search via yt-dlp ──────────────────────────────────────────────
const searchYouTube = async (query) => {
  try {
    const { stdout } = await execAsync(
      `yt-dlp "ytsearch1:${query.replace(/"/g, "")}" --dump-single-json --no-playlist --flat-playlist`,
      { maxBuffer: 1024 * 1024 * 10 }
    );
    const d = JSON.parse(stdout);
    return d.webpage_url || d.url || `https://www.youtube.com/watch?v=${d.id}`;
  } catch {
    return null;
  }
};

// ── Sanitize filename ──────────────────────────────────────────────────────
const sanitize = (s) =>
  s.normalize("NFD")
   .replace(/[\u0300-\u036f]/g, "")
   .replace(/[^\x20-\x7E]/g, "_")
   .replace(/[\/:*?"<>|\r\n]+/g, "")
   .trim()
   .slice(0, 180);

// ── Download track with embedded metadata ──────────────────────────────────
const downloadTrack = async (track, ytUrl, format, progressStore, downloadId) => {
  const tmpDir = path.join("/tmp", `sp-${downloadId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const ext  = format === "m4a" ? "m4a" : "mp3";
  const safe = sanitize(`${track.artist} - ${track.name}`);

  try {
    progressStore.set(downloadId, { status: "downloading", percent: 0, trackName: track.name });

    const outTemplate = path.join(tmpDir, `output.%(ext)s`);

    // yt-dlp args — download audio
    const ytArgs = format === "m4a"
      ? ["--no-playlist", "-f", "bestaudio[ext=m4a]/bestaudio", "--remux-video", "m4a", "-o", outTemplate, ytUrl]
      : ["--no-playlist", "-f", "bestaudio/best", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0", "-o", outTemplate, ytUrl];

    let stderrLog = "";
    await new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", ytArgs);
      ytDlp.stderr.on("data", d => {
        const log = d.toString();
        stderrLog += log;
        const m = log.match(/\[download\]\s+(\d+\.\d+)%/);
        if (m) progressStore.set(downloadId, { status: "downloading", percent: parseFloat(m[1]), trackName: track.name });
      });
      ytDlp.on("close", code => code === 0 ? resolve(null) : reject(new Error(stderrLog.slice(-300))));
    });

    // Find output file
    const files = fs.readdirSync(tmpDir).filter(f => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (!files.length) throw new Error("No output file");
    const outFile = path.join(tmpDir, files[0]);

    progressStore.set(downloadId, { status: "tagging", percent: 100, trackName: track.name });

    // Embed metadata via ffmpeg
    const taggedFile = path.join(tmpDir, `tagged.${ext}`);

    // Download artwork to temp file
    let artArg= [];
    if (track.artwork) {
      const artFile = path.join(tmpDir, "art.jpg");
      await execAsync(`curl -sL "${track.artwork}" -o "${artFile}"`);
      if (fs.existsSync(artFile)) {
        artArg = ["-i", artFile, "-map", "0:a", "-map", "1:0", "-c:v", "mjpeg",
                  "-disposition:v:0", "attached_pic"];
      }
    }

    const ffmpegArgs = [
      "-i", outFile,
      ...artArg,
      "-metadata", `title=${track.name}`,
      "-metadata", `artist=${track.artist}`,
      "-metadata", `album=${track.album}`,
      "-c:a", "copy",
      "-id3v2_version", "3",
      "-y",
      taggedFile,
    ];

    await execAsync(`ffmpeg ${ffmpegArgs.map(a => `"${a}"`).join(" ")}`);

    const finalFile = fs.existsSync(taggedFile) ? taggedFile : outFile;
    progressStore.set(downloadId, { status: "done", percent: 100, trackName: track.name });
    return { file: finalFile, name: `${safe}.${ext}`, tmpDir };

  } catch (err) {
    progressStore.set(downloadId, { status: "error", error: err.message, trackName: track.name });
    throw err;
  }
};

// ══════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /spotify/playlist?url=...
router.get("/playlist", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const parsed = parseSpotifyUrl(url);
  if (!parsed) return res.status(400).json({ error: "Invalid Spotify URL" });

  try {
    let data;
    if (parsed.type === "playlist") data = await fetchPlaylistTracks(parsed.id);
    else if (parsed.type === "album") data = await fetchAlbumTracks(parsed.id);
    else return res.status(400).json({ error: "Only playlists and albums are supported" });
    res.json(data);
  } catch (err) {
    console.error("Spotify fetch error:", err);
    res.status(500).json({ error: "Failed to fetch from Spotify" });
  }
});

// GET /spotify/search?track=...&artist=...
router.get("/search", async (req, res) => {
  const { track, artist } = req.query;
  if (!track) return res.status(400).json({ error: "Missing track" });

  try {
    const query   = `${track} ${artist || ""} official audio`;
    const ytUrl   = await searchYouTube(query);
    res.json({ url: ytUrl });
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

// POST /spotify/download — body: { track, ytUrl, format, downloadId }
const progressStore = new Map(); // shared with main server ideally — import if refactoring

router.get("/progress/:id", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const interval = setInterval(() => {
    const p = progressStore.get(req.params.id);
    res.write(`data: ${JSON.stringify(p || {})}\n\n`);
  }, 400);

  req.on("close", () => clearInterval(interval));
});

router.get("/download", async (req, res) => {
  const { trackJson, ytUrl, format, downloadId } = req.query;
  if (!trackJson || !ytUrl || !downloadId) {
    return res.status(400).json({ error: "Missing params" });
  }

  const track = JSON.parse(decodeURIComponent(trackJson));
  const fmt   = (format === "m4a") ? "m4a" : "mp3";

  progressStore.set(downloadId, { status: "starting", percent: 0, trackName: track.name });

  let result;
  try {
    result = await downloadTrack(track, ytUrl, fmt, progressStore, downloadId);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    return;
  }

  const stat = fs.statSync(result.file);
  const safe = sanitize(`${track.artist} - ${track.name}`);
  const enc  = encodeURIComponent(`${safe}.${fmt}`);

  res.setHeader("Content-Disposition", `attachment; filename="${safe}.${fmt}"; filename*=UTF-8''${enc}`);
  res.setHeader("Content-Type",  fmt === "m4a" ? "audio/mp4" : "audio/mpeg");
  res.setHeader("Content-Length", stat.size);

  const stream = fs.createReadStream(result.file);
  stream.on("end", () => {
    progressStore.set(downloadId, { status: "completed", percent: 100, trackName: track.name });
    try { fs.rmSync(result.tmpDir, { recursive: true, force: true }); } catch {}
    setTimeout(() => progressStore.delete(downloadId), 30000);
  });
  stream.pipe(res);
});

module.exports = router;