/**
 * RatRace - Carrera de la Rata (CashFlow)
 * Edición Sweet Lab Finanzas
 * Camino continuo interminable y estética oficial CashFlow
 */

// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================

const AVATARS = [
	{ id: 'rat-blue', name: 'Quesito Veloz', emoji: '🐭', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.25)' },
	{ id: 'rat-purple', name: 'Don Inversor', emoji: '🐹', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.25)' },
	{ id: 'rat-amber', name: 'Ahorrador Feliz', emoji: '🐰', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)' },
	{ id: 'rat-rose', name: 'Emprendedor Astuto', emoji: '🦊', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.25)' }
];

const PROFESSIONS = [
	{
		title: 'Chef de Repostería',
		salary: 2800,
		fixedExpenses: 1800,
		savings: 1400,
		icon: '👨‍🍳'
	},
	{
		title: 'Profesor(a) Escolar',
		salary: 2400,
		fixedExpenses: 1500,
		savings: 1200,
		icon: '👩‍🏫'
	},
	{
		title: 'Ingeniero(a) de Software',
		salary: 4000,
		fixedExpenses: 2700,
		savings: 2000,
		icon: '💻'
	},
	{
		title: 'Diseñador(a) Gráfico',
		salary: 2900,
		fixedExpenses: 1900,
		savings: 1300,
		icon: '🎨'
	},
	{
		title: 'Administrador(a)',
		salary: 3300,
		fixedExpenses: 2200,
		savings: 1500,
		icon: '📊'
	},
	{
		title: 'Especialista en Ventas',
		salary: 3100,
		fixedExpenses: 2000,
		savings: 1400,
		icon: '🛍️'
	}
];

// Tipos de casillas disponibles para generar el camino continuo
const TILE_TYPES = {
	payday: {
		type: 'payday',
		styleClass: 'tile-style-payday',
		name: 'DÍA DE PAGO',
		icon: '💰',
		sub: '+Flujo de Caja'
	},
	opportunity: {
		type: 'opportunity',
		styleClass: 'tile-style-opportunity',
		name: 'OPORTUNIDAD',
		icon: '🚀',
		sub: 'Inversiones'
	},
	doodad: {
		type: 'doodad',
		styleClass: 'tile-style-doodad',
		name: 'CAPRICHO',
		icon: '🛍️',
		sub: 'Gasto Sorpresa'
	},
	market: {
		type: 'market',
		styleClass: 'tile-style-market',
		name: 'EL MERCADO',
		icon: '📈',
		sub: 'Compra y Venta'
	},
	charity: {
		type: 'charity',
		styleClass: 'tile-style-charity',
		name: 'CARIDAD',
		icon: '🎁',
		sub: 'Donar / 2 Dados'
	},
	crisis: {
		type: 'crisis',
		styleClass: 'tile-style-crisis',
		name: 'DESPIDO',
		icon: '🚨',
		sub: 'Pérdida de Turno'
	}
};

// Baraja de Oportunidades Pequeñas
const SMALL_DEALS = [
	{
		title: 'Máquina Expendedora Sweet Lab',
		type: 'business',
		desc: 'Instalas una máquina automática de postres en un edificio de oficinas con alta afluencia.',
		cost: 1200,
		downPayment: 1200,
		cashFlow: 180,
		roi: '180% anual',
		category: 'Negocio Automatizado'
	},
	{
		title: 'Acciones de Sweet Tech',
		type: 'stock',
		ticker: 'SWT',
		desc: 'Acciones de una empresa tecnológica a $20 c/u. Adquieres un paquete de 50 acciones con dividendo mensual.',
		cost: 1000,
		downPayment: 1000,
		shares: 50,
		pricePerShare: 20,
		cashFlow: 50,
		roi: '60% anual',
		category: 'Acciones'
	},
	{
		title: 'Tienda Online de Galletas Artesanales',
		type: 'business',
		desc: 'Abres una plataforma web de regalos y postres gourmet con entregas automatizadas.',
		cost: 800,
		downPayment: 800,
		cashFlow: 140,
		roi: '210% anual',
		category: 'Emprendimiento Digital'
	},
	{
		title: 'Fondo de Renta Fija Indexado',
		type: 'fund',
		desc: 'Colocas ahorros en un fondo diversificado de bajo riesgo que reparte dividendos cada mes.',
		cost: 1500,
		downPayment: 1500,
		cashFlow: 170,
		roi: '136% anual',
		category: 'Fondo de Inversión'
	},
	{
		title: 'Monedas de Oro de Colección',
		type: 'precious_metal',
		desc: 'Compras 2 monedas de oro raras a precio de ganga para venderlas en El Mercado cuando suba su cotización.',
		cost: 600,
		downPayment: 600,
		cashFlow: 0,
		category: 'Coleccionable'
	},
	{
		title: 'Curso y Membresía de Repostería',
		type: 'business',
		desc: 'Creas una comunidad digital donde usuarios pagan una suscripción mensual por recetas exclusivas.',
		cost: 1000,
		downPayment: 1000,
		cashFlow: 160,
		roi: '192% anual',
		category: 'Negocio Digital'
	},
	{
		title: 'Carrito Portátil de Postres',
		type: 'business',
		desc: 'Puesto móvil de postres en una zona comercial atendido por un colaborador.',
		cost: 1600,
		downPayment: 1600,
		cashFlow: 220,
		roi: '165% anual',
		category: 'Punto de Venta'
	}
];

// Baraja de Oportunidades Grandes
const BIG_DEALS = [
	{
		title: 'Casa de 2 Habitaciones en Renta',
		type: 'real_estate',
		propertyType: '2bed_house',
		desc: 'Una excelente vivienda en una zona tranquila. Se alquila a una familia con contrato a largo plazo.',
		cost: 45000,
		downPayment: 5000,
		cashFlow: 450,
		roi: '108% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Apartamento Vacacional en la Playa',
		type: 'real_estate',
		propertyType: 'condo',
		desc: 'Condominio turístico administrado por agencia que produce altas rentas en temporada.',
		cost: 75000,
		downPayment: 8000,
		cashFlow: 750,
		roi: '112% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Local Comercial en Plaza Céntrica',
		type: 'real_estate',
		propertyType: 'commercial',
		desc: 'Local de alta visibilidad alquilado a una cafetería de prestigio.',
		cost: 110000,
		downPayment: 12000,
		cashFlow: 1150,
		roi: '115% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Edificio de 4 Apartamentos (Multifamiliar)',
		type: 'real_estate',
		propertyType: '4plex',
		desc: 'Propiedad con 4 apartamentos independientes que producen 4 mensualidades simultáneas.',
		cost: 160000,
		downPayment: 18000,
		cashFlow: 1800,
		roi: '120% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Franquicia Express Sweet Lab',
		type: 'business',
		desc: 'Franquicia con personal contratado y sistema probado que opera de manera autónoma.',
		cost: 55000,
		downPayment: 6000,
		cashFlow: 650,
		roi: '130% anual',
		category: 'Franquicia'
	}
];

