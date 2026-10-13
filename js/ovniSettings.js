// Réglages du mode Enlèvement OVNI

// Durée de la recherche : temps de course avant que l'OVNI choisisse quelqu'un (secondes)
export const SEARCH_DURATION_KEY = 'dsp_ovni_search_duration';
export const SEARCH_DURATION_DEFAULT = 2;
export const SEARCH_DURATION_MIN = 1;
export const SEARCH_DURATION_MAX = 10;
const SEARCH_DURATION_STEP = 0.5;

// Valide une durée importée : null pour la valeur par défaut, erreur si elle est invalide.
// Une valeur hors limites est ramenée dans [MIN, MAX], au pas du curseur.
export function parseSearchDuration(value) {
    if (value === null) return null;
    const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) throw new Error('Durée de recherche OVNI invalide');
    const stepped = Math.round(seconds / SEARCH_DURATION_STEP) * SEARCH_DURATION_STEP;
    const clamped = Math.min(SEARCH_DURATION_MAX, Math.max(SEARCH_DURATION_MIN, stepped));
    return clamped === SEARCH_DURATION_DEFAULT ? null : clamped;
}

export function loadSearchDuration() {
    try {
        const raw = localStorage.getItem(SEARCH_DURATION_KEY);
        if (raw !== null) return parseSearchDuration(raw) ?? SEARCH_DURATION_DEFAULT;
    } catch (_) {
        // Valeur illisible : durée par défaut
    }
    return SEARCH_DURATION_DEFAULT;
}

// Seule une durée différente de la valeur par défaut est stockée
export function saveSearchDuration(seconds) {
    try {
        if (seconds === SEARCH_DURATION_DEFAULT) localStorage.removeItem(SEARCH_DURATION_KEY);
        else localStorage.setItem(SEARCH_DURATION_KEY, String(seconds));
    } catch (error) {
        console.warn('Erreur lors de la sauvegarde de la durée de recherche :', error);
    }
}

// « 2 s », « 2,5 s »
export function formatSeconds(seconds) {
    return `${String(seconds).replace('.', ',')} s`;
}
