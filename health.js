#!/usr/bin/env node
/**
 * Standalone health check script used by the Docker HEALTHCHECK instruction.
 * Exits 0 if the API responds with { status: "ok" }, exits 1 otherwise.
 */

const http = require('http');

const port = process.env.PORT || 3000;
const host = '127.0.0.1';

const req = http.get({ host, port, path: '/health', timeout: 5000 }, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (res.statusCode === 200 && parsed.status === 'ok') {
        console.log('Health check passed');
        process.exit(0);
      } else {
        console.error('Health check failed: unexpected response', body);
        process.exit(1);
      }
    } catch (err) {
      console.error('Health check failed: invalid JSON response', err.message);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('Health check failed: request timed out');
  process.exit(1);
});
