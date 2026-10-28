import { announcePick } from './participants.js';
import { resizeImage } from './image.js';
import { UnsplashPicker } from './unsplash.js';
import { panelElement } from './configWindow.js';

export const WHEEL_SETTINGS_KEY = 'dsp_wheel_settings';
// Image au centre de la roue : { src, credit: { name, url } | null }, stockée en JSON
export const HUB_IMAGE_KEY = 'dsp_wheel_hub_image';
const HUB_IMAGE_MAX_SIZE = 400; // px, une image du PC est réduite avant d'être stockée

export const WHEEL_DEFAULTS = {
    duration: 8,          // s, durée de la décélération
    turns: 8,             // nombre de tours minimum pour un lancer au clic
    braking: 'natural',   // profil de freinage (voir BRAKING)
    palette: 'vivid',
    pointer: 'right',     // 'right' | 'top'
    windup: true,         // la roue recule un peu avant de partir
    bounce: true,         // petit retour en arrière à l'arrêt
    idleSpin: true,       // rotation lente quand la roue est au repos
    sound: true,          // cliquet + jingle (suit aussi le bouton son global)
    confetti: true,
    hubSize: 13,          // rayon du centre, en % du rayon de la roue
};

export const HUB_SIZE_MIN = 8;
export const HUB_SIZE_MAX = 40;

// Exposant de la courbe de décélération 1 - (1 - t)^k : plus k est grand, plus la fin traîne
const BRAKING = { steady: 2.2, natural: 3, suspense: 4 };

const PALETTES = {
    vivid: ['#3369E8', '#D50F25', '#EEB211', '#009925'],
    rainbow: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
    pastel: ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'],
    theme: ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#EC4899', '#F43F5E'],
};

const TWO_PI = Math.PI * 2;
const IDLE_SPEED = 0.12;          // rad/s
const WINDUP_ANGLE = 0.22;        // rad
const WINDUP_TIME = 0.45;         // s
const SETTLE_TIME = 0.7;          // s
const HIGHLIGHT_TIME = 1.1;       // s avant l'ouverture de la modale
const SEGMENT_ANIM_TIME = 0.55;   // s pour qu'une part apparaisse / disparaisse
const FLING_MIN_SPEED = 2.5;      // rad/s pour qu'un geste lance la roue
const FLING_MAX_SPEED = 40;
const CLICK_TOLERANCE = 8;        // px

// Pointeur à cliquet : ressort amorti poussé par les tétons de la jante
const FLAPPER_MAX = 0.55;         // rad
const FLAPPER_ZONE = 0.11;        // rad, largeur angulaire de contact avec un téton
const FLAPPER_STIFFNESS = 900;
const FLAPPER_DAMPING = 22;

