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
		// Mise en cache pour l'effet squishy (retour au neutre à l'arrêt)
		this._squishState = {
			initialized: false,
			base: {
				head: new THREE.Vector3(1, 1, 1),
				torso: new THREE.Vector3(1, 1, 1)
			}
		};
		// Base Y du groupe pour le bounce vertical naturel
		this._baseY = PERSON_RADIUS;
		this._stepPhase = 0; // phase de foulée cumulée (évite les artefacts liés à l'horloge)
		// Cible de vagabondage (wander) pour explorer l'écran
		this._wanderTarget = new THREE.Vector3();
		this._wanderTimer = 0;
		this._wanderInterval = 3.5 + Math.random() * 2.5; // retargets beaucoup moins fréquents
        // Paramètres de locomotion
        this.maxSpeed = 0.10 + Math.random() * 0.08; // vitesse cible plus lente, légère variance
        this.turnResponsiveness = 4.0; // moins réactif pour éviter les virages trop fréquents
        this.desiredDir = new THREE.Vector3(0, 0, 1); // direction souhaitée (unité)
        this.heading = new THREE.Vector3(0, 0, 1); // direction actuelle lissée (unité)
        this.jitterStrength = 0.15; // encore réduit: mouvements plus stables
        this._speedPhase = Math.random() * Math.PI * 2; // phase pour micro-variations de vitesse
        this.lookaheadDist = PERSON_RADIUS * 8; // distance d’anticipation des murs
        this.createBody(color);
        this.setRandomPosition();
		this.#pickWanderTarget(true);
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
        const accentColor = 0xffffff;

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
		const accentMat = new THREE.MeshPhysicalMaterial({ color: accentColor, roughness: 0.18, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.15 });
		const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.28, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.2 });

        // Torse (forme plus organique et arrondie comme Fall Guys)
		const torso = new THREE.Mesh(
			new THREE.SphereGeometry(PERSON_RADIUS * 0.66, 40, 40),
			standardMat
		);
		torso.position.set(0, PERSON_RADIUS * 0.28, 0);
		torso.scale.set(1.25, 1.35, 1.25); // Chunky, doux et volumineux
		this.torsoBaseScale = torso.scale.clone();
        this.#setShadow(torso);
        this.group.add(torso);
        this.torso = torso;
        // Photo optionnelle directement mappée sur le torse
        if (this.faceUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(this.faceUrl, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;

                const img = tex.image;
                const aspect = (img && img.width) ? img.height / img.width : 1; // H/W
                // Adapter les proportions du torse à l'image (étirer en Y)
                this.headYScale = aspect;
                if (this.torso && this.torsoBaseScale) {
                    this.torso.scale.set(
                        this.torsoBaseScale.x,
                        this.torsoBaseScale.y * this.headYScale,
                        this.torsoBaseScale.z
                    );
                }

                const torsoRadius = PERSON_RADIUS * 0.66;
                const phiCenter = Math.PI / 2; // face avant +Z
                const phiLength = Math.PI;     // hémisphère avant
                const phiStart = phiCenter - phiLength / 2;
                const thetaBase = Math.PI * 0.7;
                const thetaExtra = THREE.MathUtils.clamp((aspect - 1) * Math.PI * 0.35, 0, Math.PI * 0.35);
                const thetaLength = THREE.MathUtils.clamp(thetaBase + thetaExtra, Math.PI * 0.6, Math.PI * 0.95);
                const thetaStart = Math.PI * 0.05;

                const shellGeom = new THREE.SphereGeometry(torsoRadius * 1.01, 48, 32, phiStart, phiLength, thetaStart, thetaLength);
                const shellMat = new THREE.MeshStandardMaterial({
                    map: tex,
                    transparent: true,
                    roughness: 0.45,
                    metalness: 0.0,
                    side: THREE.FrontSide
                });
                const faceShell = new THREE.Mesh(shellGeom, shellMat);
                faceShell.position.set(0, 0, 0);
                this.#setShadow(faceShell);
                this.torso.add(faceShell);
                this.faceShell = faceShell;
            });
        }

		// Bras monobloc (type capsule) plus courts et ronds
		const makeArmGeom = () => {
			if (THREE.CapsuleGeometry) {
				// radius, length, capSegments, radialSegments
				return new THREE.CapsuleGeometry(PERSON_RADIUS * 0.22, PERSON_RADIUS * 0.55, 8, 16);
			}
			// Fallback: sphère étirée (moins idéal mais monobloc visuellement)
			return new THREE.SphereGeometry(PERSON_RADIUS * 0.26, 20, 20);
		};
		const armGeom = makeArmGeom();
		this.leftArm = new THREE.Mesh(armGeom, limbMat);
		this.leftArm.position.set(-PERSON_RADIUS * 0.7, PERSON_RADIUS * 0.42, 0);
		this.leftArm.scale.set(1, 1.35, 1);
		this.leftArm.rotation.z = Math.PI / 2.2;
		this.rightArm = new THREE.Mesh(armGeom, limbMat);
		this.rightArm.position.set(PERSON_RADIUS * 0.7, PERSON_RADIUS * 0.42, 0);
		this.rightArm.scale.set(1, 1.35, 1);
		this.rightArm.rotation.z = -Math.PI / 2.2;
        this.#setShadow(this.leftArm);
        this.#setShadow(this.rightArm);
        this.group.add(this.leftArm);
        this.group.add(this.rightArm);

		// Plus de mains séparées: le bras capsule intègre la « main » visuellement

        // Jambes (plus courtes et plus rondes comme Fall Guys)
		const legGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.22, 18, 18);
        this.leftLeg = new THREE.Mesh(legGeom, limbMat);
		this.leftLeg.position.set(-PERSON_RADIUS * 0.26, -PERSON_RADIUS * 0.6, 0);
		this.leftLeg.scale.set(1, 1.35, 1); // Plus courtes et plus épaisses
        this.rightLeg = new THREE.Mesh(legGeom, limbMat);
		this.rightLeg.position.set(PERSON_RADIUS * 0.26, -PERSON_RADIUS * 0.6, 0);
		this.rightLeg.scale.set(1, 1.35, 1); // Plus courtes et plus épaisses
        this.#setShadow(this.leftLeg);
        this.#setShadow(this.rightLeg);
        this.group.add(this.leftLeg);
        this.group.add(this.rightLeg);

        // Pieds (plus gros et plus ronds comme Fall Guys)
		const footGeom = new THREE.SphereGeometry(PERSON_RADIUS * 0.25, 22, 22);
        this.leftFoot = new THREE.Mesh(footGeom, limbMat);
		this.leftFoot.scale.set(1.35, 0.85, 1.7); // Plus gros et plus arrondis
		this.leftFoot.position.set(-PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.92, PERSON_RADIUS * 0.16);
        this.rightFoot = new THREE.Mesh(footGeom, limbMat);
		this.rightFoot.scale.set(1.35, 0.85, 1.7); // Plus gros et plus arrondis
		this.rightFoot.position.set(PERSON_RADIUS * 0.25, -PERSON_RADIUS * 0.92, PERSON_RADIUS * 0.16);
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

		// Mise à jour de la direction souhaitée (wander + évitement + peur)
        this.#updateDesiredDirection(dt);

        // Tourner progressivement vers la direction souhaitée
        // Lissage exponentiel pour éviter les changements brusques
        const lerpFactor = 1 - Math.exp(-this.turnResponsiveness * dt);
        this.heading.lerp(this.desiredDir, lerpFactor).normalize();
        // Filtrage supplémentaire très léger pour éviter les micro-oscillations
        this.heading.x = THREE.MathUtils.damp(this.heading.x, this.desiredDir.x, 8.0, dt);
        this.heading.z = THREE.MathUtils.damp(this.heading.z, this.desiredDir.z, 8.0, dt);

        // Légères variations de vitesse adoucies (moins de jitter)
        this._speedPhase += dt * 1.5;
        const speedJitter = 0.96 + Math.sin(this._speedPhase) * 0.03;
        const targetSpeed = this.maxSpeed * speedJitter;

        // Mettre à jour la vélocité à partir du heading lissé
        this.velocity.copy(this.heading).multiplyScalar(this.isRunning ? targetSpeed : 0);

		// Déplacement (XZ) avec conservation du Y pour appliquer le bounce
		this.group.position.x += this.velocity.x;
		this.group.position.z += this.velocity.z;

        // Rotation 3D du personnage vers sa direction de mouvement
        this.#updateRotation3D(dt);

		// Animation de course
		this.#updateRunningAnimation(dt);

		// Bounce global du corps (naturel, synchronisé avec la foulée)
		const speed = this.velocity.length();
		const moving = this.isRunning && speed > 0.01;
        if (moving) {
            const stepFreq = 4.5 + 5.0 * Math.min(speed / (this.maxSpeed || 0.001), 1); // dépend de la vitesse
            this._stepPhase += dt * stepFreq;
            const bounceAmp = THREE.MathUtils.lerp(0.03, 0.12, Math.min(speed / this.maxSpeed, 1));
            // Courbe d'impact lissée: sin² avec amortissement léger
            const impact = Math.pow(Math.sin(this._stepPhase), 2);
            this.group.position.y = this._baseY + impact * bounceAmp * PERSON_RADIUS;
			// Lean avant subtil proportionnel à la vitesse
			const targetLean = -THREE.MathUtils.degToRad(THREE.MathUtils.lerp(2, 10, Math.min(speed / this.maxSpeed, 1)));
			this.group.rotation.x += (targetLean - this.group.rotation.x) * 0.08;
		} else {
			// Retour doux au niveau et lean neutre
			this.group.position.y += (this._baseY - this.group.position.y) * 0.15;
			this.group.rotation.x *= 0.9;
            this._stepPhase = 0;
		}
        
        // Sécurité: clamp si sortie (évite le blocage) sans inversion brutale
        const half = SCENE_SIZE / 2 - PERSON_RADIUS;
        if (this.group.position.x > half) { this.group.position.x = half; this.desiredDir.x = Math.min(0, this.desiredDir.x); }
        if (this.group.position.x < -half) { this.group.position.x = -half; this.desiredDir.x = Math.max(0, this.desiredDir.x); }
        if (this.group.position.z > half) { this.group.position.z = half; this.desiredDir.z = Math.min(0, this.desiredDir.z); }
        if (this.group.position.z < -half) { this.group.position.z = -half; this.desiredDir.z = Math.max(0, this.desiredDir.z); }
    }

    #updateDesiredDirection(dt) {
        if (!this.isRunning) return;

		// Wander: retarget périodique vers une position aléatoire dans l'écran
		this._wanderTimer -= dt;
		if (this._wanderTimer <= 0) this.#pickWanderTarget();

		// Base: garder la direction actuelle comme cible
		// Ajouter un jitter aléatoire (peur) dans le plan XZ
        const jitterVec = new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5));
        if (jitterVec.lengthSq() > 0) jitterVec.normalize();
        const fearBoost = 1.0 + this.#wallThreatLevel() * 1.5; // plus proche du mur => plus nerveux
        this.desiredDir.addScaledVector(jitterVec, this.jitterStrength * fearBoost * dt).normalize();

		// Attraction douce vers la cible wander (renforcée)
		const toTarget = new THREE.Vector3().subVectors(this._wanderTarget, this.group.position);
		toTarget.y = 0;
		if (toTarget.lengthSq() > 1e-6) {
			toTarget.normalize();
			// Mélange direction actuelle pour persister dans la trajectoire
			const forwardBias = this.heading.clone().multiplyScalar(0.6);
			const steer = new THREE.Vector3().addVectors(toTarget, forwardBias).normalize();
			this.desiredDir.addScaledVector(steer, 2.2 * dt).normalize();
		}

		// Biais fort vers l'extérieur (repousse le centre)
		const centerRepulse = this.group.position.clone();
		centerRepulse.y = 0;
		if (centerRepulse.lengthSq() > 0.05) {
			centerRepulse.normalize();
			this.desiredDir.addScaledVector(centerRepulse, 3.0 * dt).normalize();
		}

        // Évitement anticipé des bords: appliquer une force de répulsion douce
        const avoid = this.#computeWallAvoidance();
        if (avoid.lengthSq() > 0) {
            // Mélanger la direction voulue avec l'évitement
            this.desiredDir.addScaledVector(avoid.normalize(), 1.2 * dt).normalize();
        }

        // Steering prédictif: regarder un point en avant et corriger avant d'atteindre le mur
        this.#applyPredictiveWallSteer(dt);

        // Empêcher de rester presque immobile
        if (this.desiredDir.lengthSq() < 1e-4) this.desiredDir.set(0, 0, 1);
    }

    #computeWallAvoidance() {
        // Calcule un vecteur d'éloignement des murs en fonction de la proximité
        const pos = this.group.position;
		const half = SCENE_SIZE / 2 - PERSON_RADIUS * 1.4; // marge un peu moins large pour autoriser l'exploration
		const margin = PERSON_RADIUS * 4.2; // commence à éviter un peu plus tard
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

	#pickWanderTarget(initial = false) {
		// Choisit une cible XZ dans les bornes de la scène, favorisant les zones hors centre
		const half = SCENE_SIZE / 2;
		const pad = Math.max(1.2, PERSON_RADIUS * 2);
		// Rayon cible très proche du bord pour favoriser l'exploration des extrémités
		const r = THREE.MathUtils.lerp(half * 0.80, half * 0.98, Math.random());
		// Angle biaisé par la direction radiale actuelle (depuis le centre)
		const pos = this.group?.position || new THREE.Vector3();
		const baseAng = Math.atan2(pos.z, pos.x);
		const ang = baseAng + (Math.random() - 0.5) * Math.PI * 0.6; // +/- ~54°
		const candidate = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
		candidate.x = THREE.MathUtils.clamp(candidate.x, -half + pad, half - pad);
		candidate.z = THREE.MathUtils.clamp(candidate.z, -half + pad, half - pad);
		this._wanderTarget.copy(candidate);
		// Intervalle de retarget: court au démarrage, puis long
		this._wanderInterval = initial ? (0.8 + Math.random() * 0.8) : (4.5 + Math.random() * 2.8);
		this._wanderTimer = this._wanderInterval;
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
			// Fréquence liée à la vitesse pour rythme de foulée naturel
			const baseFreq = 10.0; // rad/s
			const freq = baseFreq * (0.8 + Math.min(speed / (this.maxSpeed || 0.001), 1.6));
            this._runTime += dt * freq;

            // Amplitudes plus grandes et rebondies comme Fall Guys
			const legAmp = THREE.MathUtils.lerp(1.2, 2.1, Math.min(speed / this.maxSpeed, 1));
			const armAmp = THREE.MathUtils.lerp(1.3, 2.0, Math.min(speed / this.maxSpeed, 1));
			const torsoBobAmp = 0.25; // oscillation du torse très rebondie
			const headBobAmp = 0.0; // pas de tête désormais
			// Intensité de squish (élasticité) douce
			const squishIntensity = 0.07;

            // Jambes avec grands pas rebondis comme Fall Guys
            if (this.leftLeg && this.rightLeg) {
                // Mouvement principal des jambes (balance opposée) - grands pas rebondis !
				// Retards de phase subtils entre hanches et pieds pour naturalité
				this.leftLeg.rotation.x = Math.sin(this._runTime) * legAmp;
				this.rightLeg.rotation.x = -Math.sin(this._runTime) * legAmp;
                
				// Légère oscillation latérale
				this.leftLeg.rotation.z = Math.sin(this._runTime * 0.9) * 0.28;
				this.rightLeg.rotation.z = -Math.sin(this._runTime * 0.9) * 0.28;
                
				// Rotation Y subtile
				this.leftLeg.rotation.y = Math.sin(this._runTime * 0.6) * 0.18;
				this.rightLeg.rotation.y = -Math.sin(this._runTime * 0.6) * 0.18;
            }

            // Bras avec mouvements très expressifs et rebondis
            if (this.leftArm && this.rightArm) {
				// Opposition naturelle aux jambes
				this.leftArm.rotation.x = -Math.sin(this._runTime + 0.05) * armAmp;
				this.rightArm.rotation.x = Math.sin(this._runTime + 0.05) * armAmp;
                
				// Position de base et légère oscillation latérale
				this.leftArm.rotation.z = Math.PI / 2.2 + Math.sin(this._runTime * 1.1) * 0.42;
				this.rightArm.rotation.z = -Math.PI / 2.2 - Math.sin(this._runTime * 1.1) * 0.42;
                
				// Rotation Y subtile
				this.leftArm.rotation.y = Math.sin(this._runTime * 0.7) * 0.22;
				this.rightArm.rotation.y = -Math.sin(this._runTime * 0.7) * 0.22;
            }

			// Bras monobloc: plus de section « mains » à animer séparément

            // Pieds qui pivotent de façon très rebondie
            if (this.leftFoot && this.rightFoot) {
				this.leftFoot.rotation.x = Math.sin(this._runTime) * 0.55;
				this.rightFoot.rotation.x = -Math.sin(this._runTime) * 0.55;
				this.leftFoot.rotation.z = Math.sin(this._runTime * 0.5) * 0.28;
				this.rightFoot.rotation.z = -Math.sin(this._runTime * 0.5) * 0.28;
            }

            // Oscillation du torse très rebondie et dynamique
			if (this.torso) {
				this.torso.position.y = PERSON_RADIUS * 0.3 + Math.abs(Math.sin(this._runTime)) * torsoBobAmp;
				// Rotation du torse très marquée pour l'effet rebondi
				this.torso.rotation.y = Math.sin(this._runTime * 0.7) * 0.22;
				this.torso.rotation.z = Math.sin(this._runTime * 0.4) * 0.16;
				// Effet squishy: conserve le volume approximatif
				const squish = 1 + Math.sin(this._runTime * 1.2) * squishIntensity;
				const inv = 1 / Math.sqrt(squish);
				if (!this._squishState.initialized) {
					this._squishState.base.torso.copy(this.torso.scale);
				}
				this.torso.scale.set(
					this._squishState.base.torso.x * inv,
					this._squishState.base.torso.y * squish,
					this._squishState.base.torso.z * inv
				);
			}

			// Plus de tête à animer

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
            
			// Bras monobloc: aucune main séparée à réinitialiser
            
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
				// Retour des échelles au neutre initial
				if (this._squishState.initialized) {
					this.torso.scale.lerp(this._squishState.base.torso, 0.2);
				}
            }
            
			// Plus de tête à réinitialiser
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
        
        // Supprimer l'ancienne face shell si elle existe (sur le torse)
        if (this.faceShell) {
            this.torso.remove(this.faceShell);
            this.faceShell = null;
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
                // Adapter le torse en Y selon l'aspect
                if (this.torso && this.torsoBaseScale) {
                    this.torso.scale.set(
                        this.torsoBaseScale.x,
                        this.torsoBaseScale.y * this.headYScale,
                        this.torsoBaseScale.z
                    );
                }

                const phiCenter = Math.PI / 2;
                const phiLength = Math.PI;
                const phiStart = phiCenter - phiLength / 2;
                const thetaBase = Math.PI * 0.7;
                const thetaExtra = THREE.MathUtils.clamp((aspect - 1) * Math.PI * 0.35, 0, Math.PI * 0.35);
                const thetaLength = THREE.MathUtils.clamp(thetaBase + thetaExtra, Math.PI * 0.6, Math.PI * 0.95);
                const thetaStart = Math.PI * 0.05;

                const torsoRadius = PERSON_RADIUS * 0.66;
                const shellGeom = new THREE.SphereGeometry(torsoRadius * 1.01, 48, 32, phiStart, phiLength, thetaStart, thetaLength);
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
                this.torso.add(faceShell);
                this.faceShell = faceShell;
            });
        }
    }
}
