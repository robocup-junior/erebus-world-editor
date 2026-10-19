// What the editor keeps in this browser (localStorage), by key: the work in case the page is closed
// unsaved, whether the guide was seen or offered, and the language chosen. Earlier versions kept the
// same under other keys (the CMS's beta editor's, and angular-translate's for the language);
// carryOver() moves what is there to these keys, once.
export const KEPT = {
    autosave: 'erebusEditor.autosave',
    tourSeen: 'erebusEditor.tourSeen',
    guideAsked: 'erebusEditor.guideAsked',
    lang: 'erebusEditor.lang'
};

const EARLIER: Record<string, string> = {
    'simBeta2026.autosave': KEPT.autosave,
    'simBeta2026.tourSeen': KEPT.tourSeen,
    'simBeta2026.guideAsked': KEPT.guideAsked,
    'NG_TRANSLATE_LANG_KEY': KEPT.lang
};

export function carryOver(): void {
    try {
        Object.keys(EARLIER).forEach(function (old) {
            const v = window.localStorage.getItem(old);
            if (v === null) return;
            if (window.localStorage.getItem(EARLIER[old]) === null) window.localStorage.setItem(EARLIER[old], v);
            window.localStorage.removeItem(old);
        });
    } catch (e) { /* storage off */ }
}
