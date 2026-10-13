// Décor « Fall Guys » du mode Enlèvement OVNI : une plateforme d'hexagones qui flotte
// au-dessus d'une mer de slime rose, entourée d'obstacles gonflables, de cerceaux et de ballons.
// Tout est construit ici (primitives et textures dessinées), sans fichier à charger.

const lerp = (a, b, t) => a + (b - a) * t;

// Plateforme de course (sol y = 0) : rectangle arrondi qui déborde de la zone de course
const PLATFORM = { halfX: 23, zMin: -14.5, zMax: 17, radius: 6 };
const HEX_RADIUS = 1.25;
const SLIME_Y = -9;

const SKY_COLOR = 0x9fd8ff;
const HEMI_INTENSITY = 0.6;
const SUN_INTENSITY = 0.85;
// Quand l'OVNI allume son projecteur, il fait de l'ombre : tout s'assombrit un peu
const UFO_SHADE = 0.55;

const COLORS = {
    pink: '#ff5fae',
    lightPink: '#ffa6d4',
    yellow: '#ffd23f',
    orange: '#ff9a3c',
    cyan: '#3fd6ff',
    blue: '#4a7dff',
    purple: '#9b6bff',
    mint: '#5ef0b8',
    white: '#ffffff'
};

export class FallGuysDecor {
    constructor(maxAnisotropy = 1) {
        this.group = new THREE.Group();
        this.background = new THREE.Color(SKY_COLOR);
        this.fog = new THREE.Fog(SKY_COLOR, 45, 165);
        // Faisceau plus marqué qu'en pleine nuit, sinon il disparaît dans le jour
        this.beamOpacity = 0.16;
        this._anisotropy = maxAnisotropy;
        this._time = 0;
        this._shade = 1;
        // Éléments animés à chaque image
        this._spinners = [];
        this._floaters = [];
        this._clouds = [];
        this._flags = [];

        this.#buildLights();
        this.#buildFloor();
        this.#buildSlime();
        this.#buildBunting();
        this.#buildSweeper();
        this.#buildArch();
        this.#buildPillars();
        this.#buildBalls();
        this.#buildHoops();
        this.#buildClouds();
    }

    update(dt, beamOn) {
        const t = (this._time += dt);

        this._shade = lerp(this._shade, beamOn ? UFO_SHADE : 1, 1 - Math.exp(-3 * dt));
        this.hemiLight.intensity = HEMI_INTENSITY * this._shade;
        this.sunLight.intensity = SUN_INTENSITY * this._shade;
        this.fog.color.setHex(SKY_COLOR).multiplyScalar(lerp(0.45, 1, this._shade));
        this.background.copy(this.fog.color);

        this._slimeTexture.offset.set(t * 0.012, t * 0.02);
        this._spinners.forEach(({ object, speed, axis }) => { object.rotation[axis] = t * speed; });
        this._floaters.forEach(({ object, baseY, amplitude, phase, spin }) => {
            object.position.y = baseY + Math.sin(t * 0.9 + phase) * amplitude;
            object.rotation.y = t * spin;
        });
        this._clouds.forEach((cloud) => {
            cloud.position.x += cloud.userData.speed * dt;
            if (cloud.position.x > 90) cloud.position.x -= 180;
        });
        this._flags.forEach((flag, i) => {
            flag.rotation.x = Math.sin(t * 3.1 + i * 0.7) * 0.22 + 0.12;
        });
    }

