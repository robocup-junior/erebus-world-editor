// The texts in Japanese and English (src/lang). Their parameters are written {{name}}; a key with no
// text gives the key back, which the editor uses to tell a missing text. The language chosen is kept
// in this browser (under the key the earlier version of the page used, so the choice carries over).
import { createI18n, type MessageCompiler, type MessageContext } from 'vue-i18n';
import en from './lang/en.json';
import ja from './lang/ja.json';

export type Lang = 'en' | 'ja';
const LANG_KEY = 'NG_TRANSLATE_LANG_KEY';

const compile: MessageCompiler = function (message) {
    const text = typeof message === 'string' ? message : '';
    return function (ctx: MessageContext) {
        return text.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, name: string) {
            const v = ctx.named(name);
            return v === undefined || v === null ? '' : String(v);
        });
    };
};

// The language kept, else the browser's (Japanese for ja-*, else English)
function preferred(): Lang {
    let lang: string | null = null;
    try { lang = window.localStorage.getItem(LANG_KEY); } catch (e) { /* storage off */ }
    if (lang === 'en' || lang === 'ja') return lang;
    const nav: any = navigator;
    const browser = (nav.languages && nav.languages[0]) || nav.language || nav.browserLanguage || nav.systemLanguage || nav.userLanguage || '';
    return /^ja\b/i.test(browser) ? 'ja' : 'en';
}

const start = preferred();
// told to the browser at once, so kanji are drawn with Japanese glyph shapes
document.documentElement.lang = start;

export const i18n = createI18n({
    legacy: false,
    locale: start,
    fallbackLocale: false,
    messages: { en: en, ja: ja },
    messageCompiler: compile,
    missingWarn: false,
    fallbackWarn: false,
    warnHtmlMessage: false
});

export function t(key: string, params?: Record<string, unknown>): string {
    return params ? i18n.global.t(key, params) : i18n.global.t(key);
}

export function lang(): Lang {
    return i18n.global.locale.value as Lang;
}

export function setLang(l: Lang): void {
    i18n.global.locale.value = l;
    document.documentElement.lang = l;
    try { window.localStorage.setItem(LANG_KEY, l); } catch (e) { /* storage off */ }
}
