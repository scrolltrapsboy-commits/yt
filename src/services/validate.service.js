const { ValidationError } = require('../utils/errors');
const config = require('../config');
const { listAvailableVoices } = require('../config/voices');

/**
 * Validate the incoming /render request body from n8n.
 * Throws ValidationError with details on the first failure encountered,
 * but collects as many issues as possible for a helpful response.
 * @param {object} body
 */
function validateRenderRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const { title, script, videoUrls, voiceUrl, voiceText, voice, backgroundMusic, style } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title is required and must be a non-empty string');
  }

  if (!script || typeof script !== 'string' || !script.trim()) {
    errors.push('script is required and must be a non-empty string');
  }

  if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
    errors.push('videoUrls is required and must be a non-empty array of URLs');
  } else {
    videoUrls.forEach((url, idx) => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        errors.push(`videoUrls[${idx}] must be a valid http(s) URL`);
      }
    });
  }

  // Narration audio can come from either a pre-recorded voiceUrl (original
  // behavior) OR voiceText, which is synthesized automatically on the server
  // via the local TTS engine before rendering. Exactly one must be provided.
  const hasVoiceUrl = voiceUrl !== undefined && voiceUrl !== null && voiceUrl !== '';
  const hasVoiceText = voiceText !== undefined && voiceText !== null && voiceText !== '';

  if (!hasVoiceUrl && !hasVoiceText) {
    errors.push('Either voiceUrl or voiceText is required');
  } else if (hasVoiceUrl && hasVoiceText) {
    errors.push('Provide only one of voiceUrl or voiceText, not both');
  } else if (hasVoiceUrl && (typeof voiceUrl !== 'string' || !/^https?:\/\//i.test(voiceUrl))) {
    errors.push('voiceUrl must be a valid http(s) URL');
  } else if (hasVoiceText) {
    if (typeof voiceText !== 'string' || !voiceText.trim()) {
      errors.push('voiceText must be a non-empty string');
    } else if (voiceText.trim().length > config.tts.maxChars) {
      errors.push(`voiceText exceeds maximum length of ${config.tts.maxChars} characters`);
    }
  }

  if (voice !== undefined && voice !== null && typeof voice !== 'string') {
    errors.push('voice must be a string');
  }

  if (backgroundMusic !== undefined && backgroundMusic !== null && backgroundMusic !== '') {
    if (typeof backgroundMusic !== 'string' || !/^https?:\/\//i.test(backgroundMusic)) {
      errors.push('backgroundMusic must be a valid http(s) URL when provided');
    }
  }

  if (style !== undefined && style !== null) {
    if (typeof style !== 'object' || Array.isArray(style)) {
      errors.push('style must be an object');
    } else {
      const { width, height, fps } = style;
      if (width !== undefined && (!Number.isInteger(width) || width <= 0)) {
        errors.push('style.width must be a positive integer');
      }
      if (height !== undefined && (!Number.isInteger(height) || height <= 0)) {
        errors.push('style.height must be a positive integer');
      }
      if (fps !== undefined && (!Number.isInteger(fps) || fps <= 0 || fps > 120)) {
        errors.push('style.fps must be a positive integer between 1 and 120');
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Request validation failed', errors);
  }

  return {
    title: title.trim(),
    script: script.trim(),
    videoUrls,
    voiceUrl: hasVoiceUrl ? voiceUrl : null,
    voiceText: hasVoiceText ? voiceText.trim() : null,
    voice: (voice && voice.trim()) || 'default',
    backgroundMusic: backgroundMusic || null,
    style: {
      width: style?.width || undefined,
      height: style?.height || undefined,
      fps: style?.fps || undefined
    }
  };
}

/**
 * Validate the incoming POST /tts request body.
 * @param {object} body
 */
function validateTTSRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const { text, voice } = body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    errors.push('text is required and must be a non-empty string');
  } else if (text.trim().length > config.tts.maxChars) {
    errors.push(`text exceeds maximum length of ${config.tts.maxChars} characters`);
  }

  if (voice !== undefined && voice !== null && typeof voice !== 'string') {
    errors.push(`voice must be a string (one of: ${listAvailableVoices().join(', ')})`);
  }

  if (errors.length > 0) {
    throw new ValidationError('Request validation failed', errors);
  }

  return {
    text: text.trim(),
    voice: (voice && voice.trim()) || 'default'
  };
}

module.exports = { validateRenderRequest, validateTTSRequest };
