const logger = require('../utils/logger');
const { validateTTSRequest } = require('../services/validate.service');
const { generateSpeechFile } = require('../services/tts.service');

/**
 * POST /tts
 * Body: { "text": "Hello world", "voice": "default" }
 * Synthesizes speech completely on the server (no external APIs) using the
 * local Piper TTS engine, saves it to public/audio/, and returns its URL.
 */
async function handleTTS(req, res, next) {
  const requestStart = Date.now();

  try {
    const { text, voice } = validateTTSRequest(req.body);

    logger.info({ voice, chars: text.length }, 'Received TTS request');

    const result = await generateSpeechFile(text, voice);

    logger.info(
      {
        audioUrl: `/audio/${result.fileName}`,
        duration: result.duration,
        totalRequestTime: (Date.now() - requestStart) / 1000
      },
      'TTS request completed'
    );

    return res.status(200).json({
      success: true,
      audioUrl: `/audio/${result.fileName}`,
      duration: result.duration
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handleTTS };
