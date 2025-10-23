import { ParticipantManager } from './participants.js';
import { PERSON_RADIUS, SCENE_SIZE, COLORS } from './constants.js';
import { Person } from './Person.js';
import { Scene } from './scene.js';
import { WheelPicker } from './wheel.js';

class Game {
    constructor() {
        // Clé pour le localStorage
        this.pickerStorageKey = 'dsp_picker_type';
        // Charger le type de picker sauvegardé ou utiliser la valeur par défaut
        this.currentPicker = localStorage.getItem(this.pickerStorageKey) || '3d';
        
        // Initialiser les propriétés de base
        this.scene = null;
        this.wheel = null;
        this.persons = [];
        this.running = false;
        this.spotlightPhase = false;
        this.chosenIdx = null;
        
        this.participantManager = new ParticipantManager();
        this.participantManager.setGameReference(this);
        
        // Initialiser le bon mode dès le départ
        if (this.currentPicker === '3d') {
            this.scene = new Scene();
        }
        
        this.init();
        this._lastTick = performance.now();
        
        // Ajouter le gestionnaire pour le changement de type de picker
        document.getElementById('picker-type').addEventListener('change', (e) => {
            this.switchPicker(e.target.value);
        });
    }

    init() {
        // Mettre à jour le select avec le type de picker sauvegardé
        const pickerSelect = document.getElementById('picker-type');
        if (pickerSelect) {
            pickerSelect.value = this.currentPicker;
        }
        
        // Initialiser l'affichage correct au démarrage
        if (this.currentPicker === 'wheel') {
            this.wheel = new WheelPicker(document.body);
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
        } else if (this.currentPicker === '3d') {
            if (!this.scene) {
                this.scene = new Scene();
            }
            this.scene.renderer.domElement.style.display = 'block';
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        }

        // Attendre que les participants soient configurés
        window.addEventListener('participantsReady', (event) => {
            if (this.currentPicker === '3d') {
                this.createPersons(event.detail);
            } else if (this.currentPicker === 'wheel' && this.wheel) {
                this.wheel.setParticipants(event.detail);
            }
        });
        
        // Prépare l'étiquette de nom
        this.nameEl = document.getElementById('name-display');
        if (this.nameEl) {
            this.nameEl.style.display = 'none';
            this.nameEl.style.bottom = 'auto';
        }

        this.animate();
    }

    switchPicker(type) {
        if (type === this.currentPicker) return;
        
        this.currentPicker = type;
        // Sauvegarder le choix dans le localStorage
        try {
            localStorage.setItem(this.pickerStorageKey, type);
        } catch (error) {
            console.warn('Erreur lors de la sauvegarde du type de picker:', error);
        }
        
        // Cacher/montrer les éléments appropriés
        if (type === 'wheel') {
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
            if (!this.wheel) {
                this.wheel = new WheelPicker(document.body);
                // Si des participants sont déjà configurés, les ajouter à la roue
                if (this.participantManager.participants.length > 0) {
                    this.wheel.setParticipants(this.participantManager.participants);
                }
            } else {
                this.wheel.canvas.style.display = 'block';
            }
        } else {
            if (!this.scene) {
                this.scene = new Scene();
                this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
            }
            if (this.wheel) {
                this.wheel.canvas.style.display = 'none';
            }
            this.scene.renderer.domElement.style.display = 'block';
        }
    }

    createPersons(participants) {
        if (this.currentPicker === 'wheel') {
            if (!this.wheel) {
                this.wheel = new WheelPicker(document.body);
            }
            this.wheel.setParticipants(participants);
            return;
        }

        // Mode 3D
        if (!this.scene) {
            this.scene = new Scene();
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        }

        // Nettoyer les personnes existantes
        this.persons.forEach(person => {
            this.scene.scene.remove(person.group);
        });
        this.persons = [];
        
        // Créer les nouvelles personnes
        for (let i = 0; i < participants.length; i++) {
            const color = COLORS[i % COLORS.length];
            const person = new Person(color, participants[i].faceUrl);
            person.group.userData.name = participants[i].name;
            this.scene.scene.add(person.group);
            this.persons.push(person);
        }
        
        // Activer l'indicateur visuel du bouton de configuration
        this.updateConfigButtonState();
    }

    // Méthode pour réinitialiser complètement le jeu
    resetGame() {
        this.running = false;
        this.chosenIdx = null;

        if (this.currentPicker === 'wheel') {
            if (this.wheel) {
                this.wheel.reset();
            }
        } else {
            // Mode 3D
            this.spotlightPhase = false;
            
            if (this.scene) {
                // Masquer le spotlight et le halo
                this.scene.spotlight.visible = false;
                if (this.scene.halo) this.scene.halo.setVisible(false);
                if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = false;
            }
        }
        
        // Masquer l'étiquette de nom
        if (this.nameEl) {
            this.nameEl.style.display = 'none';
        }
        
        // Arrêter toutes les personnes
        this.persons.forEach(person => {
            person.stopRunning();
            // Remettre les personnes à leur position initiale
            person.group.position.set(0, PERSON_RADIUS, 0);
            person.group.rotation.set(0, 0, 0);
        });
        
        // Mettre à jour l'état du bouton de configuration
        this.updateConfigButtonState();
    }

