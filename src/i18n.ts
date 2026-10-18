// The page's texts, one file per language (src/lang). Their parameters are written {{name}}. A text
// not in a language yet is shown in English; a key with no text at all gives the key back, which the
// editor uses to tell a missing text. The language chosen is kept in this browser (under the key the
// earlier version of the page used, so the choice carries over).
//
// Texts that depend on the rules follow the year of the map open (setRuleTexts): the rule numbers
// they cite are parameters ({{rule_reach}}: the year's refs.reach), and a year whose rules say
// otherwise has its own text of a key under "years": { "<year>": { <the key's path> } } in each
// language file, which is used in place of the key's.
//
// To add a language: its file in src/lang (a copy of en.json, translated; test/simLang.test.ts checks
// it has every key with the same parameters), and a line in LANGUAGES.
import { createI18n, type MessageCompiler, type MessageContext } from 'vue-i18n';
import en from './lang/en.json';
import ja from './lang/ja.json';

// The languages, in the order the language menu lists them: code (BCP 47, also the page's lang
// attribute), name (in that language), texts
export const LANGUAGES = [
    { code: 'ja', name: '日本語', messages: ja },
    { code: 'en', name: 'English', messages: en }
] as const;
export type Lang = typeof LANGUAGES[number]['code'];
// for a text not in the chosen language yet
const FALLBACK: Lang = 'en';
const LANG_KEY = 'NG_TRANSLATE_LANG_KEY';

function known(code: string | null | undefined): Lang | null {
    if (!code) return null;
    const c = code.toLowerCase();
    // the exact code (pt-br), else its language (pt)
    const hit = LANGUAGES.find(function (l) { return l.code.toLowerCase() === c; })
        || LANGUAGES.find(function (l) { return l.code.toLowerCase() === c.split('-')[0]; });
    return hit ? hit.code : null;
}

const compile: MessageCompiler = function (message) {
    const text = typeof message === 'string' ? message : '';
    return function (ctx: MessageContext) {
        return text.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, name: string) {
            const v = ctx.named(name);
            return v === undefined || v === null ? '' : String(v);
        });
    };
};

// The language kept, else the first of the browser's that the page has, else English
function preferred(): Lang {
    let kept: string | null = null;
    try { kept = window.localStorage.getItem(LANG_KEY); } catch (e) { /* storage off */ }
    if (known(kept)) return known(kept)!;
    const nav: any = navigator;
    const browser: string[] = (nav.languages && nav.languages.length ? nav.languages : [nav.language || nav.browserLanguage || nav.systemLanguage || nav.userLanguage || '']);
    for (let i = 0; i < browser.length; i++) if (known(browser[i])) return known(browser[i])!;
    return FALLBACK;
}

const start = preferred();
// told to the browser at once, so kanji are drawn with Japanese glyph shapes
document.documentElement.lang = start;

const messages: Record<string, any> = {};
LANGUAGES.forEach(function (l) { messages[l.code] = l.messages; });

export const i18n = createI18n({
    legacy: false,
    locale: start,
    fallbackLocale: FALLBACK,
    messages: messages,
    messageCompiler: compile,
    missingWarn: false,
    fallbackWarn: false,
    warnHtmlMessage: false
});

// the rules the texts follow (setRuleTexts)
let ruleYear = 0;
let ruleParams: Record<string, string> = {};

export function setRuleTexts(year: number, refs: Record<string, string>): void {
    ruleYear = year;
    ruleParams = {};
    Object.keys(refs).forEach(function (k) { ruleParams['rule_' + k] = refs[k]; });
}

export function t(key: string, params?: Record<string, unknown>): string {
    // the year's own text of the key, if it has one
    const own = ruleYear ? 'years.' + ruleYear + '.' + key : '';
    const has = i18n.global.te as (key: string) => boolean;
    const translate = i18n.global.t as (key: string, params: Record<string, unknown>) => string;
    if (own && has(own)) key = own;
    return translate(key, Object.assign({}, ruleParams, params));
}

export function lang(): Lang {
    return i18n.global.locale.value as Lang;
}

export function setLang(l: Lang): void {
    i18n.global.locale.value = l;
    document.documentElement.lang = l;
    try { window.localStorage.setItem(LANG_KEY, l); } catch (e) { /* storage off */ }
}
