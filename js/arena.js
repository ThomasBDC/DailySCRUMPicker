import { SCENE_SIZE } from './constants.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// Demi-largeur maximale : au-delà, les coureurs du fond deviennent minuscules
const MAX_HALF_WIDTH = 18;
// Hauteurs à l'écran (-1 = bas, 1 = haut) du bord avant et du fond du terrain
const NEAR_NDC_Y = -0.7;
const FAR_NDC_Y = 0.3;

// Zone de course au sol (y = 0) : un trapèze entre zFar (fond) et zNear (devant),
// de demi-largeur halfFar au fond et halfNear devant.
export class Arena {
    constructor() {
        this.zNear = SCENE_SIZE / 2;
        this.zFar = -SCENE_SIZE / 2;
        this.halfNear = SCENE_SIZE / 2;
        this.halfFar = SCENE_SIZE / 2;
        this._camera = null;
    }

    // Ajuste la zone à la partie du sol visible par la caméra
    fitCamera(camera) {
        this._camera = camera;
        camera.updateMatrixWorld();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        // Demi-largeur visible du sol à la profondeur z (marge de 15 % sur les côtés)
        const halfWidthAt = (z) => {
            const depth = -camera.position.x * forward.x - camera.position.y * forward.y + (z - camera.position.z) * forward.z;
            return Math.min(MAX_HALF_WIDTH, 0.85 * tanHalf * camera.aspect * depth);
        };
        // Bas de l'écran : on garde de la place pour les pieds et le prénom
        this.zNear = this.#groundZAt(NEAR_NDC_Y);
        this.zFar = Math.max(this.#groundZAt(FAR_NDC_Y), this.zNear - 20);
        this.halfNear = halfWidthAt(this.zNear);
        this.halfFar = halfWidthAt(this.zFar);
    }

    // z du point du sol vu au centre de l'écran, à la hauteur ndcY
    #groundZAt(ndcY) {
        const camera = this._camera;
        const dir = new THREE.Vector3(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
        return dir.y < -1e-3 ? camera.position.z + dir.z * (-camera.position.y / dir.y) : -Infinity;
    }

    halfX(z) {
        const t = clamp((z - this.zFar) / (this.zNear - this.zFar), 0, 1);
        return this.halfFar + (this.halfNear - this.halfFar) * t;
    }

    // Distances aux quatre bords (négatives si le point est dehors)
    wallDistances(pos) {
        const half = this.halfX(pos.z);
        return {
            left: half + pos.x,
            right: half - pos.x,
            near: this.zNear - pos.z,
            far: pos.z - this.zFar
        };
    }

    // Ramène le point (x, z) dans la zone, à `margin` des bords
    clamp(pos, margin = 0) {
        pos.z = clamp(pos.z, this.zFar + margin, this.zNear - margin);
        const half = Math.max(0, this.halfX(pos.z) - margin);
        pos.x = clamp(pos.x, -half, half);
        return pos;
    }

    // Point au hasard, réparti uniformément à l'écran (au sol, la perspective tasserait tout au fond)
    randomPoint(margin = 0, target = new THREE.Vector3()) {
        let z = this.zFar + Math.random() * (this.zNear - this.zFar);
        if (this._camera) z = this.#groundZAt(NEAR_NDC_Y + Math.random() * (FAR_NDC_Y - NEAR_NDC_Y));
        z = clamp(z, this.zFar + margin, this.zNear - margin);
        const half = Math.max(0, this.halfX(z) - margin);
        return target.set((Math.random() * 2 - 1) * half, 0, z);
    }
}