// Baraja de Caprichos (Doodads / Cosas)
const DOODADS = [
	{
		title: 'Último Teléfono Inteligente',
		desc: 'Compraste el modelo más nuevo de teléfono para estrenar con tus amigos.',
		cost: 850,
		lesson: '¿Era una necesidad real o un deseo pasajero? Comprar caprichos sin activos retrasa tu libertad.'
	},
	{
		title: 'Cena Gourmet de Celebración',
		desc: 'Invitaste a cenar a tus amigos en un restaurante de lujo sin presupuestarlo.',
		cost: 320,
		lesson: 'Disfrutar la vida es genial, pero tener un presupuesto asignado para ocio evita sobresaltos.'
	},
	{
		title: 'Reparación Imprevista del Vehículo',
		desc: 'La batería y los frenos fallaron camino al trabajo y debiste cambiarlos de urgencia.',
		cost: 480,
		lesson: '¡Para esto sirve tu Fondo de Emergencia! Evita pedir prestado o descapitalizarte ante imprevistos.'
	},
	{
		title: 'Televisor Gigante 4K en Oferta',
		desc: 'Una pantalla enorme para ver series y partidos los fines de semana.',
		cost: 650,
		lesson: 'Un televisor es un pasivo: saca dinero de tu bolsillo y pierde valor con el tiempo.'
	},
	{
		title: 'Compras por Impulso en el Centro Comercial',
		desc: 'Ropa, zapatos y accesorios comprados solo porque tenían cartel de descuento.',
		cost: 380,
		lesson: 'Los gastos hormiga y compras impulsivas reducen tu capacidad de invertir en activos.'
	},
	{
		title: 'Suscripciones que Olvidaste Cancelar',
		desc: 'Cuotas acumuladas de plataformas y servicios que llevabas meses sin utilizar.',
		cost: 190,
		lesson: 'Auditar periódicamente tus gastos fijos elimina fugas silenciosas de dinero.'
	}
];

// Baraja de Mercado (The Market)
const MARKET_EVENTS = [
	{
		title: '¡Auge en Bienes Raíces!',
		desc: 'Un fondo de inversión busca casas de 2 habitaciones. Ofrecen pagar $95,000 por cada una. Quien posea una casa puede venderla hoy y ganar $50,000 netos de plusvalía.',
		appliesTo: '2bed_house',
		salePrice: 95000,
		netGain: 50000,
		actionText: 'Vender Casa por $95,000 (Ganancia neta: +$50,000)'
	},
	{
		title: '¡Crecimiento Tecnológico: Sweet Tech!',
		desc: 'Sweet Tech anuncia utilidades récord. Sus acciones suben a $60 c/u (adquiridas a $20). Quien tenga acciones puede venderlas hoy con 200% de ganancia.',
		appliesTo: 'stock_SWT',
		newPrice: 60,
		actionText: 'Vender Acciones Sweet Tech a $60 c/u'
	},
	{
		title: 'Comprador para Apartamentos en la Playa',
		desc: 'Un grupo hotelero adquiere condominios turísticos pagando una plusvalía neta de $35,000 sobre el costo de compra.',
		appliesTo: 'condo',
		salePrice: 110000,
		netGain: 35000,
		actionText: 'Vender Apartamento con Ganancia de +$35,000'
	},
	{
		title: 'Subasta de Oro y Objetos Coleccionables',
		desc: 'Compradores pagan $1,500 por lote de monedas de oro (adquiridas a $600).',
		appliesTo: 'precious_metal',
		salePrice: 1500,
		netGain: 900,
		actionText: 'Vender Monedas de Oro por $1,500'
	},
	{
		title: 'Mercado Estable y Seguro',
		desc: 'La economía se mantiene equilibrada este mes. Excelente momento para acumular efectivo y preparar tu siguiente gran inversión.',
		appliesTo: null
	}
];

// ==========================================
// 2. ESTADO GLOBAL DEL JUEGO
// ==========================================

const gameState = {
	players: [],
	currentPlayerIndex: 0,
	selectedTabPlayerIndex: 0,
	isRolling: false,
	generatedTiles: [], // El camino largo que nunca termina
	currentMaxRow: 0
};

// ==========================================
// 3. EFECTOS DE SONIDO SINTETIZADOS (Web Audio API)
// ==========================================

class SoundEffects {
	constructor() {
		this.ctx = null;
	}

	init() {
		if (!this.ctx) {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (AudioContext) this.ctx = new AudioContext();
		}
	}

	playTone(freq, duration, type = 'sine', gainVal = 0.1) {
		try {
			this.init();
			if (!this.ctx || this.ctx.state === 'suspended') {
				this.ctx?.resume();
			}
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();
			osc.type = type;
			osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
			gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
			osc.connect(gain);
			gain.connect(this.ctx.destination);
			osc.start();
			osc.stop(this.ctx.currentTime + duration);
		} catch (e) {
			// Ignorar errores de autoplay
		}
	}

	roll() {
		for (let i = 0; i < 5; i++) {
			setTimeout(() => this.playTone(220 + Math.random() * 260, 0.08, 'triangle', 0.08), i * 70);
		}
	}

	cash() {
		this.playTone(523.25, 0.1, 'sine', 0.12);
		setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.12), 100);
		setTimeout(() => this.playTone(783.99, 0.25, 'sine', 0.15), 200);
	}

	loss() {
		this.playTone(400, 0.15, 'sawtooth', 0.1);
		setTimeout(() => this.playTone(280, 0.3, 'sawtooth', 0.12), 150);
	}

	victory() {
		const notes = [523.25, 659.25, 783.99, 1046.50];
		notes.forEach((n, idx) => {
			setTimeout(() => this.playTone(n, 0.3, 'triangle', 0.2), idx * 180);
		});
	}
}

