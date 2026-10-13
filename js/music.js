// Réglages des musiques (communs à tous les modes) et bibliothèque de musiques libres.
//
// Une musique (« piste ») est décrite par :
//   { id, source: 'builtin' | 'library' | 'custom', title, creator?, license?, licenseUrl?, pageUrl?, url?, duration? }
// - builtin : son synthétisé de js/synth.js (id 'builtin:<nom>')
// - library : fichier de la bibliothèque Openverse, lu depuis son URL (id 'openverse:<uuid>')
// - custom  : son ajouté par l'utilisateur, stocké dans IndexedDB (id 'custom:…', voir soundStore.js)

import { BUILTIN_SOUNDS } from './synth.js';

export const MUSIC_STORAGE_KEY = 'dsp_music';

// Moments où une musique est jouée
export const MOMENTS = ['shuffle', 'pick'];
// Modes de jeu qui jouent les musiques
export const MUSIC_MODES = ['3d', 'wheel', 'taptaup'];

export function builtinTrack(name) {
    return { id: `builtin:${name}`, source: 'builtin', title: BUILTIN_SOUNDS[name].title };
}

export const BUILTIN_TRACKS = Object.keys(BUILTIN_SOUNDS).map(builtinTrack);

export const MUSIC_DEFAULTS = {
    volume: 0.8,
    enabled: { '3d': true, wheel: true, taptaup: true },
    shuffle: [builtinTrack('drumroll'), builtinTrack('chase')],
    pick: [builtinTrack('fanfare'), builtinTrack('ufo')],
};

function defaults() {
    return JSON.parse(JSON.stringify(MUSIC_DEFAULTS));
}

export function loadMusicSettings() {
    try {
        const raw = localStorage.getItem(MUSIC_STORAGE_KEY);
        return raw === null ? defaults() : parseMusicSettings(JSON.parse(raw)) || defaults();
    } catch (_) {
        return defaults();
    }
}

export function saveMusicSettings(settings) {
    try {
        localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {
        // Stockage indisponible : les réglages restent valables pour la session
    }
}

function text(value, max = 120) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function httpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}

function parseTrack(track) {
    if (!track || typeof track !== 'object' || typeof track.id !== 'string') return null;
    const [prefix, name] = [track.id.slice(0, track.id.indexOf(':')), track.id.slice(track.id.indexOf(':') + 1)];
    if (prefix === 'builtin') {
        return BUILTIN_SOUNDS[name] ? builtinTrack(name) : null;
    }
    const base = { id: track.id, title: text(track.title) || 'Sans titre' };
    if (prefix === 'custom') {
        return { ...base, source: 'custom' };
    }
    if (prefix === 'openverse' && httpUrl(track.url)) {
        return {
            ...base,
            source: 'library',
            url: track.url,
            creator: text(track.creator),
            license: text(track.license, 40),
            licenseUrl: httpUrl(track.licenseUrl),
            pageUrl: httpUrl(track.pageUrl),
            duration: Number.isFinite(track.duration) ? track.duration : null,
        };
    }
    return null;
}

// Valide des réglages (sauvegardés ou importés). null : valeurs par défaut.
export function parseMusicSettings(value) {
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réglages des musiques invalides');
    const settings = defaults();
    if (Number.isFinite(value.volume)) settings.volume = Math.min(1, Math.max(0, value.volume));
    if (value.enabled && typeof value.enabled === 'object') {
        MUSIC_MODES.forEach((mode) => {
            if (typeof value.enabled[mode] === 'boolean') settings.enabled[mode] = value.enabled[mode];
        });
    }
    MOMENTS.forEach((moment) => {
        if (!Array.isArray(value[moment])) return;
        const seen = new Set();
        settings[moment] = value[moment].map(parseTrack).filter((track) => {
            if (!track || seen.has(track.id)) return false;
            seen.add(track.id);
            return true;
        });
    });
    return settings;
}

// ---------- Bibliothèque Openverse ----------
// Openverse (fondation WordPress) recense des sons sous licence Creative Commons
// (Jamendo, Freesound, ccMixter, Wikimedia…). Son API publique ne demande pas de clé.

const OPENVERSE_API = 'https://api.openverse.org/v1/audio/';

// Catégories proposées dans le panneau. `filters` : paramètres de recherche Openverse.
// Les bruitages viennent de Freesound : la catégorie Openverse « sound_effect » n'est
// presque jamais renseignée, on filtre donc par source plutôt que par catégorie.
const MUSIC = { category: 'music' };
const EFFECT = { source: 'freesound' };

