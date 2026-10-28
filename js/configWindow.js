// Le panneau de configuration peut être détaché dans une fenêtre à part : on partage l'écran
// de la scène pendant le daily et on pilote les participants à côté, sans que ça se voie.
// Ce sont les mêmes éléments qui changent de fenêtre (l'état de la partie reste donc partagé),
// mais ils ne sont plus dans `document` : le code qui les cherche après le démarrage passe
// par panelElement(), et ses alert() / confirm() par panelWindow() pour s'afficher là où l'on clique.

const panel = document.getElementById('setup-form');

const WINDOW_FEATURES = 'popup,width=460,height=860';
const CLOSED_POLL_INTERVAL = 500; // ms, au cas où la fenêtre se fermerait sans « pagehide »

export function panelElement(id) {
    return panel.ownerDocument.getElementById(id);
}

export function panelWindow() {
    return panel.ownerDocument.defaultView;
}

// Quand la fenêtre se ferme, le panneau revient (fermé) dans la page et l'événement
// « configWindowClosed » est émis sur window
export class ConfigWindow {
    // ids : éléments qui partent dans la fenêtre (le panneau et ses modales)
    constructor(ids) {
        this.ids = ids;
        this.window = null;
        this.moved = [];
        this.pollTimer = null;
        // La fenêtre détachée ne survit pas à la page principale
        window.addEventListener('pagehide', () => this.window?.close());
    }

    isOpen() {
        return this.window !== null;
    }

    focus() {
        this.window?.focus();
    }

    // Renvoie false si le navigateur a bloqué la fenêtre
    open() {
        if (this.window) {
            this.focus();
            return true;
        }
        const win = window.open('', '_blank', WINDOW_FEATURES);
        if (!win) return false;

        const doc = win.document;
        doc.documentElement.lang = 'fr';
        doc.title = 'Configuration · DailySCRUMPicker';
        const viewport = doc.createElement('meta');
        viewport.name = 'viewport';
        viewport.content = 'width=device-width, initial-scale=1';
        doc.head.appendChild(viewport);
        // Mêmes feuilles de style que la page, en adresse absolue (la fenêtre est vierge)
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
            const copy = doc.createElement('link');
            copy.rel = 'stylesheet';
            copy.href = link.href;
            doc.head.appendChild(copy);
        });
        doc.body.className = 'config-window';

        // Un repère à la place de chaque élément, pour le remettre au même endroit au retour
        this.moved = this.ids.map(id => document.getElementById(id)).filter(Boolean).map((node) => {
            const marker = document.createComment(node.id);
            node.before(marker);
            doc.body.appendChild(node);
            return { node, marker };
        });
        panel.classList.add('is-detached');

        this.window = win;
        win.addEventListener('pagehide', () => this.close());
        this.pollTimer = setInterval(() => {
            if (win.closed) this.close();
        }, CLOSED_POLL_INTERVAL);
        win.focus();
        return true;
    }

    // Ferme la fenêtre et remet le panneau dans la page principale
    close() {
        if (!this.window) return;
        const win = this.window;
        this.window = null;
        clearInterval(this.pollTimer);

        this.moved.forEach(({ node, marker }) => marker.replaceWith(node));
        this.moved = [];
        panel.classList.remove('is-detached');
        if (!win.closed) win.close();
        window.dispatchEvent(new CustomEvent('configWindowClosed'));
    }
}
