import { Halo } from './halo.js';
import { Arena } from './arena.js';

// Traque de l'élu (s) : il court au moins HUNT_MIN_TIME sous le projecteur, est attrapé dès que
// le faisceau le tient, et au plus tard après HUNT_MAX_TIME. Le projecteur atteint sa pleine
// précision au bout de HUNT_FOCUS_TIME.
const HUNT_MIN_TIME = 0.3;
const HUNT_MAX_TIME = 0.7;
const HUNT_FOCUS_TIME = 0.7;
const HUNT_CATCH_DISTANCE = 0.9; // distance faisceau-élu suffisante pour l'attraper

export class Scene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2a);
        this.scene.fog = new THREE.Fog(0x1a1a2a, 25, 70);
        this.setupCamera();
        this.setupLights();
        this.setupSpotlight();
        this.setupRenderer();
        // Zone de course : tout le sol visible à l'écran (recalculée au redimensionnement)
        this.arena = new Arena();
        this.arena.fitCamera(this.camera);
        // Faisceau au sol : position et vitesse (il a de l'inertie), et ce qu'il vise
        this._beamPos = new THREE.Vector3();
        this._beamVel = new THREE.Vector3();
        this._beamAim = new THREE.Vector3();
        this._beamAimPerson = null;
        this._beamAimTimer = 0;
        this._beamTime = 0;
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 10, 18);
        this.camera.lookAt(0, 0, 0);
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0x88aaff, 0.6);
        dirLight.position.set(-12, 25, -8);
        this.scene.add(dirLight);
    }

    setupSpotlight() {
        this.spotlightCeilingY = 80;

        this.spotlight = new THREE.SpotLight(0xffffff, 2.2, 120, Math.PI / 10, 0.45, 2);
        this.spotlight.position.set(0, this.spotlightCeilingY, 0);
        this.spotlight.visible = false;
        this.spotlight.castShadow = true;
        this.spotlight.shadow.mapSize.width = 1024;
        this.spotlight.shadow.mapSize.height = 1024;
        this.spotlight.shadow.radius = 3;
        this.scene.add(this.spotlight);

        this.spotlightTarget = new THREE.Object3D();
        this.scene.add(this.spotlightTarget);
        this.spotlight.target = this.spotlightTarget;

        // Halo au sol (plus discret de nuit)
        this.halo = new Halo({ radius: 1.8, color: 0xffffff, opacity: 0.6 });
        this.scene.add(this.halo.mesh);
        this.halo.setVisible(false);

        // Faisceau volumétrique (translucide)
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const beamGeometry = new THREE.CylinderGeometry(0.05, 1, 1, 32, 1, true);
        this.spotlightBeam = new THREE.Mesh(beamGeometry, beamMaterial);
        this.spotlightBeam.visible = false;
        this.spotlightBeam.castShadow = false;
        this.spotlightBeam.receiveShadow = false;
        this.scene.add(this.spotlightBeam);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.arena.fitCamera(this.camera);
    }

    updateSpotlight(position) {
        // Cible et halo au sol (y = 0)
        const groundPos = new THREE.Vector3(position.x, 0, position.z);

        this.spotlightTarget.position.copy(groundPos);
        this.spotlight.position.set(
            position.x,
            this.spotlightCeilingY,
            position.z
        );

        // Met à jour le halo
        if (this.halo) {
            this.halo.update(groundPos);
        }

        // Met à jour le faisceau
        if (this.spotlightBeam) {
            const lightPos = this.spotlight.position;
            const targetPos = groundPos;
            const distance = lightPos.distanceTo(targetPos);
            const bottomRadius = Math.max(0.35, Math.tan(this.spotlight.angle) * distance);

            this.spotlightBeam.visible = this.spotlight.visible;

            // Position au milieu du segment
            this.spotlightBeam.position.copy(lightPos).add(targetPos).multiplyScalar(0.5);
            // Mise à l'échelle (XZ = rayon bas, Y = longueur)
            this.spotlightBeam.scale.set(bottomRadius, distance, bottomRadius);
            // Orientation vers la cible
            const direction = new THREE.Vector3().subVectors(targetPos, lightPos).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            this.spotlightBeam.quaternion.copy(quaternion);
        }
    }

    // Atténue le faisceau volumétrique (1 = normal, 0 = invisible)
    setBeamFade(fade) {
        if (this.spotlightBeam) this.spotlightBeam.material.opacity = 0.1 * fade;
    }

    // Début de la recherche : le faisceau entre par un coin du fond et plonge sur le terrain
    startScan() {
        const arena = this.arena;
        const side = Math.random() < 0.5 ? -1 : 1;
        this._beamPos.set(side * arena.halfX(arena.zFar), 0, arena.zFar);
        this._beamVel.set(0, 0, 0);
        this._beamAimPerson = null;
        this._beamAimTimer = 0;
    }

    // Recherche : comme un opérateur, le projecteur vise un coureur (ou un coin du terrain),
    // s'y rend avec de l'inertie, s'y attarde un instant, puis passe au suivant
    updateSpotlightScan(dt, persons = []) {
        if (!this.spotlight || !this.spotlight.visible) return;
        this._beamTime += dt;
        this._beamAimTimer -= dt;
        if (this._beamAimTimer <= 0 || (this._beamAimPerson && !persons.includes(this._beamAimPerson))) {
            this.#pickScanAim(persons);
        }

        const target = new THREE.Vector3();
        if (this._beamAimPerson) {
            // Il anticipe la course de celui qu'il suit
            const person = this._beamAimPerson;
            target.set(person.group.position.x, 0, person.group.position.z).addScaledVector(person.velocity, 0.3);
        } else {
            target.copy(this._beamAim);
        }
        this.arena.clamp(target, 1.2);
        this.#stepBeam(dt, target, 4.2, 0.6);

        // En mode scan, masquer le halo (uniquement visible lors du lock sur une personne)
        if (this.halo) this.halo.setVisible(false);
        this.#applyBeam(0.12);
    }

    #pickScanAim(persons) {
        // Le plus souvent un coureur voisin de celui qu'il vient de suivre, parfois un coin vide
        const candidates = persons.filter((person) => person !== this._beamAimPerson);
        if (candidates.length > 0 && Math.random() < 0.75) {
            const distance = (person) => person.group.position.distanceToSquared(this._beamPos);
            candidates.sort((a, b) => distance(a) - distance(b));
            this._beamAimPerson = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
            this._beamAimTimer = 0.6 + Math.random() * 0.7;
        } else {
            this._beamAimPerson = null;
            this.arena.randomPoint(1.5, this._beamAim);
            this._beamAimTimer = 0.45 + Math.random() * 0.5;
        }
    }

    // Qui le projecteur attrape à la fin de la recherche : celui qu'il est en train de viser
    // s'il n'est pas loin, sinon le plus proche de là où il se dirige (pas de demi-tour brusque)
    pickCatchCandidate(persons) {
        if (persons.length === 0) return null;
        const ahead = new THREE.Vector3(this._beamPos.x, 0, this._beamPos.z).addScaledVector(this._beamVel, 0.3);
        const distance = (person) => Math.hypot(person.group.position.x - ahead.x, person.group.position.z - ahead.z);
        const aimed = this._beamAimPerson;
        if (aimed && persons.includes(aimed) && distance(aimed) < 4) return aimed;
        return persons.reduce((best, person) => (distance(person) < distance(best) ? person : best));
    }

    // L'OVNI a choisi : le faisceau fond sur l'élu, le dépasse, revient et se cale dessus,
    // de plus en plus vif et précis. Renvoie true quand il le tient.
    huntSpotlight(dt, person, elapsed) {
        this._beamTime += dt;
        const progress = Math.min(1, elapsed / HUNT_FOCUS_TIME);
        const omega = 7 + 7 * progress;
        const zeta = 0.45 + 0.3 * progress;
        // Visée en avance de la course, juste assez pour compenser le retard du projecteur
        const position = person.group.position;
        const target = new THREE.Vector3(position.x, 0, position.z).addScaledVector(person.velocity, (2 * zeta) / omega);
        this.#stepBeam(dt, target, omega, zeta);
        this.#applyBeam(0.1 * (1 - progress));

        const distance = Math.hypot(this._beamPos.x - position.x, this._beamPos.z - position.z);
        return elapsed > HUNT_MAX_TIME
            || (elapsed > HUNT_MIN_TIME && distance < HUNT_CATCH_DISTANCE && this._beamVel.length() < 6);
    }

    // Suit l'élu pendant l'enlèvement, avec un léger retard
    followSpotlight(dt, position) {
        this._beamTime += dt;
        this.#stepBeam(dt, new THREE.Vector3(position.x, 0, position.z), 7, 0.85);
        this.#applyBeam(0.03);
    }

    // Ressort amorti vers `target` (plan du sol) : omega = vivacité, zeta < 1 = dépasse un peu
    #stepBeam(dt, target, omega, zeta) {
        const steps = 2; // sous-pas pour rester stable quand l'image met du temps à venir
        const h = Math.min(dt, 0.05) / steps;
        for (let i = 0; i < steps; i++) {
            const ax = omega * omega * (target.x - this._beamPos.x) - 2 * zeta * omega * this._beamVel.x;
            const az = omega * omega * (target.z - this._beamPos.z) - 2 * zeta * omega * this._beamVel.z;
            this._beamVel.x += ax * h;
            this._beamVel.z += az * h;
            this._beamPos.x += this._beamVel.x * h;
            this._beamPos.z += this._beamVel.z * h;
        }
    }

    // Place le faisceau, avec le léger tremblement de la main de l'opérateur
    #applyBeam(tremor) {
        const t = this._beamTime;
        this.updateSpotlight(new THREE.Vector3(
            this._beamPos.x + (Math.sin(t * 7.3) * 0.6 + Math.sin(t * 13.1 + 1.7) * 0.4) * tremor,
            0,
            this._beamPos.z + (Math.sin(t * 6.1 + 0.6) * 0.6 + Math.sin(t * 11.7 + 2.9) * 0.4) * tremor
        ));
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
