// A black tile, shared by the editor's map and the custom room 4 creator: the whole tile black (its
// colour), and inside its rim a hole - a pit lit from the top left, its far sides (bottom, right)
// catching the light and its middle dark.
function drawHole(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rim: number, color: string) {
    const x0 = x + rim, y0 = y + rim, w = size - 2 * rim, d = w * 0.14;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    const g = ctx.createRadialGradient(x0 + w * 0.45, y0 + w * 0.45, 0, x0 + w * 0.45, y0 + w * 0.45, w * 0.7);
    g.addColorStop(0, '#000');
    g.addColorStop(1, '#111827');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, w);
    const face = function (color: string, pts: number[][]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
    };
    face('#475569', [[x0, y0 + w], [x0 + w, y0 + w], [x0 + w - d, y0 + w - d], [x0 + d, y0 + w - d]]);
    face('#334155', [[x0 + w, y0], [x0 + w, y0 + w], [x0 + w - d, y0 + w - d], [x0 + w - d, y0 + d]]);
    face('#020617', [[x0, y0], [x0 + w, y0], [x0 + w - d, y0 + d], [x0 + d, y0 + d]]);
    face('#0b1120', [[x0, y0], [x0 + d, y0 + d], [x0 + d, y0 + w - d], [x0, y0 + w]]);
    // its edge, catching the light on the rim
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = w * 0.03;
    ctx.strokeRect(x0, y0, w, w);
    ctx.restore();
}

export { drawHole };
