import { ParticipantManager } from './participants.js';
import { PERSON_RADIUS, SCENE_SIZE, COLORS } from './constants.js';
import { Person } from './Person.js';
import { Scene } from './scene.js';

class Game {
    constructor() {
        this.scene = new Scene();
        this.persons = [];
        this.running = false;
        this.spotlightPhase = false;
        this.chosenIdx = null;
        this.participantManager = new ParticipantManager();
        this.participantManager.setGameReference(this);
        this.init();
    }

    init() {
        // Attendre que les participants soient configurés
        window.addEventListener('participantsReady', (event) => {
            this.createPersons(event.detail);
        });

        this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        
        // Prépare l'étiquette de nom
        this.nameEl = document.getElementById('name-display');
        if (this.nameEl) {
            this.nameEl.style.display = 'none';
            this.nameEl.style.bottom = 'auto';
        }

        this.animate();
    }

    createPersons(participants) {
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
        // Arrêter toutes les animations en cours
        this.running = false;
        this.spotlightPhase = false;
        this.chosenIdx = null;
        
        // Masquer le spotlight et le halo
        this.scene.spotlight.visible = false;
        if (this.scene.halo) this.scene.halo.setVisible(false);
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = false;
        
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
        if (this.scene.halo) this.scene.halo.setVisible(true);
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = true;
        this.spotlightPhase = true;
        chosenPerson.group.flyStart = performance.now();
        // Remise à zéro des rotations pour un flottement propre
        chosenPerson.group.rotation.set(0, 0, 0);

        // Affiche le prénom sous la personne
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
        if (this.running) {
            this.persons.forEach(person => person.update());
        }

        if (this.spotlightPhase && this.chosenIdx !== null) {
            const chosenPerson = this.persons[this.chosenIdx];
            if (chosenPerson) {
                this.scene.updateSpotlight(chosenPerson.group.position);
                this.updateFlyingAnimation(chosenPerson);
                // Met à jour la position de l'étiquette
                this.updateNameLabelPosition();
            }
        }
    }

    updateFlyingAnimation(person) {
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
        this.update();
        this.scene.render();
    }
}

// Lancement du jeu
window.addEventListener('load', () => {
    new Game();
});
