const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');
const { FfmpegError, TimeoutError } = require('../utils/errors');
const { getFileSizeSync, formatBytes } = require('../utils/fileUtils');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Escape a filesystem path for safe use inside an ffmpeg filter string
 * (e.g. subtitles=path). Escapes backslashes, colons, and single quotes.
 * @param {string} filePath
 */
function escapeFilterPath(filePath) {
  return filePath
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

/**
 * Run an ffmpeg command built with fluent-ffmpeg, wiring up logging,
 * timeout enforcement, and consistent error wrapping.
 * @param {ffmpeg.FfmpegCommand} command
 * @param {string} outputPath
 * @param {string} label
 */
function runFfmpegCommand(command, outputPath, label) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let commandLine = '';

    const timeoutTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      command.kill('SIGKILL');
      reject(new TimeoutError(`FFmpeg step "${label}" timed out after ${config.ffmpeg.timeoutMs}ms`));
    }, config.ffmpeg.timeoutMs);

    command
      .on('start', (cmdLine) => {
        commandLine = cmdLine;
        logger.info({ label, command: cmdLine }, 'FFmpeg command started');
      })
      .on('stderr', (stderrLine) => {
        logger.debug({ label, stderrLine }, 'ffmpeg stderr');
      })
      .on('error', (err, stdout, stderr) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutTimer);
        logger.error({ label, error: err.message, stderr }, 'FFmpeg command failed');
        reject(new FfmpegError(`FFmpeg step "${label}" failed: ${err.message}`, { command: commandLine, stderr }));
      })
      .on('end', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutTimer);
        const outSize = getFileSizeSync(outputPath);
        logger.info({ label, outputPath, outputSize: formatBytes(outSize) }, 'FFmpeg command completed');
        resolve({ outputPath, size: outSize, command: commandLine });
      })
      .save(outputPath);
  });
}

/**
 * Step 1: Scale + center-crop each input video to the target resolution/fps
 * and concatenate them (video-only, no audio) into a single intermediate file.
 * Uses "increase" scaling + crop so videos fill the frame without distortion,
 * cropped and centered.
 *
 * @param {string[]} videoPaths - local paths to downloaded videos, in order
 * @param {object} opts - { width, height, fps }
 * @param {string} outputPath - where to write the concatenated video
 */
async function concatVideoSegments(videoPaths, opts, outputPath) {
  const { width, height, fps } = opts;
  const command = ffmpeg();

  videoPaths.forEach((videoPath) => {
    command.input(videoPath);
  });

  const filterParts = [];
  const scaledLabels = [];

  videoPaths.forEach((_, index) => {
    const label = `v${index}`;
    filterParts.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[${label}]`
    );
    scaledLabels.push(`[${label}]`);
  });

  filterParts.push(`${scaledLabels.join('')}concat=n=${videoPaths.length}:v=1:a=0[vout]`);

  const filterComplex = filterParts.join('; ');

  command
    .outputOptions([
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-an'
    ]);

  return runFfmpegCommand(command, outputPath, 'concat-video-segments');
}

/**
 * Step 2: Compose the final video - loop/trim the concatenated video to match
 * narration length, mix narration + optional background music, burn subtitles,
 * and export with the required codec settings.
 *
 * @param {object} params
 * @param {string} params.concatVideoPath - intermediate concatenated video (video only)
 * @param {string} params.narrationPath - narration audio file path
 * @param {string|null} params.musicPath - optional background music file path
 * @param {string} params.srtPath - subtitle file path (may be empty string if no subtitles)
 * @param {number} params.durationSeconds - target output duration (narration duration)
 * @param {object} params.videoSettings - { width, height, fps, crf, preset, audioBitrate, pixelFormat }
 * @param {object} params.subtitleStyle - subtitle styling config
 * @param {object} params.musicSettings - { volume, fadeInSeconds, fadeOutSeconds }
 * @param {string} params.outputPath - final MP4 output path
 */
async function composeFinalVideo(params) {
  const {
    concatVideoPath,
    narrationPath,
    musicPath,
    srtPath,
    durationSeconds,
    videoSettings,
    subtitleStyle,
    musicSettings,
    outputPath
  } = params;

  const command = ffmpeg();

  // Input 0: looped concatenated video (loop indefinitely; we trim to exact duration later)
  command.input(concatVideoPath).inputOptions(['-stream_loop', '-1']);

  // Input 1: narration audio
  command.input(narrationPath);

  const hasMusic = Boolean(musicPath);
  if (hasMusic) {
    // Input 2: looped background music
    command.input(musicPath).inputOptions(['-stream_loop', '-1']);
  }

  const filterParts = [];

  // Trim looped video to exact duration
  filterParts.push(
    `[0:v]trim=0:${durationSeconds},setpts=PTS-STARTPTS[vtrimmed]`
  );

  // Burn subtitles if provided
  let videoOutLabel = 'vtrimmed';
  if (srtPath) {
    const style =
      `FontName=${subtitleStyle.fontName},FontSize=${subtitleStyle.fontSize},` +
      `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,` +
      `Outline=${subtitleStyle.outlineWidth},Shadow=0,Alignment=2,` +
      `MarginV=${subtitleStyle.marginBottom}`;
    filterParts.push(
      `[vtrimmed]subtitles='${escapeFilterPath(srtPath)}':force_style='${style}'[vsubbed]`
    );
    videoOutLabel = 'vsubbed';
  }

  // Narration audio pass-through
  filterParts.push(`[1:a]atrim=0:${durationSeconds},asetpts=PTS-STARTPTS[narr]`);

  let audioOutLabel = 'narr';
  if (hasMusic) {
    const fadeOutStart = Math.max(0, durationSeconds - musicSettings.fadeOutSeconds);
    filterParts.push(
      `[2:a]atrim=0:${durationSeconds},asetpts=PTS-STARTPTS,` +
        `volume=${musicSettings.volume},` +
        `afade=t=in:st=0:d=${musicSettings.fadeInSeconds},` +
        `afade=t=out:st=${fadeOutStart}:d=${musicSettings.fadeOutSeconds}[music]`
    );
    filterParts.push(
      `[narr][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
    );
    audioOutLabel = 'aout';
  }

  const filterComplex = filterParts.join('; ');

  command
    .outputOptions([
      '-filter_complex', filterComplex,
      '-map', `[${videoOutLabel}]`,
      '-map', `[${audioOutLabel}]`,
      '-t', String(durationSeconds),
      '-r', String(videoSettings.fps),
      '-c:v', 'libx264',
      '-crf', String(videoSettings.crf),
      '-preset', videoSettings.preset,
      '-pix_fmt', videoSettings.pixelFormat,
      '-c:a', 'aac',
      '-b:a', videoSettings.audioBitrate,
      '-movflags', '+faststart'
    ]);

  return runFfmpegCommand(command, outputPath, 'compose-final-video');
}

module.exports = {
  escapeFilterPath,
  concatVideoSegments,
  composeFinalVideo,
  runFfmpegCommand
};
