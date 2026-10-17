// OpenCV.js (the room 4 picture read for the world, and where the robot can get to): a script of its
// own, loaded once the page starts (it is big; the page does not wait for it). It sets the global
// cv: a promise of itself until its WebAssembly is ready, then OpenCV. ready resolves then.
import url from '@techstark/opencv-js/dist/opencv.js?url';

const w = window as unknown as { cv?: any };

export const ready: Promise<void> = new Promise(function (resolve, reject) {
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
ready.catch(function (err) { console.warn(err); });

export function isReady(): boolean {
    return typeof w.cv !== 'undefined' && !!w.cv.Mat;
}
