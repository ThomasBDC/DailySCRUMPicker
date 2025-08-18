import { PERSON_RADIUS, SCENE_SIZE } from './constants.js';

export class Person {
    constructor(color, faceUrl = null) {
        this.group = new THREE.Group();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isRunning = false;
        this._runTime = 0;
        this._lastTime = performance.now();
        this.faceUrl = faceUrl;
        this.headYScale = 1.0;
        this.createBody(color);
        this.setRandomPosition();
    }

    createBody(color) {
        const baseColor = new THREE.Color(color);
        const limbColor = baseColor.clone().multiplyScalar(0.9);
        const accentColor = 0xffffff;

        const standardMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.6, metalness: 0.05 });
        const limbMat = new THREE.MeshStandardMaterial({ color: limbColor, roughness: 0.7, metalness: 0.03 });
        const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness: 0.0 });
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5, metalness: 0.0 });

        // Torse (capsule verticale)
        const torso = new THREE.Mesh(
            new THREE.CapsuleGeometry(PERSON_RADIUS * 0.5, PERSON_RADIUS * 0.9, 12, 24),
            standardMat
        );
        torso.position.set(0, PERSON_RADIUS * 0.2, 0);
        this.#setShadow(torso);
        this.group.add(torso);
        this.torso = torso;

        // Tête
        const headRadius = PERSON_RADIUS * 0.45;
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius, 24, 24),
            standardMat
        );
        head.position.set(0, PERSON_RADIUS * 0.95, 0);
        head.scale.set(1, this.headYScale, 1);
        this.#setShadow(head);
        this.group.add(head);
        this.head = head;

        // Face plate (ovale blanc très proche du front)
        const facePlate = new THREE.Mesh(
            new THREE.CircleGeometry(PERSON_RADIUS * 0.35, 24),
            accentMat
        );
        facePlate.rotation.x = -Math.PI / 2 + 0.001;
        facePlate.position.set(0, PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.44);
        facePlate.scale.set(1, this.headYScale, 1);
        this.#setShadow(facePlate);
        this.group.add(facePlate);
        this.facePlate = facePlate;

        // Photo de visage optionnelle (coquille sphérique mappée)
        if (this.faceUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(this.faceUrl, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;

                const img = tex.image;
                const aspect = (img && img.width) ? img.height / img.width : 1; // H/W
                // Adapte exactement la hauteur relative de la tête au ratio de l'image
                this.headYScale = aspect;
                this.head.scale.set(1, this.headYScale, 1);
                if (this.facePlate) this.facePlate.scale.set(1, this.headYScale, 1);

                const phiCenter = Math.PI / 2; // face avant +Z
                const phiLength = Math.PI;     // hémisphère avant
                const phiStart = phiCenter - phiLength / 2;
                // Couverture verticale de la coque (étendue de base + légère extension si portrait marqué)
                const thetaBase = Math.PI * 0.55;
                const thetaExtra = THREE.MathUtils.clamp((aspect - 1) * Math.PI * 0.35, 0, Math.PI * 0.35);
                const thetaLength = THREE.MathUtils.clamp(thetaBase + thetaExtra, Math.PI * 0.55, Math.PI * 0.9);
                const thetaStart = Math.PI * 0.1;

                const shellGeom = new THREE.SphereGeometry(headRadius * 1.01, 48, 32, phiStart, phiLength, thetaStart, thetaLength);
                const shellMat = new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    roughness: 0.6,
                    metalness: 0.0,
                    side: THREE.FrontSide
                });
                const faceShell = new THREE.Mesh(shellGeom, shellMat);
                faceShell.position.set(0, 0, 0);
                this.#setShadow(faceShell);
                this.head.add(faceShell);
                this.faceShell = faceShell;
                // Masque la plaque faciale blanche si photo
                this.facePlate.visible = false;
            });
        }

        // Yeux (sphères noires)
        const eyeGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.09, 12, 12);
        const leftEye = new THREE.Mesh(eyeGeom, blackMat);
        leftEye.position.set(-PERSON_RADIUS * 0.16, PERSON_RADIUS * 1.1, PERSON_RADIUS * 0.47);
        const rightEye = new THREE.Mesh(eyeGeom, blackMat);
        rightEye.position.set(PERSON_RADIUS * 0.16, PERSON_RADIUS * 1.1, PERSON_RADIUS * 0.47);
        leftEye.visible = !this.faceUrl;
        rightEye.visible = !this.faceUrl;
        this.#setShadow(leftEye);
        this.#setShadow(rightEye);
        this.group.add(leftEye);
        this.group.add(rightEye);

        // Bras (capsules) + mains (sphères)
        const armGeom = new THREE.CapsuleGeometry(PERSON_RADIUS * 0.12, PERSON_RADIUS * 0.55, 8, 12);
        this.leftArm = new THREE.Mesh(armGeom, limbMat);
        this.leftArm.position.set(-PERSON_RADIUS * 0.62, PERSON_RADIUS * 0.35, 0);
        this.leftArm.rotation.z = Math.PI / 2.4;
        this.rightArm = new THREE.Mesh(armGeom, limbMat);
        this.rightArm.position.set(PERSON_RADIUS * 0.62, PERSON_RADIUS * 0.35, 0);
        this.rightArm.rotation.z = -Math.PI / 2.4;
        this.#setShadow(this.leftArm);
        this.#setShadow(this.rightArm);
        this.group.add(this.leftArm);
        this.group.add(this.rightArm);

        const handGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.16, 16, 16);
        this.leftHand = new THREE.Mesh(handGeom, limbMat);
        this.rightHand = new THREE.Mesh(handGeom, limbMat);
        this.leftHand.position.set(-PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.22, 0);
        this.rightHand.position.set(PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.22, 0);
        this.#setShadow(this.leftHand);
        this.#setShadow(this.rightHand);
        this.group.add(this.leftHand);
        this.group.add(this.rightHand);

        // Jambes (capsules courtes) + pieds (ellipsoïdes)
        const legGeom = new THREE.CapsuleGeometry(PERSON_RADIUS * 0.16, PERSON_RADIUS * 0.38, 8, 8);
        this.leftLeg = new THREE.Mesh(legGeom, limbMat);
        this.leftLeg.position.set(-PERSON_RADIUS * 0.22, -PERSON_RADIUS * 0.65, 0);
        this.rightLeg = new THREE.Mesh(legGeom, limbMat);
        this.rightLeg.position.set(PERSON_RADIUS * 0.22, -PERSON_RADIUS * 0.65, 0);
        this.#setShadow(this.leftLeg);
        this.#setShadow(this.rightLeg);
        this.group.add(this.leftLeg);
        this.group.add(this.rightLeg);

        const footGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.2, 16, 16);
        this.leftFoot = new THREE.Mesh(footGeom, limbMat);
        this.leftFoot.scale.set(1.4, 0.7, 1.8);
        this.leftFoot.position.set(-PERSON_RADIUS * 0.22, -PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.1);
        this.rightFoot = new THREE.Mesh(footGeom, limbMat);
        this.rightFoot.scale.set(1.4, 0.7, 1.8);
        this.rightFoot.position.set(PERSON_RADIUS * 0.22, -PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.1);
        this.#setShadow(this.leftFoot);
        this.#setShadow(this.rightFoot);
        this.group.add(this.leftFoot);
        this.group.add(this.rightFoot);
    }

    #setShadow(mesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }

    setRandomPosition() {
        this.group.position.set(
            (Math.random() - 0.5) * SCENE_SIZE * 0.5,
            PERSON_RADIUS,
            (Math.random() - 0.5) * SCENE_SIZE * 0.5
        );
    }

    update() {
        const now = performance.now();
        const dt = Math.min((now - this._lastTime) / 1000, 0.05);
        this._lastTime = now;

        // Déplacement
        this.group.position.add(this.velocity);

        // Animation de course
        this.#updateRunningAnimation(dt);
        
        // Collision avec les bords
        if (Math.abs(this.group.position.x) > SCENE_SIZE / 2 - PERSON_RADIUS) {
            this.velocity.x *= -1;
            this.group.position.x = Math.sign(this.group.position.x) * (SCENE_SIZE / 2 - PERSON_RADIUS);
        }
        if (Math.abs(this.group.position.z) > SCENE_SIZE / 2 - PERSON_RADIUS) {
            this.velocity.z *= -1;
            this.group.position.z = Math.sign(this.group.position.z) * (SCENE_SIZE / 2 - PERSON_RADIUS);
        }
    }

    #updateRunningAnimation(dt) {
        const speed = this.velocity.length();
        const moving = this.isRunning && speed > 0.01;
        if (moving) {
            // fréquence en fonction de la vitesse
            const baseFreq = 7.0; // rad/s
            const freq = baseFreq * (0.6 + Math.min(speed / 0.25, 1.4));
            this._runTime += dt * freq;

            const legAmp = 0.6; // radians
            const armAmp = 0.7; // radians
            const torsoBobAmp = 0.05;

            // Jambes (balance opposée)
            if (this.leftLeg && this.rightLeg) {
                this.leftLeg.rotation.x = Math.sin(this._runTime) * legAmp;
                this.rightLeg.rotation.x = -Math.sin(this._runTime) * legAmp;
            }
            // Bras (opposé aux jambes)
            if (this.leftArm && this.rightArm) {
                this.leftArm.rotation.x = -Math.sin(this._runTime) * armAmp;
                this.rightArm.rotation.x = Math.sin(this._runTime) * armAmp;
            }
            // Légère oscillation du torse
            if (this.torso) {
                this.torso.position.y = PERSON_RADIUS * 0.2 + Math.abs(Math.sin(this._runTime)) * torsoBobAmp;
            }
        } else {
            // Retour doux à la pose neutre
            this._runTime = 0;
            const relax = (value, factor = 0.18) => value * (1 - factor);
            if (this.leftLeg && this.rightLeg) {
                this.leftLeg.rotation.x = relax(this.leftLeg.rotation.x);
                this.rightLeg.rotation.x = relax(this.rightLeg.rotation.x);
            }
            if (this.leftArm && this.rightArm) {
                this.leftArm.rotation.x = relax(this.leftArm.rotation.x);
                this.rightArm.rotation.x = relax(this.rightArm.rotation.x);
            }
            if (this.torso) {
                const targetY = PERSON_RADIUS * 0.2;
                this.torso.position.y = this.torso.position.y + (targetY - this.torso.position.y) * 0.15;
            }
        }
    }

    startRunning() {
        const angle = Math.random() * Math.PI * 2;
        this.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.15 + Math.random() * 0.15);
        this.isRunning = true;
    }

    stopRunning() {
        this.velocity.set(0, 0, 0);
        this.isRunning = false;
    }
}
