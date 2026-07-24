const express = require('express');
const { handleRender } = require('../controllers/render.controller');

const router = express.Router();

router.post('/render', handleRender);

module.exports = router;
