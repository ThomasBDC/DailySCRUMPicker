// Bruitages du mode Pack opening, synthétisés avec Web Audio (aucun fichier à charger) :
// papier qui se déchire, ouverture du paquet, cartes qui glissent, révélation selon la rareté.
//
// Réglage « Bruitages » du panneau de configuration, sauvegardé dans le localStorage
// (et exporté via SETTINGS dans settings.js). Le bouton son global coupe aussi les bruitages.

import { hit, kick, noise, tone } from './synth.js';

export const PACK_SOUND_KEY = 'dsp_pack_sound';

const MASTER_VOLUME = 0.8;
const TEAR_GRAIN_INTERVAL = 0.018; // s minimum entre deux grains de déchirure

// Activés par défaut : seule la désactivation est enregistrée
export function loadPackSound() {
    try {
        return localStorage.getItem(PACK_SOUND_KEY) !== 'off';
    } catch (_) {
        return true;
    }
}

export function savePackSound(enabled) {
    try {
        if (enabled) localStorage.removeItem(PACK_SOUND_KEY);
        else localStorage.setItem(PACK_SOUND_KEY, 'off');
    } catch (error) {
        console.warn('Impossible de sauvegarder le réglage des bruitages :', error);
    }
}

const random = (min, max) => min + Math.random() * (max - min);

export class PackSounds {
    // isMuted : fonction qui indique si le bouton son global est coupé
    constructor(isMuted = () => false) {
        this.enabled = loadPackSound();
        this.isMuted = isMuted;
        this.ctx = null;
        this.out = null;
        this.lastGrain = 0;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        savePackSound(enabled);
    }

    // À appeler sur un geste (clic, touche) : le navigateur n'autorise le son qu'après une interaction
    unlock() {
        if (!this.enabled) return;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            this.ctx = new AudioCtx();
            this.out = this.ctx.createGain();
            this.out.gain.value = MASTER_VOLUME;
            this.out.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // Contexte prêt à jouer, ou null si les bruitages sont coupés
    ready() {
        if (!this.enabled || this.isMuted() || !this.ctx) return null;
        return this.ctx;
    }

    // Bruit filtré dont la fréquence glisse de `from` à `to` (souffle, glissement)
    whoosh(t, { from, to, duration, peak, q = 1.2, pan = 0 }) {
        const ctx = this.ctx;
        const src = noise(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(to, t + duration);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(peak, t + duration * 0.35);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        let node = src.connect(filter).connect(env);
        if (pan && ctx.createStereoPanner) {
            const panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(-pan * 0.3, t);
            panner.pan.linearRampToValueAtTime(pan * 0.8, t + duration);
            node = node.connect(panner);
        }
        node.connect(this.out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + duration + 0.05);
    }

    shimmer(t, notes, { step = 0.06, peak = 0.05, release = 0.6, type = 'triangle' } = {}) {
        notes.forEach((midi, i) => {
            tone(this.ctx, this.out, { t: t + i * step, midi, type, peak, release });
        });
        hit(this.ctx, this.out, { t, peak: peak * 1.6, release: release + notes.length * step, cutoff: 7500 });
    }

    // ---------- Booster ----------

    // Un grain de papier qui se déchire, joué à chaque avancée de la découpe
    tear(intensity = 1) {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        if (t - this.lastGrain < TEAR_GRAIN_INTERVAL) return;
        this.lastGrain = t;
        const level = Math.min(1, Math.max(0.25, intensity));
        hit(ctx, this.out, { t, peak: 0.3 * level, release: random(0.02, 0.05), type: 'bandpass', cutoff: random(1800, 4500), q: 1.4 });
        if (Math.random() < 0.35) {
            hit(ctx, this.out, { t: t + 0.008, peak: 0.12 * level, release: 0.015, cutoff: 6500 });
        }
    }

    // Découpe automatique (clavier) : une déchirure continue sur `duration` secondes
    tearSweep(duration) {
        const ctx = this.ready();
        if (!ctx) return;
        const t0 = ctx.currentTime;
        for (let t = 0; t < duration; t += 0.022) {
            const level = 0.45 + 0.55 * (t / duration);
            hit(ctx, this.out, { t: t0 + t + random(0, 0.008), peak: 0.28 * level, release: random(0.02, 0.045), type: 'bandpass', cutoff: random(1800, 4500), q: 1.4 });
        }
    }

    // Petit choc quand on clique à côté du pointillé
    nudge() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        tone(ctx, this.out, { t, midi: 43, peak: 0.18, release: 0.12 });
        hit(ctx, this.out, { t, peak: 0.12, release: 0.05, type: 'lowpass', cutoff: 700 });
    }

    // Le haut du paquet s'arrache : dernier « scratch », pop et scintillement
    open() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        this.whoosh(t, { from: 1400, to: 5200, duration: 0.18, peak: 0.45, q: 0.9 });
        kick(ctx, this.out, t + 0.06, 0.45);
        hit(ctx, this.out, { t: t + 0.06, peak: 0.2, release: 0.08, type: 'bandpass', cutoff: 1200, q: 0.8 });
        this.shimmer(t + 0.12, [84, 88, 91, 96], { step: 0.05, peak: 0.035, release: 0.5 });
    }

