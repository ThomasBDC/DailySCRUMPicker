// Onglet « Musiques » du panneau de configuration : listes de lecture du mélange et de la
// personne choisie, bibliothèque libre (Openverse), sons intégrés et sons personnels.

import { BUILTIN_TRACKS, LIBRARY_CATEGORIES, MOMENTS, formatDuration, searchLibrary } from './music.js';
import { addSound, deleteSound, listSounds } from './soundStore.js';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MOMENT_LABELS = { shuffle: 'Mélange', pick: 'Choisi' };
const MOMENT_TITLES = {
    shuffle: 'Pendant le mélange',
    pick: 'Quand la personne est choisie',
};
const EMPTY_PLAYLIST = {
    shuffle: 'Aucune musique : le mélange se fera en silence.',
    pick: 'Aucune musique pour la personne choisie.',
};

const ICONS = {
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    remove: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
    });
    children.filter(Boolean).forEach(child => node.append(child));
    return node;
}

// Garde seulement ce qui sert à rejouer et créditer la piste
function storedTrack(track) {
    const copy = {};
    ['id', 'source', 'title', 'creator', 'license', 'licenseUrl', 'pageUrl', 'url', 'duration'].forEach((key) => {
        if (track[key] !== null && track[key] !== undefined) copy[key] = track[key];
    });
    return copy;
}

export class MusicPanel {
    constructor(audioManager) {
        this.audio = audioManager;
        this.root = document.querySelector('[data-panel="music"]');
        if (!this.root) return;

        this.view = { kind: 'builtin' };
        this.results = [];
        this.customSounds = [];
        this.searchToken = 0;

        this.statusEl = document.getElementById('music-status');
        this.resultsEl = document.getElementById('music-results');
        this.moreButton = document.getElementById('music-more');
        this.commercialInput = document.getElementById('music-commercial');
        this.customActions = document.getElementById('music-custom-actions');

        this.buildCategories();
        this.bindControls();
        this.refreshSettings();
        this.showView({ kind: 'builtin' });
        this.loadCustomSounds();
    }

    get settings() {
        return this.audio.settings;
    }

    update(changes) {
        this.audio.updateSettings({ ...this.settings, ...changes });
        this.refreshSettings();
    }

    // ---------- Contrôles ----------

