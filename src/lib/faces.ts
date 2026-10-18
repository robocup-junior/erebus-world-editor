// The faces smiley victims are drawn as: Font Awesome's (regular) face icons, as the paths of their
// SVGs (512 x 512, the face filling the square), so a face is centred where it is drawn - on the map's
// canvas and in the panels alike - without waiting for a font
import frown from '@fortawesome/fontawesome-free/svgs/regular/face-frown.svg?raw';
import meh from '@fortawesome/fontawesome-free/svgs/regular/face-meh.svg?raw';
import smile from '@fortawesome/fontawesome-free/svgs/regular/face-smile.svg?raw';

export const FACE_BOX = 512;

function pathOf(svg: string) {
    const m = svg.match(/\sd="([^"]+)"/);
    return m ? m[1] : '';
}

// by the face's name (rules: TokenKind.face)
export const FACES: Record<string, string> = {
    'face-frown': pathOf(frown),
    'face-meh': pathOf(meh),
    'face-smile': pathOf(smile)
};
