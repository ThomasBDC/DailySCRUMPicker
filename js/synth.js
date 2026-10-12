// Sons intégrés, synthétisés en direct avec Web Audio : aucun fichier à charger,
// disponibles hors ligne et libres de droits (composés pour l'application).
//
// Chaque générateur reçoit (ctx, out) et renvoie { stop, duration } :
// stop() arrête la programmation des notes, duration vaut null pour un son en boucle.

const LOOKAHEAD = 0.25; // s de notes programmées à l'avance

let noiseBuffer = null;

export function noise(ctx) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
        const length = ctx.sampleRate;
        noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function envelope(ctx, t, peak, attack, release) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    return gain;
}

export function tone(ctx, out, { t, midi, type = 'sine', peak = 0.2, attack = 0.005, release = 0.2, cutoff = null, detune = 0 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq(midi);
    osc.detune.value = detune;
    const env = envelope(ctx, t, peak, attack, release);
    let node = osc;
    if (cutoff) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 4), t + attack + release);
        node = osc.connect(filter);
    }
    node.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + attack + release + 0.05);
}

export function hit(ctx, out, { t, peak = 0.3, release = 0.08, type = 'highpass', cutoff = 6000, q = 0.8 }) {
    const src = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const env = envelope(ctx, t, peak, 0.002, release);
    src.connect(filter).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + release + 0.05);
}

export function kick(ctx, out, t, peak = 0.9) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const env = envelope(ctx, t, peak, 0.003, 0.3);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.35);
}

// Programme step(i, t) à intervalle régulier tant que le son n'est pas arrêté
function loop(ctx, interval, step) {
    let next = ctx.currentTime + 0.05;
    let i = 0;
    const tick = () => {
        while (next < ctx.currentTime + LOOKAHEAD) {
            step(i++, next);
            next += interval;
        }
    };
    tick();
    const timer = setInterval(tick, 50);
    return { stop: () => clearInterval(timer), duration: null };
}

// ---------- Pendant le mélange (en boucle) ----------

function drumroll(ctx, out) {
    const start = ctx.currentTime;
    return loop(ctx, 1 / 22, (i, t) => {
        // Crescendo sur les deux premières secondes
        const swell = Math.min(1, 0.35 + (t - start) / 3);
        hit(ctx, out, { t, peak: (0.8 + Math.random() * 0.2) * swell, release: 0.06, type: 'bandpass', cutoff: 2400, q: 0.7 });
        if (i % 11 === 0) tone(ctx, out, { t, midi: 43, type: 'sine', peak: 0.35 * swell, release: 0.25 });
    });
}

function chase(ctx, out) {
    // Électro à 140 BPM, en la mineur : Am - F - C - G
    const bass = [45, 45, 57, 45, 45, 55, 45, 57];
    const chords = [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74]];
    return loop(ctx, 60 / 140 / 4, (i, t) => {
        const bar = Math.floor(i / 16) % 4;
        const shift = [0, -4, 3, -2][bar];
        if (i % 4 === 0) kick(ctx, out, t, 0.7);
        if (i % 4 === 2) hit(ctx, out, { t, peak: 0.12, release: 0.05, cutoff: 8000 });
        if (i % 8 === 4) hit(ctx, out, { t, peak: 0.2, release: 0.12, type: 'bandpass', cutoff: 1800, q: 0.6 });
        if (i % 2 === 0) {
            tone(ctx, out, { t, midi: bass[(i / 2) % 8] + shift, type: 'sawtooth', peak: 0.16, release: 0.12, cutoff: 1400 });
        }
        const chord = chords[bar];
        tone(ctx, out, { t, midi: chord[i % 3] + (i % 6 < 3 ? 0 : 12), type: 'square', peak: 0.045, release: 0.09, cutoff: 3000 });
    });
}

function suspense(ctx, out) {
    // Battement de cœur et nappe grave qui monte d'un demi-ton toutes les deux mesures
    return loop(ctx, 60 / 100 / 2, (i, t) => {
        const beat = i % 4;
        if (beat === 0) kick(ctx, out, t, 0.8);
        if (beat === 1) kick(ctx, out, t - 0.18, 0.5);
        if (i % 8 === 0) {
            const root = 38 + (Math.floor(i / 16) % 4);
            [root, root + 7, root + 13].forEach((midi, k) => {
                tone(ctx, out, { t, midi, type: 'sawtooth', peak: 0.05, attack: 0.6, release: 1.8, cutoff: 900, detune: k * 4 });
            });
        }
        if (i % 2 === 1) tone(ctx, out, { t, midi: 81 + (i % 4 === 1 ? 0 : 1), type: 'sine', peak: 0.03, release: 0.25 });
    });
}

// ---------- Quand la personne est choisie (une fois) ----------

function fanfare(ctx, out) {
    const t0 = ctx.currentTime + 0.03;
    const brass = (t, midi, len, peak = 0.08) => {
        [0, 7, -7].forEach(detune => tone(ctx, out, { t, midi, type: 'sawtooth', peak, attack: 0.03, release: len, cutoff: 2600, detune }));
    };
    brass(t0, 67, 0.12);
    brass(t0 + 0.15, 67, 0.12);
    brass(t0 + 0.3, 67, 0.12);
    [60, 64, 67, 72].forEach(midi => brass(t0 + 0.48, midi, 1.6, 0.04));
    kick(ctx, out, t0 + 0.48, 0.5);
    hit(ctx, out, { t: t0 + 0.48, peak: 0.25, release: 1.4, cutoff: 5000 });
    return { stop: () => {}, duration: 2.4 };
}

function ufoBeam(ctx, out) {
    const t0 = ctx.currentTime + 0.03;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(1100, t0 + 1.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const depth = ctx.createGain();
    depth.gain.value = 25;
    lfo.connect(depth).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.18, t0 + 0.3);
    env.gain.setValueAtTime(0.18, t0 + 1.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    osc.connect(env).connect(out);
    [osc, lfo].forEach(o => { o.start(t0); o.stop(t0 + 2.3); });
    // Scintillement final
    [84, 88, 91, 96, 91, 96, 100].forEach((midi, k) => {
        tone(ctx, out, { t: t0 + 1.3 + k * 0.07, midi, type: 'triangle', peak: 0.07, release: 0.5 });
    });
    return { stop: () => {}, duration: 2.6 };
}

function gong(ctx, out) {
    const t0 = ctx.currentTime + 0.03;
    [[45, 0.3], [57.3, 0.12], [64.1, 0.08], [69.6, 0.06], [76.2, 0.04]].forEach(([midi, peak]) => {
        tone(ctx, out, { t: t0, midi, type: 'sine', peak, attack: 0.01, release: 3.2 });
    });
    hit(ctx, out, { t: t0, peak: 0.2, release: 0.9, type: 'bandpass', cutoff: 900, q: 0.5 });
    return { stop: () => {}, duration: 3.4 };
}

export const BUILTIN_SOUNDS = {
    drumroll: { title: 'Roulement de tambour', moment: 'shuffle', play: drumroll },
    chase: { title: 'Course électro', moment: 'shuffle', play: chase },
    suspense: { title: 'Suspense', moment: 'shuffle', play: suspense },
    fanfare: { title: 'Fanfare', moment: 'pick', play: fanfare },
    ufo: { title: 'Rayon OVNI', moment: 'pick', play: ufoBeam },
    gong: { title: 'Gong', moment: 'pick', play: gong },
};