    // Les cartes glissent hors du paquet
    cardsOut() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        this.whoosh(t, { from: 2800, to: 500, duration: 0.45, peak: 0.22, q: 0.8 });
        for (let i = 0; i < 4; i++) {
            hit(ctx, this.out, { t: t + 0.12 + i * 0.05, peak: 0.08, release: 0.03, type: 'bandpass', cutoff: 2600, q: 1.2 });
        }
    }

    // ---------- Cartes ----------

    // Carte lancée sur le côté
    swipe(direction = 1) {
        const ctx = this.ready();
        if (!ctx) return;
        this.whoosh(ctx.currentTime, { from: 700, to: 2800, duration: 0.3, peak: 0.32, pan: direction });
    }

    // Nouvelle carte du dessus : claquement, puis un effet selon la rareté
    reveal(rarityId) {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime + 0.01;
        hit(ctx, this.out, { t, peak: 0.25, release: 0.035, type: 'bandpass', cutoff: 2200, q: 1 });
        tone(ctx, this.out, { t, midi: 57, type: 'triangle', peak: 0.05, release: 0.06 });

        switch (rarityId) {
            case 'uncommon':
                tone(ctx, this.out, { t: t + 0.04, midi: 81, type: 'triangle', peak: 0.05, release: 0.4 });
                break;
            case 'rare':
                this.shimmer(t + 0.05, [76, 79, 84, 88], { peak: 0.06, release: 0.55 });
                break;
            case 'ultra':
                this.whoosh(t, { from: 400, to: 4200, duration: 0.35, peak: 0.18 });
                kick(ctx, this.out, t + 0.3, 0.5);
                this.shimmer(t + 0.3, [72, 76, 79, 84, 88, 91], { step: 0.055, peak: 0.065, release: 0.8 });
                break;
            case 'crown': {
                this.whoosh(t, { from: 300, to: 5000, duration: 0.45, peak: 0.2 });
                const t1 = t + 0.4;
                kick(ctx, this.out, t1, 0.7);
                [60, 64, 67, 72].forEach(midi => {
                    [0, 7, -7].forEach(detune => tone(ctx, this.out, { t: t1, midi, type: 'sawtooth', peak: 0.03, attack: 0.03, release: 1.4, cutoff: 2600, detune }));
                });
                this.shimmer(t1 + 0.05, [84, 88, 91, 96, 91, 96, 100], { step: 0.07, peak: 0.06, release: 0.9 });
                break;
            }
        }
    }

    // Récapitulatif : un petit « pop » par carte qui apparaît, puis un accord final
    summary(count, delayMs) {
        const ctx = this.ready();
        if (!ctx) return;
        const t0 = ctx.currentTime + 0.05;
        const scale = [0, 2, 4, 7, 9]; // pentatonique
        const shown = Math.min(count, 24);
        for (let i = 0; i < shown; i++) {
            const midi = 72 + scale[i % 5] + 12 * Math.floor(i / 5) - 12 * Math.floor(i / 15);
            tone(ctx, this.out, { t: t0 + (i * delayMs) / 1000, midi, type: 'sine', peak: 0.06, release: 0.18 });
        }
        const tEnd = t0 + (shown * delayMs) / 1000 + 0.1;
        [72, 76, 79, 84].forEach(midi => tone(ctx, this.out, { t: tEnd, midi, type: 'triangle', peak: 0.04, attack: 0.02, release: 1.1 }));
    }
}
