const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const logger = require('../utils/logger');
const config = require('../config');
const { getFileSizeSync, formatBytes } = require('../utils/fileUtils');
const { DownloadError, CorruptedFileError, ValidationError } = require('../utils/errors');

/**
 * Validate that a string is an http(s) URL.
 * @param {string} value
 * @param {string} fieldName
 */
function assertValidUrl(value, fieldName) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
  } catch (err) {
    throw new ValidationError(`Invalid URL for ${fieldName}: ${value}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a single file with retry + timeout + size guard.
 * @param {string} url
 * @param {string} destPath
 * @param {string} label - used for logging (e.g. "video[0]", "narration")
 */
async function downloadFile(url, destPath, label = 'file') {
  assertValidUrl(url, label);

  const { maxRetries, retryDelayMs, timeoutMs, maxFileSizeBytes } = config.download;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      logger.info({ url, label, attempt }, 'Starting download');

      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: timeoutMs,
        maxContentLength: maxFileSizeBytes,
        maxBodyLength: maxFileSizeBytes,
        validateStatus: (status) => status >= 200 && status < 300,
        headers: {
          'User-Agent': 'ffmpeg-render-service/1.0'
        }
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
        let receivedBytes = 0;
        let settled = false;

        const timeoutTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          response.data.destroy();
          writer.destroy();
          reject(new Error(`Download timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        response.data.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxFileSizeBytes) {
            settled = true;
            clearTimeout(timeoutTimer);
            response.data.destroy();
            writer.destroy();
            reject(new Error(`File exceeds max allowed size of ${formatBytes(maxFileSizeBytes)}`));
          }
        });

        response.data.pipe(writer);

        writer.on('finish', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutTimer);
          resolve();
        });

        writer.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutTimer);
          reject(err);
        });

        response.data.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutTimer);
          reject(err);
        });
      });

      const fileSize = getFileSizeSync(destPath);
      if (fileSize === 0) {
        throw new CorruptedFileError(`Downloaded file is empty: ${label}`);
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        { url, label, fileSize: formatBytes(fileSize), durationMs },
        'Download completed'
      );

      return { path: destPath, size: fileSize };
    } catch (err) {
      lastError = err;
      logger.warn(
        { url, label, attempt, error: err.message },
        'Download attempt failed'
      );

      // Clean up partial file before retrying
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch (_) {
        /* ignore cleanup errors */
      }

      if (attempt < maxRetries) {
        await sleep(retryDelayMs * attempt); // exponential-ish backoff
      }
    }
  }

  throw new DownloadError(
    `Failed to download ${label} after ${maxRetries} attempts: ${lastError?.message || 'unknown error'}`,
    { url, label }
  );
}

/**
 * Download multiple video URLs in parallel-safe sequence (sequential to avoid
 * overwhelming source hosts / bandwidth spikes), returning local paths in order.
 * @param {string[]} urls
 * @param {string} jobDir
 */
async function downloadVideos(urls, jobDir) {
  const paths = [];
  for (let i = 0; i < urls.length; i++) {
    const ext = getExtensionFromUrl(urls[i], '.mp4');
    const destPath = path.join(jobDir, `video_${i}${ext}`);
    await downloadFile(urls[i], destPath, `video[${i}]`);
    paths.push(destPath);
  }
  return paths;
}

/**
 * Guess a file extension from a URL, falling back to a default.
 */
function getExtensionFromUrl(url, fallback) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext && ext.length <= 5 ? ext : fallback;
  } catch (err) {
    return fallback;
  }
}

module.exports = {
  downloadFile,
  downloadVideos,
  assertValidUrl,
  getExtensionFromUrl
};