const sounds = new SoundEffects();

// ==========================================
// 4. GENERADOR DEL CAMINO CONTINUO INTERMINABLE
// ==========================================

/**
 * Genera bloques de casillas dinámicas para el camino sinuoso continuo.
 * Cada bloque añade varias filas de 6 casillas que serpentean.
 */
function extendContinuousTrack(rowsToAdd = 6) {
	const trackContainer = document.getElementById('track-path');
	if (!trackContainer) return;

	const tilesPerRow = 6;
	const currentTileCount = gameState.generatedTiles.length;

	for (let r = 0; r < rowsToAdd; r++) {
		const rowIndex = gameState.currentMaxRow++;
		const isEvenRow = (rowIndex % 2 === 0); // Fila par: izq a der, impar: der a izq

		// Marcador mensual cada 2 filas (aprox 12 casillas)
		if (rowIndex % 2 === 0) {
			const monthNum = Math.floor(rowIndex / 2) + 1;
			const marker = document.createElement('div');
			marker.className = 'milestone-marker';
			marker.innerHTML = `<span>🧀 TRAMO FINANCIERO: MES ${monthNum}</span>`;
			trackContainer.appendChild(marker);
		}

		const rowEl = document.createElement('div');
		rowEl.className = 'track-row';
		rowEl.id = `track-row-${rowIndex}`;

		const rowTiles = [];

		for (let c = 0; c < tilesPerRow; c++) {
			const globalIndex = currentTileCount + (r * tilesPerRow) + c;
			const tileData = pickTileTypeForIndex(globalIndex);
			tileData.globalIndex = globalIndex;
			gameState.generatedTiles.push(tileData);
			rowTiles.push(tileData);
		}

		// Si es fila impar, invertimos visualmente para dar el efecto de camino sinuoso que va y viene
		const displayTiles = isEvenRow ? rowTiles : [...rowTiles].reverse();

		displayTiles.forEach(tile => {
			const tileEl = createTileDOM(tile);
			rowEl.appendChild(tileEl);
		});

		trackContainer.appendChild(rowEl);
	}
}

/**
 * Determina el tipo de casilla asegurando que haya un Día de Pago cada 6-7 casillas,
 * y variando entre Oportunidades, Caprichos, Mercado, Caridad y Despido.
 */
function pickTileTypeForIndex(index) {
	if (index === 0) {
		return { ...TILE_TYPES.payday, id: index, title: 'SALIDA • DÍA DE PAGO' };
	}

	// Día de Pago regular cada 6 o 7 casillas (el sueldo/flujo del mes)
	if (index % 6 === 0) {
		return { ...TILE_TYPES.payday, id: index };
	}

	// Variedad balanceada entre las demás casillas
	const cycle = index % 12;
	let typeKey = 'opportunity';

	switch (cycle) {
		case 1: typeKey = 'opportunity'; break;
		case 2: typeKey = 'doodad'; break;
		case 3: typeKey = 'market'; break;
		case 4: typeKey = 'opportunity'; break;
		case 5: typeKey = 'charity'; break;
		case 7: typeKey = 'doodad'; break;
		case 8: typeKey = 'opportunity'; break;
		case 9: typeKey = 'crisis'; break;
		case 10: typeKey = 'market'; break;
		case 11: typeKey = 'opportunity'; break;
		default: typeKey = 'opportunity';
	}

	return { ...TILE_TYPES[typeKey], id: index };
}

function createTileDOM(tile) {
	const el = document.createElement('div');
	el.id = `track-tile-${tile.globalIndex}`;
	el.className = `track-tile ${tile.styleClass}`;

	el.innerHTML = `
		<span class="track-tile-num">${tile.globalIndex + 1}</span>
		<span class="track-tile-icon">${tile.icon}</span>
		<div>
			<div class="track-tile-name">${tile.name}</div>
			<div class="track-tile-sub">${tile.sub}</div>
		</div>
		<div class="track-tile-pawns" id="tile-pawns-${tile.globalIndex}"></div>
	`;

	return el;
}

// ==========================================
// 5. INICIALIZACIÓN Y EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
	setupPlayerInputs(2);
	wireEventListeners();
});

function setupPlayerInputs(count) {
	const container = document.getElementById('setup-players-container');
	if (!container) return;
	container.innerHTML = '';

	const defaultNames = ['Jorge', 'Lulita', 'Mateo', 'Valeria'];

	for (let i = 0; i < count; i++) {
		const avatar = AVATARS[i];
		const name = defaultNames[i] || `Jugador ${i + 1}`;

		const row = document.createElement('div');
		row.className = 'player-input-row';
		row.innerHTML = `
			<div class="player-badge-preview" style="background: ${avatar.bg}; border: 2px solid ${avatar.color};">
				${avatar.emoji}
			</div>
			<input type="text" id="player-input-${i}" class="player-name-field" value="${name}" placeholder="Nombre del jugador ${i + 1}" maxlength="18" />
			<span style="font-size: 0.85rem; font-weight: 800; color: ${avatar.color}; font-family: 'Outfit', sans-serif;">${avatar.name}</span>
		`;
		container.appendChild(row);
	}
}

function wireEventListeners() {
	// Selector de cantidad de jugadores
	document.querySelectorAll('.setup-count-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			document.querySelectorAll('.setup-count-btn').forEach(b => b.classList.remove('active'));
			e.target.classList.add('active');
			const count = parseInt(e.target.dataset.count, 10);
			setupPlayerInputs(count);
		});
	});

	// Iniciar Partida
	document.getElementById('btn-start-play')?.addEventListener('click', () => {
		sounds.init();
		startContinuousGame();
	});

	// Botón Tirar Dado en el HUD
	document.getElementById('btn-roll-dice')?.addEventListener('click', () => {
		sounds.init();
		rollDiceContinuous();
	});

	// Botón Volver al Sistema
	document.getElementById('btn-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});

	// Botón Nueva Partida
	document.getElementById('btn-new-game')?.addEventListener('click', () => {
		if (confirm('¿Deseas reiniciar la partida y volver a la configuración?')) {
			document.getElementById('game-hud').classList.add('hidden');
			document.getElementById('game-screen').classList.add('hidden');
			document.getElementById('setup-screen').classList.remove('hidden');
		}
	});

	// Modal de Reglas
	document.getElementById('btn-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.add('open');
	});
	document.getElementById('btn-close-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.remove('open');
	});

	// Préstamo Bancario
	document.getElementById('btn-request-loan')?.addEventListener('click', () => {
		showLoanModal();
	});

	// Pagar Deudas
	document.getElementById('btn-pay-debt')?.addEventListener('click', () => {
		showPayDebtModal();
	});

	// Modal de Victoria
	document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
		document.getElementById('victory-modal').classList.remove('open');
		startContinuousGame();
	});
	document.getElementById('btn-victory-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});
}

