// Réglages du mode Tap Taupe, sauvegardés dans le localStorage
// (et exportés via SETTINGS dans settings.js).

// Durée de la partie : temps pendant lequel le marteau rate tout ; son coup suivant assomme l'élu (secondes)
export const GAME_DURATION_KEY = 'dsp_taptaup_duration';
export const GAME_DURATION_DEFAULT = 5;
export const GAME_DURATION_MIN = 2;
export const GAME_DURATION_MAX = 15;
export const GAME_DURATION_STEP = 1;

// Bruitages (pop des taupes, coups de marteau…), activés par défaut : seul « off » est stocké
export const TAPTAUP_SOUND_KEY = 'dsp_taptaup_sound';

// Valide une durée importée : null pour la valeur par défaut, erreur si elle est invalide.
// Une valeur hors limites est ramenée dans [MIN, MAX], au pas du curseur.
export function parseGameDuration(value) {
    if (value === null) return null;
    const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) throw new Error('Durée de partie Tap Taupe invalide');
    const stepped = Math.round(seconds / GAME_DURATION_STEP) * GAME_DURATION_STEP;
    const clamped = Math.min(GAME_DURATION_MAX, Math.max(GAME_DURATION_MIN, stepped));
    return clamped === GAME_DURATION_DEFAULT ? null : clamped;
}

export function loadGameDuration() {
    try {
        const raw = localStorage.getItem(GAME_DURATION_KEY);
        if (raw !== null) return parseGameDuration(raw) ?? GAME_DURATION_DEFAULT;
    } catch (_) {
        // Valeur illisible : durée par défaut
    }
    return GAME_DURATION_DEFAULT;
}

// Seule une durée différente de la valeur par défaut est stockée
export function saveGameDuration(seconds) {
    try {
        if (seconds === GAME_DURATION_DEFAULT) localStorage.removeItem(GAME_DURATION_KEY);
        else localStorage.setItem(GAME_DURATION_KEY, String(seconds));
    } catch (error) {
        console.warn('Erreur lors de la sauvegarde de la durée de partie :', error);
    }
}

export function loadTapTaupeSound() {
    try {
        return localStorage.getItem(TAPTAUP_SOUND_KEY) !== 'off';
    } catch (_) {
        return true;
    }
}

export function saveTapTaupeSound(enabled) {
    try {
        if (enabled) localStorage.removeItem(TAPTAUP_SOUND_KEY);
        else localStorage.setItem(TAPTAUP_SOUND_KEY, 'off');
    } catch (error) {
        console.warn('Impossible de sauvegarder le réglage des bruitages :', error);
    }
}