    // Méthode pour mettre à jour les participants en cours de partie
    updateParticipants(participants) {
        if (this.currentPicker === 'wheel') {
            if (this.wheel) {
                this.wheel.setParticipants(participants);
            }
            return;
        }

        // Mode 3D
        if (!this.scene) {
            this.scene = new Scene();
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        }

        const oldCount = this.persons.length;
        
        // Si aucun participant actif, masquer tous les personnages
        if (participants.length === 0) {
            this.persons.forEach(person => {
                this.scene.scene.remove(person.group);
            });
            this.persons = [];
            this.updateConfigButtonState();
            return;
        }
        
        // Mise à jour intelligente : ne recréer que si nécessaire
        if (this.shouldRecreatePersons(participants)) {
            this.createPersons(participants);
            
            // Si on a moins de participants qu'avant, réinitialiser le jeu
            if (participants.length < oldCount) {
                this.resetGame();
            }
        } else {
            // Mise à jour individuelle des participants existants
            this.updateExistingPersons(participants);
        }
    }
    
    // Vérifie si on doit recréer tous les personnages
    shouldRecreatePersons(newParticipants) {
        if (newParticipants.length !== this.persons.length) {
            return true;
        }
        
        // Vérifier si les noms ou les photos ont changé
        for (let i = 0; i < newParticipants.length; i++) {
            const newP = newParticipants[i];
            const oldP = this.persons[i];
            
            if (!oldP || newP.name !== oldP.name || newP.faceUrl !== oldP.faceUrl) {
                return true;
            }
        }
        
        return false;
    }
    
    // Met à jour les personnages existants sans les recréer
    updateExistingPersons(participants) {
        // Mettre à jour les noms des personnages existants
        for (let i = 0; i < Math.min(participants.length, this.persons.length); i++) {
            const participant = participants[i];
            const person = this.persons[i];
            
            if (person && participant.name !== person.group.userData.name) {
                person.group.userData.name = participant.name;
            }
            
            // Mettre à jour la face si elle a changé
            if (person && participant.faceUrl !== person.faceUrl) {
                person.updateFace(participant.faceUrl);
            }
        }
    }



    // Méthode pour mettre à jour l'état visuel du bouton de configuration
    updateConfigButtonState() {
        const configButton = document.getElementById('config-button');
        if (configButton) {
            if (this.persons.length > 0) {
                configButton.classList.add('game-active');
            } else {
                configButton.classList.remove('game-active');
            }
        }
    }

    handleClick() {
        if (this.persons.length === 0) return;

        if (!this.running && !this.spotlightPhase) {
            this.startRace();
        } else if (this.spotlightPhase) {
            this.removePerson();
        }
    }

    startRace() {
        this.running = true;
        this.persons.forEach(person => person.startRunning());

        setTimeout(() => {
            this.running = false;
            this.persons.forEach(person => person.stopRunning());
            this.startSpotlightPhase();
        }, 2000);
    }

    startSpotlightPhase() {
        this.chosenIdx = Math.floor(Math.random() * this.persons.length);
        const chosenPerson = this.persons[this.chosenIdx];

        this.scene.spotlight.visible = true;
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = true;
        // Pas de halo pendant la transition de lock
        if (this.scene.halo) this.scene.halo.setVisible(false);
        this.spotlightPhase = true;

        // Configuration transition de lock
        this._lockStart = performance.now();
        this._lockDuration = 800; // ms
        this._locking = true;

        // Affiche le prénom (apparaîtra bien placé à la fin du lock)
        if (this.nameEl) {
            this.nameEl.textContent = chosenPerson.group.userData.name || '';
            this.nameEl.style.display = 'block';
            this.updateNameLabelPosition();
        }
    }

    removePerson() {
        if (this.chosenIdx !== null && this.persons[this.chosenIdx]) {
            const personToRemove = this.persons[this.chosenIdx];
            this.scene.scene.remove(personToRemove.group);
            this.persons.splice(this.chosenIdx, 1);
        }
        
        this.scene.spotlight.visible = false;
        if (this.scene.halo) this.scene.halo.setVisible(false);
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = false;
        this.chosenIdx = null;
        this.spotlightPhase = false;

        // Masque l'étiquette
        if (this.nameEl) {
            this.nameEl.style.display = 'none';
        }
    }

