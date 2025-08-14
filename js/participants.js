export class Participant {
    constructor(name) {
        this.name = name;
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

    getParticipants() {
        const inputs = document.querySelectorAll('#participants-list input');
        return Array.from(inputs).map(input => new Participant(input.value.trim() || 'Anonyme'));
    }

    startGame() {
        this.participants = this.getParticipants();
        this.setupFormElement.classList.add('hidden');
        // Émet un événement personnalisé pour informer le jeu que les participants sont prêts
        const event = new CustomEvent('participantsReady', { detail: this.participants });
        window.dispatchEvent(event);
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
