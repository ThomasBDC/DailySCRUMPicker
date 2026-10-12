// Sélecteur "Pack opening" façon Pokémon TCG Pocket :
// on découpe le haut du booster, puis on fait défiler les cartes (une par participant)
// en les swipant. L'ordre des cartes = l'ordre de passage.

import { resizeImage } from './image.js';
import { announcePick, announceRoundReset } from './participants.js';

// Niveaux de rareté, tirés au moment de la génération du paquet
const RARITIES = [
    { id: 'common',   label: 'Commune',     symbol: '◆',   weight: 45, hp: [60, 90],   stage: 'De base',  moves: 1, sparkles: 0 },
    { id: 'uncommon', label: 'Peu commune', symbol: '◆◆',  weight: 27, hp: [80, 110],  stage: 'Niveau 1', moves: 1, sparkles: 0 },
    { id: 'rare',     label: 'Rare',        symbol: '◆◆◆', weight: 15, hp: [110, 150], stage: 'Niveau 2', moves: 2, sparkles: 0,  shiny: true },
    { id: 'ultra',    label: 'Ultra rare',  symbol: '★',   weight: 9,  hp: [160, 200], stage: 'ex',       moves: 2, sparkles: 10, shiny: true, suffix: 'ex' },
    { id: 'crown',    label: 'Couronne',    symbol: '♛',   weight: 4,  hp: [220, 260], stage: 'Légende',  moves: 1, sparkles: 18, shiny: true, suffix: 'ex' }
];

// Types d'énergie : définissent les couleurs de la carte
const TYPES = [
    { label: 'Feu',        icon: '🔥', colors: ['#ffc2a8', '#ff6a3d'] },
    { label: 'Eau',        icon: '💧', colors: ['#bfe3ff', '#4a90e2'] },
    { label: 'Plante',     icon: '🌿', colors: ['#d4f5b5', '#55b555'] },
    { label: 'Électrique', icon: '⚡', colors: ['#fff6b0', '#f2c014'] },
    { label: 'Psy',        icon: '🔮', colors: ['#ecc8ff', '#a05ad8'] },
    { label: 'Combat',     icon: '👊', colors: ['#f5d3b0', '#c27a3e'] },
    { label: 'Métal',      icon: '⚙️', colors: ['#eef1f5', '#8d99ab'] },
    { label: 'Dragon',     icon: '🐉', colors: ['#f7e3a6', '#5a8f7b'] }
];

const MOVES = [
    { name: 'Stand-up éclair', dmg: 30, text: "Résume sa journée d'hier en 15 secondes chrono." },
    { name: 'Merge Conflict', dmg: 60, text: 'Lance une pièce. Si face, la branche main est cassée.' },
    { name: 'Hotfix du vendredi', dmg: 90, text: "Inflige aussi 10 dégâts au moral de l'équipe." },
    { name: 'Story Points', dmg: 20, text: 'Estime à 8. Tout le monde avait dit 3.' },
    { name: 'Refacto', dmg: 50, text: 'Rien ne change, mais tout est plus beau.' },
    { name: 'Café serré', dmg: 40, text: 'Soigne 20 PV à ce collègue.' },
    { name: 'Blocage levé', dmg: 70, text: 'Défausse un ticket « En attente ».' },
    { name: 'Revue de code', dmg: 30, text: 'Ajoute 47 commentaires « nit: ».' },
    { name: 'Mise en prod', dmg: 120, text: 'Ne peut pas être utilisée le vendredi.' },
    { name: 'Rétro', dmg: 10, text: 'Pioche un post-it. Il dit « communication ».' },
    { name: 'Daily de 45 min', dmg: 0, text: "L'adversaire s'endort. Toi aussi." },
    { name: 'Ça marche chez moi', dmg: 80, text: 'Immunisé contre les tickets de bug ce tour-ci.' },
    { name: 'Pair programming', dmg: 40, text: 'Inflige 40 dégâts × 2 claviers.' },
    { name: 'Sprint final', dmg: 100, text: 'Ce collègue ne peut pas attaquer au prochain tour.' },
    { name: 'Micro coupé', dmg: 20, text: '« Tu es en muet ! »' },
    { name: 'Ticket Jira', dmg: 30, text: "Crée 3 sous-tâches. Aucune n'est assignée." }
];

