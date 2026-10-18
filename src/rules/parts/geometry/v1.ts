// The field and the robot (2026: rules 3.3, 5.6.2)
import type { Geometry } from '../../types';

export const geometry: Geometry = {
    tileCm: 12,             // 3.3.1
    wallHalfCm: 0.5,        // 3.3.2: walls 1 cm thick
    robotRadiusCm: 3.7,     // the robot of the robot customiser, as the editor reckons it
    identifyCm: 6           // 5.6.2: within half a tile of the token
};
