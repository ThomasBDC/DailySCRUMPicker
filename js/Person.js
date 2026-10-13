import { PERSON_RADIUS } from './constants.js';
import { Arena } from './arena.js';
import { StressFx } from './stressFx.js';

const R = PERSON_RADIUS;
const TAU = Math.PI * 2;
// Distance parcourue pendant une foulée complète (deux pas) : la cadence en découle,
// ce qui évite que les pieds glissent sur le sol
const STRIDE_LENGTH = R * 1.9;
// Positions de repos des membres dans le repère du personnage (centre ≈ origine)
const LEG_Y = -R * 0.28;
const FOOT_Y = -R * 0.6;
const ARM_REST = 0.55; // écartement des bras au repos (rad)
// Enlèvement par l'OVNI (durées en s) : soulevé un peu, il continue de courir dans le vide,
// puis le rayon l'amène devant la caméra
const STRUGGLE_TIME = 0.6;
const GLIDE_TIME = 1.4;
const RISE_HEIGHT = R * 1.3;
const DEPART_TIME = 0.7;
const GULP_PERIOD = 2.4; // il déglutit nerveusement pendant qu'on le présente

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
// Lissage exponentiel indépendant du nombre d'images par seconde
const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Course : écartement entre coureurs, rayon de panique autour du faisceau, marge aux bords
const PERSONAL_SPACE = R * 3.5;
const BEAM_FEAR_RADIUS = R * 4.5;
const WALL_MARGIN = R * 2.5;
// Destinations : distance visée (≈ ce qu'on parcourt en une course) et écart recherché entre elles
const TARGET_DISTANCE = R * 11;
const TARGET_SPREAD = R * 12;

export class Person {
    // arena : zone de course partagée (voir arena.js), mise à jour quand l'écran change
    constructor(color, faceUrl = null, arena = new Arena()) {
        this.arena = arena;
        this.group = new THREE.Group();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isRunning = false;
        this.faceUrl = faceUrl;
        this.headYScale = 1.0;
        // 'free' : court ou attend, 'caught' : enlevé par l'OVNI, 'departing' : aspiré dans l'OVNI
        this.state = 'free';
        this._torsoRest = new THREE.Vector3(1.25, 1.35, 1.25);
        // Destination courante : un point au hasard sur tout le terrain
        this._wanderTarget = new THREE.Vector3();
        this._wanderTimer = 0;
        this._zigTimer = 0; // prochain écart brusque (zigzag de panique)
        this._fear = 0; // 0..1, proximité du faisceau de l'OVNI
        // Paramètres de locomotion (vitesses en unités/s)
        this.maxSpeed = 5 + Math.random() * 2;
        this.turnResponsiveness = 6.0;
        this.desiredDir = new THREE.Vector3(0, 0, 1); // direction souhaitée (unité)
        this.heading = new THREE.Vector3(0, 0, 1); // direction actuelle lissée (unité)
        this._speedPhase = Math.random() * Math.PI * 2; // micro-variations de vitesse
        this._speed = 0;
        this._accel = 0; // accélération lissée : penché en avant au départ, en arrière au freinage
        this._yawRate = 0; // vitesse de rotation lissée : inclinaison dans les virages
        this._shuffle = 0; // petits pas quand il tourne sur place
        this._phase = Math.random() * TAU; // phase de foulée
        this._idleTime = Math.random() * 10;
        this._seed = Math.random() * TAU;
        // Personnalité : certains fuient les bras en l'air, les autres pompent des bras
        this._panicArms = Math.random() < 0.4;
        this._panicArmsDefault = this._panicArms;
        this._lookTarget = null;
        this._airPhase = 0;
        this._wavePhase = 0;
        // Sursaut quand un autre se fait attraper (0..1, retombe tout seul)
        this._startle = 0;
        this._startleDelay = 0;
        this.createBody(color);
        this.stressFx = new StressFx(this.group, this.torso);
        this.setRandomPosition();
    }

