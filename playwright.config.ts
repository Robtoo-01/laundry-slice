import { defineConfig } from '@playwright/test';

// Builds the static site for a GitHub Pages style sub-path, serves the exported files, and runs
// the browser test against them. Supabase is replaced by e2e/fake-supabase.ts; needs Google Chrome.
export default defineConfig({
  testDir: './e2e',
  use: { channel: 'chrome' },
  webServer: {
    command: 'npm run build && node e2e/serve.mjs /laundry-slice 4173',
    url: 'http://localhost:4173/laundry-slice/',
    timeout: 180000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_BASE_PATH: '/laundry-slice',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
  },
});
