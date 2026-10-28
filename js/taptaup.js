// Sélecteur "Tap Taupe" : un jardin avec un terrier par participant.
// Pendant la partie, les taupes sortent et rentrent au hasard et le marteau tape sans relâche :
// elles esquivent toutes, jusqu'à la fin de la durée où son coup suivant assomme l'élu, tiré au sort.
// Tout est en DOM / SVG / CSS (comme le Pack opening), la partie se déroule toute seule.

import { announcePick, announceRoundReset } from './participants.js';
import { TapTaupeSounds } from './taptaupSounds.js';
import { panelElement } from './configWindow.js';
import { formatSeconds } from './ovniSettings.js';
import {
    loadGameDuration, saveGameDuration,
    GAME_DURATION_MIN, GAME_DURATION_MAX, GAME_DURATION_STEP
} from './taptaupSettings.js';

// Couleurs des pancartes et des cadres photo, attribuées d'après l'identifiant du participant
const PALETTE = ['#ff6b6b', '#ff922b', '#fcc419', '#51cf66', '#22b8cf', '#4c6ef5', '#9775fa', '#f06595'];

// Un terrier est une boîte de w x 1.5w (viewBox 100 x 150) : 1 unité = w / 100 px
const BURROW_MAX = 190;      // px
const BURROW_MIN = 56;
const CELL_GAP = 1.2;        // largeur d'une case / largeur d'un terrier
const ROW_STEP = 1.08;       // écart vertical entre deux rangées, en largeur de terrier
const ROW_HEIGHT = 1.4;      // hauteur occupée par une rangée (pancarte comprise)
const HEAD_Y = 0.2;          // haut de la tête d'une taupe sortie (en w depuis le haut de la boîte)
const HOLE_Y = 0.97;         // bord du trou, là où tape le marteau quand il rate

// Marteau (viewBox 240 x 120) : point de frappe (dessous de la tête), le pivot est la poignée
const HAMMER_RATIO = 1.9;    // largeur du marteau / largeur d'un terrier
const STRIKE_X = 45 / 240;
const STRIKE_Y = 110 / 120;
const ANGLE_RAISED = 38;

// Rythme de la partie : [début, fin], ça s'accélère
const SPAWN_INTERVAL = [520, 190]; // ms entre deux sorties
const UP_TIME = [950, 480];        // ms passées dehors
const SWING_INTERVAL = [650, 260]; // ms de pause entre deux coups (ratés)

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => min + Math.random() * (max - min);
const pick = (array) => array[Math.floor(Math.random() * array.length)];

function hash(text) {
    let h = 0;
    for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
}

function hasPhoto(url) {
    return !!url && url !== 'null' && url !== window.location.href;
}

