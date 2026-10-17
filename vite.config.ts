import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue({
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
        // OpenCV.js is a script of its own (public/vendor), not part of the bundle
        chunkSizeWarningLimit: 1024
    }
});