const FLAVORS = [
    'Arrive toujours à 9h59 pour le daily de 10h.',
    'Son habitat naturel : la salle de réunion n°3.',
    'Capable de dire « c’est presque fini » pendant trois sprints.',
    'Se nourrit exclusivement de croissants du vendredi.',
    'On raconte que ce collègue a déjà fermé un ticket sans le rouvrir.',
    'Communique principalement par emojis sur Slack.',
    'Évolue en Tech Lead après 10 000 revues de code.',
    'Très territorial autour de la machine à café.'
];

const WEAKNESSES = ['Réunions', 'Lundis matin', 'Bugs en prod', 'Wi-Fi capricieux', 'Mails « urgent »', 'Specs floues'];

const CUT_THRESHOLD = 0.75;        // part de la largeur du paquet à découper pour l'ouvrir
// Le découpage peut commencer n'importe où sur la largeur de l'écran, dans une bande
// autour du haut du paquet (exprimée en hauteur de paquet)
const CUT_ZONE_ABOVE = 0.25;
const CUT_ZONE_BELOW = 0.32;
const SWIPE_DISTANCE_RATIO = 0.28; // distance (en largeur de carte) pour valider un swipe
const SWIPE_VELOCITY = 0.55;       // ou vitesse minimale (px/ms)
const STACK_VISIBLE_DEPTH = 3;     // nombre de cartes visibles sous la carte du dessus
const TILT_MAX_DEG = 14;

const DEFAULT_PACK_LABEL = 'DAILY SCRUM';
const LABEL_STORAGE_KEY = 'dsp_pack_label';
const IMAGE_STORAGE_KEY = 'dsp_pack_image';
const IMAGE_MAX_SIZE = 600; // px, l'image est réduite avant d'être stockée

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function pickWeighted(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll < 0) return item;
    }
    return items[items.length - 1];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function pad(n) {
    return String(n).padStart(3, '0');
}

function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function energyCost(dmg) {
    if (dmg <= 30) return 1;
    if (dmg <= 70) return 2;
    return 3;
}

// Une vignette vide (<img src="">) renvoie l'URL de la page : ce n'est pas une photo
function hasPhoto(url) {
    return !!url && url !== 'null' && url !== window.location.href;
}

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch (error) {
        console.warn('Impossible de sauvegarder le réglage du paquet :', error);
    }
}

