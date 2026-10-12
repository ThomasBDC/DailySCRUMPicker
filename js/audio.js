import { BUILTIN_SOUNDS } from './synth.js';
import { loadMusicSettings, saveMusicSettings } from './music.js';
import { getSound } from './soundStore.js';

const FADE_IN = 0.8;   // s, début de la musique du mélange
const FADE_OUT = 0.5;  // s

// Une musique en cours de lecture. `level` (0 à 1) sert aux fondus ;
// le gestionnaire le combine au volume général et au bouton son.
class FileVoice {
    constructor(element, loop) {
        this.element = element;
        this.element.loop = loop;
        this.level = 0;
    }

    start() {
        this.element.currentTime = 0;
        this.element.play().catch((error) => {
            console.warn('Lecture impossible :', error);
            this.onended?.();
        });
        this.element.addEventListener('ended', () => this.onended?.(), { once: true });
    }

    setGain(gain) {
        this.element.volume = Math.min(1, Math.max(0, gain));
    }

    stop() {
        this.element.pause();
    }
}

class SynthVoice {
    constructor(ctx, sound) {
        this.ctx = ctx;
        this.sound = sound;
        this.output = ctx.createGain();
        this.output.gain.value = 0;
        this.output.connect(ctx.destination);
        this.level = 0;
    }

    start() {
        this.handle = this.sound.play(this.ctx, this.output);
        if (this.handle.duration) {
            this.endTimer = setTimeout(() => this.onended?.(), this.handle.duration * 1000);
        }
    }

    setGain(gain) {
        this.output.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015);
    }

    stop() {
        clearTimeout(this.endTimer);
        this.handle?.stop();
        // Laisse finir les notes déjà programmées, sous un volume nul
        this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
        setTimeout(() => this.output.disconnect(), 500);
    }
}

// Joue les musiques du mélange (« shuffle ») et de la personne choisie (« pick »),
// tirées au hasard parmi celles sélectionnées dans l'onglet Musiques.
export class AudioManager {
    constructor() {
        this.settings = loadMusicSettings();
        this.isMuted = false;
        this.ctx = null;
        this.voices = { shuffle: null, pick: null, preview: null };
        // Prochaine piste de chaque moment, préchargée pour démarrer sans attendre
        this.prepared = { shuffle: null, pick: null };
        this.lastPlayed = { shuffle: null, pick: null };
        this.customUrls = new Map(); // id -> URL de l'objet Blob

        this.prepare('shuffle');
        this.prepare('pick');
    }

    // ---------- Réglages ----------

    updateSettings(settings) {
        this.settings = settings;
        saveMusicSettings(settings);
        ['shuffle', 'pick'].forEach((moment) => {
            const prepared = this.prepared[moment];
            if (!prepared || !settings[moment].some(t => t.id === prepared.track.id)) this.prepare(moment);
        });
        Object.values(this.voices).forEach(voice => voice && this.applyVolume(voice));
    }

    isEnabled(mode) {
        return !!this.settings.enabled[mode];
    }

    // ---------- Sources ----------

    ensureContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    // URL lisible immédiatement (null si elle doit d'abord être chargée)
    cachedUrl(track) {
        if (track.source === 'library') return track.url;
        if (track.source === 'custom') return this.customUrls.get(track.id) || null;
        return null;
    }

    async resolveUrl(track) {
        const cached = this.cachedUrl(track);
        if (cached || track.source !== 'custom') return cached;
        const sound = await getSound(track.id).catch(() => null);
        if (!sound) return null;
        const url = URL.createObjectURL(sound.blob);
        this.customUrls.set(track.id, url);
        return url;
    }

    // À appeler quand un son personnalisé est supprimé
    forgetCustom(id) {
        const url = this.customUrls.get(id);
        if (url) URL.revokeObjectURL(url);
        this.customUrls.delete(id);
    }

    createVoice(track, element, loop) {
        if (track.source === 'builtin') {
            const sound = BUILTIN_SOUNDS[track.id.slice('builtin:'.length)];
            const ctx = this.ensureContext();
            return sound && ctx ? new SynthVoice(ctx, sound) : null;
        }
        return element ? new FileVoice(element, loop) : null;
    }

    loadElement(url) {
        const element = new Audio();
        element.preload = 'auto';
        element.src = url;
        return element;
    }

    // Choisit au hasard la prochaine piste d'un moment et précharge son fichier
    prepare(moment) {
        const old = this.prepared[moment];
        if (old?.element && !old.used) {
            old.element.removeAttribute('src');
            old.element.load();
        }
        this.prepared[moment] = null;

        const list = this.settings[moment];
        if (list.length === 0) return;
        const candidates = list.length > 1 ? list.filter(t => t.id !== this.lastPlayed[moment]) : list;
        const track = candidates[Math.floor(Math.random() * candidates.length)];
        const prepared = { track, element: null, used: false };
        this.prepared[moment] = prepared;

        if (track.source === 'builtin') return;
        this.resolveUrl(track).then((url) => {
            if (url && this.prepared[moment] === prepared) prepared.element = this.loadElement(url);
        });
    }

