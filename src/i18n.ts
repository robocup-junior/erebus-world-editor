// The page's texts, one file per language (src/lang). Their parameters are written {{name}}. A text
// not in a language yet is shown in English; a key with no text at all gives the key back, which the
// editor uses to tell a missing text. The language chosen is kept in this browser (lib/kept: what an
// earlier version kept is carried over first, so the choice stays).
//
// Texts that depend on the rules follow the year of the map open (setRuleTexts): the rule numbers
// they cite are parameters ({{rule_reach}}: the year's refs.reach), and a year whose rules say
// otherwise has its own text of a key under "years": { "<year>": { <the key's path> } } in each
// language file, which is used in place of the key's.
//
// To add a language: its file in src/lang (a copy of en.json, translated; test/lang.test.ts checks
// it has every key with the same parameters), and a line in LANGUAGES with the flag of the country
// most taken for it (flag-icons). The language menu shows each language by its own name and flag.
//
// Only English (what a missing text falls back to) is part of the page's script; each other
// language is a file of its own, loaded when it is chosen (loadLang) - the page waits for the one it
// starts in.
import { createI18n, type MessageCompiler, type MessageContext } from 'vue-i18n';
import { KEPT, carryOver } from './lib/kept';
import en from './lang/en.json';
import flagJp from 'flag-icons/flags/4x3/jp.svg?url';
import flagGb from 'flag-icons/flags/4x3/gb.svg?url';
import flagEs from 'flag-icons/flags/4x3/es.svg?url';
import flagBr from 'flag-icons/flags/4x3/br.svg?url';
import flagDe from 'flag-icons/flags/4x3/de.svg?url';
import flagCn from 'flag-icons/flags/4x3/cn.svg?url';
import flagKr from 'flag-icons/flags/4x3/kr.svg?url';
import flagFr from 'flag-icons/flags/4x3/fr.svg?url';
import flagTr from 'flag-icons/flags/4x3/tr.svg?url';
import flagId from 'flag-icons/flags/4x3/id.svg?url';
import flagTh from 'flag-icons/flags/4x3/th.svg?url';
import flagHk from 'flag-icons/flags/4x3/hk.svg?url';

// The languages, in the order the language menu lists them - by their own names, as language menus
// usually are: Latin script alphabetically, then the others by their characters: code (BCP 47, also
// the page's lang attribute and the name of its file in src/lang), name (in that language), flag (a
// picture's URL)
export const LANGUAGES = [
    { code: 'id', name: 'Bahasa Indonesia', flag: flagId },
    { code: 'de', name: 'Deutsch', flag: flagDe },
    { code: 'en', name: 'English', flag: flagGb },
    { code: 'es', name: 'Español', flag: flagEs },
    { code: 'fr', name: 'Français', flag: flagFr },
    { code: 'pt-BR', name: 'Português (Brasil)', flag: flagBr },
    { code: 'tr', name: 'Türkçe', flag: flagTr },
    { code: 'th', name: 'ไทย', flag: flagTh },
    { code: 'zh-CN', name: '中文（简体）', flag: flagCn },
    { code: 'zh-Hant', name: '中文（繁體）', flag: flagHk },
    { code: 'ja', name: '日本語', flag: flagJp },
    { code: 'ko', name: '한국어', flag: flagKr }
] as const;
export type Lang = typeof LANGUAGES[number]['code'];
// for a text not in the chosen language yet
const FALLBACK: Lang = 'en';
const LANG_KEY = KEPT.lang;

function known(code: string | null | undefined): Lang | null {
    if (!code) return null;
    let c = code.toLowerCase();
    // Chinese written in traditional characters: by its script (zh-Hant-TW), else by where (zh-TW)
    if (/^zh-(hant|tw|hk|mo)\b/.test(c)) c = 'zh-hant';
    // the exact code (pt-br), else one of its language (pt, pt-pt: pt-BR; zh, zh-sg: zh-CN)
    const base = function (code: string) { return code.toLowerCase().split('-')[0]; };
    const hit = LANGUAGES.find(function (l) { return l.code.toLowerCase() === c; })
        || LANGUAGES.find(function (l) { return base(l.code) === base(c); });
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

carryOver();
const start = preferred();
// told to the browser at once, so kanji are drawn with Japanese glyph shapes
document.documentElement.lang = start;

// the languages' files, each loaded when first asked for (English is here already)
const FILES = import.meta.glob<{ default: Record<string, any> }>(['./lang/*.json', '!./lang/en.json']);
const loaded: Partial<Record<Lang, Promise<void>>> = { en: Promise.resolve() };

export const i18n = createI18n({
    legacy: false,
    // the language started in is set once its texts are there (main.ts: loadLang)
    locale: FALLBACK,
    fallbackLocale: FALLBACK,
    messages: { en: en } as Record<string, any>,
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

// The language's texts, loaded once (a language that would not load stays in English)
function texts(l: Lang): Promise<void> {
    if (!loaded[l]) {
        const file = FILES['./lang/' + l + '.json'];
        loaded[l] = file().then(function (m) {
            i18n.global.setLocaleMessage(l, m.default);
        }, function (err) {
            delete loaded[l];
            throw err;
        });
    }
    return loaded[l]!;
}

// The language the page starts in, once its texts are there (English, if they would not load)
export function loadLang(): Promise<void> {
    return texts(start).then(function () {
        i18n.global.locale.value = start;
    }, function (err) {
        console.warn(err);
        document.documentElement.lang = FALLBACK;
    });
}

// The language chosen: the page turns to it once its texts are there (a language that would not
// load leaves the page as it is)
export function setLang(l: Lang): Promise<void> {
    return texts(l).then(function () {
        i18n.global.locale.value = l;
        document.documentElement.lang = l;
        try { window.localStorage.setItem(LANG_KEY, l); } catch (e) { /* storage off */ }
    }, function (err) { console.warn(err); });
}