export const LIBRARY_CATEGORIES = [
    {
        group: 'Musiques',
        items: [
            { id: 'suspense', label: 'Suspense', q: 'suspense', filters: MUSIC },
            { id: 'gameshow', label: 'Jeu télé', q: 'game show', filters: MUSIC },
            { id: 'epic', label: 'Épique', q: 'epic', filters: MUSIC },
            { id: 'electro', label: 'Électro', q: 'electronic', filters: MUSIC },
            { id: 'chiptune', label: 'Rétro 8-bit', q: 'chiptune', filters: MUSIC },
            { id: 'action', label: 'Action', q: 'action', filters: MUSIC },
            { id: 'funk', label: 'Funk', q: 'funk', filters: MUSIC },
            { id: 'rock', label: 'Rock', q: 'rock', filters: MUSIC },
            { id: 'jazz', label: 'Jazz', q: 'jazz', filters: MUSIC },
            { id: 'latin', label: 'Latino', q: 'latin', filters: MUSIC },
            { id: 'chill', label: 'Chill', q: 'chill', filters: MUSIC },
            { id: 'funny', label: 'Rigolo', q: 'funny', filters: MUSIC },
            { id: 'space', label: 'Espace', q: 'space', filters: MUSIC },
            { id: 'orchestra', label: 'Orchestral', q: 'orchestra', filters: MUSIC },
        ],
    },
    {
        group: 'Effets courts',
        items: [
            { id: 'drumroll', label: 'Roulement de tambour', q: 'drum roll', filters: EFFECT },
            { id: 'fanfare', label: 'Fanfare', q: 'fanfare', filters: EFFECT },
            { id: 'jingle', label: 'Jingle', q: 'jingle', filters: EFFECT },
            { id: 'win', label: 'Victoire', q: 'win', filters: EFFECT },
            { id: 'applause', label: 'Applaudissements', q: 'applause', filters: EFFECT },
            { id: 'tada', label: 'Ta-da', q: 'tada', filters: EFFECT },
            { id: 'gong', label: 'Gong', q: 'gong', filters: EFFECT },
            { id: 'ufo', label: 'OVNI / Sci-fi', q: 'ufo', filters: EFFECT },
            { id: 'cartoon', label: 'Cartoon', q: 'cartoon', filters: EFFECT },
            { id: 'whoosh', label: 'Whoosh', q: 'whoosh', filters: EFFECT },
        ],
    },
];

function licenseLabel(license, version) {
    if (!license) return null;
    if (license === 'cc0') return 'CC0';
    if (license === 'pdm') return 'Domaine public';
    return `CC ${license.toUpperCase()}${version ? ` ${version}` : ''}`;
}

function toTrack(result) {
    return {
        id: `openverse:${result.id}`,
        source: 'library',
        title: text(result.title) || 'Sans titre',
        creator: text(result.creator),
        license: licenseLabel(result.license, result.license_version),
        licenseUrl: httpUrl(result.license_url),
        pageUrl: httpUrl(result.foreign_landing_url),
        url: result.url,
        // Openverse donne la durée en millisecondes
        duration: Number.isFinite(result.duration) ? Math.round(result.duration / 1000) : null,
    };
}

const searchCache = new Map();

// Renvoie { tracks, hasMore, filters }. commercial : seulement les licences qui autorisent
// un usage commercial. Si les filtres de la catégorie ne donnent rien en première page,
// la recherche est relancée sans eux ; `filters` indique ceux finalement utilisés.
export async function searchLibrary({ q, filters = {}, page = 1, commercial = true }) {
    const result = await fetchLibrary({ q, filters, page, commercial });
    if (result.tracks.length === 0 && page === 1 && Object.keys(filters).length > 0) {
        return fetchLibrary({ q, filters: {}, page, commercial });
    }
    return result;
}

async function fetchLibrary({ q, filters, page, commercial }) {
    const params = new URLSearchParams({ q, page: String(page), page_size: '20' });
    Object.entries(filters).forEach(([key, value]) => params.set(key, value));
    if (commercial) params.set('license_type', 'commercial');
    const url = `${OPENVERSE_API}?${params}`;
    if (searchCache.has(url)) return searchCache.get(url);

    let response;
    try {
        response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (_) {
        throw new Error('Bibliothèque injoignable : vérifiez la connexion internet.');
    }
    if (response.status === 429) throw new Error('Trop de recherches d\'affilée : réessayez dans une minute.');
    if (!response.ok) throw new Error(`La bibliothèque ne répond pas (erreur ${response.status}).`);

    const body = await response.json();
    const result = {
        tracks: (body.results || []).filter(r => httpUrl(r.url)).map(toTrack),
        hasMore: page < (body.page_count || 0),
        filters,
    };
    searchCache.set(url, result);
    return result;
}

export function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return null;
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
