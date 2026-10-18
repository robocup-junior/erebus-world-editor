import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

// OpenCV.js as it is in the dev server: a script of 13 MB that Vite would otherwise send with a
// source map ten times its size (the build copies it as it is)
const OPENCV = '/node_modules/@techstark/opencv-js/dist/opencv.js';
function opencvAsIs(): Plugin {
    return {
        name: 'opencv-as-is',
        configureServer(server) {
            server.middlewares.use(function (req, res, next) {
                // the script itself (not its ?url import, which Vite answers with the address)
                if (req.url !== OPENCV) return next();
                res.setHeader('Content-Type', 'text/javascript');
                fs.createReadStream(fileURLToPath(new URL('.' + OPENCV, import.meta.url))).pipe(res);
            });
        }
    };
}

// What this build is (shown when the copyright is clicked): the commit it was built from - from git, or from the build's environment (Cloudflare Workers Builds, GitHub Actions) where
// git does not tell (a detached checkout has no branch)
function git(args: string) {
    try { return execSync('git ' + args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; }
}
function buildInfo() {
    const env = process.env;
    const branch = git('rev-parse --abbrev-ref HEAD');
    const remote = git('remote get-url origin').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
    return {
        commit: git('rev-parse HEAD') || env.WORKERS_CI_COMMIT_SHA || env.GITHUB_SHA || '',
        commitDate: git('log -1 --format=%cI'),
        branch: (branch && branch !== 'HEAD' ? branch : '') || env.WORKERS_CI_BRANCH || env.GITHUB_REF_NAME || '',
        // changes not committed yet (a build on someone's machine)
        dirty: git('status --porcelain') !== '',
        builtAt: new Date().toISOString(),
        repo: /^https:\/\//.test(remote) ? remote : 'https://github.com/robocup-junior/erebus-world-editor'
    };
}

export default defineConfig({
    plugins: [opencvAsIs(), vue({
        template: {
            compilerOptions: {
                // the rotation dial keeps its own element (the styles name it)
                isCustomElement: function (tag) { return tag === 'sim-rotation-dial'; }
            }
        }
    })],
    // vue-i18n's features: the Composition API only, no devtools in production
    define: {
        __VUE_I18N_FULL_INSTALL__: true,
        __VUE_I18N_LEGACY_API__: false,
        __INTLIFY_PROD_DEVTOOLS__: false,
        __BUILD_INFO__: JSON.stringify(buildInfo())
    },
    build: {
        // OpenCV.js is a file of its own (loaded by src/lib/opencv.ts), not part of the bundle
        chunkSizeWarningLimit: 1024
    }
});
