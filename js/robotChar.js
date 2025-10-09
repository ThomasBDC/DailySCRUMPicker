import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Classe Robot pour créer et contrôler un robot 3D
 */
export class Robot {
   constructor(id, template, position, scene) {
	   this.id = id;
	   this.model = template.scene.clone();
	   this.animations = template.animations;
	   this.mixer = new THREE.AnimationMixer(this.model);
	   this.actions = {};
	   this.activeAction = null;
	   this.previousAction = null;
	   this.face = null;
	   this.gui = null;
	   this.api = { state: 'Walking' };
	   this.scene = scene;

	   // Mouvement
	   this.direction = new THREE.Vector3(0, 0, 1); // Avance tout droit
	   this.speed = 2 + Math.random() * 2; // Vitesse aléatoire
	   this.nextTurnTime = 0; // Pour changer de direction

	   // Position the robot
	   this.model.position.copy(position);
	   this.scene.add(this.model);

	   // Setup animations
	   this.setupAnimations();
	   //this.setupGUI();
   }

	setupAnimations() {
		const states = ['Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing'];
		const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp'];

		for (let i = 0; i < this.animations.length; i++) {
			const clip = this.animations[i];
			const action = this.mixer.clipAction(clip);
			this.actions[clip.name] = action;

			if (emotes.indexOf(clip.name) >= 0 || states.indexOf(clip.name) >= 4) {
				action.clampWhenFinished = true;
				action.loop = THREE.LoopOnce;
			}
		}

		// Start with walking animation
		this.activeAction = this.actions['Walking'];
		this.activeAction.play();
	}

	setupGUI() {
		this.gui = new GUI();
		this.gui.title(`Robot ${this.id}`);

		const states = ['Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing'];
		const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp'];

		// States
		const statesFolder = this.gui.addFolder('States');
		const clipCtrl = statesFolder.add(this.api, 'state').options(states);
		clipCtrl.onChange(() => {
			this.fadeToAction(this.api.state, 0.5);
		});
		statesFolder.open();

		// Emotes
		const emoteFolder = this.gui.addFolder('Emotes');
		
		const createEmoteCallback = (name) => {
			this.api[name] = () => {
				this.fadeToAction(name, 0.2);
				this.mixer.addEventListener('finished', this.restoreState.bind(this));
			};
			emoteFolder.add(this.api, name);
		};

		for (let i = 0; i < emotes.length; i++) {
			createEmoteCallback(emotes[i]);
		}
		emoteFolder.open();

		// Expressions
		this.face = this.model.getObjectByName('Head_4');
		if (this.face && this.face.morphTargetDictionary) {
			const expressions = Object.keys(this.face.morphTargetDictionary);
			const expressionFolder = this.gui.addFolder('Expressions');

			for (let i = 0; i < expressions.length; i++) {
				expressionFolder.add(this.face.morphTargetInfluences, i, 0, 1, 0.01).name(expressions[i]);
			}
			expressionFolder.open();
		}

		// Position controls
		const positionFolder = this.gui.addFolder('Position');
		positionFolder.add(this.model.position, 'x', -10, 10, 0.1).name('X');
		positionFolder.add(this.model.position, 'y', 0, 5, 0.1).name('Y');
		positionFolder.add(this.model.position, 'z', -10, 10, 0.1).name('Z');
		positionFolder.open();

		// Remove button
		this.gui.add({ remove: () => this.onRemove && this.onRemove(this.id) }, 'remove').name('Remove Robot');
	}

	restoreState() {
		this.mixer.removeEventListener('finished', this.restoreState.bind(this));
		this.fadeToAction(this.api.state, 0.2);
	}

	fadeToAction(name, duration) {
		this.previousAction = this.activeAction;
		this.activeAction = this.actions[name];

		if (this.previousAction !== this.activeAction) {
			this.previousAction.fadeOut(duration);
		}

		this.activeAction
			.reset()
			.setEffectiveTimeScale(1)
			.setEffectiveWeight(1)
			.fadeIn(duration)
			.play();
	}

	   update(dt) {
		   if (this.mixer) {
			   this.mixer.update(dt);
		   }

		   // Mouvement si Running
		   if (this.api.state === 'Running') {
			   // Changement de direction aléatoire toutes les 0.5 à 1.5 secondes
			   this.nextTurnTime -= dt;
			   if (this.nextTurnTime <= 0) {
				   // Tourne d'un angle aléatoire entre -60° et +60°
				   const angle = (Math.random() - 0.5) * Math.PI / 1.5;
				   this.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
				   this.nextTurnTime = 0.5 + Math.random();
			   }
			   // Avance dans la direction
			   const move = this.direction.clone().multiplyScalar(this.speed * dt);
			   this.model.position.add(move);
			   // Oriente le robot dans la direction de déplacement
			   const targetRotY = Math.atan2(this.direction.x, this.direction.z);
			   this.model.rotation.y = targetRotY;
		   }
	   }

	dispose() {
		if (this.gui) {
			this.gui.destroy();
		}
		if (this.model) {
			this.scene.remove(this.model);
		}
	}

	// Méthodes publiques pour contrôler le robot
	setState(state) {
		if (this.actions[state]) {
			this.api.state = state;
			this.fadeToAction(state, 0.5);
		}
	}

	playEmote(emote) {
		if (this.actions[emote]) {
			this.fadeToAction(emote, 0.2);
			this.mixer.addEventListener('finished', this.restoreState.bind(this));
		}
	}

	setPosition(x, y, z) {
		this.model.position.set(x, y, z);
	}

	getPosition() {
		return this.model.position.clone();
	}

