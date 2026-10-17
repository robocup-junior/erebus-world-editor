// Numbers and times as the page shows them

// n with `digits` decimals, rounded half up on its decimal digits (12.25 -> "12.3")
export function fixed(n: number | null | undefined, digits: number): string {
    if (n === null || n === undefined || !isFinite(n)) return '';
    const rounded = Number(Math.round(Number(n + 'e' + digits)) + 'e-' + digits);
    return rounded.toFixed(digits);
}

// a time as M/d HH:mm (local time)
export function monthDayTime(time: number | Date | null | undefined): string {
    if (time === null || time === undefined) return '';
    const d = new Date(time);
    if (isNaN(d.getTime())) return '';
    const two = function (v: number) { return (v < 10 ? '0' : '') + v; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}
