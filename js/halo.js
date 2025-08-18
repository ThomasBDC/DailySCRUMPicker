export class Halo {
    constructor(options = {}) {
        const { radius = 1.6, color = 0xffffff, opacity = 0.7 } = options;
        this.radius = radius;
        this.baseOpacity = opacity;
        this.color = color;

        const texture = this.#createRadialGradientTexture();
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: this.color,
            transparent: true,
            opacity: this.baseOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.scale.set(this.radius, this.radius, this.radius);
        this.mesh.position.set(0, 0.01, 0);
        this.mesh.visible = false;

        this._startTime = performance.now();
    }

    setVisible(visible) {
        this.mesh.visible = visible;
    }

    update(worldPosition) {
        if (!this.mesh.visible) return;
        // Positionne le halo au sol sous la personne
        this.mesh.position.set(worldPosition.x, 0.01, worldPosition.z);

        // Légère pulsation (opacité + échelle)
        const t = (performance.now() - this._startTime) * 0.0035;
        const pulse = 0.06 * (1.0 + Math.sin(t));
        const scale = this.radius * (1.0 + 0.05 * Math.sin(t * 0.8));
        this.mesh.scale.set(scale, scale, scale);
        this.mesh.material.opacity = this.baseOpacity - pulse * 0.5;
    }

    #createRadialGradientTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        // Centre lumineux vers bords transparents
        grd.addColorStop(0.0, 'rgba(255,255,255,0.95)');
        grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        grd.addColorStop(0.7, 'rgba(255,255,255,0.12)');
        grd.addColorStop(1.0, 'rgba(255,255,255,0.0)');

        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }
} 