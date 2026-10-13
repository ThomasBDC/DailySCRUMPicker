import { PERSON_RADIUS } from './constants.js';

const R = PERSON_RADIUS;
const MAX_DROPS = 16;
const DROPS_PER_SECOND = 16; // à stress maximal
const GRAVITY = 14;
const ALERT_TIME = 1.2; // durée d'affichage du « ! » (s)
const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();

// Ressources partagées par tous les personnages, créées à la première utilisation
let dropGeometry = null;
let dropMaterial = null;
let alertTexture = null;

function getDropAssets() {
    if (!dropGeometry) {
        // Goutte : ronde en bas, pointue en haut (profil tourné autour de l'axe Y)
        const points = [];
        for (let i = 0; i <= 14; i++) {
            const a = Math.PI * (1 - i / 14);
            points.push(new THREE.Vector2(Math.sin(a) * Math.sin(a / 2) * R * 0.11, Math.cos(a) * R * 0.16));
        }
        dropGeometry = new THREE.LatheGeometry(points, 14);
        dropMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xa8dcff,
            emissive: 0x1d4f7a,
            emissiveIntensity: 0.35,
            roughness: 0.05,
            clearcoat: 1,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
    }
    return { geometry: dropGeometry, material: dropMaterial };
}

function getAlertTexture() {
    if (!alertTexture) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.font = '900 220px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 18;
        ctx.strokeStyle = '#1a1a2a';
        ctx.strokeText('!', 64, 136);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText('!', 64, 136);
        alertTexture = new THREE.CanvasTexture(canvas);
        alertTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return alertTexture;
}

// Signes de stress d'un personnage : gouttes de sueur qui giclent de la tête
// et gros « ! » de dessin animé au moment où il se fait attraper
export class StressFx {
    constructor(group, torso) {
        this.group = group;
        this.torso = torso;
        this.stress = 0; // 0..1 : cadence des gouttes
        this._drops = [];
        this._pending = 0;
        this._alert = null;
        this._alertTime = 0;
    }

    setStress(level) {
        this.stress = Math.max(0, Math.min(1, level));
    }

    // « ! » qui surgit au-dessus de la tête
    alert() {
        if (!this._alert) {
            const material = new THREE.SpriteMaterial({ map: getAlertTexture(), transparent: true, depthWrite: false });
            this._alert = new THREE.Sprite(material);
            this._alert.position.set(R * 0.55, R * 1.95, 0);
            this.group.add(this._alert);
        }
        this._alert.visible = true;
        this._alertTime = 0;
    }

    update(dt) {
        this.#updateAlert(dt);

        // Nouvelles gouttes, au rythme du stress
        this._pending += dt * this.stress * DROPS_PER_SECOND;
        if (this._pending >= 1 && this.group.parent) this.group.updateMatrixWorld(true);
        while (this._pending >= 1) {
            this._pending -= 1;
            this.#emit();
        }

        // Trajectoires en cloche, la pointe traînant derrière, puis la goutte s'évanouit
        for (const drop of this._drops) {
            if (!drop.mesh.visible) continue;
            drop.age += dt;
            if (drop.age >= drop.life) {
                drop.mesh.visible = false;
                continue;
            }
            drop.velocity.y -= GRAVITY * dt;
            drop.mesh.position.addScaledVector(drop.velocity, dt);
            drop.mesh.quaternion.setFromUnitVectors(UP, TMP.copy(drop.velocity).negate().normalize());
            const u = drop.age / drop.life;
            const size = drop.size * Math.min(1, drop.age / 0.08) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
            drop.mesh.scale.setScalar(Math.max(0.001, size));
        }
    }

    #emit() {
        const scene = this.group.parent;
        if (!scene) return;
        let drop = this._drops.find((d) => !d.mesh.visible);
        if (!drop) {
            if (this._drops.length >= MAX_DROPS) return;
            const { geometry, material } = getDropAssets();
            drop = { mesh: new THREE.Mesh(geometry, material), velocity: new THREE.Vector3(), age: 0, life: 1, size: 1 };
            this._drops.push(drop);
        }
        if (drop.mesh.parent !== scene) scene.add(drop.mesh);

        // Part d'un côté du haut de la tête (repère du torse, qui suit sa déformation)
        const side = Math.random() < 0.5 ? -1 : 1;
        const local = new THREE.Vector3(side * (0.5 + Math.random() * 0.25), 0.55 + Math.random() * 0.25, 0.2 + Math.random() * 0.3)
            .normalize()
            .multiplyScalar(R * 0.66);
        const origin = this.torso.localToWorld(local.clone());
        const center = this.torso.localToWorld(new THREE.Vector3());
        // Gicle vers l'extérieur et vers le haut
        const outward = origin.clone().sub(center).setY(0);
        if (outward.lengthSq() < 1e-6) outward.set(side, 0, 0);
        outward.normalize();
        drop.velocity.copy(outward).multiplyScalar(1.6 + Math.random() * 1.4);
        drop.velocity.y = 2.8 + Math.random() * 1.8;
        drop.mesh.position.copy(origin);
        drop.age = 0;
        drop.life = 0.55 + Math.random() * 0.3;
        drop.size = 0.8 + Math.random() * 0.5;
        drop.mesh.scale.setScalar(0.001);
        drop.mesh.visible = true;
    }

    #updateAlert(dt) {
        if (!this._alert || !this._alert.visible) return;
        this._alertTime += dt;
        const t = this._alertTime;
        // Surgit en rebondissant, tremble un peu, puis s'efface
        const pop = t < 0.2 ? 1.35 * Math.sin((t / 0.2) * Math.PI / 2) : 1 + 0.35 * Math.exp(-(t - 0.2) * 10);
        const shake = Math.sin(t * 40) * 0.06 * Math.max(0, 1 - t / 0.6);
        this._alert.scale.set(R * 0.5 * pop, R * 1.0 * pop, 1);
        this._alert.material.rotation = shake;
        this._alert.material.opacity = t > ALERT_TIME - 0.3 ? Math.max(0, (ALERT_TIME - t) / 0.3) : 1;
        if (t >= ALERT_TIME) this._alert.visible = false;
    }

    // Plus de gouttes ni de « ! » (le personnage est retiré ou remis à zéro)
    clear() {
        this.stress = 0;
        this._pending = 0;
        for (const drop of this._drops) {
            drop.mesh.visible = false;
            drop.mesh.parent?.remove(drop.mesh);
        }
        if (this._alert) this._alert.visible = false;
    }
}
