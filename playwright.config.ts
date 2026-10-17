import { defineConfig } from '@playwright/test';

// End-to-end tests of the built site (npm run build first). E2E_DIST serves another build (to compare
// two builds: the screenshots of one are kept with --update-snapshots, the other is checked against them).
const port = Number(process.env.PORT) || 4173;

export default defineConfig({
    testDir: 'e2e',
    snapshotPathTemplate: '{testDir}/' + (process.env.E2E_SNAPSHOTS || '__screenshots__') + '/{testFilePath}/{arg}{ext}',
    fullyParallel: true,
    workers: 4,
    reporter: [['list']],
    expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 } },
    use: {
        baseURL: 'http://localhost:' + port,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
        acceptDownloads: true
    },
    webServer: {
        command: 'node e2e/server.mjs',
        port: port,
        reuseExistingServer: false,
        env: { PORT: String(port), E2E_DIST: process.env.E2E_DIST || 'dist' }
    }
});
