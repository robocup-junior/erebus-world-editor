import fs from 'node:fs';
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
        __INTLIFY_PROD_DEVTOOLS__: false
    },
    build: {
        // OpenCV.js is a file of its own (loaded by src/lib/opencv.ts), not part of the bundle
        chunkSizeWarningLimit: 1024
    }
});