// Taille du titre selon la longueur du libellé (en fraction de largeur de carte)
function titleScale(label) {
    const longestWord = Math.max(...label.split(/\s+/).map(word => word.length));
    const byWord = 0.85 / (Math.max(longestWord, 1) * 0.62);
    const byLength = label.length > 24 ? 0.09 : label.length > 14 ? 0.12 : 0.15;
    return Math.min(0.15, byWord, byLength);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class PackOpeningPicker {
    constructor(container) {
        this.container = container;
        this.participants = [];
        this.cards = [];
        this.slots = [];
        this.index = 0;
        this.state = 'empty'; // empty | idle | opening | cards | summary
        this.cut = null;
        this.drag = null;
        this.hovered = null;
        this.timers = new Set();
        this.bannerTimer = null;
        this.label = readStorage(LABEL_STORAGE_KEY) || DEFAULT_PACK_LABEL;
        this.image = readStorage(IMAGE_STORAGE_KEY);

        this.buildDom();
        this.bindEvents();
        this.bindSettings();
        this.renderPack();
    }

    // ---------- Structure ----------

    buildDom() {
        this.root = el('div', 'pack-picker');
        this.root.appendChild(el('div', 'pack-rays'));
        this.counter = el('div', 'pack-counter');
        this.stage = el('div', 'pack-stage');
        this.banner = el('div', 'pack-banner');
        this.stage.appendChild(this.banner);
        this.hint = el('div', 'pack-hint');
        this.summary = el('div', 'pack-summary');
        this.root.append(this.counter, this.stage, this.hint, this.summary);
        this.container.appendChild(this.root);
    }

    bindEvents() {
        this.onPointerDown = (e) => this.handlePointerDown(e);
        this.onPointerMove = (e) => this.handlePointerMove(e);
        this.onPointerUp = (e) => this.handlePointerUp(e);
        this.onKeyDown = (e) => this.handleKeyDown(e);

        this.root.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        document.addEventListener('keydown', this.onKeyDown);
    }

    // Réglages du paquet (libellé + image) dans le panneau de configuration
    bindSettings() {
        const labelInput = document.getElementById('pack-label-input');
        const imageInput = document.getElementById('pack-image-input');
        this.imageThumb = document.getElementById('pack-image-thumb');
        this.imageRemove = document.getElementById('pack-image-remove');

        if (labelInput) {
            labelInput.value = this.label;
            labelInput.addEventListener('input', () => {
                this.label = labelInput.value.trim() || DEFAULT_PACK_LABEL;
                writeStorage(LABEL_STORAGE_KEY, labelInput.value.trim() ? this.label : null);
                this.refreshPack();
            });
        }

        if (imageInput) {
            imageInput.addEventListener('change', async () => {
                const file = imageInput.files?.[0];
                imageInput.value = '';
                if (!file) return;
                try {
                    this.setImage(await resizeImage(file, IMAGE_MAX_SIZE));
                } catch (error) {
                    console.warn("Impossible de lire l'image du paquet :", error);
                }
            });
            this.imageThumb?.addEventListener('click', () => imageInput.click());
            document.getElementById('pack-image-choose')?.addEventListener('click', () => imageInput.click());
        }

        this.imageRemove?.addEventListener('click', () => this.setImage(null));
        this.updateImageThumb();
    }

    setImage(dataUrl) {
        this.image = dataUrl;
        writeStorage(IMAGE_STORAGE_KEY, dataUrl);
        this.updateImageThumb();
        this.refreshPack();
    }

    updateImageThumb() {
        if (this.imageThumb) {
            if (this.image) this.imageThumb.src = this.image;
            else this.imageThumb.removeAttribute('src');
        }
        if (this.imageRemove) this.imageRemove.hidden = !this.image;
    }

    // Un paquet déjà ouvert n'est pas modifié : le réglage s'applique au prochain
    refreshPack() {
        if (this.state === 'empty' || this.state === 'idle') {
            this.renderPack();
        }
    }

    show() {
        this.root.style.display = '';
    }

    hide() {
        this.root.style.display = 'none';
    }

    isVisible() {
        return this.root.style.display !== 'none';
    }

    later(fn, ms) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.add(id);
    }

    clearTimers() {
        this.timers.forEach(id => clearTimeout(id));
        this.timers.clear();
    }

    // ---------- API utilisée par Game ----------

    setParticipants(participants) {
        this.participants = participants.filter(p => p.display !== false);
        if (this.state === 'empty' || this.state === 'idle') {
            this.renderPack();
        } else if (this.cards.length > 0) {
            this.syncCards();
        }
    }

    // Paquet ouvert : les cartes pas encore retournées suivent la liste en direct.
    // this.participants ne contient que les personnes qui restent à passer.
    syncCards() {
        // Cartes déjà vues (la carte du dessus est face visible) : on n'y touche plus
        const revealedCount = this.state === 'summary' ? this.cards.length
            : this.state === 'cards' ? this.index + 1
            : 0;
        const kept = this.cards.slice(0, revealedCount);
        const previousUpcoming = this.cards.slice(revealedCount);

        const byId = new Map(this.participants.map(p => [p.id, p]));
        const upcoming = previousUpcoming
            .filter(card => byId.has(card.participant.id))
            .map(card => ({ ...card, participant: byId.get(card.participant.id) }));

        // Les nouveaux venus sont glissés à une place au hasard parmi les cartes restantes
        const takenIds = new Set([...kept, ...upcoming].map(card => card.participant.id));
        this.participants
            .filter(p => !takenIds.has(p.id))
            .forEach(p => {
                const card = this.createCardData(p, 0, 0, pickWeighted(RARITIES));
                upcoming.splice(randomInt(0, upcoming.length), 0, card);
            });

        const signature = cards => cards
            .map(card => `${card.participant.id}|${card.participant.name}|${card.participant.faceUrl}`)
            .join('\n');
        if (signature(upcoming) === signature(previousUpcoming)) return;

        this.cards = [...kept, ...upcoming];
        this.cards.forEach((card, i) => {
            card.order = i + 1;
            card.total = this.cards.length;
        });

        if (this.cards.length === 0) {
            // Plus personne dans un paquet en cours d'ouverture : retour au paquet vide
            this.clearTimers();
            this.renderPack();
            return;
        }

        if (this.state === 'summary') {
            // Quelqu'un arrive après la dernière carte : on reprend avec ses cartes
            this.clearTimers();
            this.summary.classList.remove('visible');
            this.summary.replaceChildren();
            this.clearStage();
            this.stackEl = el('div', 'card-stack');
            this.slots = this.cards.map((card, i) => (i < revealedCount ? null : this.buildSlot(card)));
            this.slots.forEach(slot => slot && this.stackEl.appendChild(slot));
            this.index = revealedCount;
            this.state = 'cards';
            this.layoutStack();
            this.stage.appendChild(this.stackEl);
            this.revealTop();
            return;
        }

        // Pile pas encore construite (paquet en train de s'ouvrir) : elle utilisera this.cards
        if (!this.stackEl) return;

        const peeking = this.slots[revealedCount]?.classList.contains('is-peek');
        this.slots.slice(revealedCount).forEach(slot => slot?.remove());
        const newSlots = upcoming.map(card => this.buildSlot(card));
        newSlots.forEach(slot => this.stackEl.appendChild(slot));
        if (peeking && newSlots[0]) newSlots[0].classList.add('is-peek');
        this.slots = [...this.slots.slice(0, revealedCount), ...newSlots];
        this.layoutStack();
        if (this.state === 'cards') this.updateProgress();
    }

    reset() {
        this.clearTimers();
        this.cards = [];
        this.slots = [];
        this.index = 0;
        this.cut = null;
        this.drag = null;
        // Nouveau paquet = nouveau tour : tout le monde revient dans la liste à passer
        announceRoundReset();
        this.renderPack();
    }

    dispose() {
        this.clearTimers();
        this.root.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        document.removeEventListener('keydown', this.onKeyDown);
        this.root.remove();
    }

    // ---------- Génération du paquet ----------

    generatePack(participants) {
        const order = shuffle(participants);
        const total = order.length;
        const cards = order.map((participant, i) =>
            this.createCardData(participant, i + 1, total, pickWeighted(RARITIES))
        );

        // Comme dans un vrai booster : au moins une carte brillante à partir de 3 cartes
        if (total >= 3 && !cards.some(card => card.rarity.shiny)) {
            const luckyIdx = randomInt(0, total - 1);
            const lucky = cards[luckyIdx];
            cards[luckyIdx] = this.createCardData(lucky.participant, lucky.order, total, RARITIES.find(r => r.id === 'rare'));
        }

        return cards;
    }

    createCardData(participant, order, total, rarity) {
        return {
            participant,
            order,
            total,
            rarity,
            type: pick(TYPES),
            hp: randomInt(rarity.hp[0] / 10, rarity.hp[1] / 10) * 10,
            moves: shuffle(MOVES).slice(0, rarity.moves),
            weakness: pick(WEAKNESSES),
            flavor: pick(FLAVORS),
            coffees: randomInt(1, 9)
        };
    }

    // ---------- Booster ----------

    renderPack() {
        this.clearStage();
        this.summary.classList.remove('visible');
        this.summary.replaceChildren();
        this.root.dataset.glow = '';
        this.counter.textContent = '';

        const count = this.participants.length;
        this.state = count > 0 ? 'idle' : 'empty';

        const float = el('div', 'pack-float');
        const pack = el('div', 'pack');
        if (count === 0) pack.classList.add('is-empty');

        const top = el('div', 'pack-top');
        const body = el('div', 'pack-body');
        const title = el('div', 'pack-title', this.label);
        title.style.setProperty('--title-scale', titleScale(this.label));
        body.append(
            this.buildEmblem('pack-emblem'),
            title,
            el('div', 'pack-subtitle', 'Booster · Édition Stand-up'),
            el('div', 'pack-count', count > 0 ? `${count} carte${count > 1 ? 's' : ''}` : 'Paquet vide'),
            el('div', 'pack-shine')
        );

        const cutLine = el('div', 'pack-cut');
        this.cutGlow = el('div', 'pack-cut-glow');
        cutLine.append(el('span', 'pack-scissors', '✂'), this.cutGlow, el('div', 'pack-hint-finger'));

        pack.append(top, body, cutLine, el('div', 'pack-flash'));
        float.appendChild(pack);
        this.stage.appendChild(float);
        this.packFloat = float;
        this.packEl = pack;

        this.hint.textContent = count > 0
            ? '✂ Glisse le long du pointillé pour ouvrir le paquet'
            : 'Ajoute des participants dans la configuration';
    }

    // Médaillon : image choisie dans la configuration, sinon une étoile
    buildEmblem(className) {
        const emblem = el('div', className);
        if (this.image) {
            emblem.classList.add('has-image');
            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.src = this.image;
            emblem.appendChild(img);
        } else {
            emblem.appendChild(el('span', null, '✦'));
        }
        return emblem;
    }

    clearStage() {
        Array.from(this.stage.children).forEach(child => {
            if (child !== this.banner) child.remove();
        });
        this.banner.className = 'pack-banner';
        this.packEl = null;
        this.packFloat = null;
        this.stackEl = null;
    }

    nudgePack() {
        if (!this.packFloat) return;
        this.packFloat.classList.remove('nudge');
        void this.packFloat.offsetWidth;
        this.packFloat.classList.add('nudge');
    }

    startCut(e) {
        const rect = this.packEl.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (y < -rect.height * CUT_ZONE_ABOVE || y > rect.height * CUT_ZONE_BELOW) {
            this.nudgePack();
            return;
        }
        e.preventDefault();
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        this.cut = { rect, minX: x, maxX: x };
        this.packEl.classList.add('cutting');
        this.renderCut();
    }

    updateCut(e) {
        const { rect } = this.cut;
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        this.cut.minX = Math.min(this.cut.minX, x);
        this.cut.maxX = Math.max(this.cut.maxX, x);
        this.renderCut();
        if ((this.cut.maxX - this.cut.minX) / rect.width >= CUT_THRESHOLD) {
            this.cut = null;
            this.openPack();
        }
    }

    renderCut() {
        const { rect, minX, maxX } = this.cut;
        this.cutGlow.style.left = `${(minX / rect.width) * 100}%`;
        this.cutGlow.style.width = `${((maxX - minX) / rect.width) * 100}%`;
    }

    cancelCut() {
        this.cut = null;
        if (!this.packEl) return;
        this.packEl.classList.remove('cutting');
        // La découpe se referme si on lâche trop tôt
        this.cutGlow.style.left = '50%';
        this.cutGlow.style.width = '0%';
    }

    // Ouverture au clavier : la découpe se fait toute seule
    autoCut() {
        if (this.state !== 'idle') return;
        this.state = 'opening';
        this.cutGlow.style.left = '0%';
        this.cutGlow.style.width = '0%';
        void this.cutGlow.offsetWidth;
        this.cutGlow.style.transition = 'width .45s ease-in';
        this.cutGlow.style.width = '100%';
        this.later(() => this.tearPack(), 450);
    }

    openPack() {
        if (this.state !== 'idle') return;
        this.state = 'opening';
        this.tearPack();
    }

    tearPack() {
        const pack = this.packEl;
        this.cards = this.generatePack(this.participants);
        this.cutGlow.style.left = '0%';
        this.cutGlow.style.width = '100%';
        pack.classList.remove('cutting');
        pack.classList.add('opened');
        this.hint.textContent = '';

        this.later(() => {
            this.buildStack();
            pack.classList.add('dropping');
        }, 450);

        this.later(() => {
            if (this.packFloat) this.packFloat.remove();
            this.packFloat = null;
            this.packEl = null;
            this.stackEl.classList.remove('entering');
            this.state = 'cards';
            this.revealTop();
        }, 1150);
    }

    // ---------- Cartes ----------

    buildStack() {
        this.stackEl = el('div', 'card-stack entering');
        this.slots = this.cards.map(card => {
            const slot = this.buildSlot(card);
            this.stackEl.appendChild(slot);
            return slot;
        });
        this.index = 0;
        this.layoutStack();
        this.stage.appendChild(this.stackEl);
    }

    buildSlot(card) {
        const slot = el('div', 'card-slot');
        slot.appendChild(this.buildCard(card, true));
        return slot;
    }

    layoutStack() {
        this.slots.forEach((slot, i) => {
            if (i < this.index || !slot) return;
            const depth = i - this.index;
            slot.style.setProperty('--d', Math.min(depth, STACK_VISIBLE_DEPTH));
            slot.style.zIndex = String(100 - depth);
            slot.classList.toggle('is-top', depth === 0);
            slot.classList.toggle('is-hidden', depth > STACK_VISIBLE_DEPTH);
        });
    }

    buildCard(card, withBack) {
        const { participant, rarity, type } = card;

        const cardEl = el('div', `card rarity-${rarity.id}`);
        cardEl.style.setProperty('--t1', type.colors[0]);
        cardEl.style.setProperty('--t2', type.colors[1]);

        const tilt = el('div', 'card-tilt');
        const frame = el('div', 'card-frame');
        const face = el('div', 'card-face');

        const header = el('div', 'card-header');
        const name = el('span', 'card-name', participant.name);
        if (rarity.suffix) name.appendChild(el('span', 'card-ex', rarity.suffix));
        const hp = el('span', 'card-hp');
        hp.append(el('small', null, 'PV'), document.createTextNode(String(card.hp)));
        header.append(el('span', 'card-stage', rarity.stage), name, hp, el('span', 'card-type', type.icon));

        const art = el('div', 'card-art');
        art.appendChild(el('div', 'card-initials', initials(participant.name)));
        if (hasPhoto(participant.faceUrl)) {
            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            img.addEventListener('load', () => img.classList.add('loaded'));
            img.addEventListener('error', () => img.remove());
            img.src = participant.faceUrl;
            art.appendChild(img);
        }

        const info = el('div', 'card-info', `N°${pad(card.order)} · Collègue ${type.label} · ${card.coffees} café${card.coffees > 1 ? 's' : ''}/jour`);

        const moves = el('div', 'card-moves');
        card.moves.forEach(move => {
            const moveEl = el('div', 'move');
            const head = el('div', 'move-head');
            head.append(
                el('span', 'move-cost', type.icon.repeat(energyCost(move.dmg))),
                el('span', 'move-name', move.name),
                el('span', 'move-dmg', move.dmg ? String(move.dmg) : '')
            );
            moveEl.append(head, el('p', 'move-text', move.text));
            moves.appendChild(moveEl);
        });
        moves.appendChild(el('p', 'card-flavor', card.flavor));

        const footer = el('div', 'card-footer');
        footer.append(
            el('span', 'card-weakness', `Faiblesse : ${card.weakness} ×2`),
            el('span', 'card-rarity', rarity.symbol),
            el('span', 'card-number', `${pad(card.order)}/${pad(card.total)}`)
        );

        face.append(header, art, info, moves, footer);
        frame.appendChild(face);

        // Effets de brillance (activés selon la rareté en CSS)
        const fx = el('div', 'card-fx');
        fx.append(el('div', 'card-shine'), el('div', 'card-holo'), el('div', 'card-glare'));
        if (rarity.sparkles) {
            const sparkles = el('div', 'card-sparkles');
            for (let i = 0; i < rarity.sparkles; i++) {
                const s = el('i');
                s.style.left = `${Math.random() * 100}%`;
                s.style.top = `${Math.random() * 100}%`;
                s.style.setProperty('--s', `${0.5 + Math.random() * 0.9}em`);
                s.style.animationDelay = `${-Math.random() * 2.4}s`;
                sparkles.appendChild(s);
            }
            fx.appendChild(sparkles);
        }

        tilt.append(frame, fx);
        if (withBack) tilt.appendChild(this.buildCardBack());
        cardEl.appendChild(tilt);
        return cardEl;
    }

    buildCardBack() {
        const back = el('div', 'card-back');
        back.append(this.buildEmblem('card-back-emblem'), el('div', 'card-back-title', this.label));
        return back;
    }

    revealTop() {
        const card = this.cards[this.index];
        if (!card) return;
        announcePick(card.participant.id);

        this.root.dataset.glow = card.rarity.shiny ? card.rarity.id : '';
        this.updateProgress();

        if (card.rarity.shiny) {
            this.showBanner(card.rarity);
            this.burst(card.rarity);
        }
        if (card.rarity.id === 'ultra' || card.rarity.id === 'crown') {
            this.fireConfetti(card.rarity);
        }
    }

    updateProgress() {
        this.counter.textContent = `Carte ${this.index + 1} / ${this.cards.length}`;
        this.hint.textContent = this.index === this.cards.length - 1
            ? "Dernière carte ! Glisse-la pour voir l'ordre de passage"
            : '← Glisse la carte pour passer à la suivante →';
    }

    showBanner(rarity) {
        clearTimeout(this.bannerTimer);
        this.banner.textContent = `${rarity.symbol} ${rarity.label.toUpperCase()} ${rarity.symbol}`;
        this.banner.className = `pack-banner rarity-${rarity.id}`;
        void this.banner.offsetWidth;
        this.banner.classList.add('show');
        this.bannerTimer = setTimeout(() => this.banner.classList.remove('show'), 1800);
    }

    burst(rarity) {
        const burst = el('div', `reveal-burst rarity-${rarity.id}`);
        this.stage.appendChild(burst);
        this.later(() => burst.remove(), 1000);
    }

    fireConfetti(rarity) {
        if (typeof window.confetti !== 'function') return;
        const colors = rarity.id === 'crown'
            ? ['FFD700', 'FFF4B0', 'FFB300', 'FFFFFF']
            : ['FF7773', 'FFED5F', 'A8FF5F', '83FFF7', '7894FF', 'D875FF'];
        window.confetti({
            particleCount: rarity.id === 'crown' ? 140 : 70,
            spread: 110,
            startVelocity: 38,
            ticks: 130,
            origin: { x: 0.5, y: 0.55 },
            shapes: ['star', 'circle'],
            scalar: 1.1,
            colors
        });
    }

    topCardEl() {
        const slot = this.slots[this.index];
        return slot ? slot.querySelector('.card') : null;
    }

    // La carte suivante se retourne dès qu'on commence à déplacer celle du dessus
    revealNext() {
        const next = this.slots[this.index + 1];
        if (next) next.classList.add('is-peek');
    }

    startDrag(e) {
        const cardEl = this.topCardEl();
        if (!cardEl || !cardEl.contains(e.target)) return;
        e.preventDefault();
        this.resetTilt(cardEl);
        this.revealNext();
        cardEl.classList.add('dragging');
        cardEl.style.transition = 'none';
        this.drag = {
            cardEl,
            startX: e.clientX,
            startY: e.clientY,
            dx: 0,
            dy: 0,
            samples: [{ x: e.clientX, t: performance.now() }]
        };
    }

    updateDrag(e) {
        const drag = this.drag;
        drag.dx = e.clientX - drag.startX;
        drag.dy = (e.clientY - drag.startY) * 0.6;
        drag.cardEl.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.05}deg)`;

        const now = performance.now();
        drag.samples.push({ x: e.clientX, t: now });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 100) {
            drag.samples.shift();
        }
    }

    endDrag() {
        const { cardEl, dx, dy, samples } = this.drag;
        this.drag = null;
        cardEl.classList.remove('dragging');

        const first = samples[0];
        const last = samples[samples.length - 1];
        const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
        const farEnough = Math.abs(dx) > cardEl.offsetWidth * SWIPE_DISTANCE_RATIO;
        const fastEnough = Math.abs(velocity) > SWIPE_VELOCITY && Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) > 10;

        if (farEnough || fastEnough) {
            this.flyOut(Math.sign(dx) || 1, dy);
            return;
        }

        // Retour élastique
        cardEl.style.transition = 'transform .35s cubic-bezier(.2, 1.4, .4, 1)';
        cardEl.style.transform = '';
        if (Math.abs(dx) < 5) {
            cardEl.classList.remove('nudge');
            void cardEl.offsetWidth;
            cardEl.classList.add('nudge');
        }
    }

    flyOut(direction, dy = 0) {
        if (this.state !== 'cards') return;
        const slot = this.slots[this.index];
        const cardEl = this.topCardEl();
        if (!slot || !cardEl) return;

        this.revealNext();
        slot.classList.add('flying');
        cardEl.classList.remove('nudge');
        cardEl.style.transition = 'transform .5s cubic-bezier(.4, 0, .8, .6), opacity .5s ease';
        cardEl.style.transform = `translate(${direction * window.innerWidth}px, ${dy - 40}px) rotate(${direction * 30}deg)`;
        cardEl.style.opacity = '0';
        this.later(() => slot.remove(), 550);

        this.index++;
        if (this.index >= this.cards.length) {
            this.state = 'summary';
            this.root.dataset.glow = '';
            this.counter.textContent = '';
            this.hint.textContent = '';
            this.later(() => this.showSummary(), 450);
            return;
        }
        this.layoutStack();
        this.later(() => this.revealTop(), 120);
    }

    // ---------- Récapitulatif ----------

    showSummary() {
        this.clearStage();
        this.summary.replaceChildren();

        const subtitle = RARITIES
            .map(rarity => ({ rarity, count: this.cards.filter(c => c.rarity === rarity).length }))
            .filter(({ count }) => count > 0)
            .reverse()
            .map(({ rarity, count }) => `${count} ${rarity.symbol}`)
            .join('  ·  ');

        const grid = el('div', 'summary-grid');
        this.cards.forEach((card, i) => {
            const item = el('div', 'summary-item');
            item.style.animationDelay = `${i * 70}ms`;
            const mini = el('div', 'summary-card');
            mini.append(el('span', 'summary-rank', String(card.order)), this.buildCard(card, false));
            item.append(
                mini,
                el('div', 'summary-name', card.participant.name),
                el('div', 'summary-rarity', card.rarity.label)
            );
            grid.appendChild(item);
        });

        const button = el('button', 'pack-button', 'Ouvrir un nouveau paquet');
        button.addEventListener('click', () => this.reset());

        this.summary.append(
            el('h2', null, 'Ordre de passage'),
            el('div', 'summary-subtitle', subtitle),
            grid,
            button
        );
        this.summary.classList.add('visible');
    }

    // ---------- Entrées ----------

    handlePointerDown(e) {
        if (e.button !== 0) return;
        if (this.state === 'idle' && this.packEl) {
            this.startCut(e);
        } else if (this.state === 'cards') {
            this.startDrag(e);
        }
    }

    handlePointerMove(e) {
        if (this.cut) {
            this.updateCut(e);
        } else if (this.drag) {
            this.updateDrag(e);
        } else if (this.isVisible()) {
            this.updateHoverTilt(e);
        }
    }

    handlePointerUp() {
        if (this.cut) {
            this.cancelCut();
        } else if (this.drag) {
            this.endDrag();
        }
    }

    handleKeyDown(e) {
        if (!this.isVisible()) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select, button')) return;
        if (document.getElementById('setup-form')?.classList.contains('active')) return;
        if (!['ArrowRight', 'ArrowLeft', ' ', 'Enter'].includes(e.key)) return;

        e.preventDefault();
        if (this.state === 'idle') {
            this.autoCut();
        } else if (this.state === 'cards' && !this.drag) {
            this.flyOut(e.key === 'ArrowLeft' ? -1 : 1);
        } else if (this.state === 'summary' && this.summary.classList.contains('visible') && (e.key === 'Enter' || e.key === ' ')) {
            this.reset();
        }
    }

    // Inclinaison 3D + reflet qui suivent le pointeur (paquet ou carte du dessus)
    updateHoverTilt(e) {
        let target = null;
        if (this.state === 'idle') target = this.packEl;
        else if (this.state === 'cards') target = this.topCardEl();

        if (this.hovered && this.hovered !== target) this.resetTilt(this.hovered);
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        if (px < 0 || px > 1 || py < 0 || py > 1) {
            this.resetTilt(target);
            return;
        }

        this.hovered = target;
        target.classList.add('hovering');
        target.style.setProperty('--rx', `${(px - 0.5) * TILT_MAX_DEG}deg`);
        target.style.setProperty('--ry', `${(0.5 - py) * TILT_MAX_DEG}deg`);
        target.style.setProperty('--mx', `${px * 100}%`);
        target.style.setProperty('--my', `${py * 100}%`);
        target.style.setProperty('--glare-o', '0.7');
    }

    resetTilt(target) {
        if (!target) return;
        target.classList.remove('hovering');
        ['--rx', '--ry', '--mx', '--my', '--glare-o'].forEach(prop => target.style.removeProperty(prop));
        if (this.hovered === target) this.hovered = null;
    }
}
