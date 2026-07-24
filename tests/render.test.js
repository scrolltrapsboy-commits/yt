/**
 * Lightweight test suite using only Node's built-in assert module - no
 * external test framework dependency required.
 *
 * Run with: npm test  (or) node tests/render.test.js
 */

const assert = require('assert');
const {
  splitIntoSentences,
  wrapSentenceIntoCues,
  formatSrtTime,
  timeCues,
  generateSrtContent
} = require('../src/services/subtitle.service');
const { validateRenderRequest } = require('../src/services/validate.service');
const { formatBytes } = require('../src/utils/fileUtils');
const { ValidationError } = require('../src/utils/errors');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

console.log('\nRunning ffmpeg-render-service tests...\n');

console.log('subtitle.service:');

test('splitIntoSentences splits on punctuation', () => {
  const result = splitIntoSentences('Hello world. How are you? I am fine!');
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0], 'Hello world.');
});

test('splitIntoSentences handles text with no punctuation', () => {
  const result = splitIntoSentences('just one fragment with no ending');
  assert.strictEqual(result.length, 1);
});

test('wrapSentenceIntoCues respects maxCharsPerLine and maxLines', () => {
  const sentence =
    'This is a fairly long sentence that should wrap across multiple lines and cues automatically';
  const cues = wrapSentenceIntoCues(sentence, 20, 2);
  cues.forEach((cue) => {
    const lines = cue.split('\n');
    assert.ok(lines.length <= 2, 'cue should not exceed maxLines');
    lines.forEach((line) => {
      assert.ok(line.length <= 20, `line "${line}" exceeds maxCharsPerLine`);
    });
  });
});

test('wrapSentenceIntoCues never splits a word mid-word (except oversized words)', () => {
  const sentence = 'short words here';
  const cues = wrapSentenceIntoCues(sentence, 42, 2);
  const rejoined = cues.join(' ').replace(/\n/g, ' ');
  assert.strictEqual(rejoined, sentence);
});

test('formatSrtTime formats zero correctly', () => {
  assert.strictEqual(formatSrtTime(0), '00:00:00,000');
});

test('formatSrtTime formats fractional seconds correctly', () => {
  assert.strictEqual(formatSrtTime(65.5), '00:01:05,500');
});

test('formatSrtTime formats hours correctly', () => {
  assert.strictEqual(formatSrtTime(3661.25), '01:01:01,250');
});

test('timeCues distributes cues proportionally within total duration', () => {
  const cues = ['short', 'a much longer cue with more characters'];
  const timed = timeCues(cues, 20);
  assert.strictEqual(timed.length, 2);
  assert.ok(timed[0].start === 0);
  assert.ok(timed[1].end <= 20.0001);
  assert.ok(timed[1].end >= timed[1].start);
});

test('generateSrtContent produces valid SRT structure', () => {
  const srt = generateSrtContent('Hello there. This is a test sentence for subtitles.', 10);
  assert.ok(srt.includes('-->'));
  assert.ok(/^\d+\n/.test(srt), 'should start with a cue index');
});

test('generateSrtContent returns empty string for empty script', () => {
  const srt = generateSrtContent('', 10);
  assert.strictEqual(srt, '');
});

console.log('\nvalidate.service:');

test('validateRenderRequest accepts a valid payload', () => {
  const payload = {
    title: 'Test Video',
    script: 'This is a test script.',
    videoUrls: ['https://example.com/video1.mp4'],
    voiceUrl: 'https://example.com/voice.mp3'
  };
  const result = validateRenderRequest(payload);
  assert.strictEqual(result.title, 'Test Video');
  assert.strictEqual(result.videoUrls.length, 1);
});

test('validateRenderRequest rejects missing title', () => {
  assert.throws(() => {
    validateRenderRequest({
      script: 'Test script',
      videoUrls: ['https://example.com/video1.mp4'],
      voiceUrl: 'https://example.com/voice.mp3'
    });
  }, ValidationError);
});

test('validateRenderRequest rejects empty videoUrls array', () => {
  assert.throws(() => {
    validateRenderRequest({
      title: 'Test',
      script: 'Test script',
      videoUrls: [],
      voiceUrl: 'https://example.com/voice.mp3'
    });
  }, ValidationError);
});

test('validateRenderRequest rejects invalid voiceUrl', () => {
  assert.throws(() => {
    validateRenderRequest({
      title: 'Test',
      script: 'Test script',
      videoUrls: ['https://example.com/video1.mp4'],
      voiceUrl: 'not-a-valid-url'
    });
  }, ValidationError);
});

test('validateRenderRequest rejects invalid style.fps', () => {
  assert.throws(() => {
    validateRenderRequest({
      title: 'Test',
      script: 'Test script',
      videoUrls: ['https://example.com/video1.mp4'],
      voiceUrl: 'https://example.com/voice.mp3',
      style: { fps: 500 }
    });
  }, ValidationError);
});

test('validateRenderRequest allows omitting optional backgroundMusic', () => {
  const result = validateRenderRequest({
    title: 'Test',
    script: 'Test script',
    videoUrls: ['https://example.com/video1.mp4'],
    voiceUrl: 'https://example.com/voice.mp3'
  });
  assert.strictEqual(result.backgroundMusic, null);
});

console.log('\nfileUtils:');

test('formatBytes formats bytes correctly', () => {
  assert.strictEqual(formatBytes(0), '0 B');
  assert.strictEqual(formatBytes(1024), '1.00 KB');
  assert.strictEqual(formatBytes(1048576), '1.00 MB');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
