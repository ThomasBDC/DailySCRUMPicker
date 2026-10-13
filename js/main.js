import { ParticipantManager, announcePick } from './participants.js';
import { PERSON_RADIUS, SCENE_SIZE, COLORS } from './constants.js';
import { Person } from './Person.js';
import { Scene } from './scene.js';
import { WheelPicker } from './wheel.js';
import { TapTaupePicker } from './taptaup.js';
import { PackOpeningPicker } from './pack.js';
import { AudioManager } from './audio.js';
import { MusicPanel } from './musicPanel.js';
import { setupSettingsTransfer, PICKER_TYPES } from './settings.js';
import { loadSearchDuration, saveSearchDuration, formatSeconds, SEARCH_DURATION_MIN, SEARCH_DURATION_MAX, loadDecor, saveDecor } from './ovniSettings.js';
import { CardsModal } from './cardsModal.js';

class Game {
    constructor() {
        // Initialiser le gestionnaire audio
        this.audioManager = new AudioManager();
        
        // Clé pour le localStorage
        this.pickerStorageKey = 'dsp_picker_type';
        // Charger le type de picker sauvegardé ou utiliser la valeur par défaut
        const savedPicker = localStorage.getItem(this.pickerStorageKey);
        this.currentPicker = PICKER_TYPES.includes(savedPicker) ? savedPicker : '3d';
        
        // Initialiser les propriétés de base
        this.scene = null;
        this.wheel = null;
        this.taptaup = null;
        this.pack = null;
        this.persons = [];
        this.running = false;
        this.spotlightPhase = false;
        this.chosenIdx = null;
        // Personnages enlevés en train d'être aspirés dans l'OVNI
        this.departing = [];
        this._raceTimer = null;
        // Durée de la course avant que l'OVNI choisisse (s), réglable dans le panneau
        this.searchDuration = loadSearchDuration();
        // Décor de la scène (Fall Guys ou nuit), réglable dans le panneau
        this.ovniDecor = loadDecor();
        this.bindOvniSettings();
        
        this.participantManager = new ParticipantManager();
        this.participantManager.setGameReference(this);

        // Modale de configuration des cartes du pack opening
        this.cardsModal = new CardsModal(this.participantManager);

        // Onglet Musiques du panneau de configuration
        this.musicPanel = new MusicPanel(this.audioManager);

        // Export / import de toute la configuration
        setupSettingsTransfer();
        
        // Initialiser le bon mode dès le départ
        if (this.currentPicker === '3d') {
            this.scene = new Scene(this.ovniDecor);
        }
        
        // Avant init(), qui lance déjà la boucle d'animation (sinon le premier dt vaut NaN)
        this._lastTick = performance.now();
        this.init();
        
        // Ajouter le gestionnaire pour le changement de type de picker
        document.querySelectorAll('input[name="picker-type"]').forEach((radio) => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) this.switchPicker(e.target.value);
            });
        });

        // Ajouter le gestionnaire pour le bouton mute
        document.getElementById('mute-button').addEventListener('click', () => {
            this.toggleMute();
        });
    }

    init() {
        // Cocher le type de picker sauvegardé
        const pickerRadio = document.querySelector(`input[name="picker-type"][value="${this.currentPicker}"]`);
        if (pickerRadio) {
            pickerRadio.checked = true;
        }
        this.updatePickerSettings();
        
        // Initialiser l'affichage correct au démarrage
        if (this.currentPicker === 'wheel') {
            this.wheel = new WheelPicker(document.body, this.audioManager);
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
        } else if (this.currentPicker === 'taptaup') {
            this.taptaup = new TapTaupePicker(document.body, this.audioManager);
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
        } else if (this.currentPicker === 'pack') {
            this.pack = new PackOpeningPicker(document.body, this.audioManager);
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
        } else if (this.currentPicker === '3d') {
            if (!this.scene) {
                this.scene = new Scene(this.ovniDecor);
            }
            this.scene.renderer.domElement.style.display = 'block';
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
            if (this.wheel) {
                this.wheel.canvas.style.display = 'none';
            }
        }

        // Attendre que les participants soient configurés
        window.addEventListener('participantsReady', (event) => {
            if (this.currentPicker === '3d') {
                this.createPersons(event.detail);
            } else if (this.currentPicker === 'wheel' && this.wheel) {
                this.wheel.setParticipants(event.detail);
            } else if (this.currentPicker === 'taptaup' && this.taptaup) {
                this.taptaup.setParticipants(event.detail);
            } else if (this.currentPicker === 'pack' && this.pack) {
                this.pack.setParticipants(event.detail);
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
        
        this.updatePickerSettings();
        this.audioManager.stopAll();

        // Changer de sélecteur commence un nouveau tour
        this.participantManager.resetRound();

        // L'étiquette de nom d'un autre sélecteur ne doit pas rester affichée
        if (this.nameEl) {
            this.nameEl.style.display = 'none';
        }

        // Cacher/montrer les éléments appropriés
        if (this.pack && type !== 'pack') {
            this.pack.hide();
        }
        if (this.taptaup && type !== 'taptaup') {
            this.taptaup.hide();
        }
        if (type === 'pack') {
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
            if (this.wheel) {
                this.wheel.canvas.style.display = 'none';
            }
            if (!this.pack) {
                this.pack = new PackOpeningPicker(document.body, this.audioManager);
            } else {
                this.pack.show();
            }
            this.pack.setParticipants(this.participantManager.participants);
        } else if (type === 'wheel') {
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
            if (!this.wheel) {
                this.wheel = new WheelPicker(document.body, this.audioManager);
                // Si des participants sont déjà configurés, les ajouter à la roue
                if (this.participantManager.participants.length > 0) {
                    this.wheel.setParticipants(this.participantManager.participants);
                }
            } else {
                this.wheel.canvas.style.display = 'block';
            }
        } else if (type === 'taptaup') {
            if (this.scene) {
                this.scene.renderer.domElement.style.display = 'none';
            }
            if (this.wheel) {
                this.wheel.canvas.style.display = 'none';
            }
            if (!this.taptaup) {
                this.taptaup = new TapTaupePicker(document.body, this.audioManager);
            } else {
                this.taptaup.show();
            }
            this.taptaup.setParticipants(this.participantManager.participants);
        } else {
            // Mode 3D
            if (this.wheel) {
                this.wheel.canvas.style.display = 'none';
            }
            if (!this.scene) {
                this.scene = new Scene(this.ovniDecor);
                this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
            }
            this.scene.renderer.domElement.style.display = 'block';
            // Nouveau tour : tous les participants reviennent sur le terrain (comme les autres
            // sélecteurs, qui reçoivent la liste ci-dessus), sans attendre « Commencer »
            this.resetGame();
            this.createPersons(this.participantManager.participants);
        }
    }

    // Curseur « Durée de la recherche » et choix du décor du mode Enlèvement OVNI
    bindOvniSettings() {
        const decorSelect = document.getElementById('ovni-decor');
        if (decorSelect) {
            decorSelect.value = this.ovniDecor;
            decorSelect.addEventListener('change', () => {
                this.ovniDecor = decorSelect.value;
                saveDecor(this.ovniDecor);
                if (this.scene) this.scene.setDecor(this.ovniDecor);
            });
        }

        const input = document.getElementById('ovni-search-duration');
        const output = document.getElementById('ovni-search-duration-value');
        if (!input) return;
        input.min = String(SEARCH_DURATION_MIN);
        input.max = String(SEARCH_DURATION_MAX);
        input.value = String(this.searchDuration);
        if (output) output.textContent = formatSeconds(this.searchDuration);
        input.addEventListener('input', () => {
            this.searchDuration = Number(input.value);
            saveSearchDuration(this.searchDuration);
            if (output) output.textContent = formatSeconds(this.searchDuration);
        });
    }

    // Affiche les réglages propres au sélecteur courant dans le panneau de configuration
    updatePickerSettings() {
        const ovniSettings = document.getElementById('ovni-settings');
        if (ovniSettings) {
            ovniSettings.hidden = this.currentPicker !== '3d';
        }
        const packSettings = document.getElementById('pack-settings');
        if (packSettings) {
            packSettings.hidden = this.currentPicker !== 'pack';
        }
        const wheelSettings = document.getElementById('wheel-settings');
        if (wheelSettings) {
            wheelSettings.hidden = this.currentPicker !== 'wheel';
        }
        const taptaupSettings = document.getElementById('taptaup-settings');
        if (taptaupSettings) {
            taptaupSettings.hidden = this.currentPicker !== 'taptaup';
        }
    }

    createPersons(participants) {
        if (this.currentPicker === 'wheel') {
            if (!this.wheel) {
                this.wheel = new WheelPicker(document.body, this.audioManager);
            }
            this.wheel.setParticipants(participants);
            return;
        }

        if (this.currentPicker === 'taptaup') {
            if (!this.taptaup) {
                this.taptaup = new TapTaupePicker(document.body, this.audioManager);
            }
            this.taptaup.setParticipants(participants);
            return;
        }

        if (this.currentPicker === 'pack') {
            if (!this.pack) {
                this.pack = new PackOpeningPicker(document.body, this.audioManager);
            }
            this.pack.setParticipants(participants);
            this.pack.reset();
            return;
        }

        // Mode 3D
        if (!this.scene) {
            this.scene = new Scene(this.ovniDecor);
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        }

        // Nettoyer les personnes existantes
        this.persons.forEach(person => {
            person.dispose();
            this.scene.scene.remove(person.group);
        });
        this.persons = [];
        this.clearDepartures();

        // Créer les nouvelles personnes
        for (let i = 0; i < participants.length; i++) {
            const color = COLORS[i % COLORS.length];
            const person = new Person(color, participants[i].faceUrl, this.scene.arena);
            person.group.userData.name = participants[i].name;
            person.group.userData.participantId = participants[i].id;
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
        this.audioManager.stopAll();

        if (this.currentPicker === 'wheel') {
            if (this.wheel) {
                this.wheel.reset();
            }
        } else if (this.currentPicker === 'taptaup') {
            if (this.taptaup) {
                this.taptaup.reset();
            }
        } else if (this.currentPicker === 'pack') {
            if (this.pack) {
                this.pack.reset();
            }
        } else {
            // Mode 3D
            this.spotlightPhase = false;
            clearTimeout(this._raceTimer);
            this.clearDepartures();

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
        
        // Arrêter toutes les personnes et les remettre au sol, au repos
        this.persons.forEach(person => person.reset());
        
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

        if (this.currentPicker === 'taptaup') {
            // Une partie en cours est interrompue par le sélecteur lui-même
            if (this.taptaup) {
                this.taptaup.setParticipants(participants);
            }
            return;
        }

        if (this.currentPicker === 'pack') {
            if (this.pack) {
                this.pack.setParticipants(participants);
            }
            return;
        }

        // Mode 3D
        if (!this.scene) {
            this.scene = new Scene(this.ovniDecor);
            this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        }

        const oldCount = this.persons.length;
        
        // Si aucun participant actif, masquer tous les personnages
        if (participants.length === 0) {
            this.persons.forEach(person => {
                person.dispose();
                this.scene.scene.remove(person.group);
            });
            this.persons = [];
            this.updateConfigButtonState();
            return;
        }
        
        // Mise à jour intelligente : ne recréer que si nécessaire
        if (this.shouldRecreatePersons(participants)) {
            this.createPersons(participants);
            
            // Si on a moins de participants qu'avant, ou si un tirage visait un personnage recréé,
            // réinitialiser le jeu
            if (participants.length < oldCount || this.running || this.spotlightPhase) {
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
        this.persons.forEach(person => person.startRunning(this.persons));
        this.scene.startScan();

        // Démarre la musique de sélection avec fade in
        this.audioManager.playSelectionMusic('3d');
        this._raceTimer = setTimeout(() => {
            this.running = false;

            // Arrête la musique avec fade out
            this.audioManager.stopSelectionMusic();

            // Tout le monde s'arrête, sauf l'élu qui détale sous le projecteur
            this.startSpotlightPhase();
        }, this.searchDuration * 1000);
    }

    startSpotlightPhase() {
        // L'élu est celui que le projecteur a sous la main (il bouge au hasard, le tirage aussi)
        const candidate = this.scene.pickCatchCandidate(this.persons);
        this.chosenIdx = candidate ? this.persons.indexOf(candidate) : Math.floor(Math.random() * this.persons.length);
        const chosenPerson = this.persons[this.chosenIdx];

        announcePick(chosenPerson.group.userData.participantId);

        // Les autres s'arrêtent et se retournent pour regarder l'élu,
        // qui continue de courir en paniquant pendant que le projecteur le traque
        this.persons.forEach(person => {
            if (person === chosenPerson) return;
            person.stopRunning();
            person.watch(chosenPerson.group.position);
        });
        chosenPerson.panic();

        // Musique de la personne choisie
        this.audioManager.playPickSound('3d');

        this.scene.spotlight.visible = true;
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = true;
        this.scene.setBeamFade(1);
        // Pas de halo pendant la traque
        if (this.scene.halo) this.scene.halo.setVisible(false);
        this.spotlightPhase = true;

        // Traque : le projecteur fond sur l'élu jusqu'à le tenir (voir update)
        this._huntStart = performance.now();
        this._hunting = true;

        // Affiche le prénom sous l'élu
        if (this.nameEl) {
            this.nameEl.textContent = chosenPerson.group.userData.name || '';
            this.nameEl.style.display = 'block';
            this.updateNameLabelPosition();
        }
    }

    removePerson() {
        this.audioManager.stopPickSound();
        const chosenPerson = this.chosenIdx !== null ? this.persons[this.chosenIdx] : null;
        if (chosenPerson) {
            // Il est aspiré dans l'OVNI avant de disparaître (voir updateDepartures)
            this.persons.splice(this.chosenIdx, 1);
            chosenPerson.startDeparture();
            this.departing.push(chosenPerson);
        }
        this.persons.forEach(person => person.watch(null));

        if (this.scene.halo) this.scene.halo.setVisible(false);
        this.chosenIdx = null;
        this.spotlightPhase = false;
        if (!chosenPerson) this.hideSpotlightIfIdle();

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

        // Course, dérapage à l'arrêt et attente (l'élu, lui, est animé par l'enlèvement)
        // Pendant la course, ils fuient le faisceau qui les cherche
        const danger = this.running ? this.scene.spotlightTarget.position : null;
        this.persons.forEach(person => person.update(this.persons, dt, danger));
        this.scene.updateDecor(dt);

        if (this.running) {
            // Le projecteur cherche parmi les coureurs
            this.scene.spotlight.visible = true;
            if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = true;
            if (this.scene.halo) this.scene.halo.setVisible(false);
            this.scene.setBeamFade(1);
            this.scene.updateSpotlightScan(dt, this.persons);
        }

        if (this.spotlightPhase && this.chosenIdx !== null) {
            const chosenPerson = this.persons[this.chosenIdx];
            if (chosenPerson) {
                if (this._hunting) {
                    // Traque : le faisceau fond sur l'élu qui court toujours
                    const elapsed = (now - this._huntStart) / 1000;
                    if (this.scene.huntSpotlight(dt, chosenPerson, elapsed)) {
                        // Attrapé : le rayon le soulève puis l'amène devant la caméra (qui ne bouge pas)
                        this._hunting = false;
                        if (this.scene.halo) this.scene.halo.setVisible(true);
                        chosenPerson.startAbduction(this.getShowcasePoint(), this.scene.camera.position);
                        // Les autres sursautent, chacun avec son temps de réaction
                        this.persons.forEach(person => {
                            if (person !== chosenPerson) person.startle(Math.random() * 0.3);
                        });
                    }
                } else {
                    chosenPerson.updateAbduction(dt);
                    const fade = this.getBeamFade(chosenPerson);
                    this.scene.setBeamFade(fade);
                    if (this.scene.halo) this.scene.halo.setVisible(fade > 0.3);
                    this.scene.followSpotlight(dt, chosenPerson.group.position);
                }
                // Met à jour la position de l'étiquette
                this.updateNameLabelPosition();
            }
        }

        this.updateDepartures(dt);
    }

    // Point devant la caméra où l'élu vient se présenter : assez près pour bien le voir,
    // en restant entier à l'écran (plus loin sur un écran étroit)
    getShowcasePoint() {
        const camera = this.scene.camera;
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const distance = Math.max(
            2.4 / (0.35 * 2 * halfTan),               // ~35 % de la hauteur de l'écran
            3.4 / (0.7 * 2 * halfTan * camera.aspect) // bras levés compris dans 70 % de la largeur
        );
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const point = camera.position.clone().addScaledVector(forward, distance);
        point.y += PERSON_RADIUS * 0.4; // laisse la place au prénom, affiché sous les pieds
        this._showcaseDistanceXZ = Math.hypot(point.x - camera.position.x, point.z - camera.position.z);
        return point;
    }

    // Le faisceau s'efface quand l'élu approche de la caméra : sinon son cône voile tout l'écran
    getBeamFade(person) {
        const camera = this.scene.camera.position;
        const distanceXZ = Math.hypot(person.group.position.x - camera.x, person.group.position.z - camera.z);
        const showcase = this._showcaseDistanceXZ || 0;
        return THREE.MathUtils.smoothstep(distanceXZ, showcase + 1, showcase + 6);
    }

    updateDepartures(dt) {
        if (this.departing.length === 0) return;
        this.departing = this.departing.filter(person => {
            const done = person.updateDeparture(dt);
            if (!this.running && !this.spotlightPhase) {
                this.scene.setBeamFade(this.getBeamFade(person));
                this.scene.updateSpotlight(person.group.position);
            }
            if (done) {
                person.dispose();
                this.scene.scene.remove(person.group);
            }
            return !done;
        });
        if (this.departing.length === 0) this.hideSpotlightIfIdle();
    }

    clearDepartures() {
        if (this.scene) this.departing.forEach(person => {
            person.dispose();
            this.scene.scene.remove(person.group);
        });
        this.departing = [];
    }

    // Éteint le projecteur s'il ne sert plus (ni course, ni enlèvement en cours)
    hideSpotlightIfIdle() {
        if (!this.scene || this.running || this.spotlightPhase) return;
        this.scene.spotlight.visible = false;
        if (this.scene.halo) this.scene.halo.setVisible(false);
        if (this.scene.spotlightBeam) this.scene.spotlightBeam.visible = false;
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

    toggleMute() {
        const isMuted = this.audioManager.toggleMute();
        const muteButton = document.getElementById('mute-button');
        const muteIcon = document.getElementById('mute-icon');
        
        muteButton.setAttribute('aria-label', isMuted ? 'Remettre le son' : 'Couper le son');
        if (isMuted) {
            muteButton.classList.add('muted');
            muteIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
        } else {
            muteButton.classList.remove('muted');
            muteIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
        }
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
