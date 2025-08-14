import { PERSON_COUNT, COLORS } from './constants.js';
import { Person } from './Person.js';
import { Scene } from './scene.js';

class Game {
    constructor() {
        this.scene = new Scene();
        this.persons = [];
        this.running = false;
        this.spotlightPhase = false;
        this.chosenIdx = null;
        this.init();
    }

    init() {
        this.createPersons();
        this.scene.renderer.domElement.addEventListener('click', () => this.handleClick());
        this.animate();
    }

    createPersons() {
        for (let i = 0; i < PERSON_COUNT; i++) {
            const person = new Person(COLORS[i % COLORS.length]);
            this.scene.scene.add(person.group);
            this.persons.push(person);
        }
    }

    handleClick() {
        if (this.persons.length === 0) return;

        if (!this.running && !this.spotlightPhase) {
            this.startRace();
        } else if (this.spotlightPhase) {
            this.removePerson();
        }
    }

    startRace() {
        this.running = true;
        this.persons.forEach(person => person.startRunning());

        setTimeout(() => {
            this.running = false;
            this.persons.forEach(person => person.stopRunning());
            this.startSpotlightPhase();
        }, 2000);
    }

    startSpotlightPhase() {
        this.chosenIdx = Math.floor(Math.random() * this.persons.length);
        const chosenPerson = this.persons[this.chosenIdx];
        
        this.scene.spotlight.visible = true;
        this.scene.spotlight.halo.visible = true;
        this.spotlightPhase = true;
        chosenPerson.group.flyStart = performance.now();
    }

    removePerson() {
        if (this.chosenIdx !== null && this.persons[this.chosenIdx]) {
            const personToRemove = this.persons[this.chosenIdx];
            this.scene.scene.remove(personToRemove.group);
            this.persons.splice(this.chosenIdx, 1);
        }
        
        this.scene.spotlight.visible = false;
        this.scene.spotlight.halo.visible = false;
        this.chosenIdx = null;
        this.spotlightPhase = false;
    }

    update() {
        if (this.running) {
            this.persons.forEach(person => person.update());
        }

        if (this.spotlightPhase && this.chosenIdx !== null) {
            const chosenPerson = this.persons[this.chosenIdx];
            if (chosenPerson) {
                this.scene.updateSpotlight(chosenPerson.group.position);
                this.updateFlyingAnimation(chosenPerson);
            }
        }
    }

    updateFlyingAnimation(person) {
        if (!person.group.flyStart) return;
        
        let t = (performance.now() - person.group.flyStart) / 1200;
        if (t < 1) {
            person.group.position.y = PERSON_RADIUS + 2 * t;
        } else {
            person.group.position.y = PERSON_RADIUS + 2;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        this.scene.render();
    }
}

// Lancement du jeu
window.addEventListener('load', () => {
    new Game();
});
