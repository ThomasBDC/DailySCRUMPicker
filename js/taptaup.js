import { Person } from './Person.js';
import { COLORS, PERSON_RADIUS, SCENE_SIZE } from './constants.js';

export class TapTaupePicker {
    constructor(container) {
        this.container = container;
        this.participants = [];
        this.persons = [];
        this.selectedPerson = null;
        this.running = false;
        this.selectionPhase = false;
        this.hammer = null;
        this.platform = null;
        this.holes = [];
        this.chosenIdx = null;
        this.zoomPhase = false;
        this.nameDisplay = null;
        this.hammerInitialPosition = null;
        this.hammerInitialRotation = null;
        
        // Configuration de la grille de trous
        this.gridCols = 4;
        this.gridRows = 4;
        // Espacement suffisant pour éviter les chevauchements (au moins 2.5x le rayon)
        this.holeRadius = PERSON_RADIUS * 1.0;
        this.holeSpacing = Math.max(this.holeRadius * 2.5, SCENE_SIZE * 0.7 / Math.max(this.gridCols, this.gridRows));
        
        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.createPlatform();
        this.createHammer();
        this.animate();
        
        // Gestion du redimensionnement
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a3a);
        this.scene.fog = new THREE.Fog(0x2a2a3a, 15, 50);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 8, 9);
        this.camera.lookAt(0, 0, 0);
        this.originalCameraPos = this.camera.position.clone();
        this.scene.add(this.camera);
    }
    
    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(-10, 15, -5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        this.scene.add(dirLight);
    }
    
    createPlatform() {
        // Créer une plateforme épaisse avec de vrais trous en utilisant ExtrudeGeometry
        const platformSize = SCENE_SIZE * 0.8;
        const platformThickness = 2;
        const halfSize = platformSize / 2;
        
        // Créer la forme extérieure de la plateforme (en coordonnées 2D)
        const shape = new THREE.Shape();
        shape.moveTo(-halfSize, -halfSize);
        shape.lineTo(halfSize, -halfSize);
        shape.lineTo(halfSize, halfSize);
        shape.lineTo(-halfSize, halfSize);
        shape.lineTo(-halfSize, -halfSize);
        
        // Créer les trous circulaires
        this.holes = [];
        const startX = -(this.gridCols - 1) * this.holeSpacing / 2;
        const startZ = -(this.gridRows - 1) * this.holeSpacing / 2;
        
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                const x = startX + col * this.holeSpacing;
                const z = startZ + row * this.holeSpacing;
                
                // Créer un trou circulaire dans la forme (en coordonnées 2D)
                const holePath = new THREE.Path();
                const segments = 32;
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    const px = x + Math.cos(angle) * this.holeRadius;
                    const py = z + Math.sin(angle) * this.holeRadius;
                    if (i === 0) {
                        holePath.moveTo(px, py);
                    } else {
                        holePath.lineTo(px, py);
                    }
                }
                shape.holes.push(holePath);
                
                // Stocker les informations du trou (en coordonnées 3D pour le positionnement)
                this.holes.push({
                    position: new THREE.Vector3(x, -PERSON_RADIUS * 2, z),
                    surfacePosition: new THREE.Vector3(x, 3+ PERSON_RADIUS, z),
                    occupied: false
                });
            }
        }
        
        // Créer la géométrie extrudée (plateforme épaisse avec trous)
        const extrudeSettings = {
            depth: platformThickness,
            bevelEnabled: false
        };
        const platformGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Matériau de la plateforme (plus clair pour contraster avec les trous)
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x6a6a7a,
            roughness: 0.8,
            metalness: 0.1
        });
        this.platform = new THREE.Mesh(platformGeometry, platformMaterial);
        this.platform.rotation.x = -Math.PI / 2;
        this.platform.position.y = platformThickness / 2;
        this.platform.receiveShadow = true;
        this.platform.castShadow = true;
        this.scene.add(this.platform);
    }
    
    createHammer() {
        const hammerGroup = new THREE.Group();
        
        // Manche du marteau (agrandi)
        const handleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 3.0, 16);
        const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.y = 1.5;
        handle.castShadow = true;
        hammerGroup.add(handle);
        
        // Tête du marteau (agrandie)
        const headGeometry = new THREE.BoxGeometry(0.8, 0.6, 1.0);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.8 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 3.2;
        head.castShadow = true;
        hammerGroup.add(head);
        
        this.hammer = hammerGroup;
        this.hammer.position.set(2.5, -2.2, -3);
        this.hammer.rotation.set(0.1, -0.4, 0.1);
        this.hammer.visible = true;
        this.hammerInitialPosition = this.hammer.position.clone();
        this.hammerInitialRotation = this.hammer.rotation.clone();
        this.camera.add(this.hammer);
    }
    
    setParticipants(participants) {
        this.participants = participants.filter(p => p.display);
        
        // Réinitialiser l'état des trous
        this.holes.forEach(hole => {
            hole.occupied = false;
        });
        
        // Nettoyer les personnages existants
        this.persons.forEach(person => {
            this.scene.remove(person.group);
        });
        this.persons = [];
        
        // Créer les nouveaux personnages
        for (let i = 0; i < this.participants.length; i++) {
            const color = COLORS[i % COLORS.length];
            const person = new Person(color, this.participants[i].faceUrl);
            person.group.userData.name = this.participants[i].name;
            person.group.userData.participantIndex = i;
            
            // Positionner initialement sous la plateforme
            const hole = this.holes[i % this.holes.length];
            person.group.position.copy(hole.position);
            person.group.visible = false;
            
            this.scene.add(person.group);
            this.persons.push(person);
        }
    }
    
    startSelection() {
        if (this.persons.length === 0) return;
        
        this.running = true;
        this.selectionPhase = true;
        this.chosenIdx = null;
        
        // Réinitialiser l'état des trous
        this.holes.forEach(hole => {
            hole.occupied = false;
        });
        
        // Cacher tous les personnages initialement
        this.persons.forEach((person, idx) => {
            const hole = this.holes[idx % this.holes.length];
            person.group.position.copy(hole.position);
            person.group.visible = false;
        });
        
        // Faire apparaître les personnages aléatoirement
        this.startRandomPopups();
        
        // Après le temps de sélection, choisir un gagnant
        setTimeout(() => {
            this.selectWinner();
        }, 2000);
    }
    
    startRandomPopups() {
        if (!this.running) return;
        
        // Choisir un personnage aléatoire à faire apparaître
        const availablePersons = this.persons.filter((p, idx) => {
            const hole = this.holes[idx % this.holes.length];
            return !hole.occupied && !p.group.visible;
        });
        
        if (availablePersons.length > 0) {
            const randomPerson = availablePersons[Math.floor(Math.random() * availablePersons.length)];
            const personIdx = this.persons.indexOf(randomPerson);
            const hole = this.holes[personIdx % this.holes.length];
            
            // Marquer le trou comme occupé avant l'animation
            hole.occupied = true;
            
            // Positionner le personnage sous la plateforme puis l'animer
            randomPerson.group.position.copy(hole.position);
            randomPerson.group.visible = true;
            
            // Animation de sortie (pop-up)
            this.animatePersonPopUp(randomPerson, hole);
            
            // Faire disparaître après un certain temps
            setTimeout(() => {
                if (this.running && randomPerson !== this.selectedPerson && randomPerson.group.visible) {
                    this.animatePersonPopDown(randomPerson, hole);
                }
            }, 800 + Math.random() * 400);
        }
        
        // Continuer à faire apparaître des personnages
        if (this.running) {
            setTimeout(() => this.startRandomPopups(), 300 + Math.random() * 200);
        }
    }
    
    animatePersonPopUp(person, hole) {
        const startY = hole.position.y;
        const endY = hole.surfacePosition.y;
        const duration = 300;
        const startTime = performance.now();
        
        const animate = () => {
            if (!this.running && person !== this.selectedPerson) {
                return; // Arrêter l'animation si le jeu s'est arrêté
            }
            
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out bounce
            const eased = 1 - Math.pow(1 - t, 3);
            const bounce = Math.sin(t * Math.PI * 3) * (1 - t) * 0.3;
            person.group.position.y = startY + (endY - startY) * eased + bounce * PERSON_RADIUS;
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                person.group.position.y = endY;
            }
        };
        
        animate();
    }
    
    animatePersonPopDown(person, hole) {
        const startY = person.group.position.y;
        const endY = hole.position.y;
        const duration = 200;
        const startTime = performance.now();
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            const eased = t * t; // ease in quad
            person.group.position.y = startY + (endY - startY) * eased;
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                person.group.visible = false;
                person.group.position.y = endY;
                hole.occupied = false;
            }
        };
        
        animate();
    }
    
    selectWinner() {
        if (this.persons.length === 0) return;
        
        this.running = false;
        this.selectionPhase = false;
        
        // Choisir un gagnant aléatoire parmi les participants
        this.chosenIdx = Math.floor(Math.random() * this.persons.length);
        this.selectedPerson = this.persons[this.chosenIdx];
        
        // S'assurer que le gagnant est visible
        const hole = this.holes[this.chosenIdx % this.holes.length];
        this.selectedPerson.group.position.copy(hole.surfacePosition);
        this.selectedPerson.group.visible = true;
        this.selectedPerson.group.position.y = hole.surfacePosition.y;
        
        // Arrêter tous les autres personnages
        this.persons.forEach((person, idx) => {
            if (idx !== this.chosenIdx) {
                const otherHole = this.holes[idx % this.holes.length];
                this.animatePersonPopDown(person, otherHole);
            }
        });
        
        // Attendre un peu puis lancer le marteau
        setTimeout(() => {
            this.hammerDown();
        }, 500);
    }
    
    hammerDown() {
        if (!this.selectedPerson) return;

        // Animation "vue FPS" (style Minecraft): le marteau reste attaché à la caméra,
        // on ne fait qu'une animation de swing.
        this.hammer.visible = true;

        const startRotationX = -Math.PI / 2;
        const endRotationX = 0;
        const baseRotation = this.hammer.rotation.clone();
        this.hammer.rotation.x = startRotationX;

        const duration = 300;
        const startTime = performance.now();

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            const eased = t * t;
            this.hammer.rotation.x = startRotationX + (endRotationX - startRotationX) * eased;
            this.hammer.rotation.y = baseRotation.y;
            this.hammer.rotation.z = baseRotation.z;

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.onHammerHit();
            }
        };

        animate();
    }
    
    onHammerHit() {
        // Effet de rebond du personnage
        if (this.selectedPerson) {
            const bounceDuration = 200;
            const startTime = performance.now();
            const originalY = this.selectedPerson.group.position.y;
            
            const animate = () => {
                const elapsed = performance.now() - startTime;
                const t = Math.min(elapsed / bounceDuration, 1);
                
                // Bounce effect
                const bounce = Math.sin(t * Math.PI) * 0.3;
                this.selectedPerson.group.position.y = originalY + bounce * PERSON_RADIUS;
                
                // Légère rotation
                this.selectedPerson.group.rotation.x = Math.sin(t * Math.PI) * 0.2;
                
                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.selectedPerson.group.position.y = originalY;
                    this.selectedPerson.group.rotation.x = 0;
                }
            };
            
            animate();
        }
        
        // Remonter le marteau légèrement (retour à la position levée)
        setTimeout(() => {
            if (this.hammerInitialPosition) {
                this.hammer.position.copy(this.hammerInitialPosition);
            }
            if (this.hammerInitialRotation) {
                this.hammer.rotation.copy(this.hammerInitialRotation);
            } else {
                this.hammer.rotation.x = -Math.PI / 2;
            }
        }, 100);
        
        // Zoom vers le personnage
        setTimeout(() => {
            this.startZoom();
        }, 300);
    }
    
    startZoom() {
        if (!this.selectedPerson) return;
        
        this.zoomPhase = true;
        const targetPos = this.selectedPerson.group.position.clone();
        targetPos.y += PERSON_RADIUS;
        
        // Calculer la position de la caméra pour le zoom
        const zoomDistance = PERSON_RADIUS * 3;
        const cameraOffset = new THREE.Vector3(0, 0.5, 1).normalize().multiplyScalar(zoomDistance);
        const targetCameraPos = targetPos.clone().add(cameraOffset);
        
        const startPos = this.camera.position.clone();
        const duration = 800;
        const startTime = performance.now();
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            this.camera.position.lerpVectors(startPos, targetCameraPos, eased);
            this.camera.lookAt(targetPos);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                // Afficher le nom
                this.showName();
            }
        };
        
        animate();
    }
    
    showName() {
        if (!this.selectedPerson) return;
        
        const name = this.selectedPerson.group.userData.name || '';
        const nameEl = document.getElementById('name-display');
        if (nameEl) {
            nameEl.textContent = name;
            nameEl.style.display = 'block';
            nameEl.style.position = 'fixed';
            nameEl.style.left = '50%';
            nameEl.style.top = '50%';
            nameEl.style.transform = 'translate(-50%, -50%)';
            nameEl.style.fontSize = '48px';
            nameEl.style.zIndex = '1000';
        }
    }
    
    removeSelectedPerson() {
        if (this.chosenIdx !== null && this.persons[this.chosenIdx]) {
            const personToRemove = this.persons[this.chosenIdx];
            this.scene.remove(personToRemove.group);
            this.persons.splice(this.chosenIdx, 1);
            this.participants.splice(this.chosenIdx, 1);
        }
        
        // Réinitialiser l'état
        this.chosenIdx = null;
        this.selectedPerson = null;
        this.zoomPhase = false;
        this.hammer.visible = true;
        
        // Remettre la caméra à sa position originale
        const duration = 500;
        const startTime = performance.now();
        const startPos = this.camera.position.clone();
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            const eased = t * t; // ease in quad
            this.camera.position.lerpVectors(startPos, this.originalCameraPos, eased);
            this.camera.lookAt(0, 0, 0);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
        
        // Masquer le nom
        const nameEl = document.getElementById('name-display');
        if (nameEl) {
            nameEl.style.display = 'none';
        }
    }
    
    reset() {
        this.running = false;
        this.selectionPhase = false;
        this.zoomPhase = false;
        this.chosenIdx = null;
        this.selectedPerson = null;
        this.hammer.visible = true;
        
        // Remettre la caméra à sa position originale
        this.camera.position.copy(this.originalCameraPos);
        this.camera.lookAt(0, 0, 0);
        
        // Masquer tous les personnages
        this.persons.forEach((person, idx) => {
            const hole = this.holes[idx % this.holes.length];
            person.group.position.copy(hole.position);
            person.group.visible = false;
            hole.occupied = false;
        });
        
        // Masquer le nom
        const nameEl = document.getElementById('name-display');
        if (nameEl) {
            nameEl.style.display = 'none';
        }
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.render();
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    dispose() {
        // Nettoyer la scène
        this.persons.forEach(person => {
            this.scene.remove(person.group);
        });
        this.scene.remove(this.platform);
        this.camera.remove(this.hammer);
        this.holes.forEach(hole => {
            if (hole.cylinder) {
                this.scene.remove(hole.cylinder);
            }
        });
        this.container.removeChild(this.renderer.domElement);
    }
}

