import { AUDIO_FILES } from '../audio/sounds.js';

export class AudioManager {
    constructor() {
        // Liste des sons disponibles
        this.selectionSounds = AUDIO_FILES.selection;
        this.spotlightSounds = AUDIO_FILES.spotlight;
        
        // Cache pour les sons préchargés
        this.preloadedSounds = new Map();
        
        // Créer les éléments audio
        this.selectionMusic = new Audio();
        this.spotlightSound = new Audio();
        
        // Configurer la musique de sélection
        this.selectionMusic.volume = 0;
        this.selectionMusic.loop = true;
        
        // Configurer le son du spotlight
        this.spotlightSound.volume = 1;
        
        // Précharger tous les sons
        this.preloadAllSounds();
    }
    
    preloadAllSounds() {
        // Précharger tous les sons de sélection
        this.selectionSounds.forEach(sound => {
            const audio = new Audio();
            audio.src = `audio/${sound}`;
            // Forcer le préchargement
            audio.load();
            this.preloadedSounds.set(sound, audio);
        });
        
        // Précharger tous les sons de spotlight
        this.spotlightSounds.forEach(sound => {
            const audio = new Audio();
            audio.src = `audio/${sound}`;
            // Forcer le préchargement
            audio.load();
            this.preloadedSounds.set(sound, audio);
        });
    }
    
    getRandomSound(array) {
        if (array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    playSelectionMusic() {
        const randomSound = this.getRandomSound(this.selectionSounds);
        if (randomSound) {
            // Utiliser le son préchargé
            const preloadedAudio = this.preloadedSounds.get(randomSound);
            if (preloadedAudio) {
                // Copier les paramètres au son actuel
                this.selectionMusic.src = preloadedAudio.src;
                this.selectionMusic.currentTime = 0;
                // S'assurer que le volume est à 0 avant de commencer le fade
                this.selectionMusic.volume = 0;
                this.selectionMusic.play().catch(error => {
                    console.warn('Erreur lors de la lecture du son de sélection:', error);
                });
                // Fade in plus long (0.8 secondes) pour un début plus doux
                this.fadeIn(this.selectionMusic, 0.8);
            }
        }
    }

    stopSelectionMusic() {
        this.fadeOut(this.selectionMusic, 0.5).then(() => {
            this.selectionMusic.pause();
        });
    }

    playSpotlightSound() {
        const randomSound = this.getRandomSound(this.spotlightSounds);
        if (randomSound) {
            // Utiliser le son préchargé
            const preloadedAudio = this.preloadedSounds.get(randomSound);
            if (preloadedAudio) {
                // Copier les paramètres au son actuel
                this.spotlightSound.src = preloadedAudio.src;
                this.spotlightSound.currentTime = 0;
                this.spotlightSound.play().catch(error => {
                    console.warn('Erreur lors de la lecture du son de spotlight:', error);
                });
            }
        }
    }

    fadeIn(audio, duration) {
        audio.volume = 0;
        let startTime = performance.now();
        
        const fade = () => {
            let currentTime = performance.now();
            let elapsed = (currentTime - startTime) / 1000; // en secondes
            let percentage = Math.min(elapsed / duration, 1);
            
            // Utiliser une courbe easeInQuad pour un début plus doux
            const eased = percentage * percentage;
            audio.volume = eased;
            
            if (percentage < 1) {
                requestAnimationFrame(fade);
            }
        };
        
        requestAnimationFrame(fade);
    }

    fadeOut(audio, duration) {
        return new Promise(resolve => {
            let startVolume = audio.volume;
            let startTime = performance.now();
            
            const fade = () => {
                let currentTime = performance.now();
                let elapsed = (currentTime - startTime) / 1000; // en secondes
                let percentage = Math.min(elapsed / duration, 1);
                
                audio.volume = startVolume * (1 - percentage);
                
                if (percentage < 1) {
                    requestAnimationFrame(fade);
                } else {
                    resolve();
                }
            };
            
            requestAnimationFrame(fade);
        });
    }
}