// Recherche de photos sur Unsplash (https://unsplash.com/developers).
// L'API demande une clé d'accès gratuite (« Access Key » d'une application Unsplash) :
// l'utilisateur la saisit une fois, elle est gardée dans le localStorage et exportée.

export const UNSPLASH_KEY_STORAGE = 'dsp_unsplash_key';

const API = 'https://api.unsplash.com';
// Paramètres de suivi demandés par Unsplash sur les liens d'attribution
const UTM = 'utm_source=DailySCRUMPicker&utm_medium=referral';
const PER_PAGE = 12;
const IMAGE_SIZE = 400; // px, image carrée recadrée par Unsplash

export function readUnsplashKey() {
    try {
        return localStorage.getItem(UNSPLASH_KEY_STORAGE) || '';
    } catch (_) {
        return '';
    }
}

function saveUnsplashKey(key) {
    try {
        if (key) localStorage.setItem(UNSPLASH_KEY_STORAGE, key);
        else localStorage.removeItem(UNSPLASH_KEY_STORAGE);
    } catch (error) {
        console.warn("Impossible de sauvegarder la clé d'accès Unsplash :", error);
    }
}

// Validation pour l'import (voir settings.js)
export function parseUnsplashKey(value) {
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error("Clé d'accès Unsplash invalide");
    const key = value.trim();
    if (!key) return null;
    if (!/^[\w-]{10,128}$/.test(key)) throw new Error("Clé d'accès Unsplash invalide");
    return key;
}

export function withUtm(url) {
    return `${url}${url.includes('?') ? '&' : '?'}${UTM}`;
}

async function request(url, key) {
    const response = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    });
    if (response.status === 401) throw new Error("Clé d'accès Unsplash refusée : vérifiez-la ci-dessous.");
    if (response.status === 403) throw new Error('Limite de recherches Unsplash atteinte, réessayez dans une heure.');
    if (!response.ok) throw new Error(`Unsplash ne répond pas (erreur ${response.status}).`);
    return response.json();
}

// Renvoie { photos, totalPages } ; chaque photo : { id, thumb, src, alt, credit, downloadLocation }
async function searchPhotos(query, page, key) {
    const params = new URLSearchParams({ query, page: String(page), per_page: String(PER_PAGE), content_filter: 'high' });
    const data = await request(`${API}/search/photos?${params}`, key);
    const photos = (data.results || []).map(photo => ({
        id: photo.id,
        thumb: photo.urls.thumb,
        src: `${photo.urls.raw}&w=${IMAGE_SIZE}&h=${IMAGE_SIZE}&fit=crop&crop=entropy&auto=format&q=80`,
        alt: photo.alt_description || photo.description || '',
        credit: { name: photo.user?.name || 'Unsplash', url: withUtm(photo.user?.links?.html || 'https://unsplash.com') },
        downloadLocation: photo.links?.download_location,
    }));
    return { photos, totalPages: data.total_pages || 0 };
}

// Unsplash demande de signaler chaque photo réellement utilisée
function trackDownload(photo, key) {
    if (!photo.downloadLocation) return;
    request(photo.downloadLocation, key).catch(error => console.warn('Unsplash : téléchargement non signalé', error));
}

// Bloc de recherche Unsplash (formulaire, résultats, clé d'accès) contenu dans `root`.
// onPick({ src, credit }) est appelé avec la photo choisie.
export class UnsplashPicker {
    constructor(root, { onPick }) {
        this.root = root;
        this.onPick = onPick;
        this.form = root.querySelector('.unsplash-search');
        this.input = root.querySelector('.unsplash-input');
        this.results = root.querySelector('.unsplash-results');
        this.status = root.querySelector('.unsplash-status');
        this.more = root.querySelector('.unsplash-more');
        this.keyDetails = root.querySelector('.unsplash-key');
        this.keyInput = root.querySelector('.unsplash-key-input');
        this.query = '';
        this.page = 0;
        this.totalPages = 0;
        this.requestId = 0;

        this.keyInput.value = readUnsplashKey();
        this.keyDetails.open = !this.keyInput.value;
        this.keyInput.addEventListener('change', () => {
            const key = this.keyInput.value.trim();
            this.keyInput.value = key;
            saveUnsplashKey(key);
            this.setStatus('');
        });

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = this.input.value.trim();
            if (query) this.search(query, 1);
        });
        this.more.addEventListener('click', () => this.search(this.query, this.page + 1));
    }

    async search(query, page) {
        const key = readUnsplashKey();
        if (!key) {
            this.keyDetails.open = true;
            this.keyInput.focus();
            this.setStatus("Saisissez d'abord votre clé d'accès Unsplash.", true);
            return;
        }

        const id = ++this.requestId;
        if (page === 1) this.results.replaceChildren();
        this.more.hidden = true;
        this.setStatus('Recherche…');
        try {
            const { photos, totalPages } = await searchPhotos(query, page, key);
            if (id !== this.requestId) return;
            this.query = query;
            this.page = page;
            this.totalPages = totalPages;
            photos.forEach(photo => this.results.appendChild(this.renderPhoto(photo, key)));
            this.setStatus(this.results.children.length ? '' : 'Aucune photo trouvée.');
            this.more.hidden = page >= totalPages;
        } catch (error) {
            if (id !== this.requestId) return;
            console.warn('Recherche Unsplash impossible :', error);
            const offline = error instanceof TypeError;
            this.setStatus(offline ? 'Unsplash est injoignable (connexion ou clé invalide).' : error.message, true);
        }
    }

    renderPhoto(photo, key) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'unsplash-photo';
        button.title = `${photo.alt ? `${photo.alt} – ` : ''}photo de ${photo.credit.name}`;
        const img = document.createElement('img');
        img.src = photo.thumb;
        img.alt = photo.alt;
        img.loading = 'lazy';
        button.appendChild(img);
        button.addEventListener('click', () => {
            this.results.querySelectorAll('.unsplash-photo.is-selected').forEach(b => b.classList.remove('is-selected'));
            button.classList.add('is-selected');
            trackDownload(photo, key);
            this.onPick({ src: photo.src, credit: photo.credit });
        });
        item.appendChild(button);
        return item;
    }

    setStatus(text, isError = false) {
        this.status.textContent = text;
        this.status.hidden = !text;
        this.status.classList.toggle('is-error', isError);
    }
}
