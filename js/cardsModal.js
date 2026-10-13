// Modale « Cartes des participants » (mode Pack opening) : pour chaque participant,
// la liste des attaques dans laquelle sa carte pioche. Les changements s'appliquent
// immédiatement et sont sauvegardés avec les participants (donc inclus dans l'export).

import { MOVES, proposeAttacks } from './pack.js';
import { MAX_ATTACKS, ATTACK_MAX_LENGTH } from './participants.js';

const SUGGESTIONS_ID = 'attack-suggestions';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function iconButton(className, title, label) {
    const button = el('button', `icon-button ${className}`, label);
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    return button;
}

export class CardsModal {
    constructor(participantManager) {
        this.participantManager = participantManager;
        this.buildDom();
        document.getElementById('pack-cards-open')?.addEventListener('click', () => this.open());
    }

    buildDom() {
        this.modal = el('div', 'modal cards-modal');
        this.modal.id = 'cards-modal';

        const content = el('div', 'modal-content cards-modal-content');
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('aria-labelledby', 'cards-modal-title');

        const header = el('header', 'cards-modal-header');
        const title = el('h2', null, 'Cartes des participants');
        title.id = 'cards-modal-title';
        const close = iconButton('cards-modal-close', 'Fermer (Échap)', '✕');
        close.addEventListener('click', () => this.close());
        header.append(title, close);

        const hint = el('p', 'setting-hint cards-modal-hint',
            "Chaque carte pioche 1 ou 2 attaques (selon sa rareté) dans la liste de son participant. "
            + "Une attaque de la liste générale garde ses dégâts et son texte ; un nouveau nom reçoit des dégâts au hasard. "
            + 'Liste vide : attaques tirées dans la liste générale.');

        this.list = el('ul', 'cards-config-list');
        this.empty = el('p', 'empty-state', 'Aucun participant pour l’instant.');

        const suggestions = document.createElement('datalist');
        suggestions.id = SUGGESTIONS_ID;
        MOVES.forEach(move => {
            const option = document.createElement('option');
            option.value = move.name;
            suggestions.appendChild(option);
        });

        const footer = el('footer', 'cards-modal-footer');
        const done = el('button', 'btn btn-primary', 'Terminé');
        done.type = 'button';
        done.addEventListener('click', () => this.close());
        footer.appendChild(done);

        content.append(header, hint, this.list, this.empty, suggestions, footer);
        this.modal.appendChild(content);
        document.body.appendChild(this.modal);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
        // Échap ferme la modale sans fermer le panneau de configuration en dessous
        // (écouteur en phase de capture, avant celui du panneau)
        window.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !this.isOpen()) return;
            e.stopPropagation();
            this.close();
        }, true);
        this.list.addEventListener('input', (e) => {
            if (e.target.matches('.attack-input')) this.save(e.target.closest('.card-config'));
        });
        this.list.addEventListener('keydown', (e) => {
            // Entrée sur la dernière attaque en ajoute une nouvelle
            if (e.key !== 'Enter' || !e.target.matches('.attack-input')) return;
            e.preventDefault();
            const item = e.target.closest('.card-config');
            const inputs = Array.from(item.querySelectorAll('.attack-input'));
            const next = inputs[inputs.indexOf(e.target) + 1];
            if (next) next.focus();
            else if (e.target.value.trim()) this.addAttack(item);
        });
    }

    isOpen() {
        return this.modal.style.display === 'block';
    }

    open() {
        const participants = this.participantManager.getCardSettings();
        // Première ouverture pour ce participant : on lui propose des attaques
        participants.forEach(participant => {
            if (participant.attacks === undefined) {
                participant.attacks = proposeAttacks();
                this.participantManager.setAttacks(participant.id, participant.attacks);
            }
        });

        this.list.replaceChildren(...participants.map(participant => this.buildItem(participant)));
        this.empty.hidden = participants.length > 0;
        this.modal.classList.remove('closing');
        this.modal.style.display = 'block';
        (this.list.querySelector('.attack-input') || this.modal.querySelector('.cards-modal-close')).focus();
    }

    close() {
        if (!this.isOpen() || this.modal.classList.contains('closing')) return;
        this.modal.classList.add('closing');
        setTimeout(() => {
            this.modal.style.display = 'none';
            this.modal.classList.remove('closing');
            this.list.replaceChildren();
            document.getElementById('pack-cards-open')?.focus();
        }, 300);
    }

    buildItem(participant) {
        const item = el('li', 'card-config');
        item.classList.toggle('is-absent', !participant.display);
        item.dataset.id = participant.id;

        const head = el('div', 'card-config-head');
        const avatar = el('span', 'avatar card-config-avatar');
        if (participant.avatar) {
            avatar.append(...Array.from(participant.avatar.childNodes, node => node.cloneNode(true)));
            const hue = participant.avatar.style.getPropertyValue('--avatar-hue');
            if (hue) avatar.style.setProperty('--avatar-hue', hue);
        }
        const name = el('strong', 'card-config-name', participant.name);
        const reroll = iconButton('card-config-reroll', 'Proposer d’autres attaques', '🎲');
        reroll.addEventListener('click', () => {
            this.renderAttacks(item, proposeAttacks());
            this.save(item);
        });
        head.append(avatar, name);
        if (!participant.display) head.appendChild(el('span', 'card-config-tag', 'Absent'));
        head.appendChild(reroll);

        const attacks = el('div', 'attack-list');
        const fallback = el('p', 'attack-fallback', 'Attaques tirées dans la liste générale');
        const add = el('button', 'btn-link attack-add', '+ Ajouter une attaque');
        add.type = 'button';
        add.addEventListener('click', () => this.addAttack(item));

        item.append(head, attacks, fallback, add);
        this.renderAttacks(item, participant.attacks);
        return item;
    }

    renderAttacks(item, names) {
        const list = item.querySelector('.attack-list');
        list.replaceChildren(...names.map(name => this.buildAttackRow(item, name)));
        this.refreshItem(item);
    }

    buildAttackRow(item, name) {
        const row = el('div', 'attack-row');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-field attack-input';
        input.maxLength = ATTACK_MAX_LENGTH;
        input.placeholder = 'Nom de l’attaque';
        input.value = name;
        input.setAttribute('list', SUGGESTIONS_ID);
        input.setAttribute('aria-label', 'Nom de l’attaque');

        const remove = iconButton('attack-remove', 'Retirer cette attaque', '✕');
        remove.addEventListener('click', () => {
            const next = row.nextElementSibling || row.previousElementSibling;
            row.remove();
            this.refreshItem(item);
            this.save(item);
            (next?.querySelector('.attack-input') || item.querySelector('.attack-add')).focus();
        });

        row.append(input, remove);
        return row;
    }

    addAttack(item) {
        const list = item.querySelector('.attack-list');
        if (list.children.length >= MAX_ATTACKS) return;
        const row = this.buildAttackRow(item, '');
        list.appendChild(row);
        this.refreshItem(item);
        row.querySelector('.attack-input').focus();
    }

    refreshItem(item) {
        const count = item.querySelector('.attack-list').children.length;
        item.querySelector('.attack-fallback').hidden = count > 0;
        item.querySelector('.attack-add').hidden = count >= MAX_ATTACKS;
    }

    save(item) {
        const names = Array.from(item.querySelectorAll('.attack-input'), input => input.value);
        this.participantManager.setAttacks(item.dataset.id, names);
    }
}
