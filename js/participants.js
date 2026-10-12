export class Participant {
    constructor(name, faceUrl = null, display = true) {
        this.name = name;
        this.faceUrl = faceUrl;
        this.display = display;
        this.mesh = null;
    }
}

export class ParticipantManager {
    constructor() {
        this.participants = [];
        this.cookieKey = 'dsp_participants';
        this.storageKey = 'dsp_participants_v2';
        this.setupFormElement = document.getElementById('setup-form');
        this.overlayElement = document.getElementById('offcanvas-overlay');
        this.game = null; // Référence vers l'instance du jeu
        this.updateTimeout = null; // Pour éviter les mises à jour trop fréquentes
        
        // S'assurer que le panneau est masqué au démarrage
        if (this.setupFormElement) {
            this.setupFormElement.classList.remove('active');
        }
        if (this.overlayElement) {
            this.overlayElement.classList.remove('active');
        }
        
        this.setupListeners();
        this.loadPreferences();
    }

    setGameReference(game) {
        this.game = game;
    }

    setupListeners() {
        // Bouton pour ouvrir le panneau de configuration
        document.getElementById('config-button').addEventListener('click', () => this.openConfigPanel());

        // Bouton pour fermer le panneau
        document.getElementById('close-config').addEventListener('click', () => this.closeConfigPanel());

        // Fermer en cliquant sur l'overlay
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) {
                this.closeConfigPanel();
            }
        });

        // Bouton pour ajouter un participant
        document.getElementById('add-participant').addEventListener('click', () => this.addParticipantRow());

        // Bouton pour démarrer le jeu
        document.getElementById('start-game').addEventListener('click', () => this.startGame());

        // Bouton pour relancer la partie
        document.getElementById('restart-game').addEventListener('click', () => this.restartGame());

        // Gestion des boutons de suppression (délégation d'événements)
        document.getElementById('participants-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-participant')) {
                this.removeParticipantRow(e.target);
                this.savePreferences();
            }
        });

        // Sauvegarde à la volée des noms/flags saisis
        document.getElementById('participants-list').addEventListener('input', (e) => {
            if (e.target && (e.target.matches('input[type="text"]') || e.target.matches('input[type="checkbox"]'))) {
                this.savePreferences();
                // Mettre à jour les participants immédiatement
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(() => {
                    this.updateParticipantsInGame();
                }, 100);
            }
        });

        // Délégation: clic sur la vignette ouvre l'input file associé
        document.getElementById('participants-list').addEventListener('click', (e) => {
            if (e.target && e.target.matches('img.face-thumb')) {
                const row = e.target.closest('.participant-row');
                const fileInput = row?.querySelector('input[type="file"].face-input');
                fileInput?.click();
            }
        });

        // Délégation: quand un fichier est choisi, on met à jour la vignette et on sauvegarde
        document.getElementById('participants-list').addEventListener('change', (e) => {
            if (e.target && e.target.matches('input[type="file"].face-input')) {
                const row = e.target.closest('.participant-row');
                const thumb = row?.querySelector('img.face-thumb');
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    if (thumb) thumb.src = reader.result;
                    this.savePreferences();
                    // Mettre à jour les participants immédiatement
                    clearTimeout(this.updateTimeout);
                    this.updateTimeout = setTimeout(() => {
                        this.updateParticipantsInGame();
                    }, 100);
                };
                reader.readAsDataURL(file);
            }
        });

        // Export / import de la configuration des participants
        document.getElementById('export-participants').addEventListener('click', () => this.exportParticipants());
        const importInput = document.getElementById('import-participants-input');
        document.getElementById('import-participants').addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.importParticipants(file);
            // Réinitialiser pour pouvoir réimporter le même fichier
            e.target.value = '';
        });

        // Fermer avec la touche Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isConfigPanelOpen()) {
                this.closeConfigPanel();
            }
        });
    }

    openConfigPanel() {
        if (this.setupFormElement) {
            this.setupFormElement.classList.add('active');
        }
        if (this.overlayElement) {
            this.overlayElement.classList.add('active');
        }
        document.body.style.overflow = 'hidden';
        
        // Afficher un message informatif si le jeu est actif
        if (this.game && this.game.persons.length > 0) {
            this.showGameActiveMessage();
        }
    }

    closeConfigPanel() {
        if (this.setupFormElement) {
            this.setupFormElement.classList.remove('active');
        }
        if (this.overlayElement) {
            this.overlayElement.classList.remove('active');
        }
        document.body.style.overflow = '';
        
        // Masquer le message informatif
        const messageEl = document.getElementById('game-active-message');
        if (messageEl) {
            messageEl.style.display = 'none';
        }
    }

    isConfigPanelOpen() {
        return this.setupFormElement && this.setupFormElement.classList.contains('active');
    }

    addParticipantRow(name, faceUrl = null, display = true) {
        const list = document.getElementById('participants-list');
        const row = document.createElement('div');
        row.className = 'participant-row';
        const placeholder = `Participant ${list.children.length + 1}`;
        row.innerHTML = `
            <input type="text" placeholder="Nom du participant" value="${name ? this.#escapeHtml(name) : placeholder}">
            <img class="face-thumb" src="${faceUrl ? this.#escapeHtml(faceUrl) : ''}" alt="" title="Choisir une photo">
            <input type="file" class="face-input" accept="image/*">
            <label style="color:#000; font-family: Arial; font-size: 14px;">
                <input type="checkbox" class="display-input" ${display ? 'checked' : ''}> Afficher
            </label>
            <button class="remove-participant">×</button>
        `;
        list.appendChild(row);
        
        // Mettre à jour les participants si la case est cochée
        if (display) {
            setTimeout(() => {
                this.updateParticipantsInGame();
            }, 50);
        }
    }

    removeParticipantRow(button) {
        const list = document.getElementById('participants-list');
        if (list.children.length > 1) {
            button.closest('.participant-row').remove();
            // Mettre à jour les participants après suppression
            setTimeout(() => {
                this.updateParticipantsInGame();
            }, 50);
        }
    }

    async startGame() {
        try {
            const participants = await this.getParticipantsFromForm();
            if (participants.length === 0) {
                alert('Veuillez ajouter au moins un participant');
                return;
            }

            this.participants = participants.filter(p => p.display !== false);
            this.savePreferences(participants);
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
            // Récupérer les participants actuels du formulaire
            const participants = await this.getParticipantsFromForm();
            this.participants = participants.filter(p => p.display !== false);
            
            // Réinitialiser complètement le jeu
            this.game.resetGame();
            this.game.createPersons(this.participants);
            this.closeConfigPanel();
            
            // Masquer le message informatif car le jeu est réinitialisé
            const messageEl = document.getElementById('game-active-message');
            if (messageEl) {
                messageEl.style.display = 'none';
            }
        } catch (error) {
            console.error('Erreur lors du redémarrage du jeu:', error);
        }
    }

    getParticipantsFromForm() {
        const list = document.getElementById('participants-list');
        const rows = Array.from(list.getElementsByClassName('participant-row'));

        const readAsDataURL = (file) => new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });

        const promises = rows.map(async (row, idx) => {
            const nameInput = row.querySelector('input[type="text"]');
            const fileInput = row.querySelector('input[type="file"]');
            const displayInput = row.querySelector('input[type="checkbox"]');
            const thumb = row.querySelector('img.face-thumb');
            const name = (nameInput?.value || '').trim() || `Participant ${idx + 1}`;
            const file = fileInput?.files?.[0] || null;
            // Priorité: fichier choisi sinon vignette existante (depuis localStorage)
            const faceUrl = file ? await readAsDataURL(file) : (thumb?.src || null);
            const display = !!(displayInput?.checked);
            return new Participant(name, faceUrl, display);
        });

        return Promise.all(promises);
    }

    // Méthode pour mettre à jour les participants en temps réel
    async updateParticipantsInGame() {
        if (!this.game) return;
        
        try {
            const participants = await this.getParticipantsFromForm();
            const activeParticipants = participants.filter(p => p.display !== false);
            
            // Sauvegarder les préférences
            this.savePreferences(participants);
            
            // Mettre à jour les participants actifs
            this.participants = activeParticipants;
            
            // Mettre à jour le jeu avec les nouveaux participants
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
        // Créer ou mettre à jour le message informatif
        let messageEl = document.getElementById('game-active-message');
        if (!messageEl && this.setupFormElement) {
            messageEl = document.createElement('div');
            messageEl.id = 'game-active-message';
            messageEl.className = 'game-active-message';
            const contentEl = this.setupFormElement.querySelector('.offcanvas-content');
            const listEl = this.setupFormElement.querySelector('#participants-list');
            if (contentEl && listEl) {
                contentEl.insertBefore(messageEl, listEl);
            }
        }
        
        if (messageEl) {
            messageEl.innerHTML = `
                <div class="message-content">
                    <span class="message-icon">🎮</span>
                    <span>Partie en cours - Vous pouvez modifier les participants en temps réel</span>
                </div>
            `;
            messageEl.style.display = 'block';
        }
    }

    // --------- Export / import (fichier JSON) ---------
    exportParticipants() {
        const list = document.getElementById('participants-list');
        const rows = Array.from(list.getElementsByClassName('participant-row'));
        const participants = rows.map((row, idx) => {
            const name = (row.querySelector('input[type="text"]')?.value || '').trim() || `Participant ${idx + 1}`;
            // getAttribute évite de récupérer l'URL de la page quand la vignette est vide
            const faceUrl = row.querySelector('img.face-thumb')?.getAttribute('src') || null;
            const display = !!row.querySelector('input[type="checkbox"]')?.checked;
            return { name, faceUrl, display };
        });

        const data = {
            app: 'DailySCRUMPicker',
            version: 1,
            exportedAt: new Date().toISOString(),
            participants
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `participants-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async importParticipants(file) {
        let participants;
        try {
            participants = this.#parseImportedParticipants(JSON.parse(await file.text()));
        } catch (error) {
            console.error('Erreur lors de l\'import des participants:', error);
            alert('Fichier invalide : impossible d\'importer la configuration des participants.');
            return;
        }

        if (!confirm(`Importer ${participants.length} participant(s) ? La liste actuelle sera remplacée.`)) {
            return;
        }

        const list = document.getElementById('participants-list');
        list.innerHTML = '';
        participants.forEach((p) => this.addParticipantRow(p.name, p.faceUrl, p.display));
        this.savePreferences();
        this.updateParticipantsInGame();
    }

    #parseImportedParticipants(data) {
        // Accepte le format exporté ({ participants: [...] }) ou un tableau brut
        const items = Array.isArray(data) ? data : data?.participants;
        if (!Array.isArray(items)) {
            throw new Error('Aucune liste de participants trouvée');
        }

        const participants = items
            .map((item, idx) => {
                // Un simple nom est aussi accepté
                if (typeof item === 'string') item = { name: item };
                if (!item || typeof item !== 'object') return null;
                const name = typeof item.name === 'string' && item.name.trim()
                    ? item.name.trim()
                    : `Participant ${idx + 1}`;
                const faceUrl = typeof item.faceUrl === 'string' && /^(data:image\/|https?:\/\/)/i.test(item.faceUrl)
                    ? item.faceUrl
                    : null;
                return { name, faceUrl, display: item.display !== false };
            })
            .filter(Boolean);

        if (participants.length === 0) {
            throw new Error('La liste de participants est vide');
        }
        return participants;
    }

    // --------- Préférences (localStorage + fallback cookies noms) ---------
    savePreferences(participantsOpt) {
        const list = document.getElementById('participants-list');
        const rows = Array.from(list.getElementsByClassName('participant-row'));
        const rowsToSave = participantsOpt ? null : rows;

        const buildFromDom = rowsToSave?.map((row, idx) => {
            const nameInput = row.querySelector('input[type="text"]');
            const displayInput = row.querySelector('input[type="checkbox"]');
            const thumb = row.querySelector('img.face-thumb');
            const name = (nameInput?.value || '').trim() || `Participant ${idx + 1}`;
            const display = !!(displayInput?.checked);
            const faceUrl = thumb?.src || null;
            return { name, faceUrl, display };
        }) || participantsOpt?.map(p => ({ name: p.name, faceUrl: p.faceUrl, display: p.display })) || [];

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(buildFromDom));
        } catch (_) {
            const names = buildFromDom.map((p, idx) => p.name || `Participant ${idx + 1}`);
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
            const list = document.getElementById('participants-list');
            list.innerHTML = '';
            loaded.forEach((p) => this.addParticipantRow(p.name, p.faceUrl, p.display !== false));
            
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
                const list = document.getElementById('participants-list');
                list.innerHTML = '';
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

    #escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
