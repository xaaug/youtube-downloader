# ── Backend Dockerfile ──────────────────────────────────────────────────────
FROM node:20-slim

# Install system deps: ffmpeg, curl, python3 (needed for yt-dlp), zip
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    zip \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (latest stable binary)
RUN curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Verify installs
RUN yt-dlp --version && ffmpeg -version | head -1

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

# Copy source
COPY server.js spotify.js ./

# /tmp is writable by default — used for download temp dirs
# Render gives at least 512MB ephemeral disk on /tmp

EXPOSE 5300

ENV NODE_ENV=production
ENV PORT=5300

CMD ["node", "server.js"]