# DailySCRUMPicker

Application web statique (HTML/CSS/JS en modules ES, sans build) qui tire au sort l'ordre de passage du daily scrum. Point d'entrée : `index.html` → `js/main.js`.

## Règle obligatoire : paramètres et export/import

Toute la configuration est exportable dans un fichier JSON et réimportable (boutons « Exporter » / « Importer » du panneau de configuration). La liste des paramètres concernés est le tableau `SETTINGS` de `js/settings.js`.

**Dès que tu ajoutes (ou renommes, ou supprimes) un paramètre sauvegardé** — participants, mode de jeu, réglage de la roue, du pack opening, d'un nouveau mode, etc., c'est-à-dire toute valeur écrite dans le `localStorage` (ou ailleurs) pour être conservée entre deux visites — **tu dois mettre à jour `SETTINGS` dans `js/settings.js` dans la même modification** :

- `name` : nom lisible dans le fichier exporté ;
- `storageKey` : la clé `localStorage` utilisée par le code qui lit/écrit le réglage (garder les deux identiques) ;
- `read` / `write` si la valeur n'est pas une simple chaîne (ex. JSON) ;
- `parse` : valide la valeur importée, renvoie `null` pour revenir à la valeur par défaut, lève une erreur si elle est invalide.
- si la valeur n'est pas dans le `localStorage` (ex. les sons personnels, dans IndexedDB via `js/soundStore.js`) : remplacer `storageKey` par `load()` / `store(value)` asynchrones.

L'import écrit les valeurs dans le `localStorage` puis recharge la page : le réglage doit donc être relu au démarrage. Un paramètre absent d'un fichier importé (fichier plus ancien) n'est pas modifié. Si le format d'un paramètre change, garder la compatibilité avec les anciens fichiers dans `parse`.

Avant de terminer, vérifier qu'un export puis un import restaurent bien le nouveau paramètre.
