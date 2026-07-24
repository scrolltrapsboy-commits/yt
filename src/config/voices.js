const config = require('./index');

/**
 * Maps the public-facing "voice" value accepted by POST /tts and POST /render
 * to the Piper .onnx model file name (without extension) installed in
 * config.tts.modelsDir. Add more entries here after baking additional voice
 * models into the Docker image (see README.md -> "Adding more TTS voices").
 */
const VOICE_MODELS = {
  default: config.tts.defaultVoice,
  'en-us': config.tts.defaultVoice,
  'en-us-female': config.tts.defaultVoice
};

/**
 * Resolve a requested voice name to an installed Piper model name.
 * Unknown voices fall back to the default voice rather than failing the
 * request, since "voice" is a soft preference, not a hard requirement.
 */
function resolveVoiceModel(voice) {
  const key = String(voice || 'default').trim().toLowerCase();
  return VOICE_MODELS[key] || VOICE_MODELS.default;
}

function listAvailableVoices() {
  return Object.keys(VOICE_MODELS);
}

module.exports = { resolveVoiceModel, listAvailableVoices, VOICE_MODELS };
