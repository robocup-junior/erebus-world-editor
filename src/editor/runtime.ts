// The map is edited in place (a plain object, too big to watch property by property), so the page
// is drawn again after each thing that can change it: an event handled, a timer, a picture loaded.
// digest() asks for that; the components read `tick` while they render, so they follow it.
import { ref } from 'vue';

export const tick = ref(0);

export function digest(): void {
    tick.value++;
}

// fn, then the page drawn again
export function apply<T>(fn: () => T): T {
    const out = fn();
    digest();
    return out;
}

// fn after ms (0: after what is running now), then the page drawn again
export function later(fn: () => void, ms = 0): number {
    return window.setTimeout(function () { fn(); digest(); }, ms);
}

export function cancel(id: number | null | undefined): void {
    if (id) window.clearTimeout(id);
}

// fn soon, with others asked for meanwhile, then the page drawn once
let queue: (() => void)[] = [];
let queued = 0;
export function applyAsync(fn: () => void): void {
    queue.push(fn);
    if (queued) return;
    queued = window.setTimeout(function () {
        queued = 0;
        const run = queue;
        queue = [];
        run.forEach(function (f) { f(); });
        digest();
    }, 0);
}