    #createPastelColor(color) {
        // Adoucit la teinte en une couleur pastel vibrante
        const c = new THREE.Color(color);
        // Convertit en HSL, réduit la saturation, augmente la luminosité
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        hsl.s = THREE.MathUtils.clamp(hsl.s * 0.6, 0.25, 0.7);
        hsl.l = THREE.MathUtils.clamp(0.55 + hsl.l * 0.35, 0.6, 0.92);
        const pastel = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
        // Légère dérive vers le blanc pour l'effet doux
        pastel.lerp(new THREE.Color(0xffffff), 0.08);
        return pastel;
    }

    createBody(color) {
        const baseColor = this.#createPastelColor(color);
        const limbColor = baseColor.clone().multiplyScalar(0.9);

        // Matériaux glossy/soft (style jouet lisse) avec PhysicalMaterial
        const standardMat = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            roughness: 0.22,
            metalness: 0.0,
            clearcoat: 0.65,
            clearcoatRoughness: 0.15,
            sheen: 0.4,
            sheenColor: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.05)
        });
        const limbMat = new THREE.MeshPhysicalMaterial({
            color: limbColor,
            roughness: 0.25,
            metalness: 0.0,
            clearcoat: 0.55,
            clearcoatRoughness: 0.18
        });

        // body : pivot au niveau du sol (inclinaisons et rebonds), rig : repère du personnage
        this.body = new THREE.Group();
        this.body.position.y = -R;
        this.group.add(this.body);
        this.rig = new THREE.Group();
        this.rig.position.y = R;
        this.body.add(this.rig);

        // Torse (forme organique et arrondie comme Fall Guys)
        const torso = new THREE.Mesh(
            new THREE.SphereGeometry(R * 0.66, 40, 40),
            standardMat
        );
        torso.position.set(0, R * 0.28, 0);
        torso.scale.copy(this._torsoRest);
        this.#setShadow(torso);
        this.rig.add(torso);
        this.torso = torso;
        // Photo optionnelle directement mappée sur le torse
        if (this.faceUrl) this.#loadFace(this.faceUrl);

        // Bras monobloc (type capsule), la « main » est intégrée au bout
        const armGeom = THREE.CapsuleGeometry
            ? new THREE.CapsuleGeometry(R * 0.22, R * 0.55, 8, 16)
            : new THREE.SphereGeometry(R * 0.26, 20, 20);
        const legGeom = new THREE.SphereGeometry(R * 0.22, 18, 18);
        const footGeom = new THREE.SphereGeometry(R * 0.25, 22, 22);

        // Chaque membre pivote autour de son articulation (épaule, hanche).
        // k = 1 : côté x < 0, k = -1 : côté x > 0
        this._limbs = [1, -1].map((k) => {
            const shoulder = new THREE.Group();
            shoulder.position.set(-k * R * 0.72, R * 0.45, 0);
            const arm = new THREE.Mesh(armGeom, limbMat);
            arm.position.y = -R * 0.5;
            arm.scale.set(1, 1.35, 1);
            shoulder.add(arm);

            const hip = new THREE.Group();
            hip.position.set(-k * R * 0.26, -R * 0.32, 0);
            const leg = new THREE.Mesh(legGeom, limbMat);
            leg.position.y = LEG_Y;
            leg.scale.set(1, 1.35, 1);
            const foot = new THREE.Mesh(footGeom, limbMat);
            foot.position.set(0, FOOT_Y, R * 0.16);
            foot.scale.set(1.35, 0.85, 1.7);
            hip.add(leg, foot);

            [arm, leg, foot].forEach((mesh) => this.#setShadow(mesh));
            this.rig.add(shoulder, hip);
            // abd : bras écarté du corps, swing : bras vers l'avant (<0) ou l'arrière (>0),
            // legAngle : jambe vers l'avant (<0) ou l'arrière (>0), lift : genou levé (0..1)
            return { k, shoulder, hip, leg, foot, abd: ARM_REST, swing: 0, legAngle: 0, lift: 0 };
        });
        this.#applyLimbs();
    }

    #setShadow(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }

    #loadFace(url) {
        new THREE.TextureLoader().load(url, (tex) => {
            if (url !== this.faceUrl) return; // photo changée entre-temps
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;

            const img = tex.image;
            const aspect = (img && img.width) ? img.height / img.width : 1; // H/W
            // Adapter les proportions du torse à l'image (étirer en Y)
            this.headYScale = aspect;
            this._torsoRest.y = 1.35 * aspect;
            this.torso.scale.copy(this._torsoRest);

            const phiCenter = Math.PI / 2; // face avant +Z
            const phiLength = Math.PI;     // hémisphère avant
            const phiStart = phiCenter - phiLength / 2;
            const thetaBase = Math.PI * 0.7;
            const thetaExtra = THREE.MathUtils.clamp((aspect - 1) * Math.PI * 0.35, 0, Math.PI * 0.35);
            const thetaLength = THREE.MathUtils.clamp(thetaBase + thetaExtra, Math.PI * 0.6, Math.PI * 0.95);
            const thetaStart = Math.PI * 0.05;

            const shellGeom = new THREE.SphereGeometry(R * 0.66 * 1.01, 48, 32, phiStart, phiLength, thetaStart, thetaLength);
            const shellMat = new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                roughness: 0.45,
                metalness: 0.0,
                side: THREE.FrontSide
            });
            const faceShell = new THREE.Mesh(shellGeom, shellMat);
            this.#setShadow(faceShell);
            if (this.faceShell) this.torso.remove(this.faceShell);
            this.torso.add(faceShell);
            this.faceShell = faceShell;
        });
    }

    // Place au hasard sur tout le terrain (les collisions écartent ceux qui se chevauchent)
    setRandomPosition() {
        this.arena.randomPoint(WALL_MARGIN, this.group.position);
        this.group.position.y = R;
    }

    // Point (Vector3, suivi en direct) que le personnage regarde quand il est à l'arrêt
    watch(target) {
        this._lookTarget = target;
    }

    // danger : position au sol du faisceau de l'OVNI (ils le fuient), ou null
    update(allPersons = [], dt = 1 / 60, danger = null) {
        if (this.state !== 'free') return; // l'enlèvement anime le personnage lui-même
        dt = Math.min(dt, 0.05);
        if (dt <= 0) return;

        // Destination, écartement, fuite du faisceau, bords du terrain
        this.#updateDesiredDirection(dt, allPersons, danger);

        // Tourner progressivement vers la direction souhaitée
        this.heading.lerp(this.desiredDir, 1 - Math.exp(-this.turnResponsiveness * dt)).normalize();

        // Accélération et freinage progressifs : il dérape un peu en s'arrêtant.
        // Près du faisceau, la panique le fait sprinter.
        this._speedPhase += dt * 1.5;
        const sprint = 1 + 0.35 * this._fear;
        const targetSpeed = this.isRunning ? this.maxSpeed * sprint * (0.96 + Math.sin(this._speedPhase) * 0.04) : 0;
        const prevSpeed = this._speed;
        const maxDelta = (targetSpeed > this._speed ? 14 : 16) * dt;
        this._speed += clamp(targetSpeed - this._speed, -maxDelta, maxDelta);
        this._accel = damp(this._accel, (this._speed - prevSpeed) / dt, 10, dt);
        this.velocity.copy(this.heading).multiplyScalar(this._speed);

        this.group.position.x += this.velocity.x * dt;
        this.group.position.z += this.velocity.z * dt;

        // Collision avec les autres personnages
        this.#resolveCollisions(allPersons);

        this.#updateYaw(dt);
        this.#animateGait(dt);
        this.stressFx.update(dt);

        // Sécurité : jamais hors du terrain
        this.arena.clamp(this.group.position, R * 0.8);
    }

    #resolveCollisions(allPersons) {
        const minDistance = R * 2; // Distance minimale entre centres
        for (const other of allPersons) {
            if (other === this || other.state !== 'free') continue;
            const dx = this.group.position.x - other.group.position.x;
            const dz = this.group.position.z - other.group.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance < minDistance && distance > 0) {
                // Pousser les deux personnages
                const overlap = minDistance - distance;
                const separationX = (dx / distance) * overlap * 0.5;
                const separationZ = (dz / distance) * overlap * 0.5;
                this.group.position.x += separationX;
                this.group.position.z += separationZ;
                other.group.position.x -= separationX;
                other.group.position.z -= separationZ;
            }
        }
    }

    #updateDesiredDirection(dt, allPersons, danger) {
        if (!this.isRunning) return;
        const pos = this.group.position;

        // Nouvelle destination une fois arrivé, ou quand il change d'avis
        this._wanderTimer -= dt;
        const toTarget = new THREE.Vector3(this._wanderTarget.x - pos.x, 0, this._wanderTarget.z - pos.z);
        if (this._wanderTimer <= 0 || toTarget.lengthSq() < (R * 1.5) ** 2) {
            this.#pickWanderTarget(allPersons);
            toTarget.set(this._wanderTarget.x - pos.x, 0, this._wanderTarget.z - pos.z);
        }
        const steer = toTarget.normalize();

        // Garder ses distances : ils s'éparpillent au lieu de courir en troupeau
        for (const other of allPersons) {
            if (other === this || other.state !== 'free') continue;
            const away = new THREE.Vector3(pos.x - other.group.position.x, 0, pos.z - other.group.position.z);
            const distance = away.length();
            if (distance > 1e-3 && distance < PERSONAL_SPACE) {
                steer.addScaledVector(away.divideScalar(distance), 1.5 * (1 - distance / PERSONAL_SPACE));
            }
        }

        // Fuir le faisceau de l'OVNI
        let fear = 0;
        if (danger) {
            const away = new THREE.Vector3(pos.x - danger.x, 0, pos.z - danger.z);
            const distance = away.length();
            if (distance < BEAM_FEAR_RADIUS) {
                fear = 1 - distance / BEAM_FEAR_RADIUS;
                if (distance < 1e-3) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
                steer.addScaledVector(away.normalize(), 3 * fear);
            }
        }
        this._fear = damp(this._fear, fear, 6, dt);

        // Bords du terrain, vus un peu en avance pour tourner avant le mur
        steer.addScaledVector(this.#wallAvoidance(), 3);

        if (steer.lengthSq() > 1e-6) {
            this.desiredDir.lerp(steer.normalize(), 1 - Math.exp(-6 * dt)).normalize();
        }

        // De temps en temps, un écart brusque façon poulet affolé
        this._zigTimer -= dt;
        if (this._zigTimer <= 0) {
            this._zigTimer = 0.6 + Math.random() * 1.4;
            const angle = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8);
            this.desiredDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        }

        if (this.desiredDir.lengthSq() < 1e-4) this.desiredDir.set(0, 0, 1);
    }

    // Répulsion des bords (plus forte près du mur), calculée un peu devant le coureur
    #wallAvoidance() {
        const ahead = this.group.position.clone().addScaledVector(this.heading, R * 1.5);
        const d = this.arena.wallDistances(ahead);
        const push = (distance) => {
            const t = clamp(1 - distance / WALL_MARGIN, 0, 1.5);
            return t * t;
        };
        return new THREE.Vector3(push(d.left) - push(d.right), 0, push(d.far) - push(d.near));
    }

    // Choisit une destination sur le terrain : loin de celles des autres coureurs (sinon ils
    // traversent tous le centre en même temps et s'y retrouvent), à une distance atteignable
    #pickWanderTarget(allPersons) {
        const pos = new THREE.Vector3(this.group.position.x, 0, this.group.position.z);
        const others = allPersons.filter((other) => other !== this && other.isRunning && other.state === 'free');
        let best = null;
        let bestScore = -Infinity;
        for (let i = 0; i < 8; i++) {
            const candidate = this.arena.randomPoint(WALL_MARGIN * 0.6);
            let spread = TARGET_SPREAD;
            for (const other of others) {
                spread = Math.min(spread, candidate.distanceTo(other._wanderTarget));
            }
            const score = spread - 0.5 * Math.abs(candidate.distanceTo(pos) - TARGET_DISTANCE);
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        this._wanderTarget.copy(best);
        this._wanderTimer = 2.5 + Math.random() * 1.5;
    }

    // Oriente le personnage : vers sa course, vers ce qu'il regarde, sinon face à la caméra (+Z)
    #updateYaw(dt) {
        const prev = this.group.rotation.y;
        let target = 0;
        let rate = 4;
        if (this._speed > 0.4) {
            target = Math.atan2(this.heading.x, this.heading.z);
            rate = 12;
        } else if (this._lookTarget) {
            const dx = this._lookTarget.x - this.group.position.x;
            const dz = this._lookTarget.z - this.group.position.z;
            target = dx * dx + dz * dz > 0.25 ? Math.atan2(dx, dz) : prev;
            rate = 5;
        }
        const next = wrapAngle(prev + wrapAngle(target - prev) * (1 - Math.exp(-rate * dt)));
        this.group.rotation.y = next;
        this._yawRate = damp(this._yawRate, wrapAngle(next - prev) / dt, 12, dt);
    }

    #applyLimbs() {
        for (const limb of this._limbs) {
            limb.shoulder.rotation.set(limb.swing, 0, -limb.k * limb.abd);
            limb.hip.rotation.x = limb.legAngle;
            // Genou levé : la jambe se replie et le pied remonte, pointe en l'air
            limb.leg.scale.y = 1.35 * (1 - 0.22 * limb.lift);
            limb.leg.position.y = LEG_Y + R * 0.1 * limb.lift;
            limb.foot.position.y = FOOT_Y + R * 0.3 * limb.lift;
            limb.foot.rotation.x = -limb.legAngle * 0.6 - limb.lift * 0.4;
        }
    }

    // Course et attente au sol. Tout est calé sur la même phase de foulée :
    // jambes, bras opposés, rebond du corps (un par pas) et écrasement à l'impact.
    #animateGait(dt) {
        const ratio = clamp(this._speed / this.maxSpeed, 0, 1);
        const turning = this._speed < 0.5 ? clamp(Math.abs(this._yawRate) / 2.5, 0, 1) : 0;
        this._shuffle = damp(this._shuffle, turning, 10, dt);
        const cadence = Math.max(this._speed / STRIDE_LENGTH, 2.2 * this._shuffle);
        this._phase = (this._phase + TAU * cadence * dt) % TAU;
        this._idleTime += dt;

        const s = Math.sin(this._phase);
        const c = Math.cos(this._phase);
        const flop = Math.sin(this._phase - 0.4); // les bras suivent avec un temps de retard, tout mous
        const legAmp = Math.min(0.85, 0.85 * ratio + 0.3 * this._shuffle);
        const liftAmp = Math.min(1, ratio + 0.5 * this._shuffle);
        const breath = Math.sin(this._idleTime * 2.4);
        const sway = Math.sin(this._idleTime * 0.9 + this._seed);

        // Sursaut (un autre vient de se faire attraper) : bras qui jaillissent et petit bond
        if (this._startleDelay > 0) {
            this._startleDelay -= dt;
            if (this._startleDelay <= 0) this._startle = 1;
        } else {
            this._startle = Math.max(0, this._startle - dt * 1.6);
        }
        const startle = Math.min(1, this._startle * 2);
        const hop = this._startle > 0 ? Math.sin((1 - this._startle) * Math.PI) * R * 0.22 : 0;

        for (const limb of this._limbs) {
            const { k } = limb;
            limb.legAngle = -k * legAmp * s;
            limb.lift = Math.max(0, k * c) * liftAmp;
            // Au repos les bras respirent ; en course ils pompent à l'opposé des jambes, ou battent en l'air
            const runAbd = this._panicArms ? 2.4 + 0.35 * Math.sin(this._phase * 2 + k * 1.4) : 0.65 + 0.12 * Math.abs(s);
            const runSwing = this._panicArms ? -0.3 + 0.3 * k * flop : k * flop;
            limb.abd = lerp(lerp(ARM_REST + 0.04 * breath, runAbd, ratio), 2.6, startle);
            limb.swing = lerp(lerp(0.05 * k * sway, runSwing, ratio), -0.35, startle);
        }
        this.#applyLimbs();

        // Écrasement à chaque impact au sol, respiration à l'arrêt
        const impact = ratio * Math.pow(1 - Math.abs(s), 3);
        const idle = 1 - ratio;
        const squashY = 1 - 0.1 * impact + 0.025 * breath * idle;
        const squashXZ = 1 + 0.06 * impact - 0.012 * breath * idle;
        const rest = this._torsoRest;
        this.torso.scale.set(rest.x * squashXZ, rest.y * squashY, rest.z * squashXZ);
        this.torso.rotation.y = -0.2 * s * ratio; // les épaules contrebalancent les hanches
        this.torso.rotation.z = 0.07 * s * ratio;

        // Rebond (point bas à l'impact), penché en avant au départ et en arrière au freinage,
        // incliné dans les virages, léger balancement à l'arrêt
        this.body.position.y = -R + ratio * R * 0.16 * Math.abs(s) + hop;
        const lean = ratio * 0.14 + clamp(this._accel * 0.025, -0.35, 0.28) - 0.2 * startle;
        this.body.rotation.x = damp(this.body.rotation.x, lean, 10, dt);
        const bank = clamp(-this._yawRate * 0.07, -0.3, 0.3) * ratio + 0.025 * sway * idle;
        this.body.rotation.z = damp(this.body.rotation.z, bank, 8, dt);
    }

    // Pose en l'air. kick : jambes qui pédalent ; run : course frénétique dans le vide (jambes
    // à toute vitesse, bras en moulinets) ; armsUp : bras qui battent au-dessus de la tête ;
    // wave : main qui salue ; stretch : corps étiré (négatif : écrasé)
    #animateAir(dt, { kick = 0, run = 0, armsUp = 0, wave = 0, stretch = 0 }) {
        this._airPhase += dt * (3 + 9 * kick + 22 * run);
        this._wavePhase += dt * 9;
        const p = this._airPhase;
        const legAmp = lerp(0.2 + 0.6 * kick, 1.0, run);
        const liftAmp = lerp(0.3 + 0.7 * kick, 1, run);
        // Plus le mouvement est rapide, plus les membres collent à leur cible
        const follow = lerp(18, 60, run);
        for (const limb of this._limbs) {
            const { k } = limb;
            const opposite = k > 0 ? 0 : Math.PI; // un bras en avant quand l'autre est en arrière
            limb.legAngle = damp(limb.legAngle, -k * legAmp * Math.sin(p), follow, dt);
            limb.lift = damp(limb.lift, Math.max(0, k * Math.cos(p)) * liftAmp, follow, dt);
            let abd = lerp(ARM_REST + 0.08 * Math.sin(p * 0.5 + k), 2.5 + 0.35 * Math.sin(p * 1.6 + k * 1.5), armsUp);
            let swing = lerp(0.1 * Math.sin(p * 0.4 + k), -0.25 + 0.35 * Math.sin(p * 1.1 + k), armsUp);
            // Moulinets : chaque bras décrit de grands cercles
            abd = lerp(abd, 1.7 + 0.7 * Math.cos(p + opposite), run);
            swing = lerp(swing, 1.3 * Math.sin(p + opposite), run);
            if (k < 0) {
                abd = lerp(abd, 2.6 + 0.4 * Math.sin(this._wavePhase), wave);
                swing = lerp(swing, -0.3, wave);
            }
            limb.abd = damp(limb.abd, abd, follow, dt);
            limb.swing = damp(limb.swing, swing, follow, dt);
        }
        this.#applyLimbs();

        const rest = this._torsoRest;
        this.torso.scale.set(rest.x * (1 - stretch * 0.5), rest.y * (1 + stretch), rest.z * (1 - stretch * 0.5));
        const twist = 0.12 * Math.sin(p * 0.5) * kick + 0.25 * Math.sin(p) * run;
        this.torso.rotation.y = damp(this.torso.rotation.y, twist, 12, dt);
        this.torso.rotation.z = damp(this.torso.rotation.z, 0, 8, dt);
    }

    // Repéré par le projecteur : il panique (bras en l'air, sueur) en continuant de courir
    panic() {
        this._panicArms = true;
        this.stressFx.setStress(0.5);
    }

    // Réaction des spectateurs quand un autre se fait attraper (delay en s)
    startle(delay = 0) {
        this._startleDelay = Math.max(0.001, delay);
    }

    // Le rayon l'attrape : « ! », il est soulevé un peu et continue de courir dans le vide,
    // puis le rayon l'amène jusqu'à `showPoint`, face à la caméra
    startAbduction(showPoint, cameraPosition) {
        this.state = 'caught';
        this.isRunning = false;
        this._panicArms = true;
        this.stressFx.alert();
        this.stressFx.setStress(1);
        const horizontal = Math.hypot(cameraPosition.x - showPoint.x, cameraPosition.z - showPoint.z);
        this._abduct = {
            t: 0,
            ground: this.group.position.clone(),
            // Son élan le fait encore avancer un peu dans le rayon avant d'être bloqué
            drift: this.heading.clone().multiplyScalar(Math.min(this._speed, 5)),
            yawStruggle: this.group.rotation.y,
            lifted: null, // position et orientation au début du vol, fixées à ce moment-là
            yawFrom: 0,
            yawTo: 0,
            toCamera: Math.atan2(cameraPosition.x - showPoint.x, cameraPosition.z - showPoint.z),
            to: showPoint.clone(),
            // Penché en arrière pour tendre son visage vers la caméra, placée plus haut
            tilt: -0.6 * Math.atan2(cameraPosition.y - showPoint.y, horizontal)
        };
        // Les jambes enchaînent la foulée en cours, sans à-coup
        this._airPhase = this._phase;
        this._speed = 0;
        this.velocity.set(0, 0, 0);
    }

    updateAbduction(dt) {
        const a = this._abduct;
        if (!a) return;
        dt = Math.min(dt, 0.05);
        a.t += dt;
        const pose = { kick: 0, run: 0, armsUp: 0, wave: 0, stretch: 0 };
        let tilt;
        let bob = 0;
        let stress;

        if (a.t < STRUGGLE_TIME) {
            // Soulevé un peu, il court dans le vide de plus belle en gigotant, en nage
            const u = a.t / STRUGGLE_TIME;
            a.ground.addScaledVector(a.drift, dt);
            a.drift.multiplyScalar(Math.exp(-3 * dt));
            const rise = Math.min(1, u * 1.6);
            this.group.position.copy(a.ground);
            this.group.position.y += RISE_HEIGHT * (1 - Math.pow(1 - rise, 3));
            this.group.rotation.y = a.yawStruggle + Math.sin(a.t * 9) * 0.15 * rise;
            pose.run = 1;
            pose.stretch = 0.1 * Math.sin(rise * Math.PI); // étiré par le rayon pendant qu'il monte
            bob = Math.abs(Math.sin(this._airPhase)) * R * 0.08;
            tilt = 0.3; // penché en avant, comme pour s'échapper
            stress = 1;
        } else if (a.t < STRUGGLE_TIME + GLIDE_TIME) {
            // Le rayon l'emmène devant la caméra en le faisant tourner : il court encore,
            // s'essouffle, puis se résigne à faire coucou
            if (!a.lifted) {
                a.lifted = this.group.position.clone();
                a.yawFrom = this.group.rotation.y;
                a.yawTo = a.yawFrom + wrapAngle(a.toCamera - a.yawFrom) + (Math.random() < 0.5 ? -TAU : TAU);
            }
            const u = (a.t - STRUGGLE_TIME) / GLIDE_TIME;
            const e = easeInOut(u);
            this.group.position.lerpVectors(a.lifted, a.to, e);
            this.group.position.y += Math.sin(u * Math.PI) * R * 0.6;
            this.group.rotation.y = lerp(a.yawFrom, a.yawTo, e);
            pose.run = 1 - THREE.MathUtils.smoothstep(u, 0.35, 0.9);
            pose.kick = 1 - pose.run;
            pose.wave = THREE.MathUtils.smoothstep(u, 0.55, 1);
            bob = Math.abs(Math.sin(this._airPhase)) * R * 0.08 * pose.run;
            tilt = lerp(0.3, a.tilt, e);
            stress = lerp(1, 0.35, u);
        } else {
            // Vol stationnaire face à la caméra : coucou un peu crispé, entrecoupé de
            // « gloups » nerveux (il s'écrase, arrête de saluer et sue à grosses gouttes)
            const h = a.t - STRUGGLE_TIME - GLIDE_TIME;
            const g = h % GULP_PERIOD;
            const gulp = g < 0.35 ? Math.sin((g / 0.35) * Math.PI) : 0;
            this.group.position.copy(a.to);
            this.group.position.y += Math.sin(h * 2) * R * 0.12;
            this.group.rotation.y = a.yawTo + Math.sin(h * 0.9) * 0.12;
            pose.kick = 0.4;
            pose.wave = 1 - gulp;
            pose.stretch = -0.1 * gulp;
            tilt = a.tilt + Math.sin(h * 1.3) * 0.04;
            stress = 0.3 + 0.7 * gulp;
        }

        this.body.position.y = -R + bob;
        this.body.rotation.x = damp(this.body.rotation.x, tilt, 8, dt);
        this.body.rotation.z = damp(this.body.rotation.z, 0, 6, dt);
        this.#animateAir(dt, pose);
        this.stressFx.setStress(stress);
        this.stressFx.update(dt);
    }

    // Aspiré dans l'OVNI : il file vers le haut en tournoyant et rapetisse
    startDeparture() {
        this.state = 'departing';
        this._depart = { t: 0, y: this.group.position.y };
        this.stressFx.setStress(1);
    }

    // Renvoie true quand le personnage a disparu
    updateDeparture(dt) {
        const d = this._depart;
        dt = Math.min(dt, 0.05);
        d.t += dt;
        const u = Math.min(1, d.t / DEPART_TIME);
        const e = u * u * u;
        this.group.position.y = d.y + 14 * e;
        this.group.rotation.y += dt * (3 + 20 * e);
        const s = 1 - 0.6 * e;
        this.group.scale.set(s * (1 - 0.3 * e), s * (1 + 0.5 * e), s * (1 - 0.3 * e));
        this.#animateAir(dt, { run: 1, armsUp: 1 });
        this.stressFx.update(dt);
        if (u >= 1) this.stressFx.clear();
        return u >= 1;
    }

    // Retire les effets ajoutés à la scène (gouttes de sueur) : à appeler avant de retirer le personnage
    dispose() {
        this.stressFx.clear();
    }

    // Remet le personnage au sol, au repos, à une place aléatoire
    reset() {
        this.state = 'free';
        this._abduct = null;
        this._depart = null;
        this.isRunning = false;
        this._speed = 0;
        this._accel = 0;
        this._yawRate = 0;
        this._shuffle = 0;
        this._startle = 0;
        this._startleDelay = 0;
        this._lookTarget = null;
        this._panicArms = this._panicArmsDefault;
        this.stressFx.clear();
        this.velocity.set(0, 0, 0);
        this.group.rotation.set(0, 0, 0);
        this.group.scale.set(1, 1, 1);
        this.body.position.y = -R;
        this.body.rotation.set(0, 0, 0);
        this.setRandomPosition();
    }

    // allPersons : pour choisir une destination différente de celles des autres
    startRunning(allPersons = []) {
        // Chacun part vers sa propre destination : il se retourne puis accélère
        this.#pickWanderTarget(allPersons);
        this.desiredDir.set(this._wanderTarget.x - this.group.position.x, 0, this._wanderTarget.z - this.group.position.z);
        if (this.desiredDir.lengthSq() < 1e-6) this.desiredDir.set(0, 0, 1);
        this.desiredDir.normalize();
        this.heading.copy(this.desiredDir);
        this._zigTimer = 0.4 + Math.random() * 1.2;
        this._fear = 0;
        this.isRunning = true;
    }

    stopRunning() {
        // Pas d'arrêt net : la vitesse retombe dans update() (petit dérapage)
        this.isRunning = false;
    }

    updateFace(faceUrl) {
        if (faceUrl === this.faceUrl) return; // Pas de changement

        this.faceUrl = faceUrl;

        // Supprimer l'ancienne photo et revenir aux proportions par défaut
        if (this.faceShell) {
            this.torso.remove(this.faceShell);
            this.faceShell = null;
        }
        this.headYScale = 1.0;
        this._torsoRest.y = 1.35;
        this.torso.scale.copy(this._torsoRest);

        if (faceUrl) this.#loadFace(faceUrl);
    }
}
