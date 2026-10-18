/// <reference types="vite/client" />

// OpenCV.js, loaded by its own script (javascripts/opencv.js) as the global cv
declare const cv: any;

// What this build is (vite.config.ts: buildInfo)
declare const __BUILD_INFO__: { commit: string; commitDate: string; branch: string; dirty: boolean; builtAt: string; repo: string };

// Set by tests (or by hand) to make the world export the same every time
declare var DISABLE_RANDOMNESS: boolean | undefined;

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<object, object, any>;
    export default component;
}