    dispose() {
        const textures = new Set();
        this.group.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            const materials = [].concat(object.material || []);
            materials.forEach((material) => {
                if (material.map) textures.add(material.map);
                material.dispose();
            });
            if (object.isLight && object.dispose) object.dispose();
        });
        textures.forEach((texture) => texture.dispose());
    }

    // --- Lumières -------------------------------------------------------------------------

    #buildLights() {
        this.hemiLight = new THREE.HemisphereLight(0xdcefff, 0xffb8dc, HEMI_INTENSITY);
        this.group.add(this.hemiLight);

        // Soleil de face, un peu à gauche : les ombres des coureurs tombent derrière eux
        this.sunLight = new THREE.DirectionalLight(0xfff4e2, SUN_INTENSITY);
        this.sunLight.position.set(-14, 30, 14);
        this.sunLight.target.position.set(0, 0, -2);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        const shadowCamera = this.sunLight.shadow.camera;
        shadowCamera.left = -32;
        shadowCamera.right = 32;
        shadowCamera.top = 26;
        shadowCamera.bottom = -26;
        shadowCamera.near = 1;
        shadowCamera.far = 100;
        this.sunLight.shadow.bias = -0.0004;
        this.sunLight.shadow.normalBias = 0.03;
        this.group.add(this.sunLight, this.sunLight.target);
    }

    // --- Plateforme d'hexagones (comme dans Hex-A-Gone) ------------------------------------

    #buildFloor() {
        const R = HEX_RADIUS;
        const geometry = new THREE.CylinderGeometry(R * 0.94, R * 0.94, 1.4, 6);
        geometry.translate(0, -0.7, 0); // le dessus des tuiles est au niveau du sol
        // Flancs plus sombres que le dessus : les joints entre tuiles se lisent bien
        const normals = geometry.attributes.normal;
        const shades = [];
        for (let i = 0; i < normals.count; i++) {
            const shade = normals.getY(i) > 0.5 ? 1 : 0.62;
            shades.push(shade, shade, shade);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));

        // Tuiles en quinconce (pointe vers l'avant) : colonnes espacées de √3·R, rangées de 1,5·R
        const dx = Math.sqrt(3) * R;
        const dz = 1.5 * R;
        const cells = [];
        for (let row = Math.floor(PLATFORM.zMin / dz); row <= Math.ceil(PLATFORM.zMax / dz); row++) {
            // Décalé d'un quart de tuile : aucun joint n'est dans l'axe de la caméra (on verrait dedans)
            const offset = (Math.abs(row) % 2 ? dx / 2 : 0) + dx / 4;
            for (let col = -Math.ceil(PLATFORM.halfX / dx) - 1; col <= Math.ceil(PLATFORM.halfX / dx) + 1; col++) {
                const x = col * dx + offset;
                const z = row * dz;
                if (insidePlatform(x, z, 0)) cells.push({ x, z, edge: !insidePlatform(x, z, R * 1.6) });
            }
        }

        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });
        const tiles = new THREE.InstancedMesh(geometry, material, cells.length);
        tiles.receiveShadow = true;
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        const base = new THREE.Color(COLORS.purple);
        const light = new THREE.Color('#c7b2ff');
        const edge = new THREE.Color(COLORS.yellow);
        cells.forEach((cell, i) => {
            matrix.makeTranslation(cell.x, 0, cell.z);
            tiles.setMatrixAt(i, matrix);
            // Bord jaune, centre lilas avec de légères variations d'une tuile à l'autre
            if (cell.edge) color.copy(edge).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04);
            else color.copy(light).lerp(base, 0.4 + Math.random() * 0.2);
            tiles.setColorAt(i, color);
        });
        this.group.add(tiles);

        // Dessous sombre : on ne voit pas le slime à travers les joints
        const underside = new THREE.Mesh(
            new THREE.ShapeGeometry(platformShape(R * 0.5), 6),
            new THREE.MeshBasicMaterial({ color: '#4a2f8f' })
        );
        underside.rotation.x = -Math.PI / 2;
        underside.position.y = -1;
        this.group.add(underside);
    }

    // --- Mer de slime rose -----------------------------------------------------------------

    #buildSlime() {
        this._slimeTexture = canvasTexture(256, 256, (ctx, w, h) => {
            ctx.fillStyle = '#ff4fa8';
            ctx.fillRect(0, 0, w, h);
            // Reflets ronds, dessinés aussi de l'autre côté des bords pour que le motif se raccorde
            for (let i = 0; i < 26; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const r = 8 + Math.random() * 26;
                for (const ox of [-w, 0, w]) {
                    for (const oy of [-h, 0, h]) {
                        const gradient = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                        gradient.addColorStop(0, 'rgba(255, 196, 228, 0.85)');
                        gradient.addColorStop(1, 'rgba(255, 196, 228, 0)');
                        ctx.fillStyle = gradient;
                        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
                    }
                }
            }
        }, this._anisotropy);
        this._slimeTexture.repeat.set(36, 36);

        const slime = new THREE.Mesh(
            new THREE.PlaneGeometry(500, 500),
            new THREE.MeshStandardMaterial({
                map: this._slimeTexture,
                emissive: 0xff2f90,
                emissiveIntensity: 0.3,
                roughness: 0.3
            })
        );
        slime.rotation.x = -Math.PI / 2;
        slime.position.y = SLIME_Y;
        this.group.add(slime);
    }

    // --- Guirlande de fanions au fond de la plateforme -------------------------------------

    #buildBunting() {
        const z = PLATFORM.zMin + 0.9;
        const halfX = PLATFORM.halfX - PLATFORM.radius * 0.5;
        const top = 3.6;
        const sag = 1.1;

        const poleMaterial = new THREE.MeshStandardMaterial({ map: stripeTexture([COLORS.white, COLORS.pink], 6), roughness: 0.4 });
        [-halfX, halfX].forEach((x) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, top + 0.3, 16), poleMaterial);
            pole.position.set(x, (top + 0.3) / 2, z);
            pole.castShadow = true;
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12), new THREE.MeshStandardMaterial({ color: COLORS.yellow, roughness: 0.3 }));
            knob.position.set(x, top + 0.4, z);
            this.group.add(pole, knob);
        });

        // Corde en chaînette entre les deux poteaux
        const ropeY = (x) => top - sag * (1 - (x / halfX) ** 2);
        const points = [];
        for (let i = 0; i <= 24; i++) {
            const x = lerp(-halfX, halfX, i / 24);
            points.push(new THREE.Vector3(x, ropeY(x), z));
        }
        const rope = new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.035, 6),
            new THREE.MeshStandardMaterial({ color: COLORS.white, roughness: 0.6 })
        );
        this.group.add(rope);

        // Fanions triangulaires, accrochés par le haut pour flotter au vent
        const flagGeometry = new THREE.BufferGeometry();
        flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0, 0, 0.42, 0, 0, 0, -0.95, 0], 3));
        flagGeometry.computeVertexNormals();
        const flagColors = [COLORS.pink, COLORS.yellow, COLORS.cyan, COLORS.orange, COLORS.purple, COLORS.mint];
        const flagMaterials = flagColors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }));
        const count = 22;
        for (let i = 0; i < count; i++) {
            const x = lerp(-halfX, halfX, (i + 0.5) / count);
            const flag = new THREE.Mesh(flagGeometry, flagMaterials[i % flagMaterials.length]);
            flag.position.set(x, ropeY(x), z);
            this.group.add(flag);
            this._flags.push(flag);
        }
    }

    // --- Balayeur : barre géante qui tourne sur une plateforme ronde -----------------------

    #buildSweeper() {
        const base = new THREE.Group();
        base.position.set(14, -3.5, -31);

        const deck = new THREE.Mesh(
            new THREE.CylinderGeometry(6.5, 5.5, 2, 48),
            [
                new THREE.MeshStandardMaterial({ map: stripeTexture([COLORS.yellow, COLORS.white], 24), roughness: 0.4 }),
                new THREE.MeshStandardMaterial({ color: COLORS.cyan, roughness: 0.35 }),
                new THREE.MeshStandardMaterial({ color: COLORS.blue, roughness: 0.5 })
            ]
        );
        base.add(deck);

        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.1, 3.2, 24),
            new THREE.MeshStandardMaterial({ color: COLORS.pink, roughness: 0.35 })
        );
        pillar.position.y = 2.6;
        base.add(pillar);

        const rotor = new THREE.Group();
        rotor.position.y = 3.4;
        const bar = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.55, 11, 8, 20),
            new THREE.MeshStandardMaterial({ color: COLORS.orange, roughness: 0.35 })
        );
        bar.rotation.z = Math.PI / 2;
        rotor.add(bar);
        const cushionMaterial = new THREE.MeshStandardMaterial({ color: COLORS.yellow, roughness: 0.3 });
        [-1, 1].forEach((side) => {
            const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), cushionMaterial);
            cushion.position.x = side * 6;
            rotor.add(cushion);
        });
        const hub = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16), new THREE.MeshStandardMaterial({ color: COLORS.purple, roughness: 0.3 }));
        rotor.add(hub);
        base.add(rotor);

        this.group.add(base);
        this._spinners.push({ object: rotor, speed: 1.1, axis: 'y' });
        this._floaters.push({ object: base, baseY: base.position.y, amplitude: 0.35, phase: 0, spin: 0 });
    }

    // --- Arche gonflable de la ligne d'arrivée ---------------------------------------------

    #buildArch() {
        const arch = new THREE.Mesh(
            new THREE.TorusGeometry(11, 1.7, 20, 72, Math.PI),
            new THREE.MeshStandardMaterial({
                map: stripeTexture([COLORS.pink, COLORS.yellow, COLORS.cyan, COLORS.yellow], 16),
                roughness: 0.35
            })
        );
        arch.position.set(-14, SLIME_Y + 1, -44);
        arch.rotation.y = 0.25;
        this.group.add(arch);

        // Bandeau à damier suspendu sous le sommet
        const banner = new THREE.Mesh(
            new THREE.PlaneGeometry(9, 1.8),
            new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6, side: THREE.DoubleSide })
        );
        banner.position.set(0, 8.6, 0);
        arch.add(banner);
    }

    // --- Colonnes rayées comme des sucres d'orge, qui sortent du slime ---------------------

    #buildPillars() {
        const pillars = [
            { x: -31, z: -33, height: 16, colors: [COLORS.white, COLORS.pink] },
            { x: 33, z: -28, height: 13, colors: [COLORS.white, COLORS.cyan] },
            { x: -3, z: -64, height: 21, colors: [COLORS.white, COLORS.purple] },
            { x: 34, z: -56, height: 18, colors: [COLORS.white, COLORS.orange] },
            { x: -38, z: -55, height: 23, colors: [COLORS.white, COLORS.blue] }
        ];
        pillars.forEach(({ x, z, height, colors }) => {
            const texture = diagonalStripeTexture(colors);
            texture.repeat.set(2, height / 6);
            const column = new THREE.Mesh(
                new THREE.CylinderGeometry(1.7, 1.9, height, 32, 1, true),
                new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 })
            );
            column.position.set(x, SLIME_Y + height / 2, z);
            this.group.add(column);

            // Plateau rond et gros bouton sur le dessus
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(2.6, 2.3, 0.9, 32),
                new THREE.MeshStandardMaterial({ color: COLORS.yellow, roughness: 0.35 })
            );
            cap.position.set(x, SLIME_Y + height + 0.45, z);
            const knob = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 24, 16),
                new THREE.MeshStandardMaterial({ color: colors[1], roughness: 0.3 })
            );
            knob.position.set(x, SLIME_Y + height + 1.4, z);
            this.group.add(cap, knob);
        });
    }

    // --- Gros ballons de plage qui flottent ------------------------------------------------

    #buildBalls() {
        const balls = [
            { x: -22, y: -1.5, z: -25, r: 2.2, colors: [COLORS.pink, COLORS.white, COLORS.yellow, COLORS.white] },
            { x: 4, y: 0.5, z: -48, r: 2.8, colors: [COLORS.cyan, COLORS.white, COLORS.orange, COLORS.white] },
            { x: 27, y: 1, z: -38, r: 2, colors: [COLORS.purple, COLORS.white, COLORS.mint, COLORS.white] },
            { x: -31, y: 3, z: -66, r: 3, colors: [COLORS.yellow, COLORS.white, COLORS.pink, COLORS.white] }
        ];
        balls.forEach(({ x, y, z, r, colors }, i) => {
            const ball = new THREE.Mesh(
                new THREE.SphereGeometry(r, 32, 20),
                new THREE.MeshStandardMaterial({ map: stripeTexture(colors, 8), roughness: 0.3 })
            );
            ball.position.set(x, y, z);
            ball.rotation.z = 0.3;
            this.group.add(ball);
            this._floaters.push({ object: ball, baseY: y, amplitude: 0.6, phase: i * 1.9, spin: 0.25 + i * 0.05 });
        });
    }

    // --- Cerceaux dorés qui tournent sur eux-mêmes -----------------------------------------

    #buildHoops() {
        const material = new THREE.MeshStandardMaterial({ color: '#ffc928', emissive: '#ff9d00', emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.3 });
        [
            { x: -5, y: 2.5, z: -30, r: 2.4 },
            { x: 22, y: 6, z: -60, r: 3 }
        ].forEach(({ x, y, z, r }, i) => {
            const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.32, 14, 48), material);
            hoop.position.set(x, y, z);
            this.group.add(hoop);
            this._floaters.push({ object: hoop, baseY: y, amplitude: 0.4, phase: 1 + i * 2.3, spin: 0.9 });
        });
    }

    // --- Nuages ronds qui dérivent au loin -------------------------------------------------

    #buildClouds() {
        const material = new THREE.MeshStandardMaterial({ color: COLORS.white, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1 });
        const puff = new THREE.SphereGeometry(1, 20, 14);
        for (let i = 0; i < 9; i++) {
            const cloud = new THREE.Group();
            const puffs = 4 + Math.floor(Math.random() * 3);
            for (let j = 0; j < puffs; j++) {
                const mesh = new THREE.Mesh(puff, material);
                const size = 2.2 + Math.random() * 1.8;
                mesh.scale.set(size, size * 0.75, size);
                mesh.position.set((j - puffs / 2) * 2.4 + Math.random(), Math.random() * 1.2, Math.random() * 1.5);
                cloud.add(mesh);
            }
            cloud.position.set(-90 + i * 20 + Math.random() * 8, -3 + Math.random() * 10, -75 - Math.random() * 35);
            cloud.userData.speed = 0.8 + Math.random() * 0.9;
            this.group.add(cloud);
            this._clouds.push(cloud);
        }
    }
}

