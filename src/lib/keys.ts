// Key names as the computer has them: on a Mac, Ctrl+ is shown as ⌘ (the editors take either) and
// Alt as Option; elsewhere a "Ctrl (⌘)" loses its "(⌘)". text(s) turns a text over.
const nav: { platform?: string; userAgent?: string } = typeof navigator !== 'undefined' ? navigator : {};
const isMac = /Mac|iPhone|iPad|iPod/.test(nav.platform || '') || /Mac OS X/.test(nav.userAgent || '');

export function text(s: string, mac?: boolean): string;
export function text(s: string | null | undefined, mac?: boolean): string | null | undefined;
export function text(s: string | null | undefined, mac?: boolean): string | null | undefined {
    if (s === undefined || s === null) return s;
    s = String(s);
    if (!(mac === undefined ? isMac : mac)) return s.replace(/\s*[（(]⌘[）)]/g, '');
    return s
        .replace(/Ctrl\s*[（(]⌘[）)]\s*([＋+])/g, '⌘$1')
        .replace(/Ctrl\s*[（(]⌘[）)]/g, '⌘')
        .replace(/Ctrl\s*\+\s*Shift\s*\+\s*/g, '⇧⌘')
        .replace(/Ctrl\s*\+\s*/g, '⌘')
        .replace(/Ctrl/g, '⌘')
        .replace(/\bAlt\b/g, 'Option');
}
