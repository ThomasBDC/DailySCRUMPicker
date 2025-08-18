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
        this.spotlightCeilingY = 14;

        this.spotlight = new THREE.SpotLight(0xffffff, 2.2, 60, Math.PI / 10, 0.45, 2);
        this.spotlight.position.set(0, this.spotlightCeilingY, 0);
        this.spotlight.visible = false;
        this.spotlight.castShadow = true;
        this.spotlight.shadow.mapSize.width = 1024;
        this.spotlight.shadow.mapSize.height = 1024;
        this.spotlight.shadow.radius = 3;
        this.scene.add(this.spotlight);

        this.spotlightTarget = new THREE.Object3D();
        this.scene.add(this.spotlightTarget);
        this.spotlight.target = this.spotlightTarget;

        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const beamGeometry = new THREE.CylinderGeometry(0.04, 1, 1, 32, 1, true);
        this.spotlightBeam = new THREE.Mesh(beamGeometry, beamMaterial);
        this.spotlightBeam.visible = false;
        this.spotlightBeam.castShadow = false;
        this.spotlightBeam.receiveShadow = false;
        this.scene.add(this.spotlightBeam);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
            this.spotlightCeilingY,
            position.z
        );

        const lightPos = this.spotlight.position;
        const targetPos = position.clone();
        const distance = lightPos.distanceTo(targetPos);
        const bottomRadius = Math.max(0.4, Math.tan(this.spotlight.angle) * distance);

        this.spotlightBeam.visible = this.spotlight.visible;
        this.spotlightBeam.position.copy(lightPos).add(targetPos).multiplyScalar(0.5);
        this.spotlightBeam.scale.set(bottomRadius, distance, bottomRadius);

        const direction = new THREE.Vector3().subVectors(targetPos, lightPos).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        this.spotlightBeam.quaternion.copy(quaternion);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
