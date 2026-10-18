// Cognitive targets of 2026 (rule 3.7.7-3.7.10): five rings, K R Y G B from the outside in, worth
// -2 -1 0 1 2; their sum gives the type - 0 F (flammable gas), 1 P (poison), 2 C (corrosive), 3 O
// (organic peroxide) - and any other sum makes a fake target.

function cognitiveCodeToVictimLetter(code: string | null | undefined): string | null {
    if (!code || code.length !== 5) return null;
    let sum = 0;
    for (const c of code) {
        switch (c) {
        case 'K': sum += -2; break;
        case 'R': sum += -1; break;
        case 'Y': sum +=  0; break;
        case 'G': sum +=  1; break;
        case 'B': sum +=  2; break;
        }
    }
    const map: Record<number, string> = {0: 'F', 1: 'P', 2: 'C', 3: 'O'};
    return map[sum] !== undefined ? map[sum] : null;
}

// Generates a random 5-character CT code from {K,R,Y,G,B} where:
// K=-2, R=-1, Y=0, G=1, B=2.
// For F=0, P=1, C=2, O=3: sum of chars equals the target value (valid CT).
// For X (CTfake): sum must NOT be in [0,3] (invalid CT).
function randomCognitiveCode(hazardType?: string | null): string {
    const chars  = ['K', 'R', 'Y', 'G', 'B'];
    const values: Record<string, number> = { 'K': -2, 'R': -1, 'Y': 0, 'G': 1, 'B': 2 };
    if (hazardType === 'X') {
        // CTfake: generate until sum is outside [0, 3]
        while (true) {
            let code = '';
            let sum = 0;
            for (let i = 0; i < 5; i++) {
                let c = chars[Math.floor(Math.random() * chars.length)];
                code += c;
                sum += values[c];
            }
            if (sum < 0 || sum > 3) return code;
        }
    } else {
        const targetSumMap: Record<string, number> = { 'F': 0, 'P': 1, 'C': 2, 'O': 3 };
        const targetSum = targetSumMap[hazardType as string];
        while (true) {
            let code = '';
            let sum = 0;
            for (let i = 0; i < 4; i++) {
                let c = chars[Math.floor(Math.random() * chars.length)];
                code += c;
                sum += values[c];
            }
            let needed = targetSum - sum;
            if (needed >= -2 && needed <= 2) {
                let lastChar = Object.keys(values).find(k => values[k] === needed);
                return code + lastChar;
            }
            // sum of first 4 chars doesn't allow a valid 5th char, retry
        }
    }
}

export {
    cognitiveCodeToVictimLetter,
    randomCognitiveCode
};
