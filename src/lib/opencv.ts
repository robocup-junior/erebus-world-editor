// OpenCV.js (the room 4 picture read for the world, and where the robot can get to): a script of its
// own, loaded the first time it is needed (load: the room 4 creator opened, a world with a custom
// room 4 exported) - it is big (13 MB, 3.6 MB sent), and most maps never need it, so the page does
// not load it as it starts. It sets the global cv: a promise of itself until its WebAssembly is
// ready, then OpenCV. load's promise resolves then.
import url from '@techstark/opencv-js/dist/opencv.js?url';

const w = window as unknown as { cv?: any };

let loading: Promise<void> | null = null;
let broken = false;

export function load(): Promise<void> {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = function () {
            const cv = w.cv;
            if (cv && typeof cv.then === 'function') {
                cv.then(function (done: unknown) { w.cv = done; resolve(); });
            } else if (cv) resolve();
            else reject(new Error('OpenCV did not load'));
        };
        s.onerror = function () { reject(new Error('OpenCV did not load')); };
        document.head.appendChild(s);
    });
    loading.catch(function (err) { broken = true; console.warn(err); });
    return loading;
}

export function isReady(): boolean {
    return typeof w.cv !== 'undefined' && !!w.cv.Mat;
}

// it would not load (no network, ...)
export function failed(): boolean {
    return broken;
}
