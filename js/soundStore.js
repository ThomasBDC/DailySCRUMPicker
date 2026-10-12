// Sons ajoutés par l'utilisateur, conservés dans IndexedDB : le localStorage est trop
// petit pour des fichiers audio. Chaque son : { id: 'custom:…', name, type, blob }.

const DB_NAME = 'dsp_sounds';
const STORE = 'sounds';

let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB indisponible'));
                return;
            }
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
}

async function run(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    });
}

export function newSoundId() {
    return `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSounds() {
    try {
        const sounds = await run('readonly', store => store.getAll());
        return (sounds || []).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.warn('Sons personnalisés indisponibles :', error);
        return [];
    }
}

export async function getSound(id) {
    return run('readonly', store => store.get(id));
}

export async function addSound(file) {
    const sound = {
        id: newSoundId(),
        name: file.name.replace(/\.[^.]+$/, '').trim() || 'Mon son',
        type: file.type || 'audio/mpeg',
        blob: file,
    };
    await run('readwrite', store => store.put(sound));
    return sound;
}

export async function deleteSound(id) {
    await run('readwrite', store => store.delete(id));
}

// ---------- Export / import (voir settings.js) ----------

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function dataUrlToBlob(dataUrl) {
    return (await fetch(dataUrl)).blob();
}

// Renvoie null s'il n'y a aucun son personnalisé
export async function exportSounds() {
    const sounds = await listSounds();
    if (sounds.length === 0) return null;
    return Promise.all(sounds.map(async ({ id, name, type, blob }) => ({ id, name, type, data: await blobToDataUrl(blob) })));
}

// Remplace tous les sons personnalisés (null : les supprime tous)
export async function replaceSounds(sounds) {
    const records = await Promise.all((sounds || []).map(async ({ id, name, type, data }) => ({
        id, name, type, blob: await dataUrlToBlob(data),
    })));
    await run('readwrite', (store) => {
        store.clear();
        records.forEach(record => store.put(record));
    });
}

export function parseSounds(value) {
    if (value === null) return null;
    if (!Array.isArray(value)) throw new Error('Liste de sons personnalisés invalide');
    const sounds = value.map((sound) => {
        if (!sound || typeof sound !== 'object'
            || typeof sound.id !== 'string' || !sound.id.startsWith('custom:')
            || typeof sound.data !== 'string' || !/^data:(audio|video)\/[^;,]+(;[^,]*)?,/i.test(sound.data)) {
            throw new Error('Son personnalisé invalide');
        }
        const type = sound.data.slice(5, sound.data.search(/[;,]/));
        const name = typeof sound.name === 'string' && sound.name.trim() ? sound.name.trim().slice(0, 80) : 'Mon son';
        return { id: sound.id, name, type, data: sound.data };
    });
    return sounds.length ? sounds : null;
}