// ==========================================
// 6. INICIO DE PARTIDA
// ==========================================

function startContinuousGame() {
	const count = parseInt(document.querySelector('.setup-count-btn.active')?.dataset.count || '2', 10);
	const players = [];

	const shuffledProfessions = [...PROFESSIONS].sort(() => 0.5 - Math.random());

	for (let i = 0; i < count; i++) {
		const nameInput = document.getElementById(`player-input-${i}`);
		const name = (nameInput?.value || `Jugador ${i + 1}`).trim();
		const avatar = AVATARS[i];
		const prof = shuffledProfessions[i % shuffledProfessions.length];

		players.push({
			id: i,
			name: name,
			avatar: avatar.emoji,
			color: avatar.color,
			bg: avatar.bg,
			profession: prof.title,
			salary: prof.salary,
			fixedExpenses: prof.fixedExpenses,
			debtExpenses: 0,
			totalDebt: 0,
			cash: prof.savings,
			position: 0, // Índice en el camino continuo
			assets: [],
			hasTwoDice: 0,
			skipTurns: 0
		});
	}

	gameState.players = players;
	gameState.currentPlayerIndex = 0;
	gameState.selectedTabPlayerIndex = 0;
	gameState.isRolling = false;
	gameState.generatedTiles = [];
	gameState.currentMaxRow = 0;

	// Limpiar contenedor del camino
	const trackPath = document.getElementById('track-path');
	if (trackPath) trackPath.innerHTML = '';

	// Generar las primeras 8 filas (48 casillas de camino inicial)
	extendContinuousTrack(8);

	// Cambiar vistas
	document.getElementById('setup-screen').classList.add('hidden');
	document.getElementById('game-hud').classList.remove('hidden');
	document.getElementById('game-screen').classList.remove('hidden');

	renderPlayerTabs();
	updatePawnsOnTrack();
	updateActivePlayerHUD();
	updateFinancialSheet(gameState.selectedTabPlayerIndex);

	// Centrar cámara en la casilla 0
	scrollToCurrentTile(0);
}

function renderPlayerTabs() {
	const container = document.getElementById('cf-player-tabs');
	if (!container) return;
	container.innerHTML = '';

	gameState.players.forEach((p, idx) => {
		const tab = document.createElement('div');
		tab.className = `cf-tab ${idx === gameState.selectedTabPlayerIndex ? 'active' : ''} ${idx === gameState.currentPlayerIndex ? 'is-turn' : ''}`;
		tab.id = `cf-tab-${idx}`;
		tab.style.borderTop = `3px solid ${p.color}`;
		tab.innerHTML = `
			<span style="font-size: 1.2rem;">${p.avatar}</span>
			<span>${p.name.split(' ')[0]}</span>
		`;

		tab.addEventListener('click', () => {
			gameState.selectedTabPlayerIndex = idx;
			document.querySelectorAll('.cf-tab').forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			updateFinancialSheet(idx);
			// Centrar cámara en el jugador seleccionado al hacer clic en su pestaña
			scrollToCurrentTile(p.position);
		});

		container.appendChild(tab);
	});
}

function updatePawnsOnTrack() {
	// Limpiar pawns
	gameState.generatedTiles.forEach(tile => {
		const pawnsContainer = document.getElementById(`tile-pawns-${tile.globalIndex}`);
		if (pawnsContainer) pawnsContainer.innerHTML = '';
	});

	// Colocar pawns
	gameState.players.forEach(p => {
		const pawnsContainer = document.getElementById(`tile-pawns-${p.position}`);
		if (pawnsContainer) {
			const pawn = document.createElement('div');
			pawn.className = 'cf-pawn';
			pawn.style.background = p.color;
			pawn.title = p.name;
			pawn.innerHTML = p.avatar;
			pawnsContainer.appendChild(pawn);
		}
	});
}

function updateActivePlayerHUD() {
	const current = gameState.players[gameState.currentPlayerIndex];
	const hudAvatar = document.getElementById('hud-avatar');
	const hudName = document.getElementById('hud-name');
	const hudProf = document.getElementById('hud-profession');
	const btnRoll = document.getElementById('btn-roll-dice');
	const statusLog = document.getElementById('hud-status-log');

	if (hudAvatar) hudAvatar.textContent = current.avatar;
	if (hudName) {
		hudName.textContent = `Turno de ${current.name}`;
		hudName.style.color = current.color;
	}
	if (hudProf) hudProf.textContent = current.profession;

	// Resaltar casilla activa
	document.querySelectorAll('.track-tile').forEach(t => t.classList.remove('active-step'));
	const activeTile = document.getElementById(`track-tile-${current.position}`);
	if (activeTile) activeTile.classList.add('active-step');

	// Actualizar tabs
	document.querySelectorAll('.cf-tab').forEach((t, i) => {
		if (i === gameState.currentPlayerIndex) t.classList.add('is-turn');
		else t.classList.remove('is-turn');
	});

	if (current.skipTurns > 0) {
		btnRoll.disabled = true;
		statusLog.innerHTML = `<strong style="color:#f87171;">⚠️ ${current.name} está en crisis de empleo y pierde este turno.</strong>`;
		setTimeout(() => {
			current.skipTurns--;
			endTurn();
		}, 2200);
		return;
	}

	btnRoll.disabled = false;
	btnRoll.textContent = current.hasTwoDice > 0 ? 'Tirar 2 Dados 🎲🎲' : 'Tirar Dado 🎲';
	statusLog.textContent = '¡Lanza el dado para avanzar por el camino financiero!';

	// Enfocar hoja financiera del jugador activo
	gameState.selectedTabPlayerIndex = gameState.currentPlayerIndex;
	renderPlayerTabs();
	updateFinancialSheet(gameState.currentPlayerIndex);
}

