import { defineConfig } from "@playwright/test";
import path from "node:path";

const python = process.env.PYTHON_PATH || (process.platform === "win32" ? "../venv/Scripts/python.exe" : "../venv/bin/python");

export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3011",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `"${python}" -m uvicorn backend.main:app --app-dir .. --host 127.0.0.1 --port 8011`,
      url: "http://127.0.0.1:8011/api/health",
      env: { CHAT_DB_PATH: path.resolve("../backend/data/e2e.db"), CHAT_ORIGINS: "http://127.0.0.1:3011" },
      timeout: 60000,
    },
    {
      command: "npm run dev -- --port 3011",
      url: "http://127.0.0.1:3011",
      env: { API_URL: "http://127.0.0.1:8011", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: ".next-e2e" },
      timeout: 120000,
    },
  ],
});
