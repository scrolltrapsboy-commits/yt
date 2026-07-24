const express = require('express');
const { handleHealth } = require('../controllers/health.controller');

const router = express.Router();

router.get('/health', handleHealth);

module.exports = router;