    bindControls() {
        const volume = document.getElementById('music-volume');
        volume.addEventListener('input', () => {
            this.update({ volume: Number(volume.value) / 100 });
        });

        document.querySelectorAll('[data-music-mode]').forEach((input) => {
            input.addEventListener('change', () => {
                this.update({ enabled: { ...this.settings.enabled, [input.dataset.musicMode]: input.checked } });
            });
        });

        const searchInput = document.getElementById('music-search-input');
        document.getElementById('music-search').addEventListener('submit', (e) => {
            e.preventDefault();
            const q = searchInput.value.trim();
            if (q) this.showView({ kind: 'search', q, filters: {} });
        });

        this.commercialInput.addEventListener('change', () => {
            if (this.view.kind === 'search') this.showView({ ...this.view });
        });
        this.moreButton.addEventListener('click', () => this.search(this.view.page + 1));

        const fileInput = document.getElementById('music-file-input');
        document.getElementById('music-file-choose').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const files = [...fileInput.files];
            fileInput.value = '';
            this.addFiles(files);
        });

        // Une écoute s'arrête quand on quitte l'onglet ou qu'on ferme le panneau
        const stopPreview = () => {
            if (this.root.hidden || !document.getElementById('setup-form').classList.contains('active')) {
                this.audio.stopPreview();
            }
        };
        const observer = new MutationObserver(stopPreview);
        observer.observe(this.root, { attributes: true, attributeFilter: ['hidden'] });
        observer.observe(document.getElementById('setup-form'), { attributes: true, attributeFilter: ['class'] });
    }

    refreshSettings() {
        const volume = document.getElementById('music-volume');
        volume.value = String(Math.round(this.settings.volume * 100));
        document.getElementById('music-volume-value').textContent = `${volume.value} %`;
        document.querySelectorAll('[data-music-mode]').forEach((input) => {
            input.checked = !!this.settings.enabled[input.dataset.musicMode];
        });
        MOMENTS.forEach(moment => this.renderPlaylist(moment));
        this.refreshToggles();
    }

    // ---------- Catégories ----------

    buildCategories() {
        const container = document.getElementById('music-categories');
        const chip = (label, view, key) => el('button', {
            type: 'button',
            class: 'music-chip',
            'data-chip': key,
            text: label,
            onclick: () => this.showView(view),
        });

        container.append(el('div', { class: 'music-chip-group' }, [
            el('span', { class: 'music-chip-label', text: 'Hors ligne' }),
            el('div', { class: 'music-chips' }, [
                chip('Sons intégrés', { kind: 'builtin' }, 'builtin'),
                chip('Mes sons', { kind: 'custom' }, 'custom'),
            ]),
        ]));
        LIBRARY_CATEGORIES.forEach(({ group, items }) => {
            container.append(el('div', { class: 'music-chip-group' }, [
                el('span', { class: 'music-chip-label', text: group }),
                el('div', { class: 'music-chips' }, items.map(item => chip(
                    item.label,
                    { kind: 'search', q: item.q, filters: item.filters, chip: item.id },
                    item.id,
                ))),
            ]));
        });
    }

    showView(view) {
        // `filters` reste celui de la catégorie ; `activeFilters` peut être levé faute de résultat
        this.view = { ...view, activeFilters: view.filters };
        const active = view.kind === 'search' ? view.chip : view.kind;
        this.root.querySelectorAll('.music-chip').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.chip === active);
        });
        this.customActions.hidden = view.kind !== 'custom';
        this.root.querySelector('.music-filter').hidden = view.kind !== 'search';
        if (view.kind === 'search') {
            this.results = [];
            this.search(1);
        } else {
            this.renderResults();
        }
    }

    async search(page) {
        const view = this.view;
        const token = ++this.searchToken;
        view.page = page;
        this.moreButton.hidden = true;
        this.setStatus(page === 1 ? 'Recherche…' : 'Chargement…');
        if (page === 1) this.resultsEl.replaceChildren();

        try {
            const { tracks, hasMore, filters } = await searchLibrary({
                q: view.q,
                filters: view.activeFilters,
                page,
                commercial: this.commercialInput.checked,
            });
            if (token !== this.searchToken) return;
            // Les pages suivantes gardent les filtres retenus (ils ont pu être levés faute de résultat)
            view.activeFilters = filters;
            const known = new Set(this.results.map(t => t.id));
            this.results = this.results.concat(tracks.filter(t => !known.has(t.id)));
            this.renderResults();
            this.moreButton.hidden = !hasMore;
        } catch (error) {
            if (token !== this.searchToken) return;
            this.renderResults();
            this.setStatus(error.message, true);
        }
    }

    setStatus(message, isError = false) {
        this.statusEl.hidden = !message;
        this.statusEl.textContent = message || '';
        this.statusEl.classList.toggle('is-error', isError);
    }

    // ---------- Listes ----------

    currentTracks() {
        if (this.view.kind === 'builtin') return BUILTIN_TRACKS;
        if (this.view.kind === 'custom') {
            return this.customSounds.map(sound => ({ id: sound.id, source: 'custom', title: sound.name }));
        }
        return this.results;
    }

    renderResults() {
        const tracks = this.currentTracks();
        this.resultsEl.replaceChildren(...tracks.map(track => this.trackRow(track)));
        if (this.view.kind === 'custom' && tracks.length === 0) {
            this.setStatus('Aucun son personnel pour l\'instant : ajoutez vos fichiers audio.');
        } else if (this.view.kind === 'search' && tracks.length === 0) {
            this.setStatus(this.commercialInput.checked
                ? 'Aucun résultat. Essayez sans le filtre « usage commercial » ou avec un autre mot (en anglais).'
                : 'Aucun résultat. Essayez un autre mot (en anglais).');
        } else {
            this.setStatus('');
        }
        if (this.view.kind !== 'search') this.moreButton.hidden = true;
    }

    renderPlaylist(moment) {
        const list = this.root.querySelector(`[data-playlist="${moment}"]`);
        const tracks = this.settings[moment];
        if (tracks.length === 0) {
            list.replaceChildren(el('li', { class: 'music-empty', text: EMPTY_PLAYLIST[moment] }));
            return;
        }
        list.replaceChildren(...tracks.map(track => this.trackRow(track, moment)));
    }

    // Ligne d'une piste. Dans une liste de lecture : bouton retirer ; sinon : boutons d'ajout.
    trackRow(track, playlist = null) {
        const playing = this.audio.previewTrackId === track.id;
        const play = el('button', {
            type: 'button',
            class: `music-play${playing ? ' is-playing' : ''}`,
            'data-track': track.id,
            title: 'Écouter',
            'aria-label': `Écouter ${track.title}`,
            html: playing ? ICONS.stop : ICONS.play,
            onclick: () => this.togglePreview(track),
        });

        const meta = [];
        if (track.source === 'builtin') meta.push(document.createTextNode('Intégré'));
        if (track.source === 'custom') meta.push(document.createTextNode('Mon son'));
        if (track.creator) meta.push(document.createTextNode(track.creator));
        const duration = formatDuration(track.duration);
        if (duration) meta.push(document.createTextNode(duration));
        if (track.license) {
            meta.push(track.licenseUrl
                ? el('a', { href: track.licenseUrl, target: '_blank', rel: 'noopener', text: track.license })
                : document.createTextNode(track.license));
        }
        if (track.pageUrl) meta.push(el('a', { href: track.pageUrl, target: '_blank', rel: 'noopener', text: 'source' }));
        const metaEl = el('span', { class: 'music-meta' });
        meta.forEach((part, i) => {
            if (i > 0) metaEl.append(' · ');
            metaEl.append(part);
        });

        const info = el('div', { class: 'music-info' }, [
            el('span', { class: 'music-title', title: track.title, text: track.title }),
            metaEl,
        ]);

        const actions = el('div', { class: 'music-actions' });
        if (playlist) {
            actions.append(el('button', {
                type: 'button',
                class: 'icon-button music-remove',
                title: `Retirer de « ${MOMENT_TITLES[playlist]} »`,
                'aria-label': `Retirer ${track.title}`,
                html: ICONS.remove,
                onclick: () => this.setInPlaylist(playlist, track, false),
            }));
        } else {
            MOMENTS.forEach((moment) => {
                actions.append(el('button', {
                    type: 'button',
                    class: 'music-toggle',
                    'data-track': track.id,
                    'data-moment': moment,
                    title: `Ajouter à « ${MOMENT_TITLES[moment]} »`,
                    onclick: (e) => {
                        const pressed = e.currentTarget.getAttribute('aria-pressed') === 'true';
                        this.setInPlaylist(moment, track, !pressed);
                    },
                }));
            });
            if (track.source === 'custom') {
                actions.append(el('button', {
                    type: 'button',
                    class: 'icon-button music-remove',
                    title: 'Supprimer ce son',
                    'aria-label': `Supprimer ${track.title}`,
                    html: ICONS.trash,
                    onclick: () => this.removeCustom(track),
                }));
            }
        }

        const row = el('li', { class: 'music-item' }, [play, info, actions]);
        this.refreshToggles(row);
        return row;
    }

    // Met à jour l'état des boutons « Mélange » / « Choisi » selon les listes de lecture
    refreshToggles(scope = this.resultsEl) {
        scope.querySelectorAll('.music-toggle').forEach((button) => {
            const { track, moment } = button.dataset;
            const selected = this.settings[moment].some(t => t.id === track);
            button.setAttribute('aria-pressed', String(selected));
            button.innerHTML = `${selected ? ICONS.check : ICONS.plus}<span>${MOMENT_LABELS[moment]}</span>`;
        });
    }

    setInPlaylist(moment, track, selected) {
        const others = this.settings[moment].filter(t => t.id !== track.id);
        this.update({ [moment]: selected ? [...others, storedTrack(track)] : others });
    }

    togglePreview(track) {
        this.audio.togglePreview(track, () => this.refreshPlayButtons());
        this.refreshPlayButtons();
    }

    refreshPlayButtons() {
        this.root.querySelectorAll('.music-play').forEach((button) => {
            const playing = this.audio.previewTrackId === button.dataset.track;
            button.classList.toggle('is-playing', playing);
            button.innerHTML = playing ? ICONS.stop : ICONS.play;
        });
    }

    // ---------- Sons personnels ----------

    async loadCustomSounds() {
        this.customSounds = await listSounds();
        if (this.view.kind === 'custom') this.renderResults();
    }

    async addFiles(files) {
        const rejected = [];
        for (const file of files) {
            if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(file.name)) {
                rejected.push(`${file.name} (pas un fichier audio)`);
            } else if (file.size > MAX_FILE_SIZE) {
                rejected.push(`${file.name} (plus de 15 Mo)`);
            } else {
                try {
                    await addSound(file);
                } catch (error) {
                    console.error('Impossible d\'enregistrer le son :', error);
                    rejected.push(`${file.name} (stockage du navigateur indisponible ou plein)`);
                }
            }
        }
        await this.loadCustomSounds();
        this.showView({ kind: 'custom' });
        if (rejected.length) alert(`Certains fichiers n'ont pas été ajoutés :\n${rejected.join('\n')}`);
    }

    async removeCustom(track) {
        if (!confirm(`Supprimer « ${track.title} » de vos sons ?`)) return;
        if (this.audio.previewTrackId === track.id) this.audio.stopPreview();
        try {
            await deleteSound(track.id);
        } catch (error) {
            console.error('Impossible de supprimer le son :', error);
            return;
        }
        this.audio.forgetCustom(track.id);
        this.update(Object.fromEntries(MOMENTS.map(moment => [moment, this.settings[moment].filter(t => t.id !== track.id)])));
        await this.loadCustomSounds();
    }
}
