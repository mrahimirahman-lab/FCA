import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fca-browser-'));
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3101/api/health', env: { PORT: '3101', FCA_DATA_DIR: dataDir, INSPECTION_AI_API_KEY: '', OPENAI_API_KEY: '' }, reuseExistingServer: false },
});