    update() {
        if (!this.scene) return;  // Ne rien faire si la scène n'est pas active
        
        const now = performance.now();
        const dt = Math.min((now - this._lastTick) / 1000, 0.05);
        this._lastTick = now;

        if (this.running) {
            this.persons.forEach(person => person.update());
            // Mouvement de projecteur en mode hélicoptère pendant que tout le monde court
            this.scene.spotlight.visible = true;
            if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = true;
            if (this.scene.halo) this.scene.halo.setVisible(false);
            this.scene.updateSpotlightScan(dt, this.persons);
        }

        if (this.spotlightPhase && this.chosenIdx !== null) {
            const chosenPerson = this.persons[this.chosenIdx];
            if (chosenPerson) {
                // Transition de lock: rapprocher progressivement le faisceau de la personne
                if (this._locking) {
                    const t = Math.min(1, (performance.now() - this._lockStart) / this._lockDuration);
                    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
                    const from = this.scene._currentSpotTarget || chosenPerson.group.position;
                    const to = chosenPerson.group.position;
                    const target = new THREE.Vector3().copy(from).lerp(to, eased);
                    if (this.scene.halo) this.scene.halo.setVisible(false);
                    this.scene.updateSpotlight(target);

                    if (t >= 1) {
                        // Lock terminé: activer halo et démarrer une courte anticipation avant la montée
                        if (this.scene.halo) this.scene.halo.setVisible(true);
                        chosenPerson.group.liftStart = performance.now();
                        chosenPerson.group.flyStart = null; // sera défini après l'anticipation
                        chosenPerson.group.rotation.set(0, 0, 0);
                        this._locking = false;
                    }
                } else {
                    this.scene.updateSpotlight(chosenPerson.group.position);
                    this.updateFlyingAnimation(chosenPerson);
                }
                // Met à jour la position de l'étiquette
                this.updateNameLabelPosition();
            }
        }
    }

    updateFlyingAnimation(person) {
        // Phase d'anticipation (pré-lift): légère flexion vers le bas avant de s'élever
        if (person.group.liftStart && !person.group.flyStart) {
            const elapsedLift = performance.now() - person.group.liftStart;
            const preLiftDuration = 300; // ms
            const t = Math.min(1, elapsedLift / preLiftDuration);
            const easedIn = Math.pow(t, 2); // easeInQuad pour comprimer
            const easedOut = 1 - Math.pow(1 - t, 2); // easeOutQuad pour release
            // Petite descente (squat) puis retour à la base
            const downAmt = 0.25; // unités monde
            const baseY = PERSON_RADIUS;
            // Descendre un peu puis remonter sur la fin de l'anticipation
            const yOffset = (t < 0.5)
                ? -downAmt * (easedIn * 2) // va vers -downAmt
                : -downAmt * (1 - (easedOut * 2 - 1)); // remonte à 0
            person.group.position.y = baseY + yOffset;
            // Squash/Stretch très léger visuel via rotation X
            person.group.rotation.x = -0.08 * Math.sin(t * Math.PI);
            if (t >= 1) {
                // Début de la montée
                person.group.flyStart = performance.now();
                person.group.liftStart = null;
                // Reset rotation X pour la montée
                person.group.rotation.x = 0;
            }
            return;
        }
        if (!person.group.flyStart) return;
        
        const elapsed = performance.now() - person.group.flyStart;
        const riseDurationMs = 1200;
        if (elapsed < riseDurationMs) {
            const t = elapsed / riseDurationMs;
            // Lissage pour une montée douce (easeOutCubic)
            const eased = 1 - Math.pow(1 - t, 3);
            person.group.position.y = PERSON_RADIUS + 2 * eased;
            // Pas de rotation pendant la montée
            return;
        }

        // Flottement 3D après la montée
        const floatT = (elapsed - riseDurationMs) / 1000;
        const baseY = PERSON_RADIUS + 2;
        const bob = Math.sin(floatT * 2.2) * 0.3; // amplitude 0.3u
        person.group.position.y = baseY + bob;

        // Inclinaisons douces X/Z et légère rotation Y continue
        person.group.rotation.x = Math.sin(floatT * 1.7) * 0.12;
        person.group.rotation.z = Math.cos(floatT * 1.3) * 0.08;
        person.group.rotation.y = floatT * 0.5; // ~0.5 rad/s
    }

    // Positionne #name-display sous la personne sélectionnée
    updateNameLabelPosition() {
        if (!this.nameEl || this.chosenIdx === null) return;
        const chosenPerson = this.persons[this.chosenIdx];
        if (!chosenPerson) return;

        const worldPos = chosenPerson.group.position.clone();
        // Décale vers le bas en unités monde pour apparaître sous la personne
        worldPos.y -= PERSON_RADIUS * 0.9;

        const projected = worldPos.clone().project(this.scene.camera);

        const width = this.scene.renderer.domElement.clientWidth;
        const height = this.scene.renderer.domElement.clientHeight;

        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height + 16; // léger offset vers le bas en px

        // Si derrière la caméra, masque
        if (projected.z > 1) {
            this.nameEl.style.display = 'none';
            return;
        } else {
            this.nameEl.style.display = 'block';
        }

        this.nameEl.style.left = `${x}px`;
        this.nameEl.style.top = `${y}px`;
        this.nameEl.style.bottom = 'auto';
        this.nameEl.style.transform = 'translate(-50%, 0)';
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.currentPicker === '3d' && this.scene) {
            this.update();
            this.scene.render();
        }
    }
}

// Lancement du jeu
window.addEventListener('load', () => {
    new Game();
});
