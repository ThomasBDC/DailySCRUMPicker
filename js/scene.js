export class Scene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222233);
        this.setupCamera();
        this.setupLights();
        this.setupSpotlight();
        this.setupRenderer();
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 10, 18);
        this.camera.lookAt(0, 0, 0);
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);
    }

    setupSpotlight() {
        this.spotlight = new THREE.SpotLight(0xffffff, 3.5, 40, Math.PI / 5, 0.8, 1);
        this.spotlight.position.set(0, 10, 0);
        this.spotlight.visible = false;
        this.spotlight.castShadow = true;
        this.spotlight.shadow.mapSize.width = 1024;
        this.spotlight.shadow.mapSize.height = 1024;
        this.scene.add(this.spotlight);

        this.spotlightTarget = new THREE.Object3D();
        this.scene.add(this.spotlightTarget);
        this.spotlight.target = this.spotlightTarget;

        // Halo lumineux
        const haloTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/lensflare/lensflare0.png');
        const haloMaterial = new THREE.SpriteMaterial({ 
            map: haloTexture, 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.5 
        });
        this.spotlight.halo = new THREE.Sprite(haloMaterial);
        this.spotlight.halo.scale.set(3, 3, 1);
        this.spotlight.halo.visible = false;
        this.scene.add(this.spotlight.halo);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateSpotlight(position) {
        this.spotlightTarget.position.copy(position);
        this.spotlight.position.set(
            position.x,
            position.y + 7,
            position.z
        );
        this.spotlight.intensity = 4.5 + Math.sin(performance.now() * 0.008) * 1.2;

        this.spotlight.halo.position.set(
            position.x,
            position.y + 7.2,
            position.z
        );
        this.spotlight.halo.material.opacity = 0.5 + Math.abs(Math.sin(performance.now() * 0.008)) * 0.4;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
