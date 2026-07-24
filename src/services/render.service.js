const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { createJobDir, removeDir, getFileSizeSync, formatBytes } = require('../utils/fileUtils');
const { downloadVideos, downloadFile } = require('./download.service');
const { synthesizeToFile } = require('./tts.service');
const { validateVideoFile, validateAudioFile, getDuration, probeFile } = require('./probe.service');
const { generateSrtFile } = require('./subtitle.service');
const { concatVideoSegments, composeFinalVideo } = require('./ffmpeg.service');

/**
 * Run a full render job end-to-end.
 * @param {object} payload - validated request body { title, script, videoUrls, voiceUrl, backgroundMusic, style }
 * @returns {Promise<{videoUrl: string, duration: number, renderTime: number, outputFileName: string}>}
 */
async function runRenderJob(payload) {
  const jobId = uuidv4();
  const jobDir = createJobDir(jobId);
  const jobStartTime = Date.now();

  const videoSettings = {
    width: payload.style?.width || config.video.width,
    height: payload.style?.height || config.video.height,
    fps: payload.style?.fps || config.video.fps,
    crf: config.video.crf,
    preset: config.video.preset,
    audioBitrate: config.video.audioBitrate,
    pixelFormat: config.video.pixelFormat
  };

  logger.info({ jobId, title: payload.title, videoSettings }, 'Starting render job');

  try {
    // ---- 1. Download all assets ----
    logger.info({ jobId }, 'Downloading source videos');
    const videoPaths = await downloadVideos(payload.videoUrls, jobDir);

    let narrationPath;
    if (payload.voiceText) {
      logger.info({ jobId, voice: payload.voice }, 'Synthesizing narration audio locally via TTS');
      narrationPath = path.join(jobDir, 'narration.wav');
      await synthesizeToFile(payload.voiceText, payload.voice, narrationPath);
    } else {
      logger.info({ jobId }, 'Downloading narration audio');
      narrationPath = path.join(jobDir, 'narration.mp3');
      await downloadFile(payload.voiceUrl, narrationPath, 'narration');
    }

    let musicPath = null;
    if (payload.backgroundMusic) {
      logger.info({ jobId }, 'Downloading background music');
      musicPath = path.join(jobDir, 'music.mp3');
      await downloadFile(payload.backgroundMusic, musicPath, 'backgroundMusic');
    }

    // ---- 2. Validate media integrity ----
    logger.info({ jobId }, 'Validating downloaded media files');
    for (let i = 0; i < videoPaths.length; i++) {
      await validateVideoFile(videoPaths[i], `video[${i}]`);
    }
    const narrationMetadata = await validateAudioFile(narrationPath, 'narration');
    if (musicPath) {
      await validateAudioFile(musicPath, 'backgroundMusic');
    }

    const narrationDuration = getDuration(narrationMetadata);
    if (!narrationDuration || narrationDuration <= 0) {
      throw new (require('../utils/errors').CorruptedFileError)(
        'Could not determine narration duration - file may be corrupted or empty'
      );
    }

    logger.info({ jobId, narrationDuration }, 'Narration duration resolved');

    // ---- 3. Generate subtitles ----
    logger.info({ jobId }, 'Generating subtitles');
    const srtPath = path.join(jobDir, 'subtitles.srt');
    generateSrtFile(payload.script, narrationDuration, srtPath);

    // ---- 4. Concatenate + normalize video segments ----
    logger.info({ jobId }, 'Concatenating and normalizing video segments');
    const concatVideoPath = path.join(jobDir, 'concat_video.mp4');
    await concatVideoSegments(videoPaths, videoSettings, concatVideoPath);

    // ---- 5. Compose final video (loop/trim, mix audio, burn subtitles, encode) ----
    logger.info({ jobId }, 'Composing final video');
    const outputFileName = `${jobId}.mp4`;
    const outputPath = path.join(config.dirs.output, outputFileName);

    await composeFinalVideo({
      concatVideoPath,
      narrationPath,
      musicPath,
      srtPath,
      durationSeconds: narrationDuration,
      videoSettings,
      subtitleStyle: config.subtitles,
      musicSettings: config.music,
      outputPath
    });

    const outputSize = getFileSizeSync(outputPath);
    const renderTimeSeconds = (Date.now() - jobStartTime) / 1000;

    logger.info(
      {
        jobId,
        outputPath,
        outputSize: formatBytes(outputSize),
        renderTimeSeconds,
        narrationDuration
      },
      'Render job completed successfully'
    );

    // ---- 6. Cleanup temp working directory ----
    if (config.cleanup.deleteTempAfterRender) {
      await removeDir(jobDir);
    }

    return {
      outputFileName,
      duration: Number(narrationDuration.toFixed(2)),
      renderTime: Number(renderTimeSeconds.toFixed(2)),
      outputSize
    };
  } catch (err) {
    logger.error({ jobId, error: err.message, stack: err.stack }, 'Render job failed');
    // Best-effort cleanup of temp directory even on failure
    await removeDir(jobDir);
    throw err;
  }
}

module.exports = { runRenderJob };
