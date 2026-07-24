const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { ensureDirectories } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
const renderRoutes = require('./routes/render.routes');
const healthRoutes = require('./routes/health.routes');
const ttsRoutes = require('./routes/tts.routes');

ensureDirectories();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      },
      'HTTP request'
    );
  });
  next();
});

// Serve rendered videos statically so n8n / clients can fetch the final MP4
app.use('/output', express.static(config.dirs.output));
app.use('/public', express.static(config.dirs.public));
// Serve generated TTS audio - this is the /audio/xxxxx.wav URL returned by POST /tts
app.use('/audio', express.static(config.dirs.audio));

// Routes
app.use('/', healthRoutes);
app.use('/', renderRoutes);
app.use('/', ttsRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'ffmpeg-render-service',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      render: 'POST /render',
      tts: 'POST /tts',
      output: 'GET /output/:filename',
      audio: 'GET /audio/:filename'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
