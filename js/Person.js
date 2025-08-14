import { PERSON_RADIUS, SCENE_SIZE } from './constants.js';

export class Person {
    constructor(color) {
        this.group = new THREE.Group();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.createBody(color);
        this.setRandomPosition();
    }

    createBody(color) {
        // Corps plus rond (style Fall Guys)
        const bodyGeometry = new THREE.SphereGeometry(PERSON_RADIUS * 0.8, 32, 32);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.scale.set(1, 1.2, 0.8); // Légèrement ovale
        this.group.add(body);

        // Jambes plus courtes et trapues
        const legGeometry = new THREE.CapsuleGeometry(PERSON_RADIUS * 0.2, PERSON_RADIUS * 0.4, 8, 8);
        const legMaterial = new THREE.MeshStandardMaterial({ color: color.toString(16) });
        
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-PERSON_RADIUS * 0.3, -PERSON_RADIUS * 0.8, 0);
        this.group.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(PERSON_RADIUS * 0.3, -PERSON_RADIUS * 0.8, 0);
        this.group.add(rightLeg);

        // Yeux caractéristiques de Fall Guys
        const eyeGeometry = new THREE.SphereGeometry(PERSON_RADIUS * 0.15, 16, 16);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-PERSON_RADIUS * 0.25, PERSON_RADIUS * 0.2, PERSON_RADIUS * 0.6);
        this.group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(PERSON_RADIUS * 0.25, PERSON_RADIUS * 0.2, PERSON_RADIUS * 0.6);
        this.group.add(rightEye);
    }

    setRandomPosition() {
        this.group.position.set(
            (Math.random() - 0.5) * SCENE_SIZE * 0.5,
            PERSON_RADIUS,
            (Math.random() - 0.5) * SCENE_SIZE * 0.5
        );
    }

    update() {
        // Déplacement
        this.group.position.add(this.velocity);
        
        // Collision avec les bords
        if (Math.abs(this.group.position.x) > SCENE_SIZE / 2 - PERSON_RADIUS) {
            this.velocity.x *= -1;
            this.group.position.x = Math.sign(this.group.position.x) * (SCENE_SIZE / 2 - PERSON_RADIUS);
        }
        if (Math.abs(this.group.position.z) > SCENE_SIZE / 2 - PERSON_RADIUS) {
            this.velocity.z *= -1;
            this.group.position.z = Math.sign(this.group.position.z) * (SCENE_SIZE / 2 - PERSON_RADIUS);
        }
    }

    startRunning() {
        const angle = Math.random() * Math.PI * 2;
        this.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.15 + Math.random() * 0.15);
    }

    stopRunning() {
        this.velocity.set(0, 0, 0);
    }
}