function scrollToCurrentTile(tileIndex) {
	const tileEl = document.getElementById(`track-tile-${tileIndex}`);
	if (tileEl) {
		tileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
}

// ==========================================
// 7. CÁLCULO FINANCIERO Y BALANCE SHEET
// ==========================================

function getPlayerFinancials(player) {
	const passiveIncome = player.assets.reduce((sum, a) => sum + (a.cashFlow || 0), 0);
	const totalIncome = player.salary + passiveIncome;
	const totalExpenses = player.fixedExpenses + player.debtExpenses;
	const monthlyCashFlow = totalIncome - totalExpenses;
	const freedomProgress = Math.min(100, Math.round((passiveIncome / (totalExpenses || 1)) * 100));

	return {
		passiveIncome,
		totalIncome,
		totalExpenses,
		monthlyCashFlow,
		freedomProgress,
		isFree: passiveIncome >= totalExpenses && totalExpenses > 0
	};
}

function updateFinancialSheet(playerIndex) {
	const p = gameState.players[playerIndex];
	if (!p) return;

	const fin = getPlayerFinancials(p);

	// Nombre y profesión
	const sheetName = document.getElementById('sheet-name');
	const sheetProf = document.getElementById('sheet-profession');
	if (sheetName) {
		sheetName.innerHTML = `${p.avatar} ${p.name}`;
		sheetName.style.color = p.color;
	}
	if (sheetProf) sheetProf.textContent = p.profession;

	// Efectivo
	document.getElementById('sheet-cash-val').textContent = `$${p.cash.toLocaleString()}`;

	// Medidor de Libertad Financiera
	document.getElementById('freedom-percentage').textContent = `${fin.freedomProgress}%`;
	document.getElementById('freedom-fill').style.width = `${fin.freedomProgress}%`;
	document.getElementById('freedom-passive').textContent = `$${fin.passiveIncome.toLocaleString()}`;
	document.getElementById('freedom-expenses').textContent = `$${fin.totalExpenses.toLocaleString()}`;

	// Flujo de Caja
	const cashflowVal = document.getElementById('sheet-cashflow-val');
	if (cashflowVal) {
		cashflowVal.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}$${fin.monthlyCashFlow.toLocaleString()}`;
		cashflowVal.style.color = fin.monthlyCashFlow >= 0 ? '#4ade80' : '#f87171';
	}

	// Ingresos y Gastos
	document.getElementById('sheet-total-income').textContent = `$${fin.totalIncome.toLocaleString()}`;
	document.getElementById('sheet-salary').textContent = `$${p.salary.toLocaleString()}`;
	document.getElementById('sheet-passive').textContent = `$${fin.passiveIncome.toLocaleString()}`;

	document.getElementById('sheet-total-expenses').textContent = `$${fin.totalExpenses.toLocaleString()}`;
	document.getElementById('sheet-fixed-exp').textContent = `$${p.fixedExpenses.toLocaleString()}`;
	document.getElementById('sheet-debt-exp').textContent = `$${p.debtExpenses.toLocaleString()}`;

	// Lista de Activos
	const assetsContainer = document.getElementById('sheet-assets-list');
	if (assetsContainer) {
		if (p.assets.length === 0) {
			assetsContainer.innerHTML = `
				<div style="color:#c084fc; font-size:0.75rem; text-align:center; padding:10px;">
					Aún no tienes activos. ¡Aprovecha las casillas de Oportunidad verde!
				</div>
			`;
		} else {
			assetsContainer.innerHTML = p.assets.map(a => `
				<div class="cf-asset-entry">
					<div>
						<div class="cf-asset-name">${a.title}</div>
						<small style="color:#d8b4fe; font-size:0.65rem;">${a.category || 'Activo'}</small>
					</div>
					<div class="cf-asset-gain">+${a.cashFlow ? `$${a.cashFlow.toLocaleString()}/mes` : '$0'}</div>
				</div>
			`).join('');
		}
	}
}

// ==========================================
// 8. MOVIMIENTO Y TIRADA DE DADOS
// ==========================================

function rollDiceContinuous() {
	if (gameState.isRolling) return;
	const player = gameState.players[gameState.currentPlayerIndex];
	const btnRoll = document.getElementById('btn-roll-dice');
	const diceDisplay = document.getElementById('hud-dice-val');

	gameState.isRolling = true;
	btnRoll.disabled = true;
	diceDisplay.classList.add('rolling');
	sounds.roll();

	let rollCount = 0;
	const interval = setInterval(() => {
		const tempVal = Math.floor(Math.random() * 6) + 1;
		diceDisplay.textContent = getDiceSymbol(tempVal);
		rollCount++;

		if (rollCount > 8) {
			clearInterval(interval);
			diceDisplay.classList.remove('rolling');

			const d1 = Math.floor(Math.random() * 6) + 1;
			let totalSteps = d1;

			if (player.hasTwoDice > 0) {
				const d2 = Math.floor(Math.random() * 6) + 1;
				totalSteps = d1 + d2;
				player.hasTwoDice--;
				diceDisplay.textContent = `${d1}+${d2}=${totalSteps}`;
			} else {
				diceDisplay.textContent = getDiceSymbol(d1);
			}

			// Desplazar ficha paso a paso por el camino continuo
			stepForwardOnTrack(player, totalSteps);
		}
	}, 70);
}

function getDiceSymbol(val) {
	const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
	return faces[val - 1] || '🎲';
}

function stepForwardOnTrack(player, steps) {
	let remaining = steps;

	const moveInterval = setInterval(() => {
		player.position++;

		// Si el jugador se acerca al final del camino cargado, extender el camino infinitamente
		if (player.position >= gameState.generatedTiles.length - 12) {
			extendContinuousTrack(6); // Añadir 6 filas más (36 casillas más)
		}

		updatePawnsOnTrack();

		// Resaltar casilla actual y mover suavemente la cámara del camino
		document.querySelectorAll('.track-tile').forEach(t => t.classList.remove('active-step'));
		const tileEl = document.getElementById(`track-tile-${player.position}`);
		if (tileEl) {
			tileEl.classList.add('active-step');
			scrollToCurrentTile(player.position);
		}

		const currentTileData = gameState.generatedTiles[player.position];

		// ¿Pasó por un Día de Pago durante el trayecto?
		if (currentTileData && currentTileData.type === 'payday' && remaining > 1) {
			collectPayday(player, false);
		}

		remaining--;

		if (remaining <= 0) {
			clearInterval(moveInterval);
			gameState.isRolling = false;
			// Gestionar casilla de llegada
			handleContinuousLanding(player, currentTileData);
		}
	}, 150);
}

// ==========================================
// 9. EVENTOS DE CASILLAS
// ==========================================

function handleContinuousLanding(player, tile) {
	const statusLog = document.getElementById('hud-status-log');
	statusLog.innerHTML = `<strong>${player.name}</strong> cayó en <strong>${tile.name}</strong> (${tile.icon}).`;

	switch (tile.type) {
		case 'payday':
			collectPayday(player, true);
			break;
		case 'opportunity':
			showOpportunityModal(player);
			break;
		case 'doodad':
			showDoodadModal(player);
			break;
		case 'market':
			showMarketModal(player);
			break;
		case 'charity':
			showCharityModal(player);
			break;
		case 'crisis':
			showCrisisModal(player);
			break;
		default:
			endTurn();
	}
}

// Cobro de Día de Pago
function collectPayday(player, showPopup = true) {
	const fin = getPlayerFinancials(player);
	player.cash += fin.monthlyCashFlow;
	sounds.cash();
	updateFinancialSheet(gameState.currentPlayerIndex);

	if (showPopup) {
		showModal({
			headerClass: 'payday',
			icon: '💰',
			title: '¡DÍA DE PAGO!',
			subtitle: 'Tu flujo de caja mensual ha ingresado',
			desc: `Has recibido tu Flujo de Caja Mensual:<br><strong style="font-size:1.4rem; color:#facc15; font-family:'Outfit',sans-serif;">+$${fin.monthlyCashFlow.toLocaleString()}</strong>`,
			stats: [
				{ label: 'Ingresos Totales', value: `+$${fin.totalIncome.toLocaleString()}`, color: 'green' },
				{ label: 'Gastos Totales', value: `-$${fin.totalExpenses.toLocaleString()}`, color: 'red' },
				{ label: 'Nuevo Efectivo en Mano', value: `$${player.cash.toLocaleString()}`, color: 'green' }
			],
			buttons: [
				{ text: '¡Excelente! Continuar', class: 'primary', action: () => { closeModal(); endTurn(); } }
			]
		});
	}
}

// Modal Oportunidades
function showOpportunityModal(player) {
	showModal({
		headerClass: 'opportunity',
		icon: '🚀',
		title: 'Oportunidad de Inversión',
		subtitle: '¿Qué tamaño de negocio deseas explorar?',
		desc: 'Elige si deseas explorar un <strong>Pequeño Negocio</strong> (bajo enganche) o un <strong>Gran Negocio</strong> (mayor capital y más flujo pasivo).',
		stats: [
			{ label: 'Tu Efectivo Disponible', value: `$${player.cash.toLocaleString()}`, color: 'green' }
		],
		buttons: [
			{
				text: '🔍 Pequeño Negocio ($600 - $1,600)',
				class: 'primary',
				action: () => presentOpportunityDeal(player, SMALL_DEALS[Math.floor(Math.random() * SMALL_DEALS.length)])
			},
			{
				text: '🏢 Gran Negocio ($5,000+)',
				class: 'secondary',
				action: () => presentOpportunityDeal(player, BIG_DEALS[Math.floor(Math.random() * BIG_DEALS.length)])
			},
			{
				text: 'Pasar turno',
				class: 'secondary',
				action: () => { closeModal(); endTurn(); }
			}
		]
	});
}

function presentOpportunityDeal(player, deal) {
	const cost = deal.downPayment || deal.cost;
	const canAfford = player.cash >= cost;

	const stats = [
		{ label: 'Precio Total', value: `$${deal.cost.toLocaleString()}` },
		{ label: 'Enganche Requerido', value: `$${cost.toLocaleString()}`, color: canAfford ? 'green' : 'red' },
		{ label: 'Flujo Pasivo Mensual', value: `+${deal.cashFlow ? `$${deal.cashFlow.toLocaleString()}/mes` : '$0'}`, color: 'green' }
	];

	if (deal.roi) {
		stats.push({ label: 'Retorno de Inversión Anual', value: deal.roi, color: 'green' });
	}

	const buttons = [];

	if (canAfford) {
		buttons.push({
			text: `Comprar Activo (-$${cost.toLocaleString()})`,
			class: 'primary',
			action: () => {
				player.cash -= cost;
				player.assets.push({ ...deal });
				sounds.cash();
				closeModal();
				checkVictoryCondition(player);
				endTurn();
			}
		});
	} else {
		buttons.push({
			text: 'Pedir Préstamo al Banco 🏦',
			class: 'primary',
			action: () => {
				closeModal();
				showLoanModal(cost - player.cash, () => presentOpportunityDeal(player, deal));
			}
		});
	}

	buttons.push({
		text: 'Dejar pasar',
		class: 'secondary',
		action: () => { closeModal(); endTurn(); }
	});

	showModal({
		headerClass: 'opportunity',
		icon: '🏢',
		title: deal.title,
		subtitle: deal.category || 'Oportunidad',
		desc: deal.desc,
		stats: stats,
		buttons: buttons
	});
}

// Modal Caprichos (Doodads)
function showDoodadModal(player) {
	const doodad = DOODADS[Math.floor(Math.random() * DOODADS.length)];
	sounds.loss();

	showModal({
		headerClass: 'doodad',
		icon: '🛍️',
		title: doodad.title,
		subtitle: 'Gasto Imprevisto',
		desc: `${doodad.desc}<br><br><small style="color:#fbcfe8;">💡 <em>${doodad.lesson}</em></small>`,
		stats: [
			{ label: 'Costo del Capricho', value: `-$${doodad.cost.toLocaleString()}`, color: 'red' },
			{ label: 'Tu Efectivo Actual', value: `$${player.cash.toLocaleString()}` }
		],
		buttons: [
			{
				text: `Pagar en Efectivo (-$${doodad.cost.toLocaleString()})`,
				class: 'primary',
				action: () => {
					player.cash -= doodad.cost;
					if (player.cash < 0) {
						// Préstamo automático si el dinero no alcanza
						const debtNeeded = Math.ceil(Math.abs(player.cash) / 1000) * 1000;
						player.totalDebt += debtNeeded;
						player.debtExpenses += (debtNeeded * 0.1);
						player.cash += debtNeeded;
					}
					closeModal();
					updateFinancialSheet(gameState.currentPlayerIndex);
					endTurn();
				}
			}
		]
	});
}

// Modal Mercado (The Market)
function showMarketModal(player) {
	const event = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)];
	const eligibleAssets = player.assets.filter(a => {
		if (event.appliesTo === '2bed_house' && a.propertyType === '2bed_house') return true;
		if (event.appliesTo === 'stock_SWT' && a.ticker === 'SWT') return true;
		if (event.appliesTo === 'condo' && a.propertyType === 'condo') return true;
		if (event.appliesTo === 'precious_metal' && a.type === 'precious_metal') return true;
		return false;
	});

	const buttons = [];

	if (eligibleAssets.length > 0) {
		buttons.push({
			text: '¡Vender Activo con Gran Ganancia!',
			class: 'primary',
			action: () => {
				const asset = eligibleAssets[0];
				player.assets = player.assets.filter(a => a !== asset);
				const gain = event.netGain || event.salePrice || 10000;
				player.cash += gain;
				sounds.cash();
				closeModal();
				updateFinancialSheet(gameState.currentPlayerIndex);
				endTurn();
			}
		});
	}

	buttons.push({
		text: 'Continuar',
		class: 'secondary',
		action: () => { closeModal(); endTurn(); }
	});

	showModal({
		headerClass: 'market',
		icon: '📈',
		title: event.title,
		subtitle: 'Fluctuación del Mercado',
		desc: event.desc,
		stats: [
			{ label: '¿Posees este activo?', value: eligibleAssets.length > 0 ? '¡SÍ! Puedes vender' : 'No posees este activo', color: eligibleAssets.length > 0 ? 'green' : 'red' }
		],
		buttons: buttons
	});
}

// Modal Caridad
function showCharityModal(player) {
	const charityCost = Math.round(player.salary * 0.1);
	const canAfford = player.cash >= charityCost;

	showModal({
		headerClass: 'charity',
		icon: '🎁',
		title: 'Caridad y Generosidad',
		subtitle: 'La ley de dar para recibir',
		desc: 'Donar el 10% de tu sueldo a una causa comunitaria te premia con una aceleración: <strong>podrás lanzar con 2 dados durante tus siguientes 3 turnos</strong> para avanzar con mayor velocidad.',
		stats: [
			{ label: 'Donación (10% del sueldo)', value: `$${charityCost.toLocaleString()}`, color: 'red' },
			{ label: 'Beneficio', value: '2 Dados por 3 turnos 🎲🎲', color: 'green' }
		],
		buttons: [
			{
				text: canAfford ? `Donar (-$${charityCost.toLocaleString()})` : 'Efectivo insuficiente',
				class: 'primary',
				action: () => {
					if (!canAfford) return;
					player.cash -= charityCost;
					player.hasTwoDice = 3;
					sounds.cash();
					closeModal();
					updateFinancialSheet(gameState.currentPlayerIndex);
					endTurn();
				}
			},
			{
				text: 'En este momento no',
				class: 'secondary',
				action: () => { closeModal(); endTurn(); }
			}
		]
	});
}

// Modal Despido / Crisis
function showCrisisModal(player) {
	sounds.loss();
	const fin = getPlayerFinancials(player);
	const monthlyExpenses = fin.totalExpenses;

	showModal({
		headerClass: 'crisis',
		icon: '🚨',
		title: '¡Despido Temporal en el Trabajo!',
		subtitle: 'Reestructuración y emergencia',
		desc: 'Tu empresa pasa por un ajuste. Debes cubrir los gastos fijos del mes con tus ahorros de emergencia y pierdes tu próximo turno de tirada.<br><br>💡 <em>Lección: Contar con un fondo de reserva de 3 a 6 meses de gastos te mantiene protegido.</em>',
		stats: [
			{ label: 'Gastos a Pagar', value: `-$${monthlyExpenses.toLocaleString()}`, color: 'red' },
			{ label: 'Penalización', value: 'Pierdes 1 turno', color: 'red' }
		],
		buttons: [
			{
				text: 'Pagar Gastos y Afrontar Despido',
				class: 'primary',
				action: () => {
					player.cash -= monthlyExpenses;
					player.skipTurns = 1;
					closeModal();
					updateFinancialSheet(gameState.currentPlayerIndex);
					endTurn();
				}
			}
		]
	});
}

// ==========================================
// 10. PRÉSTAMOS Y DEUDA BANCARIA
// ==========================================

function showLoanModal(suggestedAmount = 1000, onComplete = null) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const roundSuggested = Math.ceil(suggestedAmount / 1000) * 1000;

	showModal({
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'Préstamo Bancario',
		subtitle: 'Apalancamiento Financiero',
		desc: 'El banco te otorga préstamos en bloques de <strong>$1,000</strong>. Cada $1,000 prestados añade <strong>$100/mes de intereses</strong> (10% mensual) a tus gastos.<br><br>💡 <em>Usa préstamos para comprar activos que te dejen más dinero del que pagas en intereses.</em>',
		stats: [
			{ label: 'Monto a Solicitar', value: `$${roundSuggested.toLocaleString()}`, color: 'green' },
			{ label: 'Costo Mensual de Intereses', value: `+$${(roundSuggested * 0.1).toLocaleString()}/mes`, color: 'red' }
		],
		buttons: [
			{
				text: `Aceptar Préstamo de $${roundSuggested.toLocaleString()}`,
				class: 'primary',
				action: () => {
					player.cash += roundSuggested;
					player.totalDebt += roundSuggested;
					player.debtExpenses += (roundSuggested * 0.1);
					sounds.cash();
					closeModal();
					updateFinancialSheet(gameState.currentPlayerIndex);
					if (onComplete) onComplete();
				}
			},
			{
				text: 'Cancelar',
				class: 'secondary',
				action: () => closeModal()
			}
		]
	});
}

function showPayDebtModal() {
	const player = gameState.players[gameState.currentPlayerIndex];
	if (player.totalDebt <= 0) {
		alert('¡Felicidades! No tienes ninguna deuda bancaria pendiente.');
		return;
	}

	const payAmount = Math.min(player.totalDebt, 1000);
	const canAfford = player.cash >= payAmount;

	showModal({
		headerClass: 'payday',
		icon: '💳',
		title: 'Pagar Deuda Bancaria',
		subtitle: 'Reduce tus gastos y aumenta tu flujo',
		desc: `Tienes <strong>$${player.totalDebt.toLocaleString()}</strong> en préstamos bancarios. Al liquidar un bloque de <strong>$${payAmount.toLocaleString()}</strong>, tus gastos mensuales disminuyen en <strong>$100/mes</strong>.`,
		stats: [
			{ label: 'Tu Efectivo', value: `$${player.cash.toLocaleString()}` },
			{ label: 'Deuda Restante', value: `$${player.totalDebt.toLocaleString()}`, color: 'red' }
		],
		buttons: [
			{
				text: canAfford ? `Pagar $${payAmount.toLocaleString()}` : 'Efectivo insuficiente',
				class: 'primary',
				action: () => {
					if (!canAfford) return;
					player.cash -= payAmount;
					player.totalDebt -= payAmount;
					player.debtExpenses -= (payAmount * 0.1);
					sounds.cash();
					closeModal();
					updateFinancialSheet(gameState.currentPlayerIndex);
				}
			},
			{
				text: 'Cerrar',
				class: 'secondary',
				action: () => closeModal()
			}
		]
	});
}

// ==========================================
// 11. VICTORIA Y CAMBIO DE TURNO
// ==========================================

function checkVictoryCondition(player) {
	const fin = getPlayerFinancials(player);
	if (fin.isFree) {
		triggerVictory(player);
		return true;
	}
	return false;
}

function triggerVictory(player) {
	sounds.victory();
	const fin = getPlayerFinancials(player);

	const msg = document.getElementById('victory-message');
	const summary = document.getElementById('victory-summary');

	if (msg) {
		msg.innerHTML = `
			¡Enhorabuena, <strong>${player.name}</strong>! 🎉<br><br>
			Tus <strong>Ingresos Pasivos ($${fin.passiveIncome.toLocaleString()})</strong> han superado por completo tus <strong>Gastos Totales ($${fin.totalExpenses.toLocaleString()})</strong>.<br><br>
			¡Eres financieramente libre y has escapado de la Carrera de la Rata!
		`;
	}

	if (summary) {
		summary.innerHTML = `
			<div class="card-stat-line">
				<span class="lbl">Ingresos Pasivos Mensuales</span>
				<span class="val green">+$${fin.passiveIncome.toLocaleString()}/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Gastos Totales Mensuales</span>
				<span class="val red">-$${fin.totalExpenses.toLocaleString()}/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Activos Construidos</span>
				<span class="val green">${player.assets.length} activos</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Efectivo Acumulado</span>
				<span class="val green">$${player.cash.toLocaleString()}</span>
			</div>
		`;
	}

	document.getElementById('victory-modal').classList.add('open');
	launchVictoryConfetti();
}

function endTurn() {
	const current = gameState.players[gameState.currentPlayerIndex];
	if (checkVictoryCondition(current)) return;

	gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
	gameState.isRolling = false;
	updateActivePlayerHUD();
}

// ==========================================
// 12. SISTEMA DE MODAL GENÉRICO
// ==========================================

function showModal({ headerClass, icon, title, subtitle, desc, stats = [], buttons = [] }) {
	const modal = document.getElementById('card-modal');
	const header = document.getElementById('modal-header');
	const iconEl = document.getElementById('modal-icon');
	const titleEl = document.getElementById('modal-title');
	const subEl = document.getElementById('modal-subtitle');
	const descEl = document.getElementById('modal-desc');
	const statsEl = document.getElementById('modal-stats');
	const footerEl = document.getElementById('modal-footer');

	if (!modal) return;

	header.className = `card-header-cf ${headerClass || 'opportunity'}`;
	iconEl.textContent = icon || 'ℹ️';
	titleEl.textContent = title;
	subEl.textContent = subtitle || '';
	descEl.innerHTML = desc;

	statsEl.innerHTML = stats.map(s => `
		<div class="card-stat-line">
			<span class="lbl">${s.label}</span>
			<span class="val ${s.color || ''}">${s.value}</span>
		</div>
	`).join('');

	footerEl.innerHTML = '';
	buttons.forEach(b => {
		const btn = document.createElement('button');
		btn.className = `cf-dialog-btn ${b.class || 'primary'}`;
		btn.textContent = b.text;
		btn.addEventListener('click', b.action);
		footerEl.appendChild(btn);
	});

	modal.classList.add('open');
}

function closeModal() {
	document.getElementById('card-modal')?.classList.remove('open');
}

function launchVictoryConfetti() {
	const canvas = document.createElement('canvas');
	canvas.style.position = 'fixed';
	canvas.style.top = '0';
	canvas.style.left = '0';
	canvas.style.width = '100vw';
	canvas.style.height = '100vh';
	canvas.style.pointerEvents = 'none';
	canvas.style.zIndex = '9999';
	document.body.appendChild(canvas);

	const ctx = canvas.getContext('2d');
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	const confetti = [];
	const colors = ['#facc15', '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#ffffff'];

	for (let i = 0; i < 150; i++) {
		confetti.push({
			x: Math.random() * canvas.width,
			y: Math.random() * -canvas.height,
			size: Math.random() * 8 + 4,
			color: colors[Math.floor(Math.random() * colors.length)],
			speed: Math.random() * 4 + 2,
			angle: Math.random() * 360,
			rotationSpeed: (Math.random() - 0.5) * 8
		});
	}

	let frames = 0;
	function animate() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		confetti.forEach(c => {
			c.y += c.speed;
			c.angle += c.rotationSpeed;
			ctx.save();
			ctx.translate(c.x, c.y);
			ctx.rotate((c.angle * Math.PI) / 180);
			ctx.fillStyle = c.color;
			ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
			ctx.restore();

			if (c.y > canvas.height) {
				c.y = -20;
				c.x = Math.random() * canvas.width;
			}
		});

		frames++;
		if (frames < 300) {
			requestAnimationFrame(animate);
		} else {
			canvas.remove();
		}
	}
	animate();
}
