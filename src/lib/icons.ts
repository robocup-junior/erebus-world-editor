// Victim and cognitive target icons, shared by the Simulation editors (the new editor's map and the
// custom room 4 creator), so both show the same marks.
//   letter victims (Φ Ψ Ω): a filled disc with the letter (blue; fakes grey)
//   cognitive targets: a target - its five rings in the colours of its code (outside in), with an
//   outer rim in the colour of its type; a target without a code (a room 4 stamp of a type) shows
//   rings of the type colour. Small (the map, the panels' buttons) it is the type's mark: rings of
//   the type colour and white, as the buttons of the victim panels show it

const RING: Record<string, string> = { K: '#111827', R: '#dc2626', Y: '#facc15', G: '#16a34a', B: '#2563eb' };
// the type colours: each its own hue, after what it is - flammable gas the red of fire, poison
// purple, corrosive black (as its hazard label) and organic peroxide yellow (as an oxidizer's); fake
// a light grey. Kept in the stamps of the rules' tokens too
const TYPE: Record<string, string> = { F: '#dc2626', P: '#7e22ce', C: '#1f2937', O: '#eab308', X: '#a8b0bb' };
const VICTIM = '#2563eb', FAKE = '#94a3b8';
// the ring colours as the pickers list them: K R Y G B with their values
const RING_LIST = [
    { id: 'K', color: RING.K, value: -2 }, { id: 'R', color: RING.R, value: -1 }, { id: 'Y', color: RING.Y, value: 0 },
    { id: 'G', color: RING.G, value: 1 }, { id: 'B', color: RING.B, value: 2 }
];

// The letter's own ink centred on (x, y) (the font's middle line sits higher or lower than the
// letter depending on the letter)
function centredText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    const m = ctx.measureText(text);
    if (m && m.actualBoundingBoxAscent !== undefined) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, x - (m.actualBoundingBoxLeft !== undefined ? (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 : m.width / 2),
            y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
        return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function victim(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, symbol: string, color: string, outline?: number) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color || VICTIM;
    ctx.fill();
    if (outline) {
        ctx.lineWidth = outline;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 ' + (r * 1.35) + 'px system-ui, sans-serif';
    centredText(ctx, symbol, x, y);
    ctx.restore();
}

// code: the ring code (K R Y G B, outside in) or null; color: the type colour
function target(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, code: string | null | undefined, color: string, outline?: number) {
    const rings = code && /^[KRYGB]{5}$/.test(code)
        ? code.split('').map(function (c) { return RING[c]; })
        : [color, '#fff', color, '#fff', color];
    ctx.save();
    // rim in the type colour, then the rings
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    const inner = r * 0.82;
    rings.forEach(function (c, i) {
        ctx.beginPath();
        ctx.arc(x, y, inner * (1 - i / 5), 0, 2 * Math.PI);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = Math.max(r * 0.03, 0.02);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.stroke();
    });
    if (outline) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.lineWidth = outline;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }
    ctx.restore();
}

// A cognitive target small enough that its own rings would not show (the map): the mark of its
// type (grey when the code is not valid). Without a code (a room 4 stamp of a type) `color` gives
// the type's colour.
function targetMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, code: string | null | undefined, color: string, outline?: number) {
    const c = color || TYPE[typeOf(code)];
    ctx.save();
    // from the outside in, as markBackground's stops
    [1, 0.7, 0.535, 0.355, 0.185].forEach(function (f, i) {
        ctx.beginPath();
        ctx.arc(x, y, r * f, 0, 2 * Math.PI);
        ctx.fillStyle = i % 2 ? '#fff' : c;
        ctx.fill();
    });
    if (outline) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.lineWidth = outline;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }
    ctx.restore();
}

// For HTML: the type's mark as a CSS background (same look as `targetMark`)
function markBackground(color: string) {
    return 'radial-gradient(circle closest-side, ' + color + ' 0 18%, #fff 19% 35%, ' + color + ' 36% 53%, #fff 54% 70%, ' + color + ' 71%)';
}

// For HTML: the target as a CSS background (same look as `target`)
function targetBackground(code: string | null | undefined, color: string) {
    const rings = code && /^[KRYGB]{5}$/.test(code)
        ? code.split('').map(function (c) { return RING[c]; })
        : [color, '#fff', color, '#fff', color];
    const stops: string[] = [];
    for (let i = 4; i >= 0; i--) {
        const from = (4 - i) * 16.4, to = (5 - i) * 16.4;
        stops.push(rings[i] + ' ' + from + '% ' + to + '%');
    }
    stops.push(color + ' 82%');
    return 'radial-gradient(circle closest-side, ' + stops.join(', ') + ')';
}

// The type letter (F P C O) of a ring code, or X when it is not a valid one
function ringSum(rings: string[]) {
    const v: Record<string, number> = { K: -2, R: -1, Y: 0, G: 1, B: 2 };
    return rings.reduce(function (sum, c) { return sum + (v[c] || 0); }, 0);
}

function typeOf(code: string | null | undefined) {
    if (!code || !/^[KRYGB]{5}$/.test(code)) return 'X';
    const v: Record<string, number> = { K: -2, R: -1, Y: 0, G: 1, B: 2 };
    const sum = code.split('').reduce(function (s, c) { return s + v[c]; }, 0);
    return ['F', 'P', 'C', 'O'][sum] || 'X';
}

export {
    RING_LIST,
    ringSum,
    TYPE,
    VICTIM,
    FAKE,
    victim,
    target,
    targetMark,
    markBackground,
    targetBackground,
    typeOf

};