	setExpression(expressionName, value) {
		if (this.face && this.face.morphTargetDictionary && this.face.morphTargetDictionary[expressionName] !== undefined) {
			const index = this.face.morphTargetDictionary[expressionName];
			this.face.morphTargetInfluences[index] = value;
		}
	}

	hideGUI() {
		if (this.gui) {
			this.gui.hide();
		}
	}

	showGUI() {
		if (this.gui) {
			this.gui.show();
		}
	}
}

/**
 * Gestionnaire de robots pour gérer plusieurs robots
 */
export class RobotManager {
	constructor(scene) {
		this.scene = scene;
		this.robots = [];
		this.robotTemplate = null;
		this.isLoaded = false;
		this.loadCallbacks = [];
	}

	/**
	 * Charge le modèle robot depuis l'URL spécifiée
	 * @param {string} url - URL du modèle GLTF
	 * @returns {Promise} Promise qui se résout quand le modèle est chargé
	 */
	loadRobotTemplate(url = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb') {
		return new Promise((resolve, reject) => {
			if (this.isLoaded) {
				resolve(this.robotTemplate);
				return;
			}

			const loader = new GLTFLoader();
			loader.load(url, 
				(gltf) => {
					this.robotTemplate = gltf;
					this.isLoaded = true;
					
					// Notifier tous les callbacks en attente
					this.loadCallbacks.forEach(callback => callback(this.robotTemplate));
					this.loadCallbacks = [];
					
					resolve(this.robotTemplate);
				},
				undefined,
				(error) => {
					console.error('Erreur lors du chargement du modèle robot:', error);
					reject(error);
				}
			);
		});
	}

	/**
	 * Ajoute un robot à la scène
	 * @param {THREE.Vector3} position - Position du robot
	 * @param {Function} onRemove - Callback appelé quand le robot est supprimé
	 * @returns {Robot|null} Le robot créé ou null si le template n'est pas chargé
	 */
	addRobot(position = null, onRemove = null) {
		if (!this.robotTemplate) {
			console.warn('Template robot non chargé. Utilisez loadRobotTemplate() d\'abord.');
			return null;
		}

		const id = this.robots.length + 1;
		const robotPosition = position || new THREE.Vector3(
			(Math.random() - 0.5) * 10,
			0,
			(Math.random() - 0.5) * 10
		);

		const robot = new Robot(id, this.robotTemplate, robotPosition, this.scene);
		robot.onRemove = onRemove || this.removeRobotById.bind(this);
		
		this.robots.push(robot);
		return robot;
	}

	/**
	 * Supprime le dernier robot ajouté
	 * @returns {boolean} True si un robot a été supprimé
	 */
	removeRobot() {
		if (this.robots.length > 0) {
			const robot = this.robots.pop();
			robot.dispose();
			return true;
		}
		return false;
	}

	/**
	 * Supprime un robot par son ID
	 * @param {number} id - ID du robot à supprimer
	 * @returns {boolean} True si le robot a été trouvé et supprimé
	 */
	removeRobotById(id) {
		const index = this.robots.findIndex(robot => robot.id === id);
		if (index !== -1) {
			const robot = this.robots.splice(index, 1)[0];
			robot.dispose();
			return true;
		}
		return false;
	}

	/**
	 * Supprime tous les robots
	 */
	clearAllRobots() {
		this.robots.forEach(robot => robot.dispose());
		this.robots = [];
	}

	/**
	 * Met à jour tous les robots
	 * @param {number} dt - Delta time
	 */
	update(dt) {
		this.robots.forEach(robot => robot.update(dt));
	}

	/**
	 * Obtient le nombre de robots actifs
	 * @returns {number} Nombre de robots
	 */
	getRobotCount() {
		return this.robots.length;
	}

	/**
	 * Obtient un robot par son ID
	 * @param {number} id - ID du robot
	 * @returns {Robot|null} Le robot ou null s'il n'existe pas
	 */
	getRobotById(id) {
		return this.robots.find(robot => robot.id === id) || null;
	}

	/**
	 * Obtient tous les robots
	 * @returns {Robot[]} Tableau de tous les robots
	 */
	getAllRobots() {
		return [...this.robots];
	}

	/**
	 * Attend que le template soit chargé
	 * @param {Function} callback - Callback appelé quand le template est prêt
	 */
	onTemplateLoaded(callback) {
		if (this.isLoaded) {
			callback(this.robotTemplate);
		} else {
			this.loadCallbacks.push(callback);
		}
	}
}

/**
 * Fonction utilitaire pour créer rapidement un gestionnaire de robots
 * @param {THREE.Scene} scene - Scène Three.js
 * @param {string} modelUrl - URL du modèle robot (optionnel)
 * @returns {RobotManager} Gestionnaire de robots
 */
export function createRobotManager(scene, modelUrl = null) {
	const manager = new RobotManager(scene);
	if (modelUrl) {
		manager.loadRobotTemplate(modelUrl);
	}
	return manager;
}

/**
 * Fonction utilitaire pour créer un robot avec position aléatoire
 * @param {RobotManager} manager - Gestionnaire de robots
 * @param {number} minX - Position X minimale
 * @param {number} maxX - Position X maximale
 * @param {number} minZ - Position Z minimale
 * @param {number} maxZ - Position Z maximale
 * @returns {Robot|null} Le robot créé
 */
export function createRandomRobot(manager, minX = -5, maxX = 5, minZ = -5, maxZ = 5) {
	const position = new THREE.Vector3(
		Math.random() * (maxX - minX) + minX,
		0,
		Math.random() * (maxZ - minZ) + minZ
	);
	return manager.addRobot(position);
}
