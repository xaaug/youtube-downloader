const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { exec } = require("child_process");
const { promisify } = require("util");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;
const execAsync = promisify(exec);

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Validate URL
const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (err) {
        return false;
    }
};

// Fetch metadata
const fetchMetadata = async (url) => {
    try {
        const { stdout, stderr } = await execAsync(`yt-dlp --dump-json "${url}"`);

        // Log warnings but don't treat them as errors
        if (stderr && !stderr.includes("WARNING")) {
            throw new Error(stderr);
        }

        const data = JSON.parse(stdout);
        return {
            title: data.title,
            thumbnail: data.thumbnail,
            duration: data.duration,
            formats: data.formats.map(format => ({
                format_id: format.format_id,
                resolution: format.format_note,
                extension: format.ext,
            })),
        };
    } catch (error) {
        console.error("Metadata fetch error:", error);
        throw new Error("Failed to fetch metadata");
    }
};

// Get file size using yt-dlp
const getFileSize = async (url, formatId) => {
    try {
        const { stdout } = await execAsync(`yt-dlp -f ${formatId.slice(0, 3)} --print filesize "${url}"`);
        const fileSize = stdout.trim();
        return fileSize ? parseInt(fileSize, 10) : null;
    } catch (error) {
        console.warn("File size could not be retrieved, proceeding without it.");
        return null;
    }
};

// Get available formats for a video
const listAvailableFormats = async (url) => {
    try {
        const { stdout } = await execAsync(`yt-dlp --list-formats "${url}"`);
        return stdout;
    } catch (error) {
        console.error("Error listing formats:", error);
        throw new Error("Failed to list available formats");
    }
};

// Get format ID for the desired resolution
const getFormatIdForResolution = async (url, quality) => {
    try {
        const { stdout } = await execAsync(`yt-dlp --dump-json "${url}"`);
        const data = JSON.parse(stdout);

        const normalizedQuality = quality.replace("p", "").toLowerCase();
        let bestVideo = null;
        let bestAudio = null;

        // Find the best video format and best audio format
        for (const format of data.formats) {
            if (format.vcodec !== "none" && format.acodec === "none" && format.format_note && format.format_note.includes(normalizedQuality)) {
                bestVideo = format.format_id;
            }

            if (format.acodec !== "none" && format.vcodec === "none") {
                if (!bestAudio || parseInt(format.abr) > parseInt(bestAudio.abr)) {
                    bestAudio = format.format_id;
                }
            }
        }


        // Ensure both video and audio are selected
        if (bestVideo && bestAudio) {
            return `${bestVideo}+${bestAudio}`;
        }

        // Fallback if no exact match is found
        console.warn(`No exact match for resolution: ${quality}. Falling back.`);
        return data.formats.find(f => f.ext === "mp4")?.format_id || "best";
    } catch (error) {
        console.error("Format ID fetch error:", error);
        throw new Error("Failed to fetch format ID");
    }
};

// Download & Stream with Video Title as Filename
const downloadAndStream = async (url, format, quality, res) => {
    try {
        const metadata = await fetchMetadata(url);
        const safeTitle = metadata.title.replace(/[\/:*?"<>|]/g, ""); // Remove invalid filename characters

        // Get format ID for the desired resolution (video + audio)
        const formatId = await getFormatIdForResolution(url, quality);
        console.log("Selected Format ID:", formatId);

        // Get file size
        const fileSize = await getFileSize(url, formatId);
        console.log("File size:", fileSize);

        // Set headers
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.${format}"`);
        res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : `video/${format}`);
        if (fileSize) {
            res.setHeader("Content-Length", fileSize); // Add Content-Length header if available
        }

        // Use yt-dlp to download the video
        const process = spawn("yt-dlp", [
            "-f", formatId, // Use the exact format ID
            "--merge-output-format", "mp4",
            "-o", "-", // Output to stdout
            url,
        ]);

        // Handle client disconnect
        res.once("close", () => {
            process.kill(); // Stop process if client disconnects
        });

        // Stream video to client
        process.stdout.pipe(res);

        // Log only actual errors
        process.stderr.on("data", (data) => {
            const log = data.toString();
            if (log.includes("ERROR")) {
                console.error("yt-dlp error:", log);
            }
        });

        // Handle process close
        process.on("close", (code) => {
            if (code !== 0 && !res.headersSent) {
                console.error("yt-dlp process exited with code:", code);
                res.status(500).json({ error: "Download failed" });
            }
        });
    } catch (error) {
        console.error("Download error:", error);
        res.status(500).json({ error: "Failed to download video" });
    }
};

// Single route using search parameters
app.get("/", async (req, res) => {
    const { url, action, format, quality } = req.query;

    if (!url || !isValidUrl(url)) {
        return res.status(400).json({ error: "Invalid or missing 'url' parameter" });
    }

    try {
        switch (action) {
            case "metadata":
                const metadata = await fetchMetadata(url);
                return res.json(metadata);
            case "download":
                if (!format) {
                    return res.status(400).json({ error: "Missing 'format' parameter" });
                }
                return await downloadAndStream(url, format, quality, res);
            default:
                return res.status(400).json({ error: "Invalid 'action' parameter" });
        }
    } catch (error) {
        console.error("Internal server error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
