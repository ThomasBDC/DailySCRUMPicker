import { resizeImage } from './image.js';

export class Participant {
    constructor(name, faceUrl = null, display = true, id = null, attacks = undefined) {
        this.id = id;
        this.name = name;
        this.faceUrl = faceUrl;
        this.display = display;
        // Attaques de sa carte (pack opening) : undefined tant qu'elles n'ont pas été configurées
        this.attacks = attacks;
        this.mesh = null;
    }
}

export const MAX_ATTACKS = 8;
export const ATTACK_MAX_LENGTH = 30;

// Liste d'attaques valide (noms non vides, sans doublon), ou undefined si ce n'est pas une liste
export function cleanAttacks(value) {
    if (!Array.isArray(value)) return undefined;
    const seen = new Set();
    return value
        .filter(name => typeof name === 'string')
        .map(name => name.trim().slice(0, ATTACK_MAX_LENGTH))
        .filter(name => {
            const key = name.toLowerCase();
            if (!name || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_ATTACKS);
}

// Les sélecteurs signalent qui vient d'être tiré au sort, et le début d'un nouveau tour
export function announcePick(participantId) {
    if (participantId) {
        window.dispatchEvent(new CustomEvent('participantPicked', { detail: { id: participantId } }));
    }
}

export function announceRoundReset() {
    window.dispatchEvent(new CustomEvent('pickerRoundReset'));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOAST_DURATION = 5000; // ms pendant lesquels une suppression peut être annulée
const FACE_MAX_SIZE = 400; // px, la photo est réduite avant d'être stockée

export class ParticipantManager {
    constructor() {
        this.participants = [];
        this.cookieKey = 'dsp_participants';
        this.storageKey = 'dsp_participants_v2';
        this.setupFormElement = document.getElementById('setup-form');
        this.overlayElement = document.getElementById('offcanvas-overlay');
        this.listElement = document.getElementById('participants-list');
        this.quickAddInput = document.getElementById('quick-add-input');
        this.toastElement = document.getElementById('panel-toast');
        this.game = null; // Référence vers l'instance du jeu
        this.updateTimeout = null; // Pour éviter les mises à jour trop fréquentes
        this.toastTimeout = null;
        this.toastAction = null;
        this.nextId = 1;
        this.passedIds = []; // participants déjà tirés pendant le tour en cours, dans l'ordre
        this.currentId = null; // dernier participant tiré au sort (celui qui parle)

        // S'assurer que le panneau est masqué au démarrage
        if (this.setupFormElement) {
            this.setupFormElement.classList.remove('active');
        }
        if (this.overlayElement) {
            this.overlayElement.classList.remove('active');
        }

        this.setupListeners();
        this.loadPreferences();
        this.refreshSummary();
    }

    setGameReference(game) {
        this.game = game;
    }

    setupListeners() {
        // Ouverture / fermeture du panneau
        document.getElementById('config-button').addEventListener('click', () => this.openConfigPanel());
        document.getElementById('close-config').addEventListener('click', () => this.closeConfigPanel());
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) {
                this.closeConfigPanel();
            }
        });

        // Onglets
        this.setupFormElement.querySelectorAll('.panel-tab').forEach((tab) => {
            tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
        });

        // Ajout rapide : on tape un nom puis Entrée
        document.getElementById('quick-add').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = this.quickAddInput.value.trim();
            const row = this.addParticipantRow(name || null);
            this.quickAddInput.value = '';
            this.scheduleUpdate();
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (name) {
                this.quickAddInput.focus();
            } else {
                // Sans nom saisi, on donne directement la main sur le nom par défaut
                const nameInput = row.querySelector('.participant-name');
                nameInput.focus();
                nameInput.select();
            }
        });

        // Tous présents / tous absents
        document.getElementById('select-all').addEventListener('click', () => this.setAllPresent(true));
        document.getElementById('select-none').addEventListener('click', () => this.setAllPresent(false));

        // Boutons de partie
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('restart-game').addEventListener('click', () => this.restartGame());

        // Suivi des passages pendant la partie
        window.addEventListener('participantPicked', (e) => this.markPassed(e.detail.id));
        window.addEventListener('pickerRoundReset', () => {
            this.resetRound();
            this.game?.updateParticipants(this.participants);
        });

        // Délégation d'événements sur la liste
        this.listElement.addEventListener('click', (e) => {
            const row = e.target.closest('.participant-row');
            if (!row) return;
            if (e.target.closest('.status-chip')) {
                this.togglePassed(row.dataset.id);
            } else if (e.target.closest('.remove-participant')) {
                this.removeParticipantRow(row);
            } else if (e.target.closest('.avatar')) {
                row.querySelector('.face-input')?.click();
            }
        });

        this.listElement.addEventListener('input', (e) => {
            if (e.target.matches('.participant-name')) {
                this.updateAvatar(e.target.closest('.participant-row'));
                this.scheduleUpdate();
            }
        });

        this.listElement.addEventListener('keydown', (e) => {
            // Entrée valide le nom saisi
            if (e.key === 'Enter' && e.target.matches('.participant-name')) {
                e.preventDefault();
                e.target.blur();
            }
        });

        this.listElement.addEventListener('change', async (e) => {
            const row = e.target.closest('.participant-row');
            if (!row) return;
            if (e.target.matches('.display-input')) {
                row.classList.toggle('is-absent', !e.target.checked);
                this.scheduleUpdate();
            } else if (e.target.matches('.face-input')) {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                    row.dataset.faceUrl = await resizeImage(file, FACE_MAX_SIZE);
                    this.updateAvatar(row);
                    this.scheduleUpdate();
                } catch (error) {
                    console.warn('Impossible de lire la photo :', error);
                }
            }
        });

        // Annulation depuis le toast
        this.toastElement.querySelector('.panel-toast-action').addEventListener('click', () => {
            const action = this.toastAction;
            this.hideToast();
            action?.();
        });

        // Fermer avec la touche Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isConfigPanelOpen()) {
                this.closeConfigPanel();
            }
        });
    }

    openConfigPanel() {
        this.setupFormElement?.classList.add('active');
        this.overlayElement?.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Afficher un message informatif si le jeu est actif
        if (this.isRoundActive() || (this.game && this.game.persons.length > 0)) {
            this.showGameActiveMessage();
        }
    }

    closeConfigPanel() {
        this.setupFormElement?.classList.remove('active');
        this.overlayElement?.classList.remove('active');
        document.body.style.overflow = '';
        this.hideGameActiveMessage();
        // Le panneau fermé, une suppression ne peut plus être annulée
        this.hideToast();
        document.activeElement?.blur();
    }

    isConfigPanelOpen() {
        return this.setupFormElement && this.setupFormElement.classList.contains('active');
    }

    showTab(name) {
        this.setupFormElement.querySelectorAll('.panel-tab').forEach((tab) => {
            const selected = tab.dataset.tab === name;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', String(selected));
        });
        this.setupFormElement.querySelectorAll('.panel-section').forEach((section) => {
            section.hidden = section.dataset.panel !== name;
        });
    }

    addParticipantRow(name, faceUrl = null, display = true, id = null, attacks = undefined) {
        const row = document.createElement('li');
        row.className = 'participant-row';
        row.classList.toggle('is-absent', !display);
        row.dataset.id = id || `p${this.nextId++}`;
        row.dataset.faceUrl = faceUrl || '';
        if (attacks) row.dataset.attacks = JSON.stringify(attacks);

        const avatar = document.createElement('button');
        avatar.type = 'button';
        avatar.className = 'avatar';
        avatar.title = 'Changer la photo';
        avatar.setAttribute('aria-label', 'Changer la photo');

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'face-input';
        fileInput.accept = 'image/*';
        fileInput.hidden = true;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'participant-name';
        nameInput.placeholder = 'Nom du participant';
        nameInput.maxLength = 40;
        nameInput.value = name || `Participant ${this.listElement.children.length + 1}`;
        nameInput.setAttribute('aria-label', 'Nom du participant');

        const status = document.createElement('button');
        status.type = 'button';
        status.className = 'status-chip';
        status.hidden = true;

        const toggle = document.createElement('label');
        toggle.className = 'switch';
        toggle.title = 'Présent / absent';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'display-input';
        checkbox.checked = display;
        checkbox.setAttribute('aria-label', 'Présent');
        const track = document.createElement('span');
        track.className = 'switch-track';
        toggle.append(checkbox, track);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-button remove-participant';
        remove.title = 'Supprimer';
        remove.setAttribute('aria-label', 'Supprimer');
        remove.appendChild(this.#icon('M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'));

        row.append(avatar, fileInput, nameInput, status, toggle, remove);
        this.listElement.appendChild(row);
        this.updateAvatar(row);
        this.updateStatus(row);
        return row;
    }

    // Photo si disponible, sinon initiales sur une couleur dérivée du nom
    updateAvatar(row) {
        const avatar = row.querySelector('.avatar');
        const name = row.querySelector('.participant-name').value.trim();
        const faceUrl = row.dataset.faceUrl;
        avatar.replaceChildren();
        if (faceUrl) {
            const img = document.createElement('img');
            img.className = 'face-thumb';
            img.src = faceUrl;
            img.alt = '';
            avatar.appendChild(img);
            avatar.style.removeProperty('--avatar-hue');
        } else {
            const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
            avatar.textContent = initials || '?';
            let hash = 0;
            for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
            avatar.style.setProperty('--avatar-hue', hash);
        }
    }

    removeParticipantRow(row) {
        const data = this.#readRow(row, 0);
        const nextRow = row.nextElementSibling;
        row.remove();
        this.scheduleUpdate();

        this.showToast(`${data.name} supprimé`, () => {
            const restored = this.addParticipantRow(data.name, data.faceUrl, data.display, data.id, data.attacks);
            if (nextRow?.parentElement === this.listElement) {
                this.listElement.insertBefore(restored, nextRow);
            }
            this.scheduleUpdate();
        });
    }

    setAllPresent(present) {
        this.listElement.querySelectorAll('.participant-row').forEach((row) => {
            row.querySelector('.display-input').checked = present;
            row.classList.toggle('is-absent', !present);
        });
        this.scheduleUpdate();
    }

    // --------- Cartes du pack opening ---------

    // Tous les participants (présents ou non), avec leurs attaques
    getCardSettings() {
        return Array.from(this.listElement.querySelectorAll('.participant-row')).map((row, idx) => ({
            ...this.#readRow(row, idx),
            avatar: row.querySelector('.avatar')
        }));
    }

    setAttacks(id, attacks) {
        const row = this.listElement.querySelector(`.participant-row[data-id="${CSS.escape(id)}"]`);
        if (!row) return;
        row.dataset.attacks = JSON.stringify(cleanAttacks(attacks) || []);
        this.scheduleUpdate();
    }

    // --------- Suivi des passages ---------
    isRoundActive() {
        return this.passedIds.length > 0;
    }

    markPassed(id) {
        this.passedIds = this.passedIds.filter(passedId => passedId !== id);
        this.passedIds.push(id);
        this.currentId = id;
        // Le sélecteur a déjà retiré la personne tirée : pas besoin de lui renvoyer la liste
        this.participants = this.#activeParticipants();
        this.refreshSummary();
        if (this.isConfigPanelOpen()) this.showGameActiveMessage();
    }

    // Correction manuelle : marquer quelqu'un comme passé (ou le remettre dans le tirage)
    togglePassed(id) {
        if (this.passedIds.includes(id)) {
            this.passedIds = this.passedIds.filter(passedId => passedId !== id);
            if (this.currentId === id) this.currentId = null;
        } else {
            this.passedIds.push(id);
        }
        this.refreshSummary();
        this.updateParticipantsInGame();
    }

    // Nouveau tour : tout le monde est de nouveau à passer
    resetRound() {
        this.passedIds = [];
        this.currentId = null;
        this.participants = this.#activeParticipants();
        this.refreshSummary();
    }

    updateStatus(row) {
        const chip = row.querySelector('.status-chip');
        const present = row.querySelector('.display-input').checked;
        const rank = this.passedIds.indexOf(row.dataset.id) + 1;
        const isCurrent = rank > 0 && row.dataset.id === this.currentId;

        chip.hidden = !this.isRoundActive() || (!present && rank === 0);
        chip.classList.toggle('is-passed', rank > 0 && !isCurrent);
        chip.classList.toggle('is-current', isCurrent);
        row.classList.toggle('is-passed', rank > 0 && !isCurrent);
        row.classList.toggle('is-current', isCurrent);

        if (isCurrent) {
            chip.textContent = 'En cours';
            chip.title = `Passe en ${this.#ordinal(rank)} — cliquer pour le remettre dans le tirage`;
        } else if (rank > 0) {
            chip.textContent = `✓ ${this.#ordinal(rank)}`;
            chip.title = `Passé en ${this.#ordinal(rank)} — cliquer pour le remettre dans le tirage`;
        } else {
            chip.textContent = 'À passer';
            chip.title = 'Cliquer pour le marquer comme déjà passé';
        }
    }

    // Sauvegarde puis applique la liste au jeu (regroupe les modifications rapprochées)
    scheduleUpdate() {
        this.savePreferences();
        this.refreshSummary();
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
            this.updateParticipantsInGame();
        }, 100);
    }

    refreshSummary() {
        const all = this.#readRows();
        const present = all.filter(p => p.display).length;
        const passed = all.filter(p => this.passedIds.includes(p.id)).length;
        const remaining = all.filter(p => p.display && !this.passedIds.includes(p.id)).length;
        document.getElementById('participants-count').textContent = String(all.length);
        document.getElementById('config-count').textContent = this.isRoundActive() ? `${passed}/${passed + remaining}` : String(present);
        let summary = '';
        if (this.isRoundActive()) {
            summary = `${passed} passé${passed > 1 ? 's' : ''} · ${remaining} à passer`;
        } else if (all.length) {
            summary = `${present} présent${present > 1 ? 's' : ''} sur ${all.length}`;
        }
        document.getElementById('presence-summary').textContent = summary;
        this.listElement.querySelectorAll('.participant-row').forEach(row => this.updateStatus(row));
        document.getElementById('participants-empty').hidden = all.length > 0;
        this.setupFormElement.querySelector('.list-toolbar').hidden = all.length === 0;
    }

    showToast(text, action) {
        clearTimeout(this.toastTimeout);
        this.toastAction = action;
        this.toastElement.querySelector('.panel-toast-text').textContent = text;
        this.toastElement.hidden = false;
        this.toastTimeout = setTimeout(() => this.hideToast(), TOAST_DURATION);
    }

    hideToast() {
        clearTimeout(this.toastTimeout);
        this.toastAction = null;
        this.toastElement.hidden = true;
    }

    async startGame() {
        try {
            const participants = await this.getParticipantsFromForm();
            if (participants.length === 0) {
                alert('Veuillez ajouter au moins un participant');
                return;
            }

            this.resetRound();
            this.savePreferences();
            this.closeConfigPanel();

            // Si les participants ne sont pas encore affichés, les créer
            if (this.game && this.game.persons.length === 0) {
                this.game.createPersons(this.participants);
            } else if (this.game) {
                // Sinon, juste réinitialiser le jeu
                this.game.resetGame();
            }

            const event = new CustomEvent('participantsReady', { detail: this.participants });
            window.dispatchEvent(event);
        } catch (error) {
            console.error('Erreur lors du démarrage du jeu:', error);
            alert('Erreur lors du démarrage du jeu');
        }
    }

    async restartGame() {
        if (!this.game) return;

        try {
            // Tout le monde revient dans le tirage
            this.resetRound();

            // Réinitialiser complètement le jeu
            this.game.resetGame();
            this.game.createPersons(this.participants);
            this.closeConfigPanel();
        } catch (error) {
            console.error('Erreur lors du redémarrage du jeu:', error);
        }
    }

    getParticipantsFromForm() {
        return Promise.resolve(this.#readRows().map(p => new Participant(p.name, p.faceUrl, p.display, p.id, p.attacks)));
    }

    // Méthode pour mettre à jour les participants en temps réel
    async updateParticipantsInGame() {
        if (!this.game) return;

        try {
            // Ceux qui sont déjà passés ne reviennent pas dans le tirage
            this.participants = this.#activeParticipants();
            this.game.updateParticipants(this.participants);
        } catch (error) {
            console.error('Erreur lors de la mise à jour des participants:', error);
        }
    }

    // Méthode pour vérifier si les participants ont changé
    hasParticipantsChanged(newParticipants) {
        if (newParticipants.length !== this.participants.length) {
            return true;
        }

        // Vérifier si les noms ou les photos ont changé
        for (let i = 0; i < newParticipants.length; i++) {
            const newP = newParticipants[i];
            const oldP = this.participants[i];

            if (!oldP || newP.name !== oldP.name || newP.faceUrl !== oldP.faceUrl) {
                return true;
            }
        }

        return false;
    }

    showNameDisplay(name) {
        const display = document.getElementById('name-display');
        display.textContent = name;
        display.style.opacity = '1';
    }

    hideNameDisplay() {
        const display = document.getElementById('name-display');
        display.style.opacity = '0';
    }

    showGameActiveMessage() {
        document.getElementById('game-active-message').hidden = false;
    }

    hideGameActiveMessage() {
        document.getElementById('game-active-message').hidden = true;
    }

    // --------- Préférences (localStorage + fallback cookies noms) ---------
    savePreferences() {
        const participants = this.#readRows().map(({ name, faceUrl, display, attacks }) => ({ name, faceUrl, display, attacks }));
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(participants));
        } catch (_) {
            const names = participants.map(p => p.name);
            const value = encodeURIComponent(JSON.stringify(names));
            this.#setCookie(this.cookieKey, value, 30);
        }
    }

    loadPreferences() {
        let loaded = null;
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw) loaded = JSON.parse(raw);
        } catch (_) {}

        if (Array.isArray(loaded) && loaded.length > 0) {
            this.listElement.replaceChildren();
            loaded.forEach((p) => this.addParticipantRow(p.name, this.#cleanFaceUrl(p.faceUrl), p.display !== false, null, cleanAttacks(p.attacks)));

            // Afficher automatiquement les participants actifs au chargement
            setTimeout(() => {
                this.updateParticipantsInGame();
            }, 100);
            return;
        }

        // Fallback cookie (noms seulement)
        const rawCookie = this.#getCookie(this.cookieKey);
        if (!rawCookie) return;
        try {
            const names = JSON.parse(decodeURIComponent(rawCookie));
            if (Array.isArray(names) && names.length > 0) {
                this.listElement.replaceChildren();
                names.forEach((name) => this.addParticipantRow(name));

                // Afficher automatiquement les participants au chargement
                setTimeout(() => {
                    this.updateParticipantsInGame();
                }, 100);
            }
        } catch (_) {
            // Ignore parsing errors
        }
    }

    #setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value}; ${expires}; path=/`;
    }

    #getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // D'anciennes versions enregistraient l'URL de la page quand il n'y avait pas de photo
    #cleanFaceUrl(url) {
        if (typeof url !== 'string') return null;
        if (url.startsWith('data:image/')) return url;
        if (/^https?:\/\//i.test(url) && !/(\.html?|\/)([?#].*)?$/i.test(url)) return url;
        return null;
    }

    #readRows() {
        return Array.from(this.listElement.querySelectorAll('.participant-row')).map((row, idx) => this.#readRow(row, idx));
    }

    #readRow(row, idx) {
        const id = row.dataset.id;
        const name = row.querySelector('.participant-name').value.trim() || `Participant ${idx + 1}`;
        const faceUrl = row.dataset.faceUrl || null;
        const display = row.querySelector('.display-input').checked;
        let attacks;
        try {
            attacks = row.dataset.attacks ? cleanAttacks(JSON.parse(row.dataset.attacks)) : undefined;
        } catch (_) {}
        return { id, name, faceUrl, display, attacks };
    }

    // Présents et pas encore passés : ceux qui restent à tirer au sort
    #activeParticipants() {
        return this.#readRows()
            .filter(p => p.display && !this.passedIds.includes(p.id))
            .map(p => new Participant(p.name, p.faceUrl, p.display, p.id, p.attacks));
    }

    #ordinal(rank) {
        return rank === 1 ? '1er' : `${rank}e`;
    }

    #icon(path) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const shape = document.createElementNS(SVG_NS, 'path');
        shape.setAttribute('d', path);
        svg.appendChild(shape);
        return svg;
    }
}
