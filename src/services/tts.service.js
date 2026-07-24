const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { resolveVoiceModel } = require('../config/voices');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const { validateAudioFile, getDuration } = require('./probe.service');

/**
 * Run the local Piper TTS engine as a child process.
 * Piper reads plaintext from stdin and writes a WAV file to --output_file.
 * No network calls, no API keys - fully offline speech synthesis.
 */
function runPiper({ text, modelName, outputPath }) {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(config.tts.modelsDir, `${modelName}.onnx`);

    if (!fs.existsSync(config.tts.piperBin)) {
      return reject(
        new AppError(
          'TTS engine is not installed on this server (Piper binary missing)',
          500,
          'TTS_ENGINE_MISSING',
          { expectedPath: config.tts.piperBin }
        )
      );
    }

    if (!fs.existsSync(modelPath)) {
      return reject(
        new AppError(`TTS voice model not found: ${modelName}`, 500, 'TTS_MODEL_MISSING', {
          expectedPath: modelPath
        })
      );
    }

    const args = ['--model', modelPath, '--output_file', outputPath];
    let child;
    try {
      child = spawn(config.tts.piperBin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      return reject(new AppError(`Failed to start TTS engine: ${err.message}`, 500, 'TTS_ENGINE_ERROR'));
    }

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('TTS synthesis timed out', 504, 'TTS_TIMEOUT', { timeoutMs: config.tts.timeoutMs }));
    }, config.tts.timeoutMs);
    timer.unref?.();

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new AppError(`Failed to run TTS engine: ${err.message}`, 500, 'TTS_ENGINE_ERROR'));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        logger.error({ code, stderr: stderr.slice(-1000) }, 'Piper TTS process exited with a non-zero code');
        return reject(
          new AppError('TTS synthesis failed', 500, 'TTS_SYNTHESIS_FAILED', { stderr: stderr.slice(-500) })
        );
      }
      resolve();
    });

    child.stdin.on('error', () => {
      // Swallow EPIPE if the process has already exited - the 'close'/'error'
      // handlers above are responsible for surfacing the real failure.
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

/**
 * Synthesize speech for arbitrary text into an explicit output file path.
 * Returns the duration (seconds) of the generated audio.
 * Used internally by the /render pipeline to auto-generate narration.
 */
async function synthesizeToFile(text, voice, outputPath) {
  const modelName = resolveVoiceModel(voice);
  logger.info({ voice: modelName, chars: text.length, outputPath }, 'Synthesizing speech with Piper');

  await runPiper({ text, modelName, outputPath });

  const metadata = await validateAudioFile(outputPath, 'tts-output').catch((err) => {
    throw new AppError('TTS engine produced an invalid audio file', 500, 'TTS_OUTPUT_INVALID', {
      reason: err.message
    });
  });

  return Number(getDuration(metadata).toFixed(2));
}

/**
 * Synthesize speech for the POST /tts endpoint. Generates a new file under
 * config.dirs.audio (public/audio/) and returns its file name + duration.
 */
async function generateSpeechFile(text, voice) {
  const fileName = `${uuidv4()}.wav`;
  const outputPath = path.join(config.dirs.audio, fileName);
  const duration = await synthesizeToFile(text, voice, outputPath);
  return { fileName, filePath: outputPath, duration };
}

module.exports = { synthesizeToFile, generateSpeechFile };
