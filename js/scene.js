import { Halo } from './halo.js';
import { SCENE_SIZE } from './constants.js';

export class Scene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2a);
        this.scene.fog = new THREE.Fog(0x1a1a2a, 25, 70);
        this.setupCamera();
        this.setupLights();
        this.setupSpotlight();
        this.setupRenderer();
        // État pour le mouvement de scan du projecteur (hélicoptère)
        this._scanAngle = Math.random() * Math.PI * 2;
        this._scanSpeed = 0.35; // rad/s
        // Rayon d'orbite basé sur la taille de scène, garde le faisceau à l'écran
        this._scanRadius = Math.max(2, SCENE_SIZE * 0.5 - 2.5);
        this._wobblePhase = Math.random() * Math.PI * 2;
        this._scanCenter = new THREE.Vector3(0, 0, 0);
        this._scanTarget = new THREE.Vector3(0, 0, 0);
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
        // Mémorise la cible actuelle utilisée (au sol) pour des transitions
        this._currentSpotTarget = groundPos.clone();

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

    // Mouvement du projecteur façon hélicoptère au-dessus des coureurs
    updateSpotlightScan(dt, persons = []) {
        if (!this.spotlight || !this.spotlight.visible) return;

        // Centre: barycentre lissé des personnes
        if (persons.length > 0) {
            const center = new THREE.Vector3();
            for (let i = 0; i < persons.length; i++) center.add(persons[i].group.position);
            center.multiplyScalar(1 / persons.length);
            this._scanCenter.lerp(center, 0.06);
        } else {
            this._scanCenter.lerp(new THREE.Vector3(0, 0, 0), 0.06);
        }

        // Avancement du scan avec légère oscillation
        this._scanAngle += this._scanSpeed * dt;
        this._wobblePhase += 1.5 * dt;
        const wobbleR = 2.0 + Math.sin(this._wobblePhase * 1.3) * 1.0;
        const r = this._scanRadius + wobbleR;
        const offsetX = Math.cos(this._scanAngle) * r + Math.sin(this._wobblePhase) * 1.8;
        const offsetZ = Math.sin(this._scanAngle) * r + Math.cos(this._wobblePhase * 0.8) * 1.8;
        let desired = new THREE.Vector3(this._scanCenter.x + offsetX, 0, this._scanCenter.z + offsetZ);

        // Bornage pour garantir que la cible reste dans la zone visible
        const half = SCENE_SIZE / 2;
        const pad = 1.2; // petit padding pour éviter le bord
        desired.x = THREE.MathUtils.clamp(desired.x, -half + pad, half - pad);
        desired.z = THREE.MathUtils.clamp(desired.z, -half + pad, half - pad);

        // Parfois, attirer le faisceau vers un coureur proche pour l'effet de recherche
        if (persons.length > 0) {
            const beat = (performance.now() * 0.001) % 8;
            if (beat > 2.0 && beat < 2.7) {
                let best = null, bestD2 = Infinity;
                for (let i = 0; i < persons.length; i++) {
                    const p = persons[i].group.position;
                    const dx = p.x - desired.x;
                    const dz = p.z - desired.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 < bestD2) { bestD2 = d2; best = p; }
                }
                if (best) {
                    desired.set(best.x, 0, best.z);
                    // re-borner au cas où un coureur est près du bord
                    desired.x = THREE.MathUtils.clamp(desired.x, -half + pad, half - pad);
                    desired.z = THREE.MathUtils.clamp(desired.z, -half + pad, half - pad);
                }
            }
        }

        // Lissage de la cible du faisceau
        this._scanTarget.lerp(desired, 1 - Math.exp(-5.0 * dt));
        // En mode scan, masquer le halo (uniquement visible lors du lock sur une personne)
        if (this.halo) this.halo.setVisible(false);
        this.updateSpotlight(this._scanTarget);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