const wrap = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const wrapSigned = (a) => wrap(a + Math.PI) - Math.PI;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(WHEEL_SETTINGS_KEY) || '{}');
        const settings = { ...WHEEL_DEFAULTS };
        Object.keys(WHEEL_DEFAULTS).forEach((key) => {
            if (typeof saved[key] === typeof WHEEL_DEFAULTS[key]) settings[key] = saved[key];
        });
        settings.hubSize = clamp(Math.round(settings.hubSize) || WHEEL_DEFAULTS.hubSize, HUB_SIZE_MIN, HUB_SIZE_MAX);
        return settings;
    } catch (_) {
        return { ...WHEEL_DEFAULTS };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(WHEEL_SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {
        // Stockage indisponible : les réglages restent valables pour la session
    }
}

function loadHubImage() {
    try {
        const saved = JSON.parse(localStorage.getItem(HUB_IMAGE_KEY));
        return saved && typeof saved.src === 'string' ? { src: saved.src, credit: saved.credit || null } : null;
    } catch (_) {
        return null;
    }
}

function saveHubImage(image) {
    try {
        if (image) localStorage.setItem(HUB_IMAGE_KEY, JSON.stringify(image));
        else localStorage.removeItem(HUB_IMAGE_KEY);
    } catch (error) {
        console.warn("Impossible de sauvegarder l'image du centre de la roue :", error);
    }
}

// Une vignette vide (<img src="">) renvoie l'URL de la page : ce n'est pas une photo
function hasPhoto(url) {
    return !!url && url !== 'null' && url !== window.location.href;
}

function participantKey(p) {
    return p.id ?? p.name;
}

function textColorFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#1b1f2a' : '#ffffff';
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class WheelPicker {
    constructor(container, audioManager = null) {
        this.container = container;
        this.audioManager = audioManager;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'wheel-canvas';
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Disque pré-rendu (parts, textes, jante) qu'on fait simplement tourner à chaque image
        this.disc = document.createElement('canvas');
        this.discCtx = this.disc.getContext('2d');
        this.discDirty = true;

        this.settings = loadSettings();
        this.hubImage = loadHubImage();
        this.segments = [];        // { participant, key, weight, target, color }
        this.images = new Map();   // url -> Image chargée
        this.loadingImages = new Set();
        this.freshLayout = true;

        this.angle = 0;
        this.velocity = 0;
        this.lastDir = 1;
        this.spinState = null;
        this.drag = null;
        this.highlight = null;
        this.selectedParticipant = null;
        this.flapper = { angle: 0, vel: 0 };
        this.audioCtx = null;

        this.setupCanvas();
        this.setupEventListeners();
        this.bindSettings();
        this.bindHubImage();
        if (this.hubImage) this.loadImage(this.hubImage.src);

        // Les textes sont dessinés en Inter : on redessine une fois la police chargée
        document.fonts?.ready.then(() => { this.discDirty = true; });

        this.lastTime = performance.now();
        this.frame = this.frame.bind(this);
        requestAnimationFrame(this.frame);
    }

    get spinning() {
        return !!this.spinState;
    }

    // ---------- Mise en place ----------

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9);
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.size = size;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
        this.canvas.width = Math.round(size * this.dpr);
        this.canvas.height = Math.round(size * this.dpr);
        this.centerX = size / 2;
        this.centerY = size / 2;
        this.radius = (size / 2) * 0.84;
        this.discDirty = true;
    }

    setupEventListeners() {
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('pointercancel', () => { this.drag = null; this.canvas.classList.remove('dragging'); });
    }

    bindSettings() {
        const root = panelElement('wheel-settings');
        if (!root) return;
        this.settingInputs = root.querySelectorAll('[data-setting]');
        this.settingInputs.forEach((input) => {
            const key = input.dataset.setting;
            input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
                if (input.type === 'checkbox') this.settings[key] = input.checked;
                else if (input.type === 'range') this.settings[key] = Number(input.value);
                else this.settings[key] = input.value;
                saveSettings(this.settings);
                this.applySetting(key);
                this.refreshSettingOutputs();
            });
        });
        root.querySelector('#wheel-settings-reset')?.addEventListener('click', () => {
            this.settings = { ...WHEEL_DEFAULTS };
            saveSettings(this.settings);
            this.refreshSettingInputs();
            this.applySetting('palette');
        });
        this.refreshSettingInputs();
    }

    refreshSettingInputs() {
        this.settingInputs?.forEach((input) => {
            const value = this.settings[input.dataset.setting];
            if (input.type === 'checkbox') input.checked = value;
            else input.value = String(value);
        });
        this.refreshSettingOutputs();
    }

    refreshSettingOutputs() {
        const units = { duration: 's', turns: 'tours', hubSize: '%' };
        panelElement('wheel-settings')?.querySelectorAll('[data-output]').forEach((output) => {
            const key = output.dataset.output;
            output.textContent = `${this.settings[key]} ${units[key]}`;
        });
    }

    // Image du centre : choisie sur le PC ou trouvée sur Unsplash
    bindHubImage() {
        const fileInput = panelElement('wheel-hub-input');
        this.hubThumb = panelElement('wheel-hub-thumb');
        this.hubRemove = panelElement('wheel-hub-remove');
        this.hubCredit = panelElement('wheel-hub-credit');

        if (fileInput) {
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files?.[0];
                fileInput.value = '';
                if (!file) return;
                try {
                    this.setHubImage({ src: await resizeImage(file, HUB_IMAGE_MAX_SIZE), credit: null });
                } catch (error) {
                    console.warn("Impossible de lire l'image du centre de la roue :", error);
                }
            });
            this.hubThumb?.addEventListener('click', () => fileInput.click());
            panelElement('wheel-hub-choose')?.addEventListener('click', () => fileInput.click());
        }
        this.hubRemove?.addEventListener('click', () => this.setHubImage(null));

        const unsplashRoot = panelElement('wheel-hub-unsplash');
        if (unsplashRoot) this.unsplash = new UnsplashPicker(unsplashRoot, { onPick: image => this.setHubImage(image) });

        this.updateHubThumb();
    }

    setHubImage(image) {
        this.hubImage = image;
        saveHubImage(image);
        if (image) this.loadImage(image.src);
        this.updateHubThumb();
    }

    updateHubThumb() {
        const image = this.hubImage;
        if (this.hubThumb) {
            if (image) this.hubThumb.src = image.src;
            else this.hubThumb.removeAttribute('src');
        }
        if (this.hubRemove) this.hubRemove.hidden = !image;
        if (this.hubCredit) {
            this.hubCredit.replaceChildren();
            this.hubCredit.hidden = !image?.credit;
            if (image?.credit) {
                const link = (text, href) => {
                    const a = document.createElement('a');
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.textContent = text;
                    return a;
                };
                this.hubCredit.append('Photo de ', link(image.credit.name, image.credit.url), ' sur ',
                    link('Unsplash', 'https://unsplash.com/?utm_source=DailySCRUMPicker&utm_medium=referral'));
            }
        }
    }

    hubRadius() {
        return this.radius * this.settings.hubSize / 100;
    }

    applySetting(key) {
        if (key === 'palette') this.assignColors();
        this.discDirty = true;
    }

    // ---------- Participants ----------

    setParticipants(participants) {
        const list = participants.filter(p => p.display);
        list.forEach(p => this.loadImage(p.faceUrl));

        const live = this.segments.filter(s => s.target > 0);
        if (this.freshLayout || live.length === 0) {
            // Nouvelle partie : la roue est reconstruite d'un coup
            this.freshLayout = false;
            this.segments = list.map(p => ({ participant: p, key: participantKey(p), weight: 1, target: 1, color: 0 }));
            this.assignColors();
            this.discDirty = true;
            return;
        }

        // En cours de partie : les parts apparaissent / disparaissent en douceur
        const keys = new Set(list.map(participantKey));
        this.segments.forEach((seg) => {
            if (!keys.has(seg.key)) seg.target = 0;
        });
        let previous = null;
        list.forEach((p) => {
            const key = participantKey(p);
            let seg = this.segments.find(s => s.key === key);
            if (seg) {
                seg.participant = p;
                seg.target = 1;
            } else {
                seg = { participant: p, key, weight: 0, target: 1, color: 0 };
                const at = previous ? this.segments.indexOf(previous) + 1 : 0;
                this.segments.splice(at, 0, seg);
                this.fixColor(at);
            }
            previous = seg;
        });
        this.discDirty = true;
    }

    loadImage(url) {
        if (!hasPhoto(url) || this.images.has(url) || this.loadingImages.has(url)) return;
        this.loadingImages.add(url);
        const img = new Image();
        img.onload = () => {
            this.loadingImages.delete(url);
            this.images.set(url, img);
            this.discDirty = true;
        };
        img.onerror = () => this.loadingImages.delete(url);
        img.src = url;
    }

    palette() {
        return PALETTES[this.settings.palette] || PALETTES.vivid;
    }

    // Couleurs par position, sans que la dernière part ait la couleur de la première
    assignColors() {
        const count = this.palette().length;
        const n = this.segments.length;
        this.segments.forEach((seg, i) => { seg.color = i % count; });
        if (n > 1 && this.segments[n - 1].color === this.segments[0].color) {
            this.segments[n - 1].color = (this.segments[n - 1].color + 1) % count;
            if (n > 2 && this.segments[n - 1].color === this.segments[n - 2].color) {
                this.segments[n - 1].color = (this.segments[n - 1].color + 1) % count;
            }
        }
        this.discDirty = true;
    }

    // Choisit pour la part i une couleur différente de ses voisines
    fixColor(i) {
        const n = this.segments.length;
        if (n < 2) return;
        const count = this.palette().length;
        const prev = this.segments[(i - 1 + n) % n].color;
        const next = this.segments[(i + 1) % n].color;
        let color = (prev + 1) % count;
        while ((color === prev || color === next) && count > 2) color = (color + 1) % count;
        this.segments[i].color = color;
    }

    // Termine immédiatement les apparitions / disparitions en cours
    snapWeights() {
        let changed = false;
        this.segments.forEach((seg) => {
            if (seg.weight !== seg.target) { seg.weight = seg.target; changed = true; }
        });
        if (changed) this.dropDeadSegments();
    }

    dropDeadSegments() {
        for (let i = this.segments.length - 1; i >= 0; i--) {
            const seg = this.segments[i];
            if (seg.target === 0 && seg.weight === 0) {
                this.segments.splice(i, 1);
                const n = this.segments.length;
                // Les deux voisines se retrouvent côte à côte : on évite qu'elles se confondent
                if (n > 1) {
                    const before = (i - 1 + n) % n;
                    const after = i % n;
                    if (this.segments[before].color === this.segments[after].color) this.fixColor(after);
                }
            }
        }
        this.discDirty = true;
    }

    // Angles de début / fin de chaque part dans le repère du disque
    layout() {
        const visible = this.segments.map(seg => ({ seg, w: easeInOutSine(seg.weight) })).filter(s => s.w > 0);
        const total = visible.reduce((sum, s) => sum + s.w, 0);
        let start = 0;
        return visible.map(({ seg, w }) => {
            const slice = (w / total) * TWO_PI;
            const entry = { seg, start, end: start + slice, slice };
            start += slice;
            return entry;
        });
    }

    pointerAngle() {
        return this.settings.pointer === 'top' ? -Math.PI / 2 : 0;
    }

    segmentUnderPointer(layout = this.layout()) {
        const local = wrap(this.pointerAngle() - this.angle);
        return layout.find(s => local >= s.start && local < s.end) || layout[layout.length - 1];
    }

    // ---------- Interaction ----------

    localPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.centerX;
        const y = e.clientY - rect.top - this.centerY;
        return { x, y, angle: Math.atan2(y, x), dist: Math.hypot(x, y) };
    }

    handlePointerDown(e) {
        this.ensureAudio();
        if (this.spinState || this.highlight) return;
        if (!this.segments.some(s => s.target > 0)) return;
        const p = this.localPoint(e);
        this.drag = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            lastAngle: p.angle,
            canRotate: p.dist > this.hubRadius() + this.radius * 0.03,
            moved: 0,
            samples: [{ t: performance.now(), angle: this.angle }],
        };
        this.canvas.setPointerCapture?.(e.pointerId);
    }

    handlePointerMove(e) {
        const drag = this.drag;
        if (!drag || drag.id !== e.pointerId) return;
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY));
        if (!drag.canRotate || drag.moved < CLICK_TOLERANCE) return;
        this.canvas.classList.add('dragging');
        const p = this.localPoint(e);
        this.angle += wrapSigned(p.angle - drag.lastAngle);
        drag.lastAngle = p.angle;
        const now = performance.now();
        drag.samples.push({ t: now, angle: this.angle });
        drag.samples = drag.samples.filter(s => now - s.t < 120);
    }

    handlePointerUp(e) {
        const drag = this.drag;
        if (!drag || drag.id !== e.pointerId) return;
        this.drag = null;
        this.canvas.classList.remove('dragging');

        if (drag.moved < CLICK_TOLERANCE) {
            this.spin();
            return;
        }
        const now = performance.now();
        const recent = drag.samples.filter(s => now - s.t < 100);
        if (recent.length < 2) return;
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = Math.max((last.t - first.t) / 1000, 0.016);
        const speed = (last.angle - first.angle) / dt;
        if (Math.abs(speed) >= FLING_MIN_SPEED) {
            this.spin({ fling: clamp(speed, -FLING_MAX_SPEED, FLING_MAX_SPEED) });
        }
    }

    // ---------- Lancer ----------

    // Sans argument : lancer au clic. Avec { fling } : la roue part à la vitesse du geste (rad/s)
    spin({ fling = null } = {}) {
        if (this.spinState || this.highlight) return;
        this.snapWeights();
        const layout = this.layout();
        if (layout.length === 0) return;

        const s = this.settings;
        const k = BRAKING[s.braking] || BRAKING.natural;
        const dir = fling ? Math.sign(fling) : 1;
        const back = !fling && s.windup ? -dir * WINDUP_ANGLE : 0;
        const windupTime = back ? WINDUP_TIME : 0;

        // Le gagnant est tiré au sort équitablement, puis on calcule où arrêter la roue
        const target = layout[Math.floor(Math.random() * layout.length)];
        const frac = 0.12 + Math.random() * 0.76;
        const local = target.start + frac * target.slice;
        const alpha = this.pointerAngle();
        const from = this.angle + back;
        const align = wrap(dir * (alpha - local - from));

        let duration = s.duration;
        let turns = s.turns;
        if (fling) {
            // Durée et distance choisies pour que la roue garde la vitesse donnée par le geste
            duration = s.duration * clamp(Math.abs(fling) / 14, 0.55, 1.25);
            const natural = (Math.abs(fling) * duration) / k;
            turns = Math.max(2, Math.round((natural - align) / TWO_PI));
        }
        const finalAngle = from + dir * (turns * TWO_PI + align);

        // Rebond : la roue dépasse un peu son point d'arrêt sans changer de part, puis revient
        let overshoot = 0;
        if (s.bounce) {
            const room = (dir > 0 ? frac : 1 - frac) * target.slice;
            overshoot = Math.min(0.09, room * 0.6) * (0.6 + Math.random() * 0.4);
        }

        this.selectedParticipant = null;
        this.spinState = {
            start: performance.now() / 1000,
            origin: this.angle,
            back,
            windupTime,
            from,
            peak: finalAngle + dir * overshoot,
            finalAngle,
            duration,
            k,
            settleTime: overshoot ? SETTLE_TIME : 0,
        };
        this.audioManager?.playSelectionMusic('wheel');
    }

    spinAngleAt(t) {
        const st = this.spinState;
        if (t < st.windupTime) {
            return st.origin + st.back * easeInOutSine(t / st.windupTime);
        }
        t -= st.windupTime;
        if (t < st.duration) {
            const p = 1 - Math.pow(1 - t / st.duration, st.k);
            return st.from + (st.peak - st.from) * p;
        }
        t -= st.duration;
        if (t < st.settleTime) {
            return st.peak + (st.finalAngle - st.peak) * easeInOutSine(t / st.settleTime);
        }
        return null;
    }

    finishSpin() {
        this.angle = this.spinState.finalAngle;
        this.spinState = null;
        this.audioManager?.stopSelectionMusic();
        const hit = this.segmentUnderPointer();
        if (!hit) return;
        this.highlight = { seg: hit.seg, start: performance.now() / 1000 };
        this.selectedParticipant = hit.seg.participant;
        // Le jingle de la roue ne sert que si aucune musique n'est jouée pour la personne choisie
        if (!this.audioManager?.playPickSound('wheel')) this.playWinSound();
        setTimeout(() => this.revealWinner(hit.seg), HIGHLIGHT_TIME * 1000);
    }

    revealWinner(seg) {
        // La partie a pu être relancée pendant la mise en valeur
        if (this.highlight?.seg !== seg) return;
        const winner = seg.participant;
        announcePick(winner.id);
        this.showWinnerModal(winner, () => {
            this.audioManager?.stopPickSound();
            // La personne tirée quitte la roue en douceur
            seg.target = 0;
            this.highlight = null;
        });
    }

    // ---------- Boucle d'animation ----------

    frame(now) {
        requestAnimationFrame(this.frame);
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        if (this.canvas.style.display === 'none' || document.hidden || dt <= 0) return;

        this.update(dt, now / 1000);
        this.draw();
    }

    update(dt, now) {
        // Apparition / disparition des parts
        let weightsChanged = false;
        this.segments.forEach((seg) => {
            if (seg.weight !== seg.target) {
                const step = dt / SEGMENT_ANIM_TIME;
                seg.weight = seg.target > seg.weight ? Math.min(seg.target, seg.weight + step) : Math.max(seg.target, seg.weight - step);
                weightsChanged = true;
            }
        });
        if (weightsChanged) {
            this.discDirty = true;
            if (this.segments.some(s => s.target === 0 && s.weight === 0)) this.dropDeadSegments();
        }

        const previous = this.angle;
        if (this.spinState) {
            const angle = this.spinAngleAt(now - this.spinState.start);
            if (angle === null) this.finishSpin();
            else this.angle = angle;
        } else if (!this.drag && !this.highlight && this.settings.idleSpin && this.segments.length > 0) {
            this.angle += IDLE_SPEED * dt;
        }

        const delta = this.angle - previous;
        this.velocity = delta / dt;
        if (Math.abs(delta) > 1e-6) this.lastDir = Math.sign(delta);
        this.updateFlapper(dt, previous);
    }

    updateFlapper(dt, previousAngle) {
        const layout = this.layout();
        const alpha = this.pointerAngle();
        const dir = this.lastDir;
        let contact = 0;
        let crossings = 0;

        if (layout.length > 0) {
            layout.forEach(({ start }) => {
                const d = wrapSigned(this.angle + start - alpha);
                const prevD = wrapSigned(previousAngle + start - alpha);
                // Le téton pousse la languette tant qu'il arrive sur elle
                if (dir > 0 && d >= -FLAPPER_ZONE && d <= 0) contact = Math.max(contact, (d + FLAPPER_ZONE) / FLAPPER_ZONE);
                if (dir < 0 && d <= FLAPPER_ZONE && d >= 0) contact = Math.max(contact, (FLAPPER_ZONE - d) / FLAPPER_ZONE);
                // ... puis la libère en passant dessous : clic
                if (Math.abs(d - prevD) < Math.PI && Math.sign(d) !== Math.sign(prevD) && prevD !== 0) crossings++;
            });
        }

        // Ressort amorti, intégré par petits pas pour rester stable
        const f = this.flapper;
        const steps = Math.ceil(dt / 0.004);
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            f.vel += (-FLAPPER_STIFFNESS * f.angle - FLAPPER_DAMPING * f.vel) * h;
            f.angle += f.vel * h;
        }
        const pushed = dir * contact * FLAPPER_MAX;
        if (contact > 0 && dir * f.angle < Math.abs(pushed)) {
            f.angle = pushed;
            f.vel = 0;
        }

        if (crossings > 0 && (this.spinState || this.drag)) {
            this.playTick(clamp(Math.abs(this.velocity) / 10, 0.35, 1));
        }
    }

    // ---------- Rendu ----------

    renderDisc(layout) {
        const R = this.radius;
        const dpr = this.dpr;
        const px = Math.ceil(R * 2 * dpr) + 2;
        if (this.disc.width !== px) {
            this.disc.width = px;
            this.disc.height = px;
        }
        const ctx = this.discCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, px, px);
        ctx.setTransform(dpr, 0, 0, dpr, px / 2, px / 2);

        const rimWidth = Math.max(6, R * 0.035);
        const colors = this.palette();

        // Parts
        layout.forEach(({ seg, start, end }) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, R, start, end);
            ctx.closePath();
            ctx.fillStyle = colors[seg.color % colors.length];
            ctx.fill();
        });

        // Fines séparations
        if (layout.length > 1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.2;
            layout.forEach(({ start }) => {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(start) * R, Math.sin(start) * R);
                ctx.stroke();
            });
        }

        // Noms (les photos sont dessinées à part pour rester droites)
        layout.forEach(({ seg, start, slice }) => {
            if (slice < 0.03) return;
            const color = colors[seg.color % colors.length];
            const avatar = this.avatarGeometry(seg, slice);
            const outer = avatar ? avatar.r - avatar.size / 2 - R * 0.04 : R - rimWidth - R * 0.05;
            const inner = Math.max(R * 0.17, this.hubRadius() + R * 0.04);
            const maxWidth = outer - inner;
            if (maxWidth < 16) return;

            const chord = 2 * Math.sin(Math.min(slice, Math.PI) / 2) * (inner + maxWidth * 0.6);
            const fontSize = clamp(Math.min(R * 0.075, chord * 0.55), 9, 28);
            ctx.save();
            ctx.rotate(start + slice / 2);
            ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = textColorFor(color);
            ctx.shadowColor = ctx.fillStyle === '#ffffff' ? 'rgba(0, 0, 0, 0.25)' : 'transparent';
            ctx.shadowBlur = 3;
            ctx.fillText(this.fitText(ctx, seg.participant.name, maxWidth), outer, 0);
            ctx.restore();
        });

        // Jante et tétons
        ctx.beginPath();
        ctx.arc(0, 0, R - rimWidth / 2, 0, TWO_PI);
        ctx.strokeStyle = '#1e2230';
        ctx.lineWidth = rimWidth;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, R - rimWidth, 0, TWO_PI);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#eef0f7';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        layout.forEach(({ start }) => {
            ctx.beginPath();
            ctx.arc(Math.cos(start) * (R - rimWidth / 2), Math.sin(start) * (R - rimWidth / 2), rimWidth * 0.3, 0, TWO_PI);
            ctx.fill();
        });
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetY = 0;

        this.discDirty = false;
    }

    fitText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let result = text;
        while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
            result = result.slice(0, -1);
        }
        return `${result}…`;
    }

    avatarGeometry(seg, slice) {
        const url = seg.participant.faceUrl;
        if (!hasPhoto(url) || !this.images.has(url)) return null;
        const R = this.radius;
        const r = R * 0.74;
        const chord = 2 * Math.sin(Math.min(slice, Math.PI) / 2) * r;
        const size = Math.min(chord * 0.78, R * 0.26);
        if (size < 14) return null;
        return { r, size };
    }

    draw() {
        const ctx = this.ctx;
        const R = this.radius;
        const cx = this.centerX;
        const cy = this.centerY;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.size, this.size);

        const layout = this.layout();

        // Ombre portée
        const shadow = ctx.createRadialGradient(cx, cy + R * 0.06, R * 0.85, cx, cy + R * 0.06, R * 1.14);
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(cx, cy + R * 0.06, R * 1.14, 0, TWO_PI);
        ctx.fill();

        if (layout.length === 0) {
            this.drawEmptyWheel();
            // Le centre reste affiché quand tout le monde est passé, sans « LANCER » : rien à tirer
            this.drawHub({ label: false });
            return;
        }

        if (this.discDirty) this.renderDisc(layout);

        // Disque, avec un léger flou de mouvement quand il va vite
        const speed = Math.abs(this.velocity);
        const discSize = this.disc.width / this.dpr;
        const drawDisc = (angle, alpha) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.drawImage(this.disc, -discSize / 2, -discSize / 2, discSize, discSize);
            ctx.restore();
        };
        // Moyenne de plusieurs positions sur la distance parcourue pendant ~une image :
        // l'échantillon i est dessiné avec une opacité 1/(i+1), ce qui donne un vrai flou uniforme
        const smear = clamp((speed - 6) / 70, 0, 0.22);
        const samples = smear > 0 ? clamp(Math.ceil(smear / 0.012), 2, 18) : 1;
        for (let i = 0; i < samples; i++) {
            const offset = samples > 1 ? (i / (samples - 1)) * smear : 0;
            drawDisc(this.angle - this.lastDir * offset, 1 / (i + 1));
        }

        // Photos, toujours à l'endroit
        layout.forEach(({ seg, start, slice }) => {
            const geo = this.avatarGeometry(seg, slice);
            if (!geo) return;
            const mid = this.angle + start + slice / 2;
            const x = cx + Math.cos(mid) * geo.r;
            const y = cy + Math.sin(mid) * geo.r;
            this.drawAvatar(this.images.get(seg.participant.faceUrl), x, y, geo.size);
        });

        if (this.highlight) this.drawHighlight(layout);

        // Éclairage fixe : le reflet ne tourne pas avec la roue
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TWO_PI);
        ctx.clip();
        const light = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx, cy, R * 1.05);
        light.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
        light.addColorStop(0.45, 'rgba(255, 255, 255, 0.03)');
        light.addColorStop(0.85, 'rgba(0, 0, 0, 0.06)');
        light.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = light;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();

        this.drawHub();
        this.drawPointer();
    }

    drawAvatar(img, x, y, size) {
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2 + 2.5, 0, TWO_PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, TWO_PI);
        ctx.clip();
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        ctx.restore();
    }

    drawHighlight(layout) {
        const entry = layout.find(s => s.seg === this.highlight.seg);
        if (!entry) return;
        const ctx = this.ctx;
        const R = this.radius;
        const cx = this.centerX;
        const cy = this.centerY;
        const t = performance.now() / 1000 - this.highlight.start;
        const appear = easeOutCubic(clamp(t / 0.35, 0, 1));
        const start = this.angle + entry.start;
        const end = this.angle + entry.end;

        // Les autres parts s'assombrissent
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TWO_PI);
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, start, end);
        ctx.closePath();
        ctx.fillStyle = `rgba(8, 10, 16, ${0.55 * appear})`;
        ctx.fill('evenodd');

        // La part gagnante pulse
        const pulse = 0.55 + 0.45 * Math.sin(t * 9);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R - 1, start, end);
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${appear * pulse})`;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 16 * appear;
        ctx.stroke();
        ctx.restore();
    }

    drawHub({ label = true } = {}) {
        const ctx = this.ctx;
        const R = this.radius;
        const cx = this.centerX;
        const cy = this.centerY;
        const hubR = this.hubRadius();
        const image = this.hubImage && this.images.get(this.hubImage.src);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, hubR + R * 0.018, 0, TWO_PI);
        ctx.fillStyle = '#1e2230';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fill();
        ctx.restore();

        if (image) {
            // L'image remplace le bouton « LANCER », recadrée dans le cercle
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, hubR, 0, TWO_PI);
            ctx.clip();
            const scale = Math.max((hubR * 2) / image.width, (hubR * 2) / image.height);
            const w = image.width * scale;
            const h = image.height * scale;
            ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
            ctx.restore();
            return;
        }

        const g = ctx.createLinearGradient(cx, cy - hubR, cx, cy + hubR);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#d9deea');
        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, TWO_PI);
        ctx.fillStyle = g;
        ctx.fill();

        if (label && !this.spinState && !this.highlight && !this.drag) {
            ctx.fillStyle = '#1e2230';
            ctx.font = `800 ${Math.max(9, hubR * 0.34)}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LANCER', cx, cy + 1);
        }
    }

    drawPointer() {
        const ctx = this.ctx;
        const R = this.radius;
        const alpha = this.pointerAngle();
        const pivotR = R * 0.058;
        const length = R * 0.2;
        const pivotDist = R + R * 0.035;

        ctx.save();
        ctx.translate(this.centerX + Math.cos(alpha) * pivotDist, this.centerY + Math.sin(alpha) * pivotDist);
        ctx.rotate(alpha - this.flapper.angle);

        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(0, -pivotR);
        ctx.arc(0, 0, pivotR, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -pivotR, 0, pivotR);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#c9cfdd');
        ctx.fillStyle = g;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(30, 34, 48, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, pivotR * 0.38, 0, TWO_PI);
        ctx.fillStyle = '#7c5cff';
        ctx.fill();
        ctx.restore();
    }

    drawEmptyWheel() {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.radius, 0, TWO_PI);
        ctx.fillStyle = '#1a1e28';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.max(6, this.radius * 0.035);
        ctx.stroke();

        ctx.fillStyle = '#8e96aa';
        ctx.font = `500 ${Math.max(14, this.radius * 0.07)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Sous le centre, qui reste dessiné par-dessus
        ctx.fillText('Ajoutez des participants', this.centerX, this.centerY + this.hubRadius() + this.radius * 0.14);
    }

    // ---------- Sons (synthétisés, pas de fichier à charger) ----------

    ensureAudio() {
        if (!this.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        return this.audioCtx;
    }

    soundEnabled() {
        return this.settings.sound && !this.audioManager?.isMuted && this.audioCtx;
    }

    playTick(intensity) {
        if (!this.soundEnabled()) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        if (!this.noiseBuffer) {
            const length = Math.floor(ctx.sampleRate * 0.03);
            this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3200;
        filter.Q.value = 1.2;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.35 * intensity;
        noise.connect(filter).connect(noiseGain).connect(ctx.destination);
        noise.start(t);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1500, t);
        osc.frequency.exponentialRampToValueAtTime(500, t + 0.03);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12 * intensity, t + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
    }

    playWinSound() {
        if (!this.soundEnabled()) return;
        const ctx = this.audioCtx;
        const t0 = ctx.currentTime + 0.02;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const t = t0 + i * 0.09;
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.7 : 0.25));
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.75);
        });
    }

    // ---------- Modale ----------

    showWinnerModal(winner, onClose) {
        if (this.settings.confetti && typeof confetti === 'function') {
            const shoot = () => {
                const colors = this.palette().map(c => c.slice(1)).concat(['FFFFFF', 'FFE400']);
                const spread = Math.random() * 100 + 300;
                const startVelocity = Math.random() * 20 + 20;
                const gravity = Math.random() * 2;
                const ticks = Math.floor(Math.random() * 50 + 75);
                confetti({
                    spread, ticks, gravity, decay: 0.94, startVelocity,
                    particleCount: Math.floor(Math.random() * 30 + 30),
                    scalar: Math.random() * 0.8 + 0.8,
                    shapes: ['star'],
                    colors,
                });
                confetti({
                    spread: spread - 60, ticks, gravity: gravity * 0.8, decay: 0.94,
                    startVelocity: startVelocity * 0.8,
                    particleCount: Math.floor(Math.random() * 15 + 5),
                    scalar: Math.random() * 0.4 + 0.4,
                    shapes: ['circle'],
                    colors,
                });
            };
            setTimeout(shoot, 0);
            setTimeout(shoot, Math.random() * 100 + 50);
            setTimeout(shoot, Math.random() * 150 + 150);
            setTimeout(shoot, Math.random() * 200 + 250);
        }

        document.getElementById('winner-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'winner-modal';
        modal.className = 'modal';
        const photo = hasPhoto(winner.faceUrl);
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Participant sélectionné !</h2>
                <div class="winner-info${photo ? '' : ' no-photo'}">
                    ${photo ? `<img src="${escapeHtml(winner.faceUrl)}" alt="${escapeHtml(winner.name)}" class="winner-photo">` : ''}
                    <h3>${escapeHtml(winner.name)}</h3>
                </div>
                <button class="close-modal">Fermer</button>
            </div>
        `;
        document.body.appendChild(modal);

        let closed = false;
        const onKey = (e) => {
            if (e.key === 'Escape') closeModal(e);
        };
        const closeModal = (e) => {
            if (e) e.stopPropagation();
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            modal.classList.add('closing');
            onClose?.();
            setTimeout(() => modal.remove(), 300);
        };

        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(e);
        });
        document.addEventListener('keydown', onKey);

        modal.style.display = 'block';
        modal.querySelector('.close-modal').focus();
    }

    // ---------- Cycle de vie ----------

    dispose() {
        this.container.removeChild(this.canvas);
    }

    reset() {
        if (this.spinState) this.audioManager?.stopSelectionMusic();
        if (this.highlight) this.audioManager?.stopPickSound();
        this.spinState = null;
        this.drag = null;
        this.highlight = null;
        this.selectedParticipant = null;
        this.flapper = { angle: 0, vel: 0 };
        this.snapWeights();
        // La prochaine liste reçue reconstruit la roue (nouvelle partie)
        this.freshLayout = true;
        this.discDirty = true;
    }
}
