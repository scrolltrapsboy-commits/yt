const fs = require('fs');
const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { cleanupOldOutputFiles, cleanupOldAudioFiles } = require('./src/utils/fileUtils');

// ===========================
// PIPER TTS STARTUP CHECK
// ===========================
// Non-fatal: the render/video pipeline works without Piper (narration is
// optional), so we warn loudly instead of crashing the whole service.
const piperBin = config.tts.piperBin;
const piperModelPath = `${config.tts.modelsDir}/${config.tts.defaultVoice}.onnx`;
const piperBinFound = fs.existsSync(piperBin);
const piperModelFound = fs.existsSync(piperModelPath);

if (!piperBinFound || !piperModelFound) {
  logger.warn('========== PIPER TTS NOT READY ==========');
  if (!piperBinFound) {
    logger.warn(`Piper binary not found at: ${piperBin}`);
  }
  if (!piperModelFound) {
    logger.warn(`Piper voice model not found at: ${piperModelPath}`);
  }
  logger.warn(
    'TTS endpoints (/tts, and /render with auto-narration) will fail until this is fixed.'
  );
  logger.warn(
    'Docker: rebuild the image with "docker compose up --build" and check the Piper install step in the build logs.'
  );
  logger.warn(
    'Bare metal: run "scripts/install-piper.sh" (or set PIPER_BIN / PIPER_MODELS_DIR to an existing install).'
  );
  logger.warn('See GET /health for a machine-readable status of this check.');
  logger.warn('==========================================');
} else {
  logger.info({ piperBin, defaultVoice: config.tts.defaultVoice }, 'Piper TTS engine ready');
}

// ===========================
// Start Server
// ===========================
const server = app.listen(config.port, config.host, () => {
  logger.info(
    {
      port: config.port,
      host: config.host,
      env: config.nodeEnv,
    },
    `ffmpeg-render-service listening on http://${config.host}:${config.port}`
  );
});

// Cleanup
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

setInterval(() => {
  cleanupOldOutputFiles(config.cleanup.maxOutputAgeHours).catch((err) => {
    logger.warn({ err: err.message }, 'Scheduled output cleanup failed');
  });

  cleanupOldAudioFiles(config.tts.maxAudioAgeHours).catch((err) => {
    logger.warn({ err: err.message }, 'Scheduled audio cleanup failed');
  });
}, CLEANUP_INTERVAL_MS);

// Graceful shutdown
function shutdown(signal) {
  logger.info({ signal }, 'Shutting down server');

  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error(
    {
      err: err.message,
      stack: err.stack,
    },
    'Uncaught exception'
  );

  process.exit(1);
});

module.exports = server;
