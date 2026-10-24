import { createApp } from './app.js';
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.FCA_ACCESS_PASSWORD) {
  throw new Error('Set FCA_ACCESS_PASSWORD before listening on an external interface.');
}
createApp().listen(port, host, () => console.log(`FCA server listening on port ${port}`));
