// Export / import de toute la configuration de l'application dans un fichier JSON.
//
// SETTINGS est la liste de référence des paramètres sauvegardés (localStorage ou IndexedDB).
// Tout nouveau paramètre persistant doit y être ajouté : il est alors automatiquement
// inclus dans l'export et restauré par l'import (voir CLAUDE.md).

import { WHEEL_DEFAULTS, WHEEL_SETTINGS_KEY, HUB_IMAGE_KEY } from './wheel.js';
import { UNSPLASH_KEY_STORAGE, parseUnsplashKey } from './unsplash.js';
import { MUSIC_STORAGE_KEY, parseMusicSettings } from './music.js';
import { exportSounds, parseSounds, replaceSounds } from './soundStore.js';
import { PACK_SOUND_KEY } from './packSounds.js';
import { SEARCH_DURATION_KEY, parseSearchDuration } from './ovniSettings.js';
import { GAME_DURATION_KEY, TAPTAUP_SOUND_KEY, parseGameDuration } from './taptaupSettings.js';
import { cleanAttacks } from './participants.js';

export const PICKER_TYPES = ['3d', 'wheel', 'taptaup', 'pack'];

const APP_ID = 'DailySCRUMPicker';
const EXPORT_VERSION = 2;

// Chaque paramètre : nom dans le fichier exporté, clé localStorage, et fonctions
// de conversion. `parse` valide une valeur importée et renvoie null pour la valeur par
// défaut (la clé est alors supprimée) ; elle lève une erreur si la valeur est invalide.
// Un paramètre stocké ailleurs que dans le localStorage (IndexedDB…) remplace `storageKey`
// par `load()` / `store(value)`, asynchrones ; `store(null)` revient à la valeur par défaut.
export const SETTINGS = [
    {
        name: 'participants',
        storageKey: 'dsp_participants_v2',
        read: raw => JSON.parse(raw),
        write: value => JSON.stringify(value),
        parse: parseParticipants
    },
    {
        name: 'pickerType',
        storageKey: 'dsp_picker_type',
        parse: value => {
            if (value === null) return null;
            if (!PICKER_TYPES.includes(value)) throw new Error(`Mode de jeu inconnu : ${value}`);
            return value;
        }
    },
    {
        // Durée de la course avant que l'OVNI choisisse, en secondes
        name: 'ovniSearchDuration',
        storageKey: SEARCH_DURATION_KEY,
        read: raw => Number(raw),
        write: value => String(value),
        parse: parseSearchDuration
    },
    {
        // Durée de la partie de Tap Taupe avant que le marteau choisisse, en secondes
        name: 'taptaupDuration',
        storageKey: GAME_DURATION_KEY,
        read: raw => Number(raw),
        write: value => String(value),
        parse: parseGameDuration
    },
    {
        // Bruitages du Tap Taupe, activés par défaut : seul « off » est stocké
        name: 'taptaupSound',
        storageKey: TAPTAUP_SOUND_KEY,
        read: raw => raw !== 'off',
        write: value => (value ? 'on' : 'off'),
        parse: value => {
            if (value === null) return null;
            if (typeof value !== 'boolean') throw new Error('Réglage des bruitages du Tap Taupe invalide');
            return value ? null : false;
        }
    },
    {
        name: 'packLabel',
        storageKey: 'dsp_pack_label',
        parse: value => {
            if (value === null) return null;
            if (typeof value !== 'string') throw new Error('Libellé du paquet invalide');
            return value.trim().slice(0, 40) || null;
        }
    },
    {
        name: 'packImage',
        storageKey: 'dsp_pack_image',
        parse: value => {
            if (value === null) return null;
            if (!isImageUrl(value)) throw new Error('Image du paquet invalide');
            return value;
        }
    },
    {
        // Bruitages du pack opening, activés par défaut : seul « off » est stocké
        name: 'packSound',
        storageKey: PACK_SOUND_KEY,
        read: raw => raw !== 'off',
        write: value => (value ? 'on' : 'off'),
        parse: value => {
            if (value === null) return null;
            if (typeof value !== 'boolean') throw new Error('Réglage des bruitages du paquet invalide');
            return value ? null : false;
        }
    },
    {
        name: 'wheelSettings',
        storageKey: WHEEL_SETTINGS_KEY,
        read: raw => JSON.parse(raw),
        write: value => JSON.stringify(value),
        parse: parseWheelSettings
    },
    {
        // Image au centre de la roue (PC en data URL, ou photo Unsplash avec son auteur)
        name: 'wheelHubImage',
        storageKey: HUB_IMAGE_KEY,
        read: raw => JSON.parse(raw),
        write: value => JSON.stringify(value),
        parse: parseHubImage
    },
    {
        name: 'unsplashAccessKey',
        storageKey: UNSPLASH_KEY_STORAGE,
        parse: parseUnsplashKey
    },
    {
        name: 'music',
        storageKey: MUSIC_STORAGE_KEY,
        read: raw => JSON.parse(raw),
        write: value => JSON.stringify(value),
        parse: parseMusicSettings
    },
    {
        // Sons ajoutés par l'utilisateur, exportés en data URL
        name: 'customSounds',
        load: exportSounds,
        store: replaceSounds,
        parse: parseSounds
    }
];

function parseWheelSettings(value) {
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réglages de la roue invalides');
    // Seules les options connues, du bon type, sont gardées ; les autres prennent leur valeur par défaut
    const settings = {};
    Object.keys(WHEEL_DEFAULTS).forEach((key) => {
        if (typeof value[key] === typeof WHEEL_DEFAULTS[key]) settings[key] = value[key];
    });
    return settings;
}

