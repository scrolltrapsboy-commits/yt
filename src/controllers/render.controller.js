const config = require('../config');
const logger = require('../utils/logger');
const { validateRenderRequest } = require('../services/validate.service');
const { runRenderJob } = require('../services/render.service');

/**
 * POST /render
 * Accepts a JSON payload from n8n, renders a vertical video, and returns
 * the URL of the finished MP4 along with duration and render time.
 */
async function handleRender(req, res, next) {
  const requestStart = Date.now();

  try {
    const payload = validateRenderRequest(req.body);

    logger.info(
      { title: payload.title, videoCount: payload.videoUrls.length },
      'Received render request'
    );

    const result = await runRenderJob(payload);

    const videoUrl = `${config.publicBaseUrl}/output/${result.outputFileName}`;

    logger.info(
      {
        videoUrl,
        duration: result.duration,
        renderTime: result.renderTime,
        totalRequestTime: (Date.now() - requestStart) / 1000
      },
      'Render request completed'
    );

    return res.status(200).json({
      success: true,
      videoUrl,
      duration: result.duration,
      renderTime: result.renderTime
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { handleRender };
