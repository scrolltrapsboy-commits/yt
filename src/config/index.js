require('dotenv').config();
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(ROOT_DIR, 'public');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,

  // Directories
  dirs: {
    root: ROOT_DIR,
    temp: process.env.TEMP_DIR || path.join(ROOT_DIR, 'temp'),
    output: process.env.OUTPUT_DIR || path.join(ROOT_DIR, 'output'),
    subtitles: process.env.SUBTITLES_DIR || path.join(ROOT_DIR, 'subtitles'),
    assets: path.join(ROOT_DIR, 'assets'),
    music: path.join(ROOT_DIR, 'assets', 'music'),
    fonts: path.join(ROOT_DIR, 'assets', 'fonts'),
    overlays: path.join(ROOT_DIR, 'assets', 'overlays'),
    logs: process.env.LOGS_DIR || path.join(ROOT_DIR, 'logs'),
    public: PUBLIC_DIR,
    // Generated TTS audio lives here and is served statically at /audio/:file
    audio: process.env.AUDIO_DIR || path.join(PUBLIC_DIR, 'audio')
  },

  // Video defaults
  video: {
    width: parseInt(process.env.DEFAULT_WIDTH, 10) || 1080,
    height: parseInt(process.env.DEFAULT_HEIGHT, 10) || 1920,
    fps: parseInt(process.env.DEFAULT_FPS, 10) || 30,
    crf: parseInt(process.env.DEFAULT_CRF, 10) || 20,
    preset: process.env.DEFAULT_PRESET || 'medium',
    audioBitrate: process.env.AUDIO_BITRATE || '192k',
    pixelFormat: 'yuv420p'
  },

  // Subtitles
  subtitles: {
    maxCharsPerLine: parseInt(process.env.SUB_MAX_CHARS, 10) || 42,
    maxLines: parseInt(process.env.SUB_MAX_LINES, 10) || 2,
    fontName: process.env.SUB_FONT_NAME || 'DejaVu Sans',
    fontSize: parseInt(process.env.SUB_FONT_SIZE, 10) || 64,
    fontColor: process.env.SUB_FONT_COLOR || 'white',
    outlineColor: process.env.SUB_OUTLINE_COLOR || 'black',
    outlineWidth: parseInt(process.env.SUB_OUTLINE_WIDTH, 10) || 3,
    marginBottom: parseInt(process.env.SUB_MARGIN_BOTTOM, 10) || 120
  },

  // Background music
  music: {
    volume: parseFloat(process.env.MUSIC_VOLUME) || 0.1,
    fadeInSeconds: parseFloat(process.env.MUSIC_FADE_IN) || 2,
    fadeOutSeconds: parseFloat(process.env.MUSIC_FADE_OUT) || 3
  },

  // Download / network behavior
  download: {
    maxRetries: parseInt(process.env.DOWNLOAD_MAX_RETRIES, 10) || 3,
    retryDelayMs: parseInt(process.env.DOWNLOAD_RETRY_DELAY_MS, 10) || 1500,
    timeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS, 10) || 60000,
    maxFileSizeBytes: parseInt(process.env.DOWNLOAD_MAX_FILE_SIZE_BYTES, 10) || 500 * 1024 * 1024
  },

  // FFmpeg
  ffmpeg: {
    timeoutMs: parseInt(process.env.FFMPEG_TIMEOUT_MS, 10) || 15 * 60 * 1000
  },

  // Cleanup
  cleanup: {
    deleteTempAfterRender: process.env.DELETE_TEMP_AFTER_RENDER !== 'false',
    maxOutputAgeHours: parseInt(process.env.MAX_OUTPUT_AGE_HOURS, 10) || 24
  },

  // Text-to-Speech (Piper - local, offline, no API keys / no paid services)
  tts: {
    piperBin: process.env.PIPER_BIN || '/opt/piper/piper',
    modelsDir: process.env.PIPER_MODELS_DIR || '/opt/piper/models',
    defaultVoice: process.env.PIPER_DEFAULT_VOICE || 'en_US-lessac-medium',
    maxChars: parseInt(process.env.TTS_MAX_CHARS, 10) || 5000,
    timeoutMs: parseInt(process.env.TTS_TIMEOUT_MS, 10) || 60000,
    maxAudioAgeHours: parseInt(process.env.TTS_MAX_AUDIO_AGE_HOURS, 10) || 24
  },

  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development'
};

module.exports = config;
