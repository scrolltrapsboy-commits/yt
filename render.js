#!/usr/bin/env node
/**
 * CLI entry point to run a single render job directly, without going through
 * the HTTP API. Useful for local testing, cron jobs, or CI pipelines.
 *
 * Usage:
 *   node render.js path/to/payload.json
 *   node render.js '{"title":"Test","script":"...","videoUrls":[...],"voiceUrl":"..."}'
 *
 * If no argument is given, reads JSON from stdin.
 */

const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { validateRenderRequest } = require('./src/services/validate.service');
const { runRenderJob } = require('./src/services/render.service');
const { ensureDirectories } = require('./src/utils/fileUtils');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function loadPayload() {
  const arg = process.argv[2];

  if (!arg) {
    const stdinData = await readStdin();
    if (!stdinData.trim()) {
      throw new Error(
        'No input provided. Pass a JSON file path or inline JSON string, or pipe JSON via stdin.'
      );
    }
    return JSON.parse(stdinData);
  }

  const possiblePath = path.resolve(process.cwd(), arg);
  if (fs.existsSync(possiblePath) && fs.statSync(possiblePath).isFile()) {
    const fileContents = fs.readFileSync(possiblePath, 'utf8');
    return JSON.parse(fileContents);
  }

  // Otherwise treat the argument itself as an inline JSON string
  return JSON.parse(arg);
}

async function main() {
  ensureDirectories();

  const rawPayload = await loadPayload();
  const payload = validateRenderRequest(rawPayload);

  console.log(`\nStarting render for "${payload.title}"...\n`);

  const result = await runRenderJob(payload);
  const videoUrl = `${config.publicBaseUrl}/output/${result.outputFileName}`;

  const summary = {
    success: true,
    videoUrl,
    duration: result.duration,
    renderTime: result.renderTime
  };

  console.log('\nRender complete:\n');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'CLI render failed');
  console.error('\nRender failed:', err.message);
  process.exit(1);
});
