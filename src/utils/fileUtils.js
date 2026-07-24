const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const logger = require('./logger');
const config = require('../config');

/**
 * Ensure all required application directories exist.
 */
function ensureDirectories() {
  const dirs = Object.values(config.dirs);
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Create a fresh working directory for a single render job.
 * @param {string} jobId
 * @returns {string} absolute path to the job's temp directory
 */
function createJobDir(jobId) {
  const jobDir = path.join(config.dirs.temp, jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }
  return jobDir;
}

/**
 * Recursively delete a directory, swallowing errors (best-effort cleanup).
 * @param {string} dirPath
 */
async function removeDir(dirPath) {
  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, dirPath }, 'Failed to remove directory during cleanup');
  }
}

/**
 * Get file size in bytes, returns 0 if the file does not exist.
 * @param {string} filePath
 */
function getFileSizeSync(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (err) {
    return 0;
  }
}

/**
 * Human readable byte formatting for logs.
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Delete files older than a given age in a directory (generic cleanup helper).
 * Skips dotfiles like .gitkeep so placeholder files survive.
 * @param {string} dirPath
 * @param {number} maxAgeHours
 * @param {string} label - used only for logging (e.g. 'output file', 'audio file')
 */
async function cleanupOldFiles(dirPath, maxAgeHours, label = 'file') {
  try {
    const files = await fsp.readdir(dirPath);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(dirPath, file);
      try {
        const stats = await fsp.stat(filePath);
        if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
          await fsp.unlink(filePath);
          logger.info({ file, dirPath }, `Deleted expired ${label}`);
        }
      } catch (err) {
        logger.warn({ err, file }, `Failed to check/delete ${label}`);
      }
    }
  } catch (err) {
    logger.warn({ err, dirPath }, `Failed to run ${label} cleanup`);
  }
}

/**
 * Delete output files older than a given age (cleanup job for disk space).
 * @param {number} maxAgeHours
 */
async function cleanupOldOutputFiles(maxAgeHours) {
  return cleanupOldFiles(config.dirs.output, maxAgeHours, 'output file');
}

/**
 * Delete generated TTS audio files (public/audio/) older than a given age.
 * @param {number} maxAgeHours
 */
async function cleanupOldAudioFiles(maxAgeHours) {
  return cleanupOldFiles(config.dirs.audio, maxAgeHours, 'audio file');
}

module.exports = {
  ensureDirectories,
  createJobDir,
  removeDir,
  getFileSizeSync,
  formatBytes,
  cleanupOldFiles,
  cleanupOldOutputFiles,
  cleanupOldAudioFiles
};
