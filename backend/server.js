const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { promisify } = require("util");
const { exec, spawn } = require("child_process");

const { v4: uuidv4 } = require("uuid");

const app = express();

const PORT = process.env.PORT || 5300;

const execAsync = promisify(exec);

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// ── Spotify router ──────────────────────────────────────────────────────────
// Requires: SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in env
require('dotenv').config();
const { router: spotifyRouter } = require('./spotify');
app.use('/spotify', spotifyRouter);

// ======================================================
// IN-MEMORY PROGRESS STORE
// ======================================================

const progressStore = new Map();

// ======================================================
// HELPERS
// ======================================================

const EXCLUDED_HEIGHTS = new Set([144, 240]);

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const normalizeYoutubeUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete("si");
    url.searchParams.delete("feature");
    url.searchParams.delete("ab_channel");
    url.searchParams.delete("start_radio");
    url.searchParams.delete("index");

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${id}`;
    }

    // Strip list from single-video URLs (mixes, radio, incidental playlist context)
    if (url.searchParams.has("v")) {
      const list = url.searchParams.get("list") || "";
      if (list.startsWith("RD") || list.startsWith("PL") === false) {
        // Keep only proper PLxxxxxx playlists; strip RD mixes and anything else
        url.searchParams.delete("list");
      }
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
};

const isPlaylistUrl = (url) => {
  try {
    const u = new URL(url);
    // Must have ?list= but NOT ?v= (video watch URLs with a mix/list attached are single videos)
    // Also exclude YouTube Mix/radio playlists (list starts with RD)
    if (!u.searchParams.has("list")) return false;
    if (u.searchParams.has("v")) return false;
    const list = u.searchParams.get("list") || "";
    if (list.startsWith("RD")) return false; // YouTube Mix / auto-radio
    return true;
  } catch {
    return false;
  }
};

const sanitizeFilename = (title) => {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/:*?"<>|\r\n\t]+/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
};

const contentDisposition = (title, ext) => {
  const safe = sanitizeFilename(title);
  const ascii = safe.replace(/[^a-zA-Z0-9 \-.]/g, '_');
  const encoded = encodeURIComponent(safe + '.' + ext);
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encoded}`;
};

// ======================================================
// FETCH SINGLE VIDEO METADATA
// ======================================================

const fetchMetadata = async (url) => {
  const cleanUrl = normalizeYoutubeUrl(url);

  try {
    const { stdout, stderr } = await execAsync(
      `yt-dlp --no-playlist --dump-single-json "${cleanUrl}"`,
      { maxBuffer: 1024 * 1024 * 50 }
    );

    if (stderr && stderr.includes("ERROR")) throw new Error(stderr);

    const data = JSON.parse(stdout);

    const formats = data.formats
      .filter((f) => f.vcodec !== "none" && f.height && !EXCLUDED_HEIGHTS.has(f.height))
      .map((f) => ({
        format_id: f.format_id,
        quality: `${f.height}p`,
        height: f.height,
        ext: f.ext,
        filesize: f.filesize || null,
      }));

    const uniqueFormats = [];
    const seen = new Set();
    for (const format of formats) {
      if (!seen.has(format.quality)) {
        seen.add(format.quality);
        uniqueFormats.push(format);
      }
    }

    // Sort descending by height
    uniqueFormats.sort((a, b) => b.height - a.height);

    return {
      title: data.title,
      thumbnail: data.thumbnail,
      duration: data.duration,
      uploader: data.uploader || null,
      view_count: data.view_count || null,
      formats: uniqueFormats,
      is_playlist: false,
    };
  } catch (error) {
    console.error("Metadata fetch error:", error);
    throw new Error("Failed to fetch metadata");
  }
};

// ======================================================
// FETCH PLAYLIST METADATA
// ======================================================

const fetchPlaylistMetadata = async (url) => {
  const cleanUrl = normalizeYoutubeUrl(url);

  try {
    const { stdout, stderr } = await execAsync(
      `yt-dlp --flat-playlist --dump-single-json "${cleanUrl}"`,
      { maxBuffer: 1024 * 1024 * 100 }
    );

    if (stderr && stderr.includes("ERROR")) throw new Error(stderr);

    const data = JSON.parse(stdout);

    const entries = (data.entries || []).map((e) => ({
      id: e.id,
      title: e.title,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      thumbnail: e.thumbnail || `https://img.youtube.com/vi/${e.id}/mqdefault.jpg`,
      duration: e.duration || null,
    }));

    return {
      title: data.title,
      thumbnail: data.thumbnails?.[0]?.url || entries[0]?.thumbnail || null,
      uploader: data.uploader || null,
      count: entries.length,
      entries,
      is_playlist: true,
      // Playlist MP4 formats — standard set
      formats: [
        { format_id: "1080", quality: "1080p", height: 1080, ext: "mp4", filesize: null },
        { format_id: "720",  quality: "720p",  height: 720,  ext: "mp4", filesize: null },
        { format_id: "480",  quality: "480p",  height: 480,  ext: "mp4", filesize: null },
        { format_id: "360",  quality: "360p",  height: 360,  ext: "mp4", filesize: null },
      ],
    };
  } catch (error) {
    console.error("Playlist metadata error:", error);
    throw new Error("Failed to fetch playlist metadata");
  }
};