// Le point (x, z) est-il sur la plateforme, à au moins `margin` du bord ?
function insidePlatform(x, z, margin) {
    const halfX = PLATFORM.halfX - margin;
    const zMin = PLATFORM.zMin + margin;
    const zMax = PLATFORM.zMax - margin;
    const radius = Math.max(0, PLATFORM.radius - margin);
    if (Math.abs(x) > halfX || z < zMin || z > zMax) return false;
    const cornerX = Math.max(0, Math.abs(x) - (halfX - radius));
    const cornerZ = Math.max(0, zMin + radius - z, z - (zMax - radius));
    return Math.hypot(cornerX, cornerZ) <= radius;
}

// Contour de la plateforme rétréci de `margin`, dans le plan (x, -z) d'une ShapeGeometry
function platformShape(margin) {
    const halfX = PLATFORM.halfX - margin;
    const top = -(PLATFORM.zMin + margin);
    const bottom = -(PLATFORM.zMax - margin);
    const r = PLATFORM.radius - margin;
    const shape = new THREE.Shape();
    shape.moveTo(-halfX + r, bottom);
    shape.lineTo(halfX - r, bottom);
    shape.absarc(halfX - r, bottom + r, r, -Math.PI / 2, 0);
    shape.lineTo(halfX, top - r);
    shape.absarc(halfX - r, top - r, r, 0, Math.PI / 2);
    shape.lineTo(-halfX + r, top);
    shape.absarc(-halfX + r, top - r, r, Math.PI / 2, Math.PI);
    shape.lineTo(-halfX, bottom + r);
    shape.absarc(-halfX + r, bottom + r, r, Math.PI, Math.PI * 1.5);
    return shape;
}

