import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db.js';

const required = ['DATABASE_URL', 'SESSION_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}
if (Buffer.byteLength(process.env.SESSION_SECRET, 'utf8') < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 bytes.');
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  console.log(`OLOPSC security API listening on http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async (error) => {
    await pool.end();
    if (error) {
      console.error('Error while closing the HTTP server:', error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
