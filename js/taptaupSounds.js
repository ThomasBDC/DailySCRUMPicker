// Bruitages du mode Tap Taupe, synthétisés avec Web Audio (aucun fichier à charger) :
// taupes qui sortent et rentrent, marteau qui fend l'air, coup dans la terre, « bonk » final.
//
// Réglage « Bruitages » du panneau de configuration (voir taptaupSettings.js).
// Le bouton son global coupe aussi les bruitages.

import { hit, kick, noise, tone } from './synth.js';
import { loadTapTaupeSound, saveTapTaupeSound } from './taptaupSettings.js';

const MASTER_VOLUME = 0.7;

const random = (min, max) => min + Math.random() * (max - min);

export class TapTaupeSounds {
    // isMuted : fonction qui indique si le bouton son global est coupé
    constructor(isMuted = () => false) {
        this.enabled = loadTapTaupeSound();
        this.isMuted = isMuted;
        this.ctx = null;
        this.out = null;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        saveTapTaupeSound(enabled);
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

    // Note dont la hauteur glisse de `from` à `to` Hz (bulles, « boing »)
    sweep(t, { from, to, duration, type = 'sine', peak = 0.2, vibrato = 0 }) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(to, t + duration);
        if (vibrato) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = 16;
            depth.gain.setValueAtTime(vibrato, t);
            depth.gain.linearRampToValueAtTime(0, t + duration);
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(t);
            lfo.stop(t + duration + 0.05);
        }
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(peak, t + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(env).connect(this.out);
        osc.start(t);
        osc.stop(t + duration + 0.05);
    }

    // Souffle filtré dont la fréquence glisse (marteau qui fend l'air)
    whoosh(t, { from, to, duration, peak }) {
        const ctx = this.ctx;
        const src = noise(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.1;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(to, t + duration);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(peak, t + duration * 0.7);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        src.connect(filter).connect(env).connect(this.out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + duration + 0.05);
    }

    // ---------- Taupes ----------

    // Une taupe sort de son trou
    pop() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        const base = random(380, 520);
        this.sweep(t, { from: base, to: base * 2.4, duration: 0.09, peak: 0.16 });
        hit(ctx, this.out, { t, peak: 0.08, release: 0.05, type: 'lowpass', cutoff: 900 });
    }

    // Une taupe rentre dans son trou
    duck() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        const base = random(700, 900);
        this.sweep(t, { from: base, to: base * 0.4, duration: 0.1, peak: 0.08 });
    }

    // Petit coup d'œil au repos
    peek() {
        const ctx = this.ready();
        if (!ctx) return;
        this.sweep(ctx.currentTime, { from: 600, to: 950, duration: 0.07, peak: 0.04 });
    }

    // ---------- Marteau ----------

    swing() {
        const ctx = this.ready();
        if (!ctx) return;
        this.whoosh(ctx.currentTime, { from: 500, to: 2600, duration: 0.16, peak: 0.28 });
    }

    // Raté : le marteau tape la terre
    thump() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        kick(ctx, this.out, t, 0.55);
        hit(ctx, this.out, { t, peak: 0.3, release: 0.16, type: 'lowpass', cutoff: 600 });
        hit(ctx, this.out, { t: t + 0.03, peak: 0.08, release: 0.2, type: 'bandpass', cutoff: 1800, q: 0.7 });
    }

    // Touché ! Choc, « tok » de bois, « boing » et petites étoiles
    bonk() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        kick(ctx, this.out, t, 0.9);
        hit(ctx, this.out, { t, peak: 0.35, release: 0.08, type: 'bandpass', cutoff: 1400, q: 1.2 });
        tone(ctx, this.out, { t, midi: 76, type: 'square', peak: 0.08, release: 0.06, cutoff: 3000 });
        tone(ctx, this.out, { t: t + 0.005, midi: 83, type: 'triangle', peak: 0.1, release: 0.09 });
        this.sweep(t + 0.08, { from: 170, to: 520, duration: 0.55, type: 'sine', peak: 0.22, vibrato: 45 });
        [91, 96, 100, 103].forEach((midi, i) => {
            tone(ctx, this.out, { t: t + 0.55 + i * 0.07, midi, type: 'triangle', peak: 0.04, release: 0.25 });
        });
    }

    // Le terrier de l'élu se rebouche
    fill() {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            hit(ctx, this.out, { t: t + i * 0.06 + random(0, 0.02), peak: 0.12, release: 0.06, type: 'lowpass', cutoff: random(500, 900) });
        }
    }
}
