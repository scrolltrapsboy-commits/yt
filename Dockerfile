# ==========================================
# ffmpeg-render-service
# Node.js 22 + FFmpeg production image
# ==========================================

FROM node:22-bookworm-slim

LABEL maintainer="ffmpeg-render-service"
LABEL description="FFmpeg-based render API for n8n - stock video + narration + subtitles + music -> vertical MP4"

# ==========================================
# Install system dependencies
# ==========================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    ca-certificates \
    curl \
    tini \
    libgomp1 \
    libstdc++6 \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# Piper TTS Configuration
# ==========================================
ENV PIPER_VERSION=2023.11.14-2 \
    PIPER_BIN=/opt/piper/piper \
    PIPER_MODELS_DIR=/opt/piper/models \
    PIPER_DEFAULT_VOICE=en_US-lessac-medium

# ==========================================
# Install Piper + Voice Model
# Uses scripts/install-piper.sh so the exact same, architecture-aware
# install logic works here AND on a bare-metal host (see README).
# If this RUN step fails, the build stops here -- the image will never be
# produced with a missing/broken Piper binary.
# ==========================================
COPY scripts/install-piper.sh /tmp/install-piper.sh
RUN chmod +x /tmp/install-piper.sh \
    && /tmp/install-piper.sh /opt/piper "$PIPER_DEFAULT_VOICE" \
    && rm -f /tmp/install-piper.sh

# ==========================================
# Application
# ==========================================
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY . .

# ==========================================
# Runtime Directories
# ==========================================
RUN mkdir -p \
    temp \
    output \
    subtitles \
    logs \
    assets/music \
    assets/fonts \
    assets/overlays \
    public \
    public/audio \
    && chown -R node:node /app \
    && chown -R node:node /opt/piper

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

USER node

ENTRYPOINT ["/usr/bin/tini","--"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node health.js || exit 1

CMD ["node","server.js"]
