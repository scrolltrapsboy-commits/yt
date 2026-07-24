const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('../config');

if (!fs.existsSync(config.dirs.logs)) {
  fs.mkdirSync(config.dirs.logs, { recursive: true });
}

const logFilePath = path.join(config.dirs.logs, 'app.log');

const transportTargets = [
  {
    target: 'pino/file',
    options: { destination: logFilePath, mkdir: true },
    level: config.logLevel
  }
];

// Pretty console output only outside production for readability
if (config.nodeEnv !== 'production') {
  transportTargets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    },
    level: config.logLevel
  });
} else {
  transportTargets.push({
    target: 'pino/file',
    options: { destination: 1 }, // stdout
    level: config.logLevel
  });
}

const logger = pino(
  {
    level: config.logLevel,
    base: { service: 'ffmpeg-render-service' },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  pino.transport({ targets: transportTargets })
);

module.exports = logger;
