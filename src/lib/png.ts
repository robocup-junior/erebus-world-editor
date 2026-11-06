// Text kept in a PNG file (its tEXt chunks): one put in before the image's end, one read back. The
// room 4 creator keeps room 4's obstacles in the pictures it saves this way, so a picture opened
// again brings them back; any program showing the picture leaves the text alone.

const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function isPng(png: Uint8Array) { return png.length > 8 && SIGNATURE.every(function (b, i) { return png[i] === b; }); }
function u32(png: Uint8Array, at: number) { return ((png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3]) >>> 0; }
// tEXt holds Latin-1: anything past ASCII written as JSON writes it, \uXXXX
function ascii(text: string) { return text.replace(/[\u0080-￿]/g, function (ch) { return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'); }); }

// The PNG with a tEXt chunk `key` holding `text` (one of that key there already left out), before its
// IEND; a file that is not a PNG as it is
function withText(png: Uint8Array, key: string, text: string): Uint8Array {
    if (!isPng(png)) return png;
    const body = new TextEncoder().encode(key + '\0' + ascii(text));
    const chunk = new Uint8Array(12 + body.length);
    const len = body.length;
    chunk.set([len >>> 24, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff], 0);
    chunk.set([116, 69, 88, 116], 4);           // "tEXt"
    chunk.set(body, 8);
    const crc = crc32(chunk.subarray(4, 8 + len));
    chunk.set([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], 8 + len);
    // its chunks, but the one of this key, with the new one before IEND
    const parts: Uint8Array[] = [png.subarray(0, 8)];
    let at = 8;
    while (at + 12 <= png.length) {
        const n = u32(png, at), type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
        const whole = png.subarray(at, at + 12 + n);
        if (type === 'IEND') { parts.push(chunk, whole); break; }
        if (!(type === 'tEXt' && textOf(png, at, n).key === key)) parts.push(whole);
        at += 12 + n;
    }
    const out = new Uint8Array(parts.reduce(function (s, p) { return s + p.length; }, 0));
    let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
}
function textOf(png: Uint8Array, at: number, n: number) {
    const body = png.subarray(at + 8, at + 8 + n), zero = body.indexOf(0);
    const dec = new TextDecoder('latin1');
    return zero < 0 ? { key: '', text: '' } : { key: dec.decode(body.subarray(0, zero)), text: dec.decode(body.subarray(zero + 1)) };
}
// The text of the PNG's tEXt chunk `key`, or null (none, or not a PNG)
function readText(png: Uint8Array, key: string): string | null {
    if (!isPng(png)) return null;
    let at = 8;
    while (at + 12 <= png.length) {
        const n = u32(png, at), type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);
        if (type === 'tEXt') { const t = textOf(png, at, n); if (t.key === key) return t.text; }
        if (type === 'IEND') break;
        at += 12 + n;
    }
    return null;
}
// a data: URL's bytes
function dataUrlBytes(url: string): Uint8Array {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export { withText, readText, dataUrlBytes, crc32 };
