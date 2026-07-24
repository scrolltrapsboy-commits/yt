const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Split raw narration script into sentences using punctuation boundaries.
 * Falls back to the whole string if no punctuation is present.
 * @param {string} script
 * @returns {string[]}
 */
function splitIntoSentences(script) {
  const cleaned = script.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Split on sentence terminators while keeping them attached to the sentence.
  const matches = cleaned.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (!matches) return [cleaned];

  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Wrap a sentence into subtitle "cue" chunks respecting maxCharsPerLine and
 * maxLines per cue. Words are never split mid-word.
 * @param {string} sentence
 * @param {number} maxCharsPerLine
 * @param {number} maxLines
 * @returns {string[]} array of cue texts (each may contain up to maxLines lines joined by \n)
 */
function wrapSentenceIntoCues(sentence, maxCharsPerLine, maxLines) {
  const words = sentence.split(' ').filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      // Handle a single word longer than maxCharsPerLine by hard-breaking it
      if (word.length > maxCharsPerLine) {
        let remaining = word;
        while (remaining.length > maxCharsPerLine) {
          lines.push(remaining.slice(0, maxCharsPerLine));
          remaining = remaining.slice(maxCharsPerLine);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  // Group lines into cues of maxLines each
  const cues = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    cues.push(lines.slice(i, i + maxLines).join('\n'));
  }
  return cues;
}

/**
 * Build subtitle cues (text chunks) from the full script.
 * @param {string} script
 */
function buildCues(script) {
  const { maxCharsPerLine, maxLines } = config.subtitles;
  const sentences = splitIntoSentences(script);

  const cues = [];
  for (const sentence of sentences) {
    const sentenceCues = wrapSentenceIntoCues(sentence, maxCharsPerLine, maxLines);
    cues.push(...sentenceCues);
  }
  return cues;
}

/**
 * Format seconds as an SRT timestamp: HH:MM:SS,mmm
 * @param {number} totalSeconds
 */
function formatSrtTime(totalSeconds) {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  const pad = (num, size = 2) => String(num).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Distribute cues across the narration's total duration proportionally to
 * each cue's character length, producing start/end timestamps.
 * @param {string[]} cues
 * @param {number} totalDurationSeconds
 */
function timeCues(cues, totalDurationSeconds) {
  const totalChars = cues.reduce((sum, cue) => sum + cue.replace(/\n/g, ' ').length, 0) || 1;

  // Reserve a tiny gap between cues so they don't visually overlap
  const gapSeconds = 0.08;
  let cursor = 0;
  const timed = [];

  cues.forEach((cue, index) => {
    const cueChars = cue.replace(/\n/g, ' ').length;
    const proportion = cueChars / totalChars;
    let duration = proportion * totalDurationSeconds;

    // Enforce a sensible minimum display time so short cues are readable
    const minDuration = 0.8;
    if (duration < minDuration) duration = minDuration;

    const start = cursor;
    let end = start + duration;
    if (index === cues.length - 1) {
      end = totalDurationSeconds; // last cue always ends exactly at narration end
    }

    timed.push({ start, end: Math.min(end, totalDurationSeconds), text: cue });
    cursor = end + gapSeconds;
  });

  return timed;
}

/**
 * Generate an SRT file body from the script and narration duration.
 * @param {string} script
 * @param {number} narrationDurationSeconds
 */
function generateSrtContent(script, narrationDurationSeconds) {
  const cues = buildCues(script);
  if (cues.length === 0) {
    return '';
  }

  const timedCues = timeCues(cues, narrationDurationSeconds);

  return timedCues
    .map((cue, index) => {
      return `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`;
    })
    .join('\n');
}

/**
 * Generate and write an SRT subtitle file for the given script + duration.
 * @param {string} script
 * @param {number} narrationDurationSeconds
 * @param {string} destPath
 */
function generateSrtFile(script, narrationDurationSeconds, destPath) {
  const content = generateSrtContent(script, narrationDurationSeconds);
  fs.writeFileSync(destPath, content, 'utf8');
  logger.info({ destPath, cueCount: (content.match(/-->/g) || []).length }, 'Generated SRT subtitle file');
  return destPath;
}

module.exports = {
  splitIntoSentences,
  wrapSentenceIntoCues,
  buildCues,
  formatSrtTime,
  timeCues,
  generateSrtContent,
  generateSrtFile
};
