// Font Awesome's free icons for the room 4 creator's shape tool: the list of icons and of categories
// from the package's metadata (loaded on first use), and the icons to show for a search word or a
// category. Brand logos are left out: they are trademarks, not shapes.
import iconsUrl from '@fortawesome/fontawesome-free/metadata/icons.yml?url';
import categoriesUrl from '@fortawesome/fontawesome-free/metadata/categories.yml?url';

// unicode: the icon's code point in the font (hex)
export interface Icon { name: string; label: string; terms: string[]; styles: string[]; unicode: string }
export interface Category { id: string; label: string; icons: string[] }

const SUGGESTED = ['star', 'heart', 'circle', 'square', 'play', 'plus', 'xmark', 'bolt', 'fire', 'tree', 'leaf',
    'car', 'bus', 'truck', 'helicopter', 'house', 'building', 'robot', 'paw', 'fish', 'dove', 'bone', 'puzzle-piece',
    'cube', 'shapes', 'shield-halved', 'anchor', 'umbrella', 'cloud', 'snowflake', 'sun', 'moon', 'mountain', 'droplet',
    'water', 'skull', 'user', 'child', 'hand', 'flag', 'bell', 'key', 'lock', 'gem', 'crown', 'chess-knight'];

function parseIcons(yml: string): Icon[] {
    const list: Icon[] = [];
    let cur: Icon | null = null, mode = '';
    yml.split('\n').forEach(function (line) {
        let m;
        if ((m = line.match(/^([a-z0-9-]+):\s*$/))) { cur = { name: m[1], label: m[1], terms: [], styles: [], unicode: '' }; list.push(cur); mode = ''; return; }
        if (!cur) return;
        if ((m = line.match(/^  label: (.*)$/))) { cur.label = m[1].replace(/^['"]|['"]$/g, ''); mode = ''; return; }
        if ((m = line.match(/^  unicode: ['"]?([0-9a-f]+)['"]?\s*$/))) { cur.unicode = m[1]; mode = ''; return; }
        if (/^  styles:/.test(line)) { mode = 'styles'; return; }
        if (/^    terms:/.test(line)) { mode = 'terms'; return; }
        if (/^  \S/.test(line)) { mode = ''; return; }
        if (mode === 'styles' && (m = line.match(/^    - (.*)$/))) cur.styles.push(m[1].trim());
        if (mode === 'terms' && (m = line.match(/^      - (.*)$/))) cur.terms.push(String(m[1]).replace(/^['"]|['"]$/g, '').toLowerCase());
    });
    return list.filter(function (i) { return i.unicode && i.styles.some(function (st) { return st !== 'brands'; }); });
}

function parseCategories(yml: string): Category[] {
    const cats: Category[] = [];
    let cur: Category | null = null, inIcons = false;
    yml.split('\n').forEach(function (line) {
        let m;
        if ((m = line.match(/^([a-z0-9-]+):\s*$/))) { cur = { id: m[1], label: m[1], icons: [] }; cats.push(cur); inIcons = false; return; }
        if (!cur) return;
        if (/^  icons:/.test(line)) { inIcons = true; return; }
        if ((m = line.match(/^  label: (.*)$/))) { cur.label = m[1].replace(/^['"]|['"]$/g, ''); inIcons = false; return; }
        if (inIcons && (m = line.match(/^    - (.*)$/))) cur.icons.push(m[1].trim());
    });
    return cats;
}

// Both lists, the categories keeping only icons in the list (fetched once)
let loading: Promise<{ all: Icon[]; byName: Record<string, Icon>; categories: Category[] }> | null = null;
export function loadIcons(): Promise<{ all: Icon[]; byName: Record<string, Icon>; categories: Category[] }> {
    if (loading) return loading;
    loading = Promise.all([fetch(iconsUrl).then(function (r) { return r.text(); }),
                        fetch(categoriesUrl).then(function (r) { return r.text(); })]).then(function (res) {
        const all = parseIcons(res[0]);
        const byName: Record<string, Icon> = {};
        all.forEach(function (i) { byName[i.name] = i; });
        const categories = parseCategories(res[1]).map(function (c) {
            c.icons = c.icons.filter(function (n) { return byName[n]; });
            return c;
        }).filter(function (c) { return c.icons.length; });
        return { all: all, byName: byName, categories: categories };
    }).catch(function (e) { loading = null; throw e; });
    return loading;
}

// Icons to show for the search word / category (at most 60)
export function iconResults(icons: { loaded: boolean; all: Icon[]; byName: Record<string, Icon>; categories: Category[] }, query: string, category: string): Icon[] {
    if (!icons.loaded) return [];
    const q = (query || '').trim().toLowerCase();
    let list: Icon[];
    if (category) {
        const cat = icons.categories.find(function (c) { return c.id === category; });
        list = cat ? cat.icons.map(function (n) { return icons.byName[n]; }) : [];
    } else if (!q) {
        list = SUGGESTED.map(function (n) { return icons.byName[n]; }).filter(Boolean);
    } else {
        list = icons.all;
    }
    if (q) {
        list = list.filter(function (i) {
            return i.name.indexOf(q) > -1 || i.label.toLowerCase().indexOf(q) > -1 || i.terms.some(function (x) { return x.indexOf(q) > -1; });
        }).sort(function (a, b) {
            const ra = a.name.indexOf(q) === 0 ? 0 : (a.name.indexOf(q) > -1 ? 1 : 2);
            const rb = b.name.indexOf(q) === 0 ? 0 : (b.name.indexOf(q) > -1 ? 1 : 2);
            return ra - rb || a.name.localeCompare(b.name);
        });
    }
    return list.slice(0, 60);
}

export function iconClass(i: Icon): string {
    return (i.styles.indexOf('solid') > -1 ? 'fas' : 'far') + ' fa-' + i.name;
}
