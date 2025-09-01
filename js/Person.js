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

        // Torse (forme plus organique et arrondie comme Fall Guys)
        const torso = new THREE.Mesh(
            new THREE.SphereGeometry(PERSON_RADIUS * 0.6, 32, 32),
            standardMat
        );
        torso.position.set(0, PERSON_RADIUS * 0.3, 0);
        torso.scale.set(1, 1.2, 0.8); // Plus large et plus haut, moins profond
        this.#setShadow(torso);
        this.group.add(torso);
        this.torso = torso;

        // Tête (plus grosse et plus ronde comme Fall Guys)
        const headRadius = PERSON_RADIUS * 0.55;
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(headRadius, 32, 32),
            standardMat
        );
        head.position.set(0, PERSON_RADIUS * 1.1, 0);
        head.scale.set(1, this.headYScale, 1);
        this.#setShadow(head);
        this.group.add(head);
        this.head = head;

        // Face plate (plus grande et plus ronde comme Fall Guys)
        const facePlate = new THREE.Mesh(
            new THREE.CircleGeometry(PERSON_RADIUS * 0.45, 32),
            accentMat
        );
        facePlate.rotation.x = -Math.PI / 2 + 0.001;
        facePlate.position.set(0, PERSON_RADIUS * 1.1, PERSON_RADIUS * 0.52);
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

        // Yeux (plus gros et plus expressifs comme Fall Guys)
        const eyeGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.12, 16, 16);
        const leftEye = new THREE.Mesh(eyeGeom, blackMat);
        leftEye.position.set(-PERSON_RADIUS * 0.18, PERSON_RADIUS * 1.15, PERSON_RADIUS * 0.52);
        const rightEye = new THREE.Mesh(eyeGeom, blackMat);
        rightEye.position.set(PERSON_RADIUS * 0.18, PERSON_RADIUS * 1.15, PERSON_RADIUS * 0.52);
        leftEye.visible = !this.faceUrl;
        rightEye.visible = !this.faceUrl;
        this.#setShadow(leftEye);
        this.#setShadow(rightEye);
        this.group.add(leftEye);
        this.group.add(rightEye);

        // Bras (plus courts et plus ronds comme Fall Guys)
        const armGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.15, 16, 16);
        this.leftArm = new THREE.Mesh(armGeom, limbMat);
        this.leftArm.position.set(-PERSON_RADIUS * 0.7, PERSON_RADIUS * 0.4, 0);
        this.leftArm.scale.set(1, 1.8, 1); // Plus long et plus fin
        this.leftArm.rotation.z = Math.PI / 2.2;
        this.rightArm = new THREE.Mesh(armGeom, limbMat);
        this.rightArm.position.set(PERSON_RADIUS * 0.7, PERSON_RADIUS * 0.4, 0);
        this.rightArm.scale.set(1, 1.8, 1); // Plus long et plus fin
        this.rightArm.rotation.z = -Math.PI / 2.2;
        this.#setShadow(this.leftArm);
        this.#setShadow(this.rightArm);
        this.group.add(this.leftArm);
        this.group.add(this.rightArm);

        // Mains (plus grosses et plus rondes comme Fall Guys)
        const handGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.18, 20, 20);
        this.leftHand = new THREE.Mesh(handGeom, limbMat);
        this.rightHand = new THREE.Mesh(handGeom, limbMat);
        this.leftHand.position.set(-PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.25, 0);
        this.rightHand.position.set(PERSON_RADIUS * 0.95, PERSON_RADIUS * 0.25, 0);
        this.#setShadow(this.leftHand);
        this.#setShadow(this.rightHand);
        this.group.add(this.leftHand);
        this.group.add(this.rightHand);

        // Jambes (plus courtes et plus rondes comme Fall Guys)
        const legGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.18, 16, 16);
        this.leftLeg = new THREE.Mesh(legGeom, limbMat);
        this.leftLeg.position.set(-PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.6, 0);
        this.leftLeg.scale.set(1, 1.5, 1); // Plus courtes et plus épaisses
        this.rightLeg = new THREE.Mesh(legGeom, limbMat);
        this.rightLeg.position.set(PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.6, 0);
        this.rightLeg.scale.set(1, 1.5, 1); // Plus courtes et plus épaisses
        this.#setShadow(this.leftLeg);
        this.#setShadow(this.rightLeg);
        this.group.add(this.leftLeg);
        this.group.add(this.rightLeg);

        // Pieds (plus gros et plus ronds comme Fall Guys)
        const footGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.22, 20, 20);
        this.leftFoot = new THREE.Mesh(footGeom, limbMat);
        this.leftFoot.scale.set(1.3, 0.8, 1.6); // Plus gros et plus arrondis
        this.leftFoot.position.set(-PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.9, PERSON_RADIUS * 0.15);
        this.rightFoot = new THREE.Mesh(footGeom, limbMat);
        this.rightFoot.scale.set(1.3, 0.8, 1.6); // Plus gros et plus arrondis
        this.rightFoot.position.set(PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.9, PERSON_RADIUS * 0.15);
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

        // Rotation 3D du personnage vers sa direction de mouvement
        this.#updateRotation3D(dt);

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

    #updateRotation3D(dt) {
        const speed = this.velocity.length();
        const moving = this.isRunning && speed > 0.01;
        
        if (moving) {
            // Calculer l'angle de direction du mouvement
            const moveAngle = Math.atan2(this.velocity.z, this.velocity.x);
            
            // Le personnage doit être face à sa direction de mouvement
            // Par défaut, le personnage regarde vers +Z (face à la caméra)
            // Donc quand il va vers +Z, il ne doit pas tourner (angle = 0)
            // Quand il va vers +X, il doit tourner de 90° vers la droite
            // Quand il va vers -Z, il doit tourner de 180° (dos à la caméra)
            // Quand il va vers -X, il doit tourner de -90° vers la gauche
            const currentRotation = this.group.rotation.y;
            // Le personnage doit faire face à sa direction de mouvement
            // L'angle de rotation doit être l'angle de direction du mouvement
            // Mais il faut ajuster car le modèle est orienté vers +Z par défaut
            let targetRotation = moveAngle - Math.PI / 2;
            
            // Ajuster la rotation pour éviter les rotations de 360°
            let angleDiff = targetRotation - currentRotation;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // Interpolation fluide de la rotation
            const rotationSpeed = 15.0; // Vitesse de rotation plus rapide pour un effet plus dynamique
            this.group.rotation.y += angleDiff * rotationSpeed * dt;
            
            // Normaliser la rotation
            while (this.group.rotation.y > Math.PI) this.group.rotation.y -= 2 * Math.PI;
            while (this.group.rotation.y < -Math.PI) this.group.rotation.y += 2 * Math.PI;
            
        } else {
            // Retour doux à la rotation neutre (face à la caméra) quand immobile
            const currentRotation = this.group.rotation.y;
            let targetRotation = 0; // Face à la caméra (+Z)
            
            let angleDiff = targetRotation - currentRotation;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            const rotationSpeed = 8.0; // Vitesse de retour plus rapide
            this.group.rotation.y += angleDiff * rotationSpeed * dt;
        }
    }

    #updateRunningAnimation(dt) {
        const speed = this.velocity.length();
        const moving = this.isRunning && speed > 0.01;
        
        if (moving) {
            // Fréquence très rapide pour des mouvements rebondis et dynamiques
            const baseFreq = 15.0; // rad/s - encore plus rapide pour l'effet rebondi !
            const freq = baseFreq * (0.9 + Math.min(speed / 0.25, 2.5));
            this._runTime += dt * freq;

            // Amplitudes plus grandes et rebondies comme Fall Guys
            const legAmp = 2.0; // radians - grands pas rebondis !
            const armAmp = 2.2; // radians - bras très expressifs
            const torsoBobAmp = 0.25; // oscillation du torse très rebondie
            const headBobAmp = 0.15; // oscillation de la tête très marquée

            // Jambes avec grands pas rebondis comme Fall Guys
            if (this.leftLeg && this.rightLeg) {
                // Mouvement principal des jambes (balance opposée) - grands pas rebondis !
                this.leftLeg.rotation.x = Math.sin(this._runTime) * legAmp;
                this.rightLeg.rotation.x = -Math.sin(this._runTime) * legAmp;
                
                // Mouvement latéral plus marqué pour l'effet rebondi
                this.leftLeg.rotation.z = Math.sin(this._runTime * 0.9) * 0.4;
                this.rightLeg.rotation.z = -Math.sin(this._runTime * 0.9) * 0.4;
                
                // Rotation Y plus prononcée pour plus de dynamisme
                this.leftLeg.rotation.y = Math.sin(this._runTime * 0.6) * 0.3;
                this.rightLeg.rotation.y = -Math.sin(this._runTime * 0.6) * 0.3;
            }

            // Bras avec mouvements très expressifs et rebondis
            if (this.leftArm && this.rightArm) {
                // Mouvement principal des bras (opposé aux jambes) - très expressif !
                this.leftArm.rotation.x = -Math.sin(this._runTime) * armAmp;
                this.rightArm.rotation.x = Math.sin(this._runTime) * armAmp;
                
                // Mouvement latéral très marqué des bras pour l'effet rebondi
                this.leftArm.rotation.z = Math.PI / 2.2 + Math.sin(this._runTime * 1.1) * 0.6;
                this.rightArm.rotation.z = -Math.PI / 2.2 - Math.sin(this._runTime * 1.1) * 0.6;
                
                // Rotation Y plus prononcée pour plus de dynamisme
                this.leftArm.rotation.y = Math.sin(this._runTime * 0.7) * 0.4;
                this.rightArm.rotation.y = -Math.sin(this._runTime * 0.7) * 0.4;
            }

            // Mains qui bougent de façon très rebondie avec les bras
            if (this.leftHand && this.rightHand) {
                this.leftHand.rotation.x = -Math.sin(this._runTime) * armAmp * 0.8;
                this.rightHand.rotation.x = Math.sin(this._runTime) * armAmp * 0.8;
                this.leftHand.rotation.z = Math.sin(this._runTime * 0.8) * 0.5;
                this.rightHand.rotation.z = -Math.sin(this._runTime * 0.8) * 0.5;
            }

            // Pieds qui pivotent de façon très rebondie
            if (this.leftFoot && this.rightFoot) {
                this.leftFoot.rotation.x = Math.sin(this._runTime) * 0.6;
                this.rightFoot.rotation.x = -Math.sin(this._runTime) * 0.6;
                this.leftFoot.rotation.z = Math.sin(this._runTime * 0.5) * 0.4;
                this.rightFoot.rotation.z = -Math.sin(this._runTime * 0.5) * 0.4;
            }

            // Oscillation du torse très rebondie et dynamique
            if (this.torso) {
                this.torso.position.y = PERSON_RADIUS * 0.3 + Math.abs(Math.sin(this._runTime)) * torsoBobAmp;
                // Rotation du torse très marquée pour l'effet rebondi
                this.torso.rotation.y = Math.sin(this._runTime * 0.7) * 0.3;
                this.torso.rotation.z = Math.sin(this._runTime * 0.4) * 0.2;
            }

            // Oscillation de la tête très rebondie et expressive
            if (this.head) {
                this.head.rotation.y = Math.sin(this._runTime * 0.8) * 0.25;
                this.head.rotation.z = Math.sin(this._runTime * 0.5) * 0.15;
                this.head.position.y = PERSON_RADIUS * 1.1 + Math.sin(this._runTime * 0.9) * headBobAmp;
            }

        } else {
            // Retour doux à la pose neutre avec interpolation plus fluide
            this._runTime = 0;
            const relax = (value, factor = 0.15) => value * (1 - factor); // Plus rapide pour l'arrêt
            
            // Retour des jambes à la position neutre
            if (this.leftLeg && this.rightLeg) {
                this.leftLeg.rotation.x = relax(this.leftLeg.rotation.x);
                this.rightLeg.rotation.x = relax(this.rightLeg.rotation.x);
                this.leftLeg.rotation.z = relax(this.leftLeg.rotation.z);
                this.rightLeg.rotation.z = relax(this.rightLeg.rotation.z);
                this.leftLeg.rotation.y = relax(this.leftLeg.rotation.y);
                this.rightLeg.rotation.y = relax(this.rightLeg.rotation.y);
            }
            
            // Retour des bras à la position neutre
            if (this.leftArm && this.rightArm) {
                this.leftArm.rotation.x = relax(this.leftArm.rotation.x);
                this.rightArm.rotation.x = relax(this.rightArm.rotation.x);
                this.leftArm.rotation.z = this.leftArm.rotation.z + (Math.PI / 2.2 - this.leftArm.rotation.z) * 0.2;
                this.rightArm.rotation.z = this.rightArm.rotation.z + (-Math.PI / 2.2 - this.rightArm.rotation.z) * 0.2;
                this.leftArm.rotation.y = relax(this.leftArm.rotation.y);
                this.rightArm.rotation.y = relax(this.rightArm.rotation.y);
            }
            
            // Retour des mains à la position neutre
            if (this.leftHand && this.rightHand) {
                this.leftHand.rotation.x = relax(this.leftHand.rotation.x);
                this.rightHand.rotation.x = relax(this.rightHand.rotation.x);
                this.leftHand.rotation.z = relax(this.leftHand.rotation.z);
                this.rightHand.rotation.z = relax(this.rightHand.rotation.z);
            }
            
            // Retour des pieds à la position neutre
            if (this.leftFoot && this.rightFoot) {
                this.leftFoot.rotation.x = relax(this.leftFoot.rotation.x);
                this.rightFoot.rotation.x = relax(this.rightFoot.rotation.x);
                this.leftFoot.rotation.z = relax(this.leftFoot.rotation.z);
                this.rightFoot.rotation.z = relax(this.rightFoot.rotation.z);
            }
            
            // Retour du torse à la position neutre
            if (this.torso) {
                const targetY = PERSON_RADIUS * 0.3;
                this.torso.position.y = this.torso.position.y + (targetY - this.torso.position.y) * 0.15;
                this.torso.rotation.y = relax(this.torso.rotation.y);
                this.torso.rotation.z = relax(this.torso.rotation.z);
            }
            
            // Retour de la tête à la position neutre
            if (this.head) {
                this.head.rotation.y = relax(this.head.rotation.y);
                this.head.rotation.z = relax(this.head.rotation.z);
                const targetHeadY = PERSON_RADIUS * 1.1;
                this.head.position.y = this.head.position.y + (targetHeadY - this.head.position.y) * 0.15;
            }
        }
    }

    startRunning() {
        // Direction de mouvement plus variée avec des angles plus naturels
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.2; // Vitesse variable
        
        // Créer un vecteur de vitesse avec une légère variation
        this.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(speed);
        
        // Ajouter une légère variation aléatoire pour plus de naturel
        this.velocity.x += (Math.random() - 0.5) * 0.03;
        this.velocity.z += (Math.random() - 0.5) * 0.03;
        
        this.isRunning = true;
    }

    stopRunning() {
        this.velocity.set(0, 0, 0);
        this.isRunning = false;
    }

    updateFace(faceUrl) {
        if (faceUrl === this.faceUrl) return; // Pas de changement
        
        this.faceUrl = faceUrl;
        
        // Supprimer l'ancienne face shell si elle existe
        if (this.faceShell) {
            this.head.remove(this.faceShell);
            this.faceShell = null;
        }
        
        // Masquer les yeux par défaut
        const leftEye = this.group.children.find(child => child.position.x < 0 && child.geometry.type === 'SphereGeometry');
        const rightEye = this.group.children.find(child => child.position.x > 0 && child.geometry.type === 'SphereGeometry');
        if (leftEye) leftEye.visible = !faceUrl;
        if (rightEye) rightEye.visible = !faceUrl;
        
        // Afficher la plaque faciale par défaut
        if (this.facePlate) {
            this.facePlate.visible = !faceUrl;
        }
        
        // Si une nouvelle URL est fournie, charger la texture
        if (faceUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(faceUrl, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;

                const img = tex.image;
                const aspect = (img && img.width) ? img.height / img.width : 1;
                this.headYScale = aspect;
                this.head.scale.set(1, this.headYScale, 1);
                if (this.facePlate) this.facePlate.scale.set(1, this.headYScale, 1);

                const headRadius = PERSON_RADIUS * 0.45;
                const phiCenter = Math.PI / 2;
                const phiLength = Math.PI;
                const phiStart = phiCenter - phiLength / 2;
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
                
                // Masquer la plaque faciale
                if (this.facePlate) this.facePlate.visible = false;
            });
        }
    }
}
