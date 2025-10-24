export class WheelPicker {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);
        this.participants = [];
        this.selectedParticipant = null;
        this.angle = 0;
        this.spinning = false;
        this.finalAngle = 0;
        this.spinSpeed = 0;
        
        // Configuration de la roue
        this.centerX = 0;
        this.centerY = 0;
        this.radius = 0;
        this.colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const minDim = Math.min(window.innerWidth, window.innerHeight) * 0.8;
        this.canvas.width = minDim;
        this.canvas.height = minDim;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = (Math.min(this.canvas.width, this.canvas.height) / 2) * 0.8;
        this.draw();
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', () => {
            if (!this.spinning && this.participants.length > 0) {
                this.spin();
            }
        });
    }

    setParticipants(participants) {
        this.participants = participants.filter(p => p.display);
        // Précharger les images
        this.participantImages = new Map();
        this.participants.forEach(participant => {
            if (participant.faceUrl) {
                const img = new Image();
                img.src = participant.faceUrl;
                img.onload = () => {
                    this.participantImages.set(participant.faceUrl, img);
                    this.draw();
                };
            }
        });
        this.draw();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.participants.length === 0) {
            this.drawEmptyWheel();
            return;
        }

        const sliceAngle = (2 * Math.PI) / this.participants.length;

        // Dessiner les segments de la roue
        this.participants.forEach((participant, index) => {
            const startAngle = this.angle + index * sliceAngle;
            const endAngle = startAngle + sliceAngle;

            // Dessiner le segment
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX, this.centerY);
            this.ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = this.colors[index % this.colors.length];
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Si le participant a une photo, la dessiner
            if (participant.faceUrl && this.participantImages.has(participant.faceUrl)) {
                const img = this.participantImages.get(participant.faceUrl);
                
                // Calculer la taille maximale possible pour l'image dans le segment
                const segmentWidth = Math.sin(sliceAngle / 2) * this.radius * 2;
                const maxRadius = this.radius * 0.4; // Zone utilisable dans le segment
                const maxImgSize = Math.min(segmentWidth * 0.9, maxRadius * 2); // Prendre le plus petit entre la largeur du segment et la hauteur disponible
                
                // Ne pas dépasser la résolution native de l'image
                const imgSize = Math.min(maxImgSize, Math.max(img.width, img.height));
                
                // Positionner l'image au milieu du segment
                const imgRadius = this.radius * 0.55; // Position radiale à 55% du rayon
                const imgX = this.centerX + Math.cos(startAngle + sliceAngle / 2) * imgRadius - imgSize / 2;
                const imgY = this.centerY + Math.sin(startAngle + sliceAngle / 2) * imgRadius - imgSize / 2;
                
                this.ctx.save();
                
                // Créer un clip path pour le segment
                this.ctx.beginPath();
                this.ctx.moveTo(this.centerX, this.centerY);
                this.ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
                this.ctx.lineTo(this.centerX, this.centerY);
                this.ctx.closePath();
                this.ctx.clip();
                
                // Créer un second clip pour le cercle de l'image
                this.ctx.beginPath();
                this.ctx.arc(imgX + imgSize/2, imgY + imgSize/2, imgSize/2, 0, Math.PI * 2);
                this.ctx.closePath();
                this.ctx.clip();
                
                // Calculer les dimensions pour conserver le ratio
                const scale = Math.max(imgSize / img.width, imgSize / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                const offsetX = (imgSize - scaledWidth) / 2;
                const offsetY = (imgSize - scaledHeight) / 2;
                
                // Dessiner l'image avec le bon ratio
                this.ctx.drawImage(
                    img,
                    imgX + offsetX,
                    imgY + offsetY,
                    scaledWidth,
                    scaledHeight
                );
                
                this.ctx.restore();
            } else {
                // Dessiner le nom du participant seulement s'il n'a pas de photo
                this.ctx.save();
                this.ctx.translate(this.centerX, this.centerY);
                this.ctx.rotate(startAngle + sliceAngle / 2);
                this.ctx.textAlign = 'right';
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '16px Arial';
                this.ctx.fillText(participant.name, this.radius * 0.85, 0);
                this.ctx.restore();
            }
        });

        // Dessiner le centre de la roue
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, 20, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Dessiner la flèche
        this.drawArrow();
    }

    drawEmptyWheel() {
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#666';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Ajoutez des participants', this.centerX, this.centerY);
    }

    drawArrow() {
        const arrowLength = 40;
        this.ctx.save();
        this.ctx.translate(this.centerX, this.centerY - this.radius - 10);
        this.ctx.fillStyle = '#FF0000';
        this.ctx.beginPath();
        this.ctx.moveTo(-10, 0);
        this.ctx.lineTo(10, 0);
        this.ctx.lineTo(0, arrowLength);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    spin() {
        this.spinning = true;
        this.spinSpeed = Math.random() * 0.3 + 0.3; // Vitesse initiale plus rapide
        const stopSpeed = 0.002; // Vitesse à laquelle on arrête la roue
        let deceleration = 0.99; // Facteur de décélération (plus proche de 1 = décélération plus douce)
        
        // Durée aléatoire de rotation à pleine vitesse (entre 0.5 et 2 secondes)
        const fullSpeedDuration = Math.random() * 1500 + 500;
        const startTime = Date.now();
        
        const animate = () => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            
            if (this.spinSpeed > stopSpeed) {
                this.angle += this.spinSpeed;
                
                // Commencer à décélérer seulement après la durée de pleine vitesse
                if (elapsedTime > fullSpeedDuration) {
                    this.spinSpeed *= deceleration;
                    deceleration -= 0.005;
                }
                
                this.draw();
                requestAnimationFrame(animate);
            } else {
                this.spinning = false;
                // Snap l'angle sur le segment le plus proche, curseur en haut (−π/2)
                // const sliceAngle = (2 * Math.PI) / this.participants.length;
                // let adjustedAngle = (this.angle - Math.PI / 2) % (2 * Math.PI);
                // if (adjustedAngle < 0) adjustedAngle += 2 * Math.PI;
                // const currentSegment = Math.round(adjustedAngle / sliceAngle);
                // this.angle = currentSegment * sliceAngle + Math.PI / 2;
                // this.draw();
                setTimeout(() => this.selectWinner(), 100);
            }
        };
        animate();
    }

    selectWinner() {
        const sliceAngle = (2 * Math.PI) / this.participants.length;
        
        // Normaliser l'angle entre 0 et 2π
        let normalizedAngle = this.angle % (2 * Math.PI);
        if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
        
        // Le point 0 est en haut (-π/2 ou 3π/2)
        const arrowAngle = 3 * Math.PI / 2;
        
        // Calculer l'angle relatif à la flèche
        let relativeAngle = (arrowAngle - normalizedAngle) % (2 * Math.PI);
        if (relativeAngle < 0) relativeAngle += 2 * Math.PI;
        
        // Calculer l'index du segment sous la flèche
        const index = Math.floor(relativeAngle / sliceAngle);
        
        // Déterminer si on est proche d'une limite (5% de la largeur d'un segment)
        const remainder = (relativeAngle % sliceAngle) / sliceAngle;
        
        console.log({
            normalizedAngle: normalizedAngle * 180 / Math.PI,
            relativeAngle: relativeAngle * 180 / Math.PI,
            remainder: remainder,
            index: index
        });

        if (remainder < 0.001 || remainder > 0.999) {
            // On est exactement sur la limite entre deux segments (0.1% de marge)
            const nextIndex = (index + 1) % this.participants.length;
            this.selectedParticipant = {
                name: `${this.participants[index].name} & ${this.participants[nextIndex].name} (égalité)`,
                faceUrl: null
            };
        } else {
            this.selectedParticipant = this.participants[index];
        }

        this.showWinnerModal(this.selectedParticipant);

        // Supprimer le gagnant
        this.participants = this.participants.filter(p => p !== this.selectedParticipant);
        setTimeout(() => this.draw(), 500);
    }

    showWinnerModal(winner) {
        console.log('Affichage de la modale pour:', winner.name); // Debug log

        // Lancer les confettis
        function shoot() {
            // Paramètres aléatoires pour chaque tir
            const randomSpread = Math.random() * 100 + 300; // entre 300 et 400
            const randomStartVelocity = Math.random() * 20 + 20; // entre 20 et 40
            const randomGravity = Math.random() * 2; // entre 0 et 2
            const randomTicks = Math.floor(Math.random() * 50 + 75); // entre 75 et 125

            // Liste de couleurs étendue
            const colors = [
                "FFE400", "FFBD00", "E89400", "FFCA6C", "FDFFB8", // jaunes
                "FF5757", "FF7B7B", "FF9E9E", // rouges
                "4CAF50", "8BC34A", "CDDC39", // verts
                "2196F3", "03A9F4", "00BCD4", // bleus
                "9C27B0", "E91E63", "FF4081"  // violets et roses
            ];

            // Sélection aléatoire de 5 couleurs
            const randomColors = [];
            for(let i = 0; i < 5; i++) {
                randomColors.push(colors[Math.floor(Math.random() * colors.length)]);
            }

            // Premier tir avec des étoiles
            confetti({
                spread: randomSpread,
                ticks: randomTicks,
                gravity: randomGravity,
                decay: 0.94,
                startVelocity: randomStartVelocity,
                particleCount: Math.floor(Math.random() * 30 + 30), // entre 30 et 60 particules
                scalar: Math.random() * 0.8 + 0.8, // entre 0.8 et 1.6
                shapes: ["star"],
                colors: randomColors
            });

            // Deuxième tir avec des cercles
            confetti({
                spread: randomSpread - 60,
                ticks: randomTicks,
                gravity: randomGravity * 0.8,
                decay: 0.94,
                startVelocity: randomStartVelocity * 0.8,
                particleCount: Math.floor(Math.random() * 15 + 5), // entre 5 et 20 particules
                scalar: Math.random() * 0.4 + 0.4, // entre 0.4 et 0.8
                shapes: ["circle"],
                colors: randomColors
            });
        }

        // Lancer plusieurs vagues de confettis avec des délais aléatoires
        setTimeout(shoot, 0);
        setTimeout(shoot, Math.random() * 100 + 50);  // entre 50 et 150ms
        setTimeout(shoot, Math.random() * 150 + 150); // entre 150 et 300ms
        setTimeout(shoot, Math.random() * 200 + 250); // entre 250 et 450ms

        // Supprimer l'ancienne modal si elle existe
        let oldModal = document.getElementById('winner-modal');
        if (oldModal) {
            oldModal.remove();
        }

        // Créer une nouvelle modal
        const modal = document.createElement('div');
        modal.id = 'winner-modal';
        modal.className = 'modal';
        
        // Contenu de la modal
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Participant sélectionné !</h2>
                <div class="winner-info${!winner.faceUrl ? ' no-photo' : ''}">
                    ${winner.faceUrl && winner.faceUrl !== 'null' ? `<img src="${winner.faceUrl}" alt="${winner.name}" class="winner-photo">` : ''}
                    <h3>${winner.name}</h3>
                </div>
                <button class="close-modal">Fermer</button>
            </div>
        `;

        // Ajouter la modal au document
        document.body.appendChild(modal);

        // Gestionnaire pour fermer la modal
        const closeModal = (e) => {
            if (e) e.stopPropagation();
            modal.classList.add('closing');
            setTimeout(() => {
                modal.remove();
            }, 300);
        };

        // Ajouter les gestionnaires d'événements
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(e);
        });

        // Forcer un reflow pour que l'animation fonctionne
        modal.offsetHeight;

        // Afficher la modal immédiatement
        modal.style.display = 'block';
    }

    dispose() {
        // Nettoyer les événements et le canvas
        this.container.removeChild(this.canvas);
    }

    reset() {
        // Réinitialiser l'état de la roue
        this.angle = 0;
        this.spinning = false;
        this.finalAngle = 0;
        this.spinSpeed = 0;
        this.selectedParticipant = null;
        this.participantImages = new Map();
        this.draw();
    }
}