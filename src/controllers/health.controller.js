const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * GET /health
 * Liveness check used by Docker HEALTHCHECK and monitoring.
 *
 * Always returns 200/{ status: "ok" } for liveness purposes (so container
 * orchestrators don't kill the process over an optional dependency), but
 * includes a "tts" block reporting whether Piper is actually installed and
 * ready, so a missing-Piper deployment issue shows up immediately here
 * instead of only surfacing on the first /tts or /render request.
 */
function handleHealth(req, res) {
  const piperBin = config.tts.piperBin;
  const modelsDir = config.tts.modelsDir;
  const defaultVoice = config.tts.defaultVoice;
  const modelPath = path.join(modelsDir, `${defaultVoice}.onnx`);

  const piperBinExists = fs.existsSync(piperBin);
  const modelExists = fs.existsSync(modelPath);
  const ttsReady = piperBinExists && modelExists;

  const tts = {
    ready: ttsReady,
    piperBin,
    piperBinFound: piperBinExists,
    modelsDir,
    defaultVoice,
    defaultVoiceModelFound: modelExists
  };

  if (!ttsReady) {
    tts.hint = !piperBinExists
      ? `Piper binary not found at ${piperBin}. If running via Docker, rebuild the image (docker compose up --build) and check the build logs for the Piper install step. If running outside Docker, run scripts/install-piper.sh.`
      : `Piper voice model not found at ${modelPath}. Run scripts/install-piper.sh, or download the "${defaultVoice}" model into ${modelsDir}.`;
  }

  res.status(200).json({ status: 'ok', tts });
}

module.exports = { handleHealth };
