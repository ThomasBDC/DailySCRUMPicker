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
        // Paramètres de locomotion
        this.maxSpeed = 0.18 + Math.random() * 0.12; // vitesse cible, légère variance
        this.turnResponsiveness = 7.5; // réactivité de rotation (plus haut = tourne plus vite)
        this.desiredDir = new THREE.Vector3(0, 0, 1); // direction souhaitée (unité)
        this.heading = new THREE.Vector3(0, 0, 1); // direction actuelle lissée (unité)
        this.jitterStrength = 0.9; // intensité de micro-perturbation (peur)
        this._speedPhase = Math.random() * Math.PI * 2; // phase pour micro-variations de vitesse
        this.lookaheadDist = PERSON_RADIUS * 8; // distance d’anticipation des murs
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

        // Mise à jour de la direction souhaitée (peur + évitement murs)
        this.#updateDesiredDirection(dt);

        // Tourner progressivement vers la direction souhaitée
        // Lissage exponentiel pour éviter les changements brusques
        const lerpFactor = 1 - Math.exp(-this.turnResponsiveness * dt);
        this.heading.lerp(this.desiredDir, lerpFactor).normalize();

        // Légères variations de vitesse pour un comportement nerveux
        this._speedPhase += dt * (2.5 + Math.random() * 0.5);
        const speedJitter = 0.92 + Math.sin(this._speedPhase) * 0.06;
        const targetSpeed = this.maxSpeed * speedJitter;

        // Mettre à jour la vélocité à partir du heading lissé
        this.velocity.copy(this.heading).multiplyScalar(this.isRunning ? targetSpeed : 0);

        // Déplacement
        this.group.position.addScaledVector(this.velocity, 1);

        // Rotation 3D du personnage vers sa direction de mouvement
        this.#updateRotation3D(dt);

        // Animation de course
        this.#updateRunningAnimation(dt);
        
        // Sécurité: clamp si sortie (évite le blocage) sans inversion brutale
        const half = SCENE_SIZE / 2 - PERSON_RADIUS;
        if (this.group.position.x > half) { this.group.position.x = half; this.desiredDir.x = Math.min(0, this.desiredDir.x); }
        if (this.group.position.x < -half) { this.group.position.x = -half; this.desiredDir.x = Math.max(0, this.desiredDir.x); }
        if (this.group.position.z > half) { this.group.position.z = half; this.desiredDir.z = Math.min(0, this.desiredDir.z); }
        if (this.group.position.z < -half) { this.group.position.z = -half; this.desiredDir.z = Math.max(0, this.desiredDir.z); }
    }

    #updateDesiredDirection(dt) {
        if (!this.isRunning) return;

        // Base: garder la direction actuelle comme cible
        // Ajouter un jitter aléatoire (peur) dans le plan XZ
        const jitterVec = new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5));
        if (jitterVec.lengthSq() > 0) jitterVec.normalize();
        const fearBoost = 1.0 + this.#wallThreatLevel() * 1.5; // plus proche du mur => plus nerveux
        this.desiredDir.addScaledVector(jitterVec, this.jitterStrength * fearBoost * dt).normalize();

        // Évitement anticipé des bords: appliquer une force de répulsion douce
        const avoid = this.#computeWallAvoidance();
        if (avoid.lengthSq() > 0) {
            // Mélanger la direction voulue avec l'évitement
            this.desiredDir.addScaledVector(avoid.normalize(), 2.2 * dt).normalize();
        }

        // Steering prédictif: regarder un point en avant et corriger avant d'atteindre le mur
        this.#applyPredictiveWallSteer(dt);

        // Empêcher de rester presque immobile
        if (this.desiredDir.lengthSq() < 1e-4) this.desiredDir.set(0, 0, 1);
    }

    #computeWallAvoidance() {
        // Calcule un vecteur d'éloignement des murs en fonction de la proximité
        const pos = this.group.position;
        const half = SCENE_SIZE / 2 - PERSON_RADIUS * 1.8; // marge plus large pour anticiper
        const margin = PERSON_RADIUS * 6; // on commence à éviter plus tôt
        const force = new THREE.Vector3(0, 0, 0);

        // X+
        const distXp = half - pos.x;
        if (distXp < margin) force.x -= this.#falloff(distXp / margin);
        // X-
        const distXn = half + pos.x;
        if (distXn < margin) force.x += this.#falloff(distXn / margin);
        // Z+
        const distZp = half - pos.z;
        if (distZp < margin) force.z -= this.#falloff(distZp / margin);
        // Z-
        const distZn = half + pos.z;
        if (distZn < margin) force.z += this.#falloff(distZn / margin);

        return force;
    }

    #wallThreatLevel() {
        // 0..1 en fonction de la proximité maximale aux murs
        const pos = this.group.position;
        const half = SCENE_SIZE / 2 - PERSON_RADIUS * 1.8;
        const margin = PERSON_RADIUS * 8;
        const dists = [half - pos.x, half + pos.x, half - pos.z, half + pos.z];
        const minDist = Math.max(0, Math.min(...dists));
        const threat = 1 - THREE.MathUtils.clamp(minDist / margin, 0, 1);
        return threat;
    }

    #falloff(t) {
        // courbe non linéaire: plus proche => force plus forte (ease-out quad)
        const clamped = THREE.MathUtils.clamp(1 - t, 0, 1);
        return clamped * clamped;
    }

    #applyPredictiveWallSteer(dt) {
        const pos = this.group.position.clone();
        const half = SCENE_SIZE / 2 - PERSON_RADIUS;
        const lookVec = this.heading.clone().normalize().multiplyScalar(this.lookaheadDist);
        const pred = pos.add(lookVec);

        const margin = PERSON_RADIUS * 5;
        const steer = new THREE.Vector3(0, 0, 0);
        const tangent = new THREE.Vector3(0, 0, 0);

        // Détection proximité sur position prédite
        if (pred.x > half - margin) {
            steer.x -= this.#falloff((half - pred.x) / margin);
            tangent.z = Math.sign(this.desiredDir.z || 1); // glisse le long de Z
        } else if (pred.x < -half + margin) {
            steer.x += this.#falloff((pred.x + half) / margin);
            tangent.z = Math.sign(this.desiredDir.z || 1);
        }
        if (pred.z > half - margin) {
            steer.z -= this.#falloff((half - pred.z) / margin);
            tangent.x = Math.sign(this.desiredDir.x || 1); // glisse le long de X
        } else if (pred.z < -half + margin) {
            steer.z += this.#falloff((pred.z + half) / margin);
            tangent.x = Math.sign(this.desiredDir.x || 1);
        }

        if (steer.lengthSq() > 0) {
            // Priorité au dégagement du mur
            this.desiredDir.addScaledVector(steer.normalize(), 3.0 * dt);
            // Ajoute une composante tangentielle pour éviter l’arrêt face au mur
            if (tangent.lengthSq() > 0) {
                this.desiredDir.addScaledVector(tangent.normalize(), 1.5 * dt);
            }
            this.desiredDir.normalize();
        }

        // Si très proche: supprimer la composante qui pousse vers le mur
        const nearMargin = PERSON_RADIUS * 2.5;
        if (this.group.position.x > half - nearMargin && this.desiredDir.x > 0) this.desiredDir.x = 0;
        if (this.group.position.x < -half + nearMargin && this.desiredDir.x < 0) this.desiredDir.x = 0;
        if (this.group.position.z > half - nearMargin && this.desiredDir.z > 0) this.desiredDir.z = 0;
        if (this.group.position.z < -half + nearMargin && this.desiredDir.z < 0) this.desiredDir.z = 0;
        this.desiredDir.normalize();
    }

    #updateRotation3D(dt) {
        const speed = this.velocity.length();
        const moving = this.isRunning && speed > 0.01;
        
        if (moving) {
            // Calculer directement l'angle de direction du mouvement dans le plan XZ
            // Le modèle fait face à +Z quand rotation.y = 0, donc on utilise atan2(vx, vz)
            const currentRotation = this.group.rotation.y;
            let targetRotation = Math.atan2(this.velocity.x, this.velocity.z);
            
            // Ajuster la rotation pour éviter les tours complets inutiles
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
        // Initialiser une direction de déplacement aléatoire
        const angle = Math.random() * Math.PI * 2;
        this.desiredDir.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
        this.heading.copy(this.desiredDir);
        // amorce de mouvement
        this.velocity.copy(this.desiredDir).multiplyScalar(this.maxSpeed * 0.6);
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
