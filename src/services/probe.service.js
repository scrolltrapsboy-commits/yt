const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const logger = require('../utils/logger');
const { CorruptedFileError } = require('../utils/errors');

ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Run ffprobe against a media file. Rejects with CorruptedFileError if the
 * file cannot be parsed (i.e. it is missing/invalid streams or is corrupted).
 * @param {string} filePath
 * @param {string} label
 * @returns {Promise<object>} ffprobe metadata
 */
function probeFile(filePath, label = 'file') {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error({ err: err.message, filePath, label }, 'ffprobe failed - file may be corrupted');
        return reject(
          new CorruptedFileError(`Corrupted or unreadable media file: ${label}`, {
            filePath,
            reason: err.message
          })
        );
      }

      const hasStreams = Array.isArray(metadata.streams) && metadata.streams.length > 0;
      if (!hasStreams) {
        return reject(
          new CorruptedFileError(`Media file has no valid streams: ${label}`, { filePath })
        );
      }

      resolve(metadata);
    });
  });
}

/**
 * Validate a video file has at least one video stream.
 */
async function validateVideoFile(filePath, label) {
  const metadata = await probeFile(filePath, label);
  const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new CorruptedFileError(`No video stream found in: ${label}`, { filePath });
  }
  return metadata;
}

/**
 * Validate an audio file has at least one audio stream and return duration.
 */
async function validateAudioFile(filePath, label) {
  const metadata = await probeFile(filePath, label);
  const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
  if (!audioStream) {
    throw new CorruptedFileError(`No audio stream found in: ${label}`, { filePath });
  }
  return metadata;
}

/**
 * Get duration in seconds of a media file (0 if unavailable).
 */
function getDuration(metadata) {
  const formatDuration = parseFloat(metadata?.format?.duration);
  if (!isNaN(formatDuration) && formatDuration > 0) return formatDuration;

  // Fallback: check individual streams for duration
  const streamWithDuration = (metadata?.streams || []).find(
    (s) => !isNaN(parseFloat(s.duration))
  );
  return streamWithDuration ? parseFloat(streamWithDuration.duration) : 0;
}

module.exports = {
  probeFile,
  validateVideoFile,
  validateAudioFile,
  getDuration
};