function canvasTexture(width, height, draw, anisotropy = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return texture;
}

// Bandes verticales (le long de u) : tour d'un cylindre, d'un ballon, d'une arche…
function stripeTexture(colors, count) {
    return canvasTexture(256, 4, (ctx, w, h) => {
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillRect(Math.floor((i * w) / count), 0, Math.ceil(w / count), h);
        }
    });
}

// Bandes en biais qui se raccordent d'un bord à l'autre (spirale autour d'une colonne)
function diagonalStripeTexture(colors) {
    return canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = colors[0];
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = colors[1];
        const band = w / 4;
        for (let k = -2; k < 4; k++) {
            ctx.beginPath();
            ctx.moveTo(k * 2 * band, 0);
            ctx.lineTo(k * 2 * band + band, 0);
            ctx.lineTo(k * 2 * band + band + h, h);
            ctx.lineTo(k * 2 * band + h, h);
            ctx.closePath();
            ctx.fill();
        }
    });
}

// Damier noir et blanc du bandeau d'arrivée
function checkerTexture() {
    return canvasTexture(200, 40, (ctx, w, h) => {
        const size = h / 2;
        for (let x = 0; x < w / size; x++) {
            for (let y = 0; y < 2; y++) {
                ctx.fillStyle = (x + y) % 2 ? '#1d1d2b' : '#ffffff';
                ctx.fillRect(x * size, y * size, size, size);
            }
        }
    });
}