// ======================================================
// GET FORMAT ID
// ======================================================

const getFormatIdForResolution = (formats, quality) => {
  const targetHeight = parseInt(quality.replace("p", ""));

  let bestVideo = null;
  let bestAudio = null;

  for (const format of formats) {
    if (format.vcodec !== "none" && format.acodec === "none" && format.height === targetHeight) {
      bestVideo = format;
    }
    if (format.acodec !== "none" && format.vcodec === "none") {
      if (!bestAudio || (format.abr || 0) > (bestAudio.abr || 0)) {
        bestAudio = format;
      }
    }
  }

  if (!bestVideo || !bestAudio) return "best";
  return `${bestVideo.format_id}+${bestAudio.format_id}`;
};

// ======================================================
// DOWNLOAD SINGLE VIDEO (MP4 or MP3)
// ======================================================

const downloadAndStream = async (url, quality, format, res, downloadId, startTime = null, endTime = null) => {
  const fs = require("fs");
  const path = require("path");

  // Use a dedicated temp dir so we can find whatever yt-dlp actually wrote
  const tmpDir = path.join("/tmp", `dl-${downloadId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const cleanUrl = normalizeYoutubeUrl(url);
    const isAudio = format === "mp3";

    // Fetch metadata for filename
    const { stdout, stderr: metaErr } = await execAsync(
      `yt-dlp --no-playlist --dump-single-json "${cleanUrl}"`,
      { maxBuffer: 1024 * 1024 * 50 }
    );

    if (metaErr && metaErr.includes("ERROR")) {
      throw new Error(metaErr);
    }

    const metadata = JSON.parse(stdout);
    const safeTitle = sanitizeFilename(metadata.title);

    progressStore.set(downloadId, { status: "downloading", percent: 0 });

    // Output template — let yt-dlp name it, we'll find it after
    const outTemplate = path.join(tmpDir, "output.%(ext)s");

    let ytDlpArgs;

    if (isAudio) {
      ytDlpArgs = [
        "--no-playlist",
        "-f", "bestaudio/best",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", outTemplate,
        cleanUrl,
      ];
    } else {
      const height = quality?.replace("p", "") || "720";
      ytDlpArgs = [
        "--no-playlist",
        "-f", `bestvideo[height<=${height}]+bestaudio/bestvideo+bestaudio/best`,
        "--merge-output-format", "mp4",
        "--remux-video", "mp4",
        "-o", outTemplate,
        cleanUrl,
      ];
    }

    // Inject trim/clip args if provided
    if (startTime || endTime) {
      // yt-dlp --download-sections '*START-END' then ffmpeg re-encode for accuracy
      const start = startTime || '0';
      const end = endTime || 'inf';
      ytDlpArgs.splice(ytDlpArgs.length - 1, 0,
        '--download-sections', `*${start}-${end}`,
        '--force-keyframes-at-cuts',
      );
    }

        // Collect all stderr for error reporting
    let stderrLog = "";

    // yt-dlp writes to temp dir
    await new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", ytDlpArgs);

      let killed = false;
      res.on("close", () => {
        killed = true;
        ytDlp.kill("SIGKILL");
        cleanup();
      });

      ytDlp.stderr.on("data", (data) => {
        const log = data.toString();
        stderrLog += log;

        const match = log.match(/\[download\]\s+(\d+\.\d+)%.*?at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
        if (match) {
          progressStore.set(downloadId, {
            percent: parseFloat(match[1]),
            speed: match[2],
            eta: match[3].trim(),
            status: "downloading",
          });
        }
        if (log.includes("Merging formats") || log.includes("Remuxing")) {
          progressStore.set(downloadId, { percent: 99, status: "merging" });
        }
      });

      ytDlp.on("close", (code) => {
        if (killed) return;
        if (code === 0) {
          resolve();
        } else {
          console.error("yt-dlp stderr:\n", stderrLog);
          reject(new Error(`yt-dlp exited with code ${code}\n${stderrLog.slice(-500)}`));
        }
      });
    });

    // Find the file yt-dlp wrote (ignore .part files)
    const files = fs.readdirSync(tmpDir).filter(f => !f.endsWith(".part"));
    if (files.length === 0) throw new Error("yt-dlp produced no output file");

    const outFile = path.join(tmpDir, files[0]);
    const stat = fs.statSync(outFile);
    const ext = path.extname(files[0]).slice(1) || (isAudio ? "mp3" : "mp4");
    const mimeType = isAudio ? "audio/mpeg" : "video/mp4";

    res.setHeader(
      "Content-Disposition",
      contentDisposition(safeTitle, ext)
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("X-Download-Id", downloadId);

    const readStream = fs.createReadStream(outFile);

    readStream.on("end", () => {
      progressStore.set(downloadId, { percent: 100, status: "completed" });
      cleanup();
      setTimeout(() => progressStore.delete(downloadId), 30000);
    });

    readStream.on("error", (err) => {
      console.error("Stream error:", err);
      cleanup();
    });

    readStream.pipe(res);

  } catch (error) {
    console.error("Download error:", error);
    cleanup();
    progressStore.set(downloadId, { status: "error", error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download video" });
    }
  }
};

// ======================================================
// DOWNLOAD PLAYLIST (ZIP via yt-dlp)
// ======================================================

const downloadPlaylist = async (url, quality, format, res, downloadId) => {
  try {
    const cleanUrl = normalizeYoutubeUrl(url);
    const isAudio = format === "mp3";
    const ext = isAudio ? "mp3" : "mp4";

    res.setHeader("Content-Disposition", `attachment; filename="playlist.zip"`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("X-Download-Id", downloadId);

    let ytDlpArgs;

    if (isAudio) {
      ytDlpArgs = [
        "-f", "bestaudio",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", `%(playlist_index)s - %(title)s.%(ext)s`,
        "--yes-playlist",
        cleanUrl,
      ];
    } else {
      ytDlpArgs = [
        "-f", `bestvideo[height<=${quality?.replace("p", "") || "720"}]+bestaudio/best`,
        "--merge-output-format", "mp4",
        "-o", `%(playlist_index)s - %(title)s.%(ext)s`,
        "--yes-playlist",
        cleanUrl,
      ];
    }

    // Download to temp dir then zip
    const tmpDir = `/tmp/playlist-${downloadId}`;
    const { execSync } = require("child_process");
    execSync(`mkdir -p ${tmpDir}`);

    // Adjust output to temp dir
    ytDlpArgs[ytDlpArgs.indexOf(`%(playlist_index)s - %(title)s.%(ext)s`)] =
      `${tmpDir}/%(playlist_index)s - %(title)s.%(ext)s`;

    const ytDlp = spawn("yt-dlp", ytDlpArgs);

    progressStore.set(downloadId, { status: "downloading", percent: 0 });

    ytDlp.stderr.on("data", (data) => {
      const log = data.toString();
      const match = log.match(/\[download\]\s+(\d+\.\d+)%/);
      const dlIndex = log.match(/Downloading item (\d+) of (\d+)/);

      if (dlIndex) {
        const current = parseInt(dlIndex[1]);
        const total = parseInt(dlIndex[2]);
        progressStore.set(downloadId, {
          status: "downloading",
          percent: ((current - 1) / total * 100).toFixed(1),
          item: `${current}/${total}`,
        });
      } else if (match) {
        const current = progressStore.get(downloadId) || {};
        progressStore.set(downloadId, {
          ...current,
          filePercent: match[1],
        });
      }
      if (log.includes("ERROR")) {
        console.error(log);
      }
    });

    ytDlp.on("close", async (code) => {
      if (code === 0) {
        progressStore.set(downloadId, { status: "zipping", percent: 100 });

        const zip = spawn("zip", ["-r", "-", "."], { cwd: tmpDir });

        zip.stdout.pipe(res);
        zip.on("close", () => {
          progressStore.set(downloadId, { status: "completed", percent: 100 });
          execSync(`rm -rf ${tmpDir}`);
          setTimeout(() => progressStore.delete(downloadId), 30000);
        });
      } else {
        progressStore.set(downloadId, { status: "failed", code });
        if (!res.headersSent) res.status(500).json({ error: "Playlist download failed" });
        execSync(`rm -rf ${tmpDir}`);
      }
    });

    res.on("close", () => ytDlp.kill("SIGKILL"));

  } catch (error) {
    console.error("Playlist download error:", error);
    progressStore.set(downloadId, { status: "error", error: error.message });
    if (!res.headersSent) res.status(500).json({ error: "Failed to download playlist" });
  }
};

// ======================================================
// SSE PROGRESS ENDPOINT
// ======================================================

app.get("/progress/:id", (req, res) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const progress = progressStore.get(id);
    res.write(`data: ${JSON.stringify(progress || {})}\n\n`);
  }, 500);

  req.on("close", () => clearInterval(interval));
});

// ======================================================
// MAIN ROUTE
// ======================================================

app.get("/", async (req, res) => {
  const { url, action, quality, format, startTime, endTime } = req.query;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  try {
    switch (action) {
      case "metadata": {
        const playlist = isPlaylistUrl(url);
        const metadata = playlist
          ? await fetchPlaylistMetadata(url)
          : await fetchMetadata(url);
        return res.json(metadata);
      }

      case "download": {
        const downloadId = (req.query.downloadId) || uuidv4();
        const playlist = isPlaylistUrl(url);

        // Seed immediately so SSE has something before yt-dlp starts
        progressStore.set(downloadId, { status: "starting", percent: 0 });

        if (playlist) {
          return await downloadPlaylist(url, quality, format || "mp4", res, downloadId);
        } else {
          return await downloadAndStream(url, quality, format || "mp4", res, downloadId, startTime || null, endTime || null);
        }
      }

      default:
        return res.status(400).json({ error: "Invalid action parameter" });
    }
  } catch (error) {
    console.error("Internal server error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});