function parseHubImage(value) {
    if (value === null) return null;
    // Une simple URL d'image est aussi acceptée
    if (typeof value === 'string') value = { src: value };
    if (!value || typeof value !== 'object' || !isImageUrl(value.src)) throw new Error('Image du centre de la roue invalide');
    const credit = value.credit;
    const validCredit = credit && typeof credit === 'object'
        && typeof credit.name === 'string' && credit.name.trim()
        && typeof credit.url === 'string' && /^https:\/\//i.test(credit.url);
    return {
        src: value.src,
        credit: validCredit ? { name: credit.name.trim().slice(0, 80), url: credit.url } : null
    };
}

function isImageUrl(value) {
    return typeof value === 'string' && /^(data:image\/|https?:\/\/)/i.test(value);
}

function parseParticipants(items) {
    if (!Array.isArray(items)) throw new Error('Aucune liste de participants trouvée');

    const participants = items
        .map((item, idx) => {
            // Un simple nom est aussi accepté
            if (typeof item === 'string') item = { name: item };
            if (!item || typeof item !== 'object') return null;
            const name = typeof item.name === 'string' && item.name.trim()
                ? item.name.trim()
                : `Participant ${idx + 1}`;
            const faceUrl = isImageUrl(item.faceUrl) ? item.faceUrl : null;
            // Attaques de la carte du pack opening (absentes des fichiers plus anciens)
            const attacks = cleanAttacks(item.attacks);
            return { name, faceUrl, display: item.display !== false, ...(attacks && { attacks }) };
        })
        .filter(Boolean);

    if (participants.length === 0) throw new Error('La liste de participants est vide');
    return participants;
}

async function readSetting(setting) {
    if (setting.load) {
        try {
            return await setting.load();
        } catch (error) {
            console.warn(`Paramètre ${setting.name} illisible :`, error);
            return null;
        }
    }
    try {
        const raw = localStorage.getItem(setting.storageKey);
        if (raw === null) return null;
        return setting.read ? setting.read(raw) : raw;
    } catch (_) {
        return null;
    }
}

export async function exportSettings() {
    const settings = {};
    for (const setting of SETTINGS) {
        settings[setting.name] = await readSetting(setting);
    }

    const data = {
        app: APP_ID,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        settings
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-scrum-picker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// Renvoie { nom: valeur } pour les paramètres présents dans le fichier.
// Un paramètre absent du fichier n'est pas modifié à l'import.
function parseImport(data) {
    // Anciens formats : tableau de participants, ou { participants: [...] } (version 1)
    if (Array.isArray(data)) return { participants: parseParticipants(data) };
    if (!data || typeof data !== 'object') throw new Error('Fichier vide');
    const source = data.settings && typeof data.settings === 'object' ? data.settings : data;

    const values = {};
    SETTINGS.forEach(setting => {
        if (Object.prototype.hasOwnProperty.call(source, setting.name)) {
            values[setting.name] = setting.parse(source[setting.name]);
        }
    });
    if (Object.keys(values).length === 0) throw new Error('Aucun paramètre reconnu');
    return values;
}

async function writeSettings(values) {
    // En cas d'échec (stockage plein), on remet les valeurs précédentes du localStorage
    const local = SETTINGS.filter(setting => setting.storageKey);
    const previous = local.map(setting => [setting.storageKey, localStorage.getItem(setting.storageKey)]);
    try {
        // Les paramètres stockés ailleurs d'abord : ce sont les plus susceptibles d'échouer
        for (const setting of SETTINGS) {
            if (setting.store && setting.name in values) await setting.store(values[setting.name]);
        }
        local.forEach(setting => {
            if (!(setting.name in values)) return;
            const value = values[setting.name];
            if (value === null) localStorage.removeItem(setting.storageKey);
            else localStorage.setItem(setting.storageKey, setting.write ? setting.write(value) : value);
        });
    } catch (error) {
        previous.forEach(([key, raw]) => {
            try {
                if (raw === null) localStorage.removeItem(key);
                else localStorage.setItem(key, raw);
            } catch (_) {}
        });
        throw error;
    }
}

export async function importSettings(file) {
    let values;
    try {
        values = parseImport(JSON.parse(await file.text()));
    } catch (error) {
        console.error("Erreur lors de l'import de la configuration :", error);
        alert(`Fichier invalide : impossible d'importer la configuration.\n${error.message}`);
        return;
    }

    if (!confirm('Importer cette configuration ? Les réglages actuels seront remplacés et la page rechargée.')) {
        return;
    }

    try {
        await writeSettings(values);
    } catch (error) {
        console.error("Erreur lors de l'enregistrement de la configuration :", error);
        alert("Impossible d'enregistrer la configuration importée (stockage du navigateur plein ?).");
        return;
    }

    // Recharger applique tous les réglages comme au démarrage
    window.location.reload();
}

export function setupSettingsTransfer() {
    const importInput = document.getElementById('import-settings-input');
    document.getElementById('export-settings').addEventListener('click', () => {
        exportSettings().catch((error) => {
            console.error("Erreur lors de l'export de la configuration :", error);
            alert("Impossible d'exporter la configuration.");
        });
    });
    document.getElementById('import-settings').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        // Réinitialiser pour pouvoir réimporter le même fichier
        e.target.value = '';
        if (file) importSettings(file);
    });
}