    // ---------- Lecture ----------

    // Joue une musique du moment pour le mode donné ; renvoie false si rien n'est joué
    play(moment, mode) {
        if (this.isMuted || !this.isEnabled(mode)) return false;
        let prepared = this.prepared[moment];
        if (!prepared || !this.settings[moment].some(t => t.id === prepared.track.id)) {
            this.prepare(moment);
            prepared = this.prepared[moment];
        }
        if (!prepared) return false;

        this.stop(moment, 0.15);
        this.stop('preview', 0.15);
        const { track } = prepared;
        prepared.used = true;
        this.lastPlayed[moment] = track.id;
        const loop = moment === 'shuffle';

        const url = prepared.element ? null : this.cachedUrl(track);
        const element = prepared.element || (url ? this.loadElement(url) : null);
        if (track.source !== 'builtin' && !element) {
            // Son personnalisé pas encore chargé : on le lance dès qu'il est prêt
            const placeholder = { level: 0, setGain() {}, stop() {} };
            this.voices[moment] = placeholder;
            this.resolveUrl(track).then((resolved) => {
                if (!resolved || this.voices[moment] !== placeholder) return;
                this.startVoice(moment, this.createVoice(track, this.loadElement(resolved), loop));
            });
        } else {
            this.startVoice(moment, this.createVoice(track, element, loop));
        }

        this.prepare(moment);
        return true;
    }

    startVoice(moment, voice) {
        if (!voice) return;
        this.voices[moment] = voice;
        voice.onended = () => {
            if (this.voices[moment] !== voice) return;
            this.voices[moment] = null;
            if (moment === 'preview') this.onPreviewEnd?.();
        };
        voice.start();
        // Fondu d'entrée pour la musique du mélange, démarrage franc pour le reste
        this.fade(voice, 1, moment === 'shuffle' ? FADE_IN : 0);
    }

    stop(moment, duration = FADE_OUT) {
        const voice = this.voices[moment];
        if (!voice) return;
        this.voices[moment] = null;
        this.fade(voice, 0, duration).then(() => voice.stop());
        if (moment === 'preview') this.onPreviewEnd?.();
    }

    stopAll() {
        ['shuffle', 'pick', 'preview'].forEach(moment => this.stop(moment, 0.2));
    }

    playSelectionMusic(mode) {
        return this.play('shuffle', mode);
    }

    stopSelectionMusic() {
        this.stop('shuffle');
    }

    playPickSound(mode) {
        return this.play('pick', mode);
    }

    stopPickSound() {
        this.stop('pick', 0.8);
    }

    // Écoute d'une piste depuis le panneau. Renvoie false si l'écoute a été arrêtée.
    togglePreview(track, onEnd) {
        const current = this.previewTrackId;
        this.stop('preview', 0.15);
        if (current === track.id) return false;

        this.previewTrackId = track.id;
        this.onPreviewEnd = () => {
            this.previewTrackId = null;
            this.onPreviewEnd = null;
            onEnd?.();
        };
        if (track.source === 'builtin') {
            this.startVoice('preview', this.createVoice(track, null, false));
            return true;
        }
        const placeholder = { level: 0, setGain() {}, stop() {} };
        this.voices.preview = placeholder;
        this.resolveUrl(track).then((url) => {
            if (this.voices.preview !== placeholder) return;
            if (!url) {
                this.stop('preview', 0);
                return;
            }
            this.startVoice('preview', this.createVoice(track, this.loadElement(url), false));
        });
        return true;
    }

    stopPreview() {
        this.stop('preview', 0.15);
    }

    // ---------- Volume ----------

    applyVolume(voice) {
        // Le bouton son coupe le jeu, pas les écoutes lancées depuis le panneau
        const muted = this.isMuted && voice !== this.voices.preview;
        voice.setGain(muted ? 0 : voice.level * this.settings.volume);
    }

    fade(voice, to, duration) {
        const token = {};
        voice.fadeToken = token;
        const from = voice.level;
        const start = performance.now();
        return new Promise((resolve) => {
            const step = () => {
                if (voice.fadeToken !== token) return resolve();
                const t = duration > 0 ? Math.min(1, (performance.now() - start) / (duration * 1000)) : 1;
                // Courbe douce au début du fondu d'entrée
                voice.level = from + (to - from) * (to > from ? t * t : t);
                this.applyVolume(voice);
                if (t < 1) requestAnimationFrame(step);
                else resolve();
            };
            step();
        });
    }

    mute() {
        this.isMuted = true;
        Object.values(this.voices).forEach(voice => voice && this.applyVolume(voice));
    }

    unmute() {
        this.isMuted = false;
        Object.values(this.voices).forEach(voice => voice && this.applyVolume(voice));
    }

    toggleMute() {
        if (this.isMuted) {
            this.unmute();
        } else {
            this.mute();
        }
        return this.isMuted;
    }
}