function initials(name) {
    return String(name).trim().split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase() || '?';
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function participantKey(participant) {
    return participant.id || participant.name;
}

// ---------- Dessins ----------

// Dégradés et découpes partagés par tous les terriers et le marteau
const DEFS = `
<svg class="tt-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="tt-fur" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6f4327"/><stop offset=".45" stop-color="#9a6540"/><stop offset="1" stop-color="#63391f"/>
    </linearGradient>
    <radialGradient id="tt-dirt" cx=".5" cy=".3" r=".75">
        <stop offset="0" stop-color="#a06a3b"/><stop offset="1" stop-color="#6b4021"/>
    </radialGradient>
    <linearGradient id="tt-dirt-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b9824d"/><stop offset="1" stop-color="#7a4924"/>
    </linearGradient>
    <radialGradient id="tt-hole" cx=".5" cy=".7" r=".65">
        <stop offset="0" stop-color="#120802"/><stop offset="1" stop-color="#3d2413"/>
    </radialGradient>
    <linearGradient id="tt-hammer-head" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff8a7a"/><stop offset=".35" stop-color="#ea4a3f"/><stop offset="1" stop-color="#a3201c"/>
    </linearGradient>
    <linearGradient id="tt-hammer-band" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f7f9fa"/><stop offset=".4" stop-color="#cfd8dc"/><stop offset="1" stop-color="#78909c"/>
    </linearGradient>
    <linearGradient id="tt-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f2c38a"/><stop offset="1" stop-color="#b07440"/>
    </linearGradient>
    <clipPath id="tt-well" clipPathUnits="userSpaceOnUse">
        <path d="M-30 -60 H130 V100 H88 A38 12 0 0 1 12 100 H-30 Z"/>
    </clipPath>
    <clipPath id="tt-face-clip" clipPathUnits="userSpaceOnUse">
        <circle cx="50" cy="50" r="22.5"/>
    </clipPath>
</defs></svg>`;

const HAMMER = `
<svg viewBox="0 0 240 120" aria-hidden="true">
    <rect x="72" y="52" width="160" height="16" rx="8" fill="url(#tt-wood)"/>
    <rect x="190" y="49" width="46" height="22" rx="11" fill="#2f3542"/>
    <path d="M200 49 v22 M210 49 v22 M220 49 v22 M230 50 v20" stroke="#57606f" stroke-width="3"/>
    <rect x="10" y="12" width="70" height="98" rx="14" fill="url(#tt-hammer-head)"/>
    <rect x="7" y="22" width="76" height="11" rx="5" fill="url(#tt-hammer-band)"/>
    <rect x="7" y="89" width="76" height="11" rx="5" fill="url(#tt-hammer-band)"/>
    <rect x="20" y="38" width="9" height="46" rx="4.5" fill="#fff" opacity=".35"/>
</svg>`;

// Visage dessiné, pour les participants sans photo
const DRAWN_FACE = `
<g class="tt-eyes">
    <ellipse cx="39" cy="47" rx="4.2" ry="5.6" fill="#1b1b1b"/><circle cx="40.4" cy="45.2" r="1.5" fill="#fff"/>
    <ellipse cx="61" cy="47" rx="4.2" ry="5.6" fill="#1b1b1b"/><circle cx="62.4" cy="45.2" r="1.5" fill="#fff"/>
</g>
<path class="tt-eyes-x" d="M35 43 l8 8 M43 43 l-8 8 M57 43 l8 8 M65 43 l-8 8" stroke="#1b1b1b" stroke-width="2.6" stroke-linecap="round"/>
<ellipse cx="32" cy="59" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/>
<ellipse cx="68" cy="59" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/>
<ellipse cx="50" cy="64" rx="15" ry="10.5" fill="#ecc9a2"/>
<path d="M36 62 h-12 M36 65.5 l-11 3 M64 62 h12 M64 65.5 l11 3" stroke="#5a3520" stroke-width="1" opacity=".5"/>
<path d="M44 67 Q50 72 56 67" stroke="#5a3520" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<rect x="46.6" y="68.4" width="6.8" height="6" rx="1.2" fill="#fff" stroke="#d8cbb8" stroke-width=".6"/>
<path d="M50 68.6 V74.2" stroke="#d8cbb8" stroke-width=".6"/>
<ellipse cx="50" cy="58" rx="6.5" ry="4.6" fill="#ff6f91"/>
<ellipse cx="48" cy="56.6" rx="2" ry="1.2" fill="#fff" opacity=".7"/>`;

// Visage photo : la photo du participant dans un cadre à sa couleur, avec un museau de taupe
const PHOTO_FACE = `
<circle cx="50" cy="50" r="25" fill="currentColor"/>
<image class="tt-photo" x="27.5" y="27.5" width="45" height="45" preserveAspectRatio="xMidYMid slice" clip-path="url(#tt-face-clip)"/>
<path d="M43 77 h-12 M43 79.5 l-10 3 M57 77 h12 M57 79.5 l10 3" stroke="#5a3520" stroke-width="1" opacity=".5"/>
<ellipse cx="50" cy="76.5" rx="6" ry="4.2" fill="#ff6f91"/>
<ellipse cx="48.4" cy="75.3" rx="1.8" ry="1.1" fill="#fff" opacity=".7"/>`;

const BURROW = `
<svg class="tt-art" viewBox="0 0 100 150" aria-hidden="true">
    <ellipse cx="52" cy="108" rx="50" ry="19" fill="#1d4d14" opacity=".25"/>
    <ellipse cx="50" cy="104" rx="50" ry="19" fill="url(#tt-dirt)"/>
    <ellipse cx="50" cy="100" rx="38" ry="12" fill="url(#tt-hole)"/>
    <g clip-path="url(#tt-well)">
        <g class="tt-mole">
            <g class="tt-mole-body">
                <circle cx="24" cy="34" r="8" fill="#5e371e"/><circle cx="24" cy="34" r="4" fill="#e89a9a"/>
                <circle cx="76" cy="34" r="8" fill="#5e371e"/><circle cx="76" cy="34" r="4" fill="#e89a9a"/>
                <path d="M18 150 V54 C18 32 32 20 50 20 C68 20 82 32 82 54 V150 Z" fill="url(#tt-fur)"/>
                <path d="M30 30 C36 24 44 22 50 22" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".18"/>
                <ellipse cx="50" cy="104" rx="24" ry="28" fill="#d6a479"/>
                <g class="tt-face"></g>
                <ellipse cx="31" cy="96" rx="8.5" ry="5.5" fill="#f4aaa8"/>
                <ellipse cx="69" cy="96" rx="8.5" ry="5.5" fill="#f4aaa8"/>
                <path d="M27 93 v4 M31 92.5 v4.5 M35 93 v4 M65 93 v4 M69 92.5 v4.5 M73 93 v4" stroke="#c97a78" stroke-width="1.1" stroke-linecap="round"/>
                <g class="tt-bump">
                    <ellipse cx="50" cy="20" rx="9" ry="7" fill="#ff8a80"/>
                    <ellipse cx="47.5" cy="17.5" rx="3" ry="2" fill="#fff" opacity=".6"/>
                </g>
            </g>
        </g>
    </g>
    <path d="M0 104 A50 19 0 0 0 100 104 L88 100 A38 12 0 0 1 12 100 Z" fill="url(#tt-dirt-front)"/>
    <path d="M88 100 A38 12 0 0 1 12 100" fill="none" stroke="#d29a63" stroke-width="2" stroke-linecap="round"/>
    <circle cx="22" cy="112" r="2.2" fill="#8a5a33"/><circle cx="77" cy="114" r="1.8" fill="#8a5a33"/><circle cx="61" cy="119" r="1.4" fill="#d1a173"/>
    <path d="M-3 108 q3 -9 4 -15 q1 8 3 15 z M3 110 q4 -8 6 -13 q0 8 1 13 z" fill="#3e9a37"/>
    <path d="M103 108 q-3 -9 -4 -15 q-1 8 -3 15 z M97 110 q-4 -8 -6 -13 q0 8 -1 13 z" fill="#3e9a37"/>
</svg>
<div class="tt-stars" aria-hidden="true"><span>★</span><span>★</span><span>★</span></div>
<div class="tt-sign"></div>`;

const TUFT = '<path d="M0 20 Q5 10 6 0 Q9 12 11 20 Z M9 20 Q14 6 16 1 Q18 12 19 20 Z M17 20 Q23 9 28 5 Q24 14 25 20 Z" fill="currentColor"/>';
const FLOWER = `
<path d="M14 20 V11" stroke="#3e9a37" stroke-width="1.5"/>
<g fill="#fff"><circle cx="14" cy="5" r="3"/><circle cx="18.3" cy="8.2" r="3"/><circle cx="16.6" cy="13" r="3"/><circle cx="11.4" cy="13" r="3"/><circle cx="9.7" cy="8.2" r="3"/></g>
<circle cx="14" cy="9.3" r="2.6" fill="#fcc419"/>`;

// Étoile « BONK » : polygone à pointes
function burstPoints(spikes = 12) {
    const points = [];
    for (let i = 0; i < spikes * 2; i++) {
        const angle = (i / (spikes * 2)) * Math.PI * 2;
        const radius = i % 2 === 0 ? 50 : 34 + (i % 4 === 1 ? 4 : 0);
        points.push(`${(50 + Math.cos(angle) * radius).toFixed(1)},${(50 + Math.sin(angle) * radius * 0.78).toFixed(1)}`);
    }
    return points.join(' ');
}

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export class TapTaupePicker {
    constructor(container, audioManager = null) {
        this.container = container;
        this.audio = audioManager;
        this.sounds = new TapTaupeSounds(() => !!audioManager?.isMuted);
        this.duration = loadGameDuration();
        this.burrows = [];   // { key, participant, color, el, up, targeted, timer, left, top, w }
        this.state = 'empty'; // empty | idle | playing | reveal | leaving | done
        this.chosen = null;
        this.revealReady = false;
        this.run = 0;        // incrémenté à chaque partie : les étapes d'une partie annulée s'arrêtent
        this.timers = new Set();
        this.idleTimer = null;
        this.hammerAngle = ANGLE_RAISED;
        this.hammerTarget = null;
        this.hammerW = 300;

        this.buildDom();
        this.bindEvents();
        this.bindSettings();
        this.layout(true);
        this.parkHammer(true);
        this.refresh();
        this.scheduleIdle();
    }

    // ---------- Structure ----------

    buildDom() {
        this.root = el('div', 'taptaup-picker');
        this.root.innerHTML = `${DEFS}
            <div class="tt-scene">
                <div class="tt-sky">
                    <div class="tt-sun"></div>
                    <div class="tt-cloud" style="--top: 9%; --scale: 1; --speed: 95s; --delay: -20s"></div>
                    <div class="tt-cloud" style="--top: 17%; --scale: .7; --speed: 130s; --delay: -75s"></div>
                    <div class="tt-cloud" style="--top: 5%; --scale: .55; --speed: 160s; --delay: -120s"></div>
                </div>
                <svg class="tt-hills" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 110 C150 30 300 50 430 105 C540 50 720 20 1000 90 V200 H0 Z" fill="#8fd17b"/>
                    <path d="M0 150 C200 85 380 105 530 150 C660 100 830 85 1000 135 V200 H0 Z" fill="#6cbd5a"/>
                </svg>
                <div class="tt-fence"></div>
                <div class="tt-lawn"></div>
                <div class="tt-field"></div>
                <div class="tt-spot"></div>
                <div class="tt-hammer">
                    <div class="tt-hammer-flip"><div class="tt-hammer-swing">${HAMMER}</div></div>
                </div>
                <div class="tt-fx"></div>
            </div>
            <div class="tt-flash"></div>
            <div class="tt-message"></div>
            <div class="tt-reveal" role="status" aria-live="polite"></div>
            <div class="tt-hint"></div>`;

        this.scene = this.root.querySelector('.tt-scene');
        this.field = this.root.querySelector('.tt-field');
        this.spot = this.root.querySelector('.tt-spot');
        this.hammerEl = this.root.querySelector('.tt-hammer');
        this.hammerFlip = this.root.querySelector('.tt-hammer-flip');
        this.hammerSwing = this.root.querySelector('.tt-hammer-swing');
        this.fx = this.root.querySelector('.tt-fx');
        this.flashEl = this.root.querySelector('.tt-flash');
        this.message = this.root.querySelector('.tt-message');
        this.reveal = this.root.querySelector('.tt-reveal');
        this.hint = this.root.querySelector('.tt-hint');
        this.hammerSwing.style.transform = `rotate(${ANGLE_RAISED}deg)`;

        // Touffes d'herbe et pâquerettes, plus grandes au premier plan
        const lawn = this.root.querySelector('.tt-lawn');
        for (let i = 0; i < 34; i++) {
            const y = Math.random();
            const flower = Math.random() < 0.3;
            const deco = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            deco.setAttribute('class', 'tt-deco');
            deco.setAttribute('viewBox', '0 0 28 20');
            deco.setAttribute('aria-hidden', 'true');
            deco.innerHTML = flower ? FLOWER : TUFT;
            deco.style.left = `${(Math.random() * 98).toFixed(1)}%`;
            deco.style.top = `${(y * 94).toFixed(1)}%`;
            deco.style.width = `${Math.round(14 + y * 26)}px`;
            deco.style.color = pick(['#3e9a37', '#4caf50', '#378a30']);
            lawn.appendChild(deco);
        }

        this.container.appendChild(this.root);
    }

    bindEvents() {
        this.onClick = (e) => {
            if (e.button !== 0) return;
            this.sounds.unlock();
            this.action();
        };
        this.onKeyDown = (e) => {
            if (!this.isVisible()) return;
            if (e.target instanceof Element && e.target.closest('input, textarea, select, button')) return;
            if (document.getElementById('setup-form')?.classList.contains('active')) return;
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            this.sounds.unlock();
            this.action();
        };
        this.onResize = () => {
            if (this.isVisible()) this.layout(true);
        };
        this.root.addEventListener('click', this.onClick);
        document.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('resize', this.onResize);
    }

    // Réglages du mode (durée, bruitages) dans le panneau de configuration
    bindSettings() {
        const input = panelElement('taptaup-duration');
        const output = panelElement('taptaup-duration-value');
        if (input) {
            input.min = String(GAME_DURATION_MIN);
            input.max = String(GAME_DURATION_MAX);
            input.step = String(GAME_DURATION_STEP);
            input.value = String(this.duration);
            if (output) output.textContent = formatSeconds(this.duration);
            input.addEventListener('input', () => {
                this.duration = Number(input.value);
                saveGameDuration(this.duration);
                if (output) output.textContent = formatSeconds(this.duration);
            });
        }

        const soundInput = panelElement('taptaup-sound-input');
        if (soundInput) {
            soundInput.checked = this.sounds.enabled;
            soundInput.addEventListener('change', () => this.sounds.setEnabled(soundInput.checked));
        }
    }

    show() {
        this.root.style.display = '';
        this.layout(true);
        this.parkHammer(true);
        this.refresh();
    }

    // Quitter le mode interrompt la partie en cours
    hide() {
        this.reset();
        this.root.style.display = 'none';
    }

    isVisible() {
        return this.root.style.display !== 'none';
    }

    // ---------- Minuteries ----------

    later(fn, ms) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, ms);
        this.timers.add(id);
        return id;
    }

    cancel(id) {
        if (id === null || id === undefined) return;
        clearTimeout(id);
        this.timers.delete(id);
    }

    clearTimers() {
        this.timers.forEach(id => clearTimeout(id));
        this.timers.clear();
        this.idleTimer = null;
    }

    // Pause dans une étape de la partie ; renvoie false si la partie a été annulée entre-temps
    wait(ms, run) {
        return new Promise(resolve => this.later(() => resolve(run === this.run), ms));
    }

    // ---------- API utilisée par Game ----------

    setParticipants(participants) {
        const list = participants.filter(p => p.display !== false);
        // La partie visait des terriers qui vont changer : on l'interrompt.
        // Idem si l'élu est remis dans le tirage (nouveau tour, correction manuelle) pendant sa révélation.
        const chosenBack = this.chosen && list.some(p => participantKey(p) === this.chosen.key);
        if (this.state === 'playing'
            || ((this.state === 'reveal' || this.state === 'leaving') && chosenBack)) {
            this.abort();
        }

        // Pendant la révélation, l'élu (déjà marqué comme passé) reste jusqu'au clic
        const keep = this.state === 'reveal' ? this.chosen : null;
        const existing = new Map(this.burrows.map(b => [b.key, b]));
        const next = list.map((participant) => {
            const key = participantKey(participant);
            const burrow = existing.get(key);
            if (!burrow) return this.createBurrow(participant);
            existing.delete(key);
            this.updateBurrow(burrow, participant);
            return burrow;
        });
        if (keep && existing.has(keep.key)) {
            existing.delete(keep.key);
            next.splice(Math.min(this.burrows.indexOf(keep), next.length), 0, keep);
        }
        existing.forEach(burrow => this.removeBurrow(burrow));
        this.burrows = next;

        if (this.state !== 'reveal') {
            this.state = next.length ? 'idle' : (this.state === 'done' ? 'done' : 'empty');
        }
        this.layout();
        this.refresh();
        this.scheduleIdle();
    }

    // Remet le jardin au repos (relance de partie, changement de mode)
    reset() {
        const chosen = this.state === 'reveal' || this.state === 'leaving' ? this.chosen : null;
        this.abort();
        if (chosen) {
            this.removeBurrow(chosen);
            this.burrows = this.burrows.filter(b => b !== chosen);
            this.state = this.burrows.length ? 'idle' : 'empty';
            this.layout();
        }
        this.refresh();
    }

    dispose() {
        this.clearTimers();
        this.root.removeEventListener('click', this.onClick);
        document.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('resize', this.onResize);
        this.root.remove();
    }

    // ---------- Terriers ----------

    createBurrow(participant) {
        const node = el('div', 'tt-burrow is-entering');
        node.innerHTML = BURROW;
        const burrow = {
            key: participantKey(participant),
            participant: null,
            color: PALETTE[hash(participantKey(participant)) % PALETTE.length],
            el: node,
            up: false,
            targeted: false,
            timer: null,
            left: 0,
            top: 0,
            w: 0
        };
        node.style.color = burrow.color;
        node.style.setProperty('--c', burrow.color);
        node.style.setProperty('--tilt', `${(hash(burrow.key) % 7) - 3}deg`);
        this.updateBurrow(burrow, participant);
        this.field.appendChild(node);
        // Le terrier sort de terre à sa place (après le premier placement)
        requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('is-entering')));
        return burrow;
    }

    updateBurrow(burrow, participant) {
        const previous = burrow.participant;
        burrow.participant = participant;
        if (previous?.name !== participant.name) {
            const sign = burrow.el.querySelector('.tt-sign');
            sign.textContent = participant.name;
            sign.title = participant.name;
        }
        if (previous && previous.faceUrl === participant.faceUrl) return;
        const face = burrow.el.querySelector('.tt-face');
        if (hasPhoto(participant.faceUrl)) {
            face.innerHTML = PHOTO_FACE;
            face.querySelector('.tt-photo').setAttribute('href', participant.faceUrl);
        } else {
            face.innerHTML = DRAWN_FACE;
        }
        burrow.el.classList.toggle('has-photo', hasPhoto(participant.faceUrl));
    }

    removeBurrow(burrow) {
        this.cancel(burrow.timer);
        burrow.el.classList.add('is-leaving');
        setTimeout(() => burrow.el.remove(), 450);
    }

    // Répartit les terriers en rangées centrées, le plus grands possible
    layout(instant = false) {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const n = this.burrows.length;
        const side = 16;
        const top = Math.max(90, H * 0.2);
        const bottom = 72;
        const fieldW = W - side * 2;
        const fieldH = Math.max(120, H - top - bottom);

        let best = { w: 0, rows: 1 };
        for (let rows = 1; rows <= Math.max(1, n); rows++) {
            const cols = Math.ceil(Math.max(1, n) / rows);
            const w = Math.min(fieldW / (cols * CELL_GAP), fieldH / ((rows - 1) * ROW_STEP + ROW_HEIGHT), BURROW_MAX);
            if (w > best.w + 0.5) best = { w, rows };
        }
        const w = Math.max(BURROW_MIN, Math.floor(best.w));
        const rows = best.rows;
        this.hammerW = clamp(w * HAMMER_RATIO, 150, 380);
        this.hammerEl.style.width = `${this.hammerW}px`;
        this.hammerEl.style.height = `${this.hammerW / 2}px`;

        if (instant) this.root.classList.add('no-anim');

        // Plus de terriers sur les rangées de devant ; les trous restent sur la pelouse
        const totalH = (rows - 1) * ROW_STEP * w + ROW_HEIGHT * w;
        const centered = top + (fieldH - totalH) / 2;
        const y0 = Math.min(Math.max(centered, H * 0.36 - w), H - bottom - totalH);
        const base = Math.floor(n / rows);
        const extra = n % rows;
        let index = 0;
        for (let row = 0; row < rows; row++) {
            const count = base + (row >= rows - extra ? 1 : 0);
            const cell = w * CELL_GAP;
            const x0 = side + (fieldW - count * cell) / 2;
            for (let col = 0; col < count; col++) {
                const burrow = this.burrows[index++];
                const h = hash(burrow.key);
                burrow.w = w;
                burrow.left = x0 + col * cell + (cell - w) / 2 + ((h % 7) - 3) * w * 0.012;
                burrow.top = y0 + row * ROW_STEP * w + (((h >> 3) % 5) - 2) * w * 0.015;
                const style = burrow.el.style;
                style.left = `${burrow.left}px`;
                style.top = `${burrow.top}px`;
                style.setProperty('--w', `${w}px`);
                style.zIndex = String(10 + row);
            }
        }

        if (this.hammerTarget && this.burrows.includes(this.hammerTarget.burrow)) {
            this.aimAt(this.hammerTarget.burrow, this.hammerTarget.spot, 0);
        } else if (this.state !== 'playing') {
            this.parkHammer(true);
        }
        if (this.chosen && this.spot.classList.contains('visible')) this.placeSpot(this.chosen);

        if (instant) {
            void this.root.offsetWidth;
            this.root.classList.remove('no-anim');
        }
    }

    headPoint(burrow) {
        return { x: burrow.left + burrow.w / 2, y: burrow.top + burrow.w * HEAD_Y };
    }

    holePoint(burrow) {
        return { x: burrow.left + burrow.w / 2, y: burrow.top + burrow.w * HOLE_Y };
    }

    // ---------- Taupes ----------

    moleUp(burrow, stay = 0, sound = true) {
        this.cancel(burrow.timer);
        burrow.timer = null;
        burrow.up = true;
        burrow.el.classList.remove('is-peek');
        burrow.el.classList.add('is-up');
        if (sound) this.sounds.pop();
        if (stay) burrow.timer = this.later(() => this.moleDown(burrow), stay);
    }

    moleDown(burrow, sound = Math.random() < 0.5) {
        this.cancel(burrow.timer);
        burrow.timer = null;
        if (burrow.up && sound) this.sounds.duck();
        burrow.up = false;
        burrow.el.classList.remove('is-up', 'is-peek');
    }

    // Au repos, une taupe passe parfois la tête pour regarder autour d'elle
    scheduleIdle() {
        this.cancel(this.idleTimer);
        this.idleTimer = this.later(() => {
            this.idleTimer = null;
            if (this.state === 'idle' && this.isVisible() && !document.hidden) {
                const free = this.burrows.filter(b => !b.up && !b.el.classList.contains('is-peek'));
                if (free.length) {
                    const burrow = pick(free);
                    burrow.el.classList.add('is-peek');
                    this.later(() => burrow.el.classList.remove('is-peek'), 1500);
                }
            }
            if (this.state === 'idle') this.scheduleIdle();
        }, random(900, 2400));
    }

    // ---------- Marteau ----------

    // Place le point de frappe du marteau au-dessus d'un point ; il se retourne sur la droite de l'écran
    placeHammer(point, flip, duration) {
        const hw = this.hammerW;
        const x = point.x - (flip ? 1 - STRIKE_X : STRIKE_X) * hw;
        const y = point.y - STRIKE_Y * (hw / 2);
        this.hammerEl.style.transitionDuration = `${duration}ms`;
        this.hammerFlip.style.transitionDuration = `${duration}ms`;
        this.hammerEl.style.transform = `translate(${x}px, ${y}px)`;
        this.hammerFlip.classList.toggle('is-flipped', flip);
    }

    aimAt(burrow, spot, duration) {
        this.hammerTarget = { burrow, spot };
        const point = spot === 'head' ? this.headPoint(burrow) : this.holePoint(burrow);
        this.placeHammer(point, point.x > window.innerWidth * 0.58, duration);
    }

    // Hors de l'écran, à droite
    parkHammer(instant = false) {
        this.hammerTarget = null;
        this.placeHammer({ x: window.innerWidth + this.hammerW * 0.35, y: window.innerHeight * 0.45 }, false, instant ? 0 : 500);
    }

    rotateHammer(angle, duration, easing = 'ease-out') {
        const from = this.hammerAngle;
        this.hammerAngle = angle;
        this.hammerSwing.style.transform = `rotate(${angle}deg)`;
        if (!duration || !this.hammerSwing.animate) return Promise.resolve();
        const animation = this.hammerSwing.animate(
            [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${angle}deg)` }],
            { duration, easing }
        );
        return animation.finished.then(() => {}, () => {});
    }

    // ---------- Partie ----------

    action() {
        if (this.state === 'idle') {
            this.startGame();
        } else if (this.state === 'reveal' && this.revealReady) {
            this.dismissChosen();
        } else if (this.state === 'done') {
            // Nouveau tour : le gestionnaire remet tout le monde dans la liste et nous la renvoie
            announceRoundReset();
        }
    }

    progress() {
        return clamp((performance.now() - this.startTime) / (this.duration * 1000), 0, 1);
    }

    startGame() {
        if (this.state !== 'idle' || this.burrows.length === 0) return;
        const run = ++this.run;
        this.clearTimers();
        this.burrows.forEach(b => this.moleDown(b, false));
        this.state = 'playing';
        this.startTime = performance.now();
        this.refresh();
        this.audio?.playSelectionMusic('taptaup');

        // Le marteau entre en scène
        this.rotateHammer(ANGLE_RAISED, 0);
        this.aimAt(pick(this.burrows), 'hole', 450);
        this.later(() => this.spawnLoop(run), 250);
        this.later(() => this.hammerLoop(run), 600);
    }

    playing(run) {
        return run === this.run && this.state === 'playing';
    }

    // Les taupes sortent de plus en plus vite
    spawnLoop(run) {
        if (!this.playing(run)) return;
        const t = this.progress();
        const upCount = this.burrows.filter(b => b.up).length;
        const max = Math.max(1, Math.ceil(this.burrows.length * 0.5));
        const free = this.burrows.filter(b => !b.up && !b.targeted);
        if (upCount < max && free.length) {
            this.moleUp(pick(free), lerp(UP_TIME[0], UP_TIME[1], t) * random(0.8, 1.2));
        }
        this.later(() => this.spawnLoop(run), lerp(SPAWN_INTERVAL[0], SPAWN_INTERVAL[1], t) * random(0.7, 1.3));
    }

    // Le marteau tape sans relâche et les taupes esquivent au dernier moment,
    // jusqu'à ce que la durée de la partie soit écoulée : le coup suivant fait mouche
    async hammerLoop(run) {
        if (!this.playing(run)) return;
        const success = this.progress() >= 1;
        let target;
        if (success) {
            // L'élu, tiré au sort, sort (ou reste dehors) et n'esquivera pas
            target = pick(this.burrows);
            this.moleUp(target, 0, !target.up);
        } else {
            const ups = this.burrows.filter(b => b.up);
            target = ups.length ? pick(ups) : pick(this.burrows);
        }
        target.targeted = true;
        this.aimAt(target, success ? 'head' : 'hole', 220);
        const ok = await this.wait(230, run);
        if (!ok || !this.playing(run)) {
            target.targeted = false;
            return;
        }

        this.sounds.swing();
        if (!success && target.up) this.later(() => this.moleDown(target, true), 50);
        await this.rotateHammer(-3, 120, 'cubic-bezier(.6,0,1,.6)');
        if (!this.playing(run)) {
            target.targeted = false;
            return;
        }
        if (success) {
            this.bonk(run, target);
            return;
        }
        this.sounds.thump();
        this.dust(this.holePoint(target), 0.8);
        this.shake(0.35);
        await this.wait(80, run);
        await this.rotateHammer(ANGLE_RAISED, 200);
        target.targeted = false;
        if (!this.playing(run)) return;

        // Une fois sur trois, elle ressort narguer le marteau
        if (Math.random() < 0.33) {
            this.later(() => {
                if (this.playing(run) && !target.up) this.moleUp(target, 420);
            }, 120);
        }
        this.later(() => this.hammerLoop(run), lerp(SWING_INTERVAL[0], SWING_INTERVAL[1], this.progress()) * random(0.7, 1.3));
    }

    // Touché : la partie s'arrête sur l'élu
    async bonk(run, chosen) {
        this.state = 'reveal';
        this.chosen = chosen;
        this.revealReady = false;
        this.burrows.forEach((b) => {
            b.targeted = false;
            if (b !== chosen) this.moleDown(b, false);
        });
        chosen.el.classList.add('is-bonked');
        this.sounds.bonk();
        this.audio?.stopSelectionMusic();
        this.audio?.playPickSound('taptaup');
        announcePick(chosen.participant.id);

        const head = this.headPoint(chosen);
        this.shake(1);
        this.flash();
        this.bonkText({ x: head.x + chosen.w * 0.35, y: head.y - chosen.w * 0.1 }, chosen.w);
        this.dust(this.holePoint(chosen), 1.3);
        this.confetti(head);
        this.placeSpot(chosen);
        this.refresh();

        if (!await this.wait(280, run)) return;
        await this.rotateHammer(ANGLE_RAISED, 260);
        if (run !== this.run) return;
        this.parkHammer();
        if (!await this.wait(350, run)) return;
        this.showReveal(chosen);
        this.revealReady = true;
        this.refresh();
    }

    // Clic après la révélation : l'élu rentre et son terrier se rebouche
    dismissChosen() {
        const chosen = this.chosen;
        this.revealReady = false;
        this.state = 'leaving';
        this.audio?.stopPickSound();
        this.hideReveal();
        chosen.el.classList.remove('is-bonked');
        this.moleDown(chosen, true);
        this.refresh();
        const run = this.run;
        this.later(() => {
            if (run !== this.run) return;
            this.sounds.fill();
            this.removeBurrow(chosen);
            this.burrows = this.burrows.filter(b => b !== chosen);
            this.chosen = null;
            this.state = this.burrows.length ? 'idle' : 'done';
            this.layout();
            this.refresh();
            this.scheduleIdle();
        }, 320);
    }

    // Annule la partie en cours et range tout
    abort() {
        this.run++;
        this.clearTimers();
        this.audio?.stopSelectionMusic();
        this.audio?.stopPickSound();
        this.burrows.forEach((b) => {
            b.targeted = false;
            this.moleDown(b, false);
            b.el.classList.remove('is-bonked');
        });
        this.hideReveal();
        this.chosen = null;
        this.revealReady = false;
        this.rotateHammer(ANGLE_RAISED, 0);
        this.parkHammer();
        this.state = this.burrows.length ? 'idle' : 'empty';
        this.scheduleIdle();
    }

    // ---------- Effets ----------

    dust(point, strength = 1) {
        const puff = el('div', 'tt-dust');
        puff.style.left = `${point.x}px`;
        puff.style.top = `${point.y}px`;
        const count = Math.round(7 * strength);
        for (let i = 0; i < count; i++) {
            const angle = Math.PI + (i / (count - 1)) * Math.PI + random(-0.2, 0.2);
            const distance = random(30, 60) * strength;
            const grain = el('i');
            grain.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
            grain.style.setProperty('--dy', `${Math.sin(angle) * distance * 0.6}px`);
            grain.style.setProperty('--s', `${random(6, 13) * Math.min(1.4, strength)}px`);
            puff.appendChild(grain);
        }
        this.fx.appendChild(puff);
        setTimeout(() => puff.remove(), 700);
    }

    shake(strength) {
        if (REDUCED_MOTION?.matches || !this.scene.animate) return;
        const k = 7 * strength;
        this.scene.animate([
            { transform: 'translate(0, 0)' },
            { transform: `translate(${-k}px, ${k * 0.6}px)` },
            { transform: `translate(${k * 0.8}px, ${-k * 0.4}px)` },
            { transform: `translate(${-k * 0.5}px, ${k * 0.3}px)` },
            { transform: 'translate(0, 0)' }
        ], { duration: 260 + 120 * strength, easing: 'ease-out' });
    }

    flash() {
        if (REDUCED_MOTION?.matches || !this.flashEl.animate) return;
        this.flashEl.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 280, easing: 'ease-out' });
    }

    bonkText(point, w) {
        const bonk = el('div', 'tt-bonk');
        bonk.style.left = `${point.x}px`;
        bonk.style.top = `${point.y}px`;
        bonk.style.setProperty('--size', `${clamp(w * 0.3, 26, 60)}px`);
        bonk.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="${burstPoints()}"/></svg><span>BONK !</span>`;
        this.fx.appendChild(bonk);
        setTimeout(() => bonk.remove(), 1300);
    }

    confetti(point) {
        if (typeof window.confetti !== 'function') return;
        window.confetti({
            particleCount: 90,
            spread: 100,
            startVelocity: 34,
            ticks: 140,
            origin: { x: point.x / window.innerWidth, y: point.y / window.innerHeight },
            shapes: ['star', 'circle'],
            colors: ['FFD43B', 'FF6B6B', '51CF66', '4DABF7', 'FFFFFF', 'F06595']
        });
    }

    placeSpot(burrow) {
        const head = this.headPoint(burrow);
        this.spot.style.setProperty('--x', `${head.x}px`);
        this.spot.style.setProperty('--y', `${burrow.top + burrow.w * 0.6}px`);
        this.spot.style.setProperty('--r', `${burrow.w * 0.85}px`);
        this.spot.classList.add('visible');
    }

    // ---------- Révélation ----------

    showReveal(burrow) {
        const { participant, color } = burrow;
        const card = el('div', 'tt-reveal-card');
        card.style.setProperty('--c', color);
        const avatar = el('div', 'tt-reveal-avatar');
        if (hasPhoto(participant.faceUrl)) {
            const img = el('img');
            img.src = participant.faceUrl;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.textContent = initials(participant.name);
        }
        const text = el('div', 'tt-reveal-text');
        text.append(el('small', '', "C'est au tour de"), el('strong', '', participant.name));
        card.append(avatar, text);
        this.reveal.replaceChildren(card);
        // La carte se place du côté où elle ne cache pas l'élu
        const below = burrow.top + burrow.w * 0.75 < window.innerHeight / 2;
        this.reveal.classList.toggle('is-bottom', below);
        this.reveal.classList.add('visible');
    }

    hideReveal() {
        this.reveal.classList.remove('visible');
        this.spot.classList.remove('visible');
    }

    // ---------- Textes ----------

    refresh() {
        const n = this.burrows.length;
        let hint = '';
        if (this.state === 'idle') {
            hint = `${n} taupe${n > 1 ? 's' : ''} à passer · Cliquez pour lancer la partie`;
        } else if (this.state === 'reveal' && this.revealReady) {
            hint = 'Cliquez pour continuer';
        } else if (this.state === 'done') {
            hint = 'Cliquez pour un nouveau tour';
        }
        this.hint.textContent = hint;
        this.hint.classList.toggle('visible', !!hint);

        let message = null;
        if (this.state === 'empty') {
            message = ['Le jardin est vide', 'Ajoutez des participants pour faire sortir les taupes.'];
        } else if (this.state === 'done') {
            message = ['Tout le monde est passé !', '🎉'];
        }
        if (message) {
            this.message.replaceChildren(el('strong', '', message[0]), el('span', '', message[1]));
        }
        this.message.classList.toggle('visible', !!message);
        this.root.classList.toggle('is-clickable', ['idle', 'done'].includes(this.state) || (this.state === 'reveal' && this.revealReady));
    }
}
