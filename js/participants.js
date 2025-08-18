export class Participant {
    constructor(name, faceUrl = null) {
        this.name = name;
        this.faceUrl = faceUrl;
        this.mesh = null;
    }
}

export class ParticipantManager {
    constructor() {
        this.participants = [];
        this.setupFormElement = document.getElementById('setup-form');
        this.setupListeners();
    }

    setupListeners() {
        // Bouton pour ajouter un participant
        document.getElementById('add-participant').addEventListener('click', () => this.addParticipantRow());

        // Bouton pour démarrer le jeu
        document.getElementById('start-game').addEventListener('click', () => this.startGame());

        // Gestion des boutons de suppression (délégation d'événements)
        document.getElementById('participants-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-participant')) {
                this.removeParticipantRow(e.target);
            }
        });
    }

    addParticipantRow() {
        const list = document.getElementById('participants-list');
        const row = document.createElement('div');
        row.className = 'participant-row';
        row.innerHTML = `
            <input type="text" placeholder="Nom du participant" value="Participant ${list.children.length + 1}">
            <input type="file" class="face-input" accept="image/*">
            <button class="remove-participant">×</button>
        `;
        list.appendChild(row);
    }

    removeParticipantRow(button) {
        const list = document.getElementById('participants-list');
        if (list.children.length > 1) {
            button.closest('.participant-row').remove();
        }
    }

    startGame() {
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
            const name = (nameInput?.value || '').trim() || `Participant ${idx + 1}`;
            const file = fileInput?.files?.[0] || null;
            const faceUrl = await readAsDataURL(file);
            return new Participant(name, faceUrl);
        });

        Promise.all(promises).then((participants) => {
            this.participants = participants;
            this.setupFormElement.classList.add('hidden');
            const event = new CustomEvent('participantsReady', { detail: this.participants });
            window.dispatchEvent(event);
        });
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
}
