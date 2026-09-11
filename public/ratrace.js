/**
 * RatRace - Carrera de la Rata (CashFlow)
 * Edición Sweet Lab Finanzas - Versión Colombia (Pesos Colombianos COP)
 * Camino Lineal Hacia Adelante (Una casilla a la vez en fila única ➔)
 * Paleta: Blanco y 1% Gris
 */

// ==========================================
// 1. UTILIDAD DE FORMATO MONEDA (COP)
// ==========================================

function formatCOP(amount) {
	const num = Math.round(Number(amount) || 0);
	return '$' + num.toLocaleString('es-CO');
}

// ==========================================
// 2. CONFIGURACIÓN Y CONSTANTES
// ==========================================

const AVATARS = [
	{ id: 'rat-blue', name: 'Quesito Veloz', emoji: '🐭', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
	{ id: 'rat-purple', name: 'Don Inversor', emoji: '🐹', color: '#9333ea', bg: 'rgba(147, 51, 234, 0.12)' },
	{ id: 'rat-amber', name: 'Ahorrador Feliz', emoji: '🐰', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
	{ id: 'rat-rose', name: 'Emprendedor Astuto', emoji: '🦊', color: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)' }
];

// Profesiones en Colombia (Base: Salario Mínimo $1.750.000 COP)
const PROFESSIONS = [
	{
		title: 'Chef de Repostería',
		salary: 2800000,
		fixedExpenses: 1800000,
		savings: 1400000,
		icon: '👨‍🍳'
	},
	{
		title: 'Profesor(a) de Colegio',
		salary: 2400000,
		fixedExpenses: 1600000,
		savings: 1200000,
		icon: '👩‍🏫'
	},
	{
		title: 'Ingeniero(a) de Software',
		salary: 4800000,
		fixedExpenses: 3100000,
		savings: 2500000,
		icon: '💻'
	},
	{
		title: 'Diseñador(a) Gráfico',
		salary: 2900000,
		fixedExpenses: 1950000,
		savings: 1300000,
		icon: '🎨'
	},
	{
		title: 'Administrador(a) de Empresas',
		salary: 3500000,
		fixedExpenses: 2300000,
		savings: 1800000,
		icon: '📊'
	},
	{
		title: 'Especialista en Ventas',
		salary: 3100000,
		fixedExpenses: 2050000,
		savings: 1500000,
		icon: '🛍️'
	}
];

// Tipos de casillas
const TILE_TYPES = {
	payday: {
		type: 'payday',
		styleClass: 'tile-color-payday',
		name: 'DÍA DE PAGO',
		icon: '💰',
		sub: '+Flujo de Caja'
	},
	opportunity: {
		type: 'opportunity',
		styleClass: 'tile-color-opportunity',
		name: 'OPORTUNIDAD',
		icon: '🚀',
		sub: 'Comprar Activos'
	},
	doodad: {
		type: 'doodad',
		styleClass: 'tile-color-doodad',
		name: 'CAPRICHO',
		icon: '🛍️',
		sub: 'Gasto Imprevisto'
	},
	market: {
		type: 'market',
		styleClass: 'tile-color-market',
		name: 'EL MERCADO',
		icon: '📈',
		sub: 'Vender con Ganancia'
	},
	charity: {
		type: 'charity',
		styleClass: 'tile-color-charity',
		name: 'CARIDAD',
		icon: '🎁',
		sub: 'Donar / 2 Dados'
	},
	crisis: {
		type: 'crisis',
		styleClass: 'tile-color-crisis',
		name: 'DESPIDO',
		icon: '🚨',
		sub: 'Pérdida de Turno'
	}
};

// Baraja de Oportunidades Pequeñas (COP)
const SMALL_DEALS = [
	{
		title: 'Máquina Expendedora Sweet Lab',
		type: 'business',
		desc: 'Instalas una máquina automática de postres y snacks en una torre corporativa con alto flujo.',
		cost: 3500000,
		downPayment: 3500000,
		cashFlow: 450000,
		roi: '154% anual',
		category: 'Negocio Automatizado'
	},
	{
		title: 'Acciones de Sweet Tech Colombia',
		type: 'stock',
		ticker: 'SWT',
		desc: 'Acciones de una empresa tecnológica colombiana a $25.000 c/u. Compras 80 acciones con dividendos.',
		cost: 2000000,
		downPayment: 2000000,
		shares: 80,
		pricePerShare: 25000,
		cashFlow: 120000,
		roi: '72% anual',
		category: 'Acciones'
	},
	{
		title: 'Tienda Online de Galletas y Postres',
		type: 'business',
		desc: 'Creas una tienda digital automatizada de regalos y tortas artesanales con mensajería.',
		cost: 2200000,
		downPayment: 2200000,
		cashFlow: 340000,
		roi: '185% anual',
		category: 'Emprendimiento Digital'
	},
	{
		title: 'CDT Digital de Alto Rendimiento',
		type: 'fund',
		desc: 'Inversión en renta fija que genera intereses mensuales asegurados.',
		cost: 4000000,
		downPayment: 4000000,
		cashFlow: 380000,
		roi: '114% anual',
		category: 'Fondo de Inversión'
	},
	{
		title: 'Monedas de Oro y Joyería Fina',
		type: 'precious_metal',
		desc: 'Compras 2 monedas de oro raras a precio de ganga para venderlas en El Mercado con alta plusvalía.',
		cost: 1800000,
		downPayment: 1800000,
		cashFlow: 0,
		category: 'Coleccionable'
	},
	{
		title: 'Club de Suscriptores de Recetas Gourmet',
		type: 'business',
		desc: 'Comunidad digital de repostería donde miembros pagan suscripción mensual recurrente.',
		cost: 2500000,
		downPayment: 2500000,
		cashFlow: 390000,
		roi: '187% anual',
		category: 'Negocio Digital'
	},
	{
		title: 'Carrito Móvil de Postres y Café',
		type: 'business',
		desc: 'Puesto portátil en una plazoleta comercial operado por un colaborador.',
		cost: 4200000,
		downPayment: 4200000,
		cashFlow: 580000,
		roi: '165% anual',
		category: 'Punto de Venta'
	}
];

// Baraja de Oportunidades Grandes (COP - Bienes Raíces)
const BIG_DEALS = [
	{
		title: 'Apartaestudio para Renta',
		type: 'real_estate',
		propertyType: 'apartaestudio',
		desc: 'Apartaestudio bien ubicado en zona residencial, arrendado con contrato anual.',
		cost: 130000000,
		downPayment: 15000000,
		cashFlow: 950000,
		roi: '76% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Apartamento Turístico en Santa Marta',
		type: 'real_estate',
		propertyType: 'condo_playa',
		desc: 'Condominio cerca a la playa con administración hotelera y alta ocupación.',
		cost: 240000000,
		downPayment: 25000000,
		cashFlow: 1850000,
		roi: '88% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Local Comercial en Plaza Central',
		type: 'real_estate',
		propertyType: 'commercial',
		desc: 'Local de alta visibilidad alquilado a una cadena de servicios financieros.',
		cost: 350000000,
		downPayment: 35000000,
		cashFlow: 2700000,
		roi: '92% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Casa con 3 Apartamentos Multifamiliar',
		type: 'real_estate',
		propertyType: 'multifamiliar',
		desc: 'Inmueble de 3 niveles con 3 viviendas que generan 3 arriendos mensuales simultáneos.',
		cost: 480000000,
		downPayment: 48000000,
		cashFlow: 3900000,
		roi: '97% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Franquicia Express Sweet Lab',
		type: 'business',
		desc: 'Punto de venta franquiciado con empleados en centro comercial con alto flujo de clientes.',
		cost: 150000000,
		downPayment: 18000000,
		cashFlow: 1650000,
		roi: '110% anual',
		category: 'Franquicia'
	}
];

// Baraja de Caprichos (Doodads / Cosas - COP)
const DOODADS = [
	{
		title: 'Último Smartphone de Gama Alta',
		desc: 'Compraste el teléfono de última generación para estrenar con tus amigos.',
		cost: 3800000,
		lesson: '¿Era una necesidad o un deseo? Gastar en pasivos antes de tener activos retrasa tu libertad.'
	},
	{
		title: 'Cena Gourmet y Rumba de Cumpleaños',
		desc: 'Invitaste a cenar a tus amigos en un restaurante elegante sin presupuestarlo.',
		cost: 450000,
		lesson: 'Disfrutar la vida es genial, pero tener un presupuesto asignado para ocio evita sobresaltos.'
	},
	{
		title: 'Reparación Imprevista del Carro o Moto',
		desc: 'Falla mecánica imprevista en frenos y suspensión que debiste arreglar de urgencia.',
		cost: 750000,
		lesson: '¡Para esto sirve el Fondo de Emergencia! Evita endeudarte ante imprevistos del día a día.'
	},
	{
		title: 'Televisor Gigante 4K en Oferta',
		desc: 'Una pantalla gigante de 75 pulgadas comprada en jornada de descuentos.',
		cost: 1950000,
		lesson: 'Un televisor es un pasivo: saca dinero de tu bolsillo y se deprecia con los meses.'
	},
	{
		title: 'Compras por Impulso en el Centro Comercial',
		desc: 'Ropa de marca, tenis y accesorios comprados sin planificar.',
		cost: 650000,
		lesson: 'Los gastos hormiga y compras impulsivas reducen tu capacidad de crear capital de inversión.'
	},
	{
		title: 'Suscripciones y Domicilios Acumulados',
		desc: 'Plataformas de streaming, apps y domicilios frecuentes que olvidaste cancelar.',
		cost: 280000,
		lesson: 'Revisar periódicamente tus gastos fijos elimina fugas silenciosas de dinero.'
	}
];

// Baraja de Mercado (The Market - COP)
const MARKET_EVENTS = [
	{
		title: '¡Auge en Bienes Raíces!',
		desc: 'Un fondo de inversión busca apartaestudios en la ciudad. Ofrecen pagar $200.000.000 COP por cada uno. Quien tenga uno puede venderlo hoy y ganar $70.000.000 COP netos de plusvalía.',
		appliesTo: 'apartaestudio',
		salePrice: 200000000,
		netGain: 70000000,
		actionText: 'Vender Apartaestudio con Ganancia de +$70.000.000'
	},
	{
		title: '¡Boom Tecnológico: Sweet Tech!',
		desc: 'Sweet Tech anuncia utilidades récord en Colombia. Sus acciones suben a $65.000 COP c/u (adquiridas a $25.000). Quien tenga acciones puede liquidarlas con ganancia de +$3.200.000 COP.',
		appliesTo: 'stock_SWT',
		newPrice: 65000,
		netGain: 3200000,
		actionText: 'Vender Acciones a $65.000 c/u (Ganancia: +$3.200.000)'
	},
	{
		title: 'Comprador para Apartamento en la Playa',
		desc: 'Una cadena hotelera compra condominios turísticos pagando una plusvalía neta de $60.000.000 COP al propietario.',
		appliesTo: 'condo_playa',
		salePrice: 300000000,
		netGain: 60000000,
		actionText: 'Vender Apartamento Turístico (Ganancia: +$60.000.000)'
	},
	{
		title: 'Subasta de Oro y Joyería Fina',
		desc: 'Compradores pagan $4.500.000 COP por lote de monedas de oro (adquiridas a $1.800.000).',
		appliesTo: 'precious_metal',
		salePrice: 4500000,
		netGain: 2700000,
		actionText: 'Vender Oro por $4.500.000 (Ganancia: +$2.700.000)'
	},
	{
		title: 'Mercado Estable y Seguro',
		desc: 'La economía se mantiene equilibrada este mes. Excelente momento para acumular ahorros y preparar tu siguiente inversión.',
		appliesTo: null
	}
];

// ==========================================
// 3. ESTADO GLOBAL DEL JUEGO
// ==========================================

const gameState = {
	players: [],
	currentPlayerIndex: 0,
	selectedTabPlayerIndex: 0,
	isRolling: false,
	generatedTiles: [] // Camino lineal horizontal hacia adelante
};

// ==========================================
// 4. EFECTOS DE SONIDO SINTETIZADOS
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
			// Ignorar
		}
	}

	roll() {
		for (let i = 0; i < 5; i++) {
			setTimeout(() => this.playTone(220 + Math.random() * 260, 0.08, 'triangle', 0.08), i * 70);
		}
	}

	step() {
		this.playTone(340, 0.06, 'sine', 0.08);
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
// 5. GENERADOR DEL CAMINO HACIA ADELANTE (FILA ÚNICA HORIZONTAL)
// ==========================================

/**
 * Añade casillas en una sola línea horizontal hacia adelante (de izquierda a derecha ➔).
 * Menos ancha (160px), una exactamente delante de la otra.
 */
function extendForwardRoad(tilesCountToAdd = 25) {
	const trackContainer = document.getElementById('horizontal-track');
	if (!trackContainer) return;

	const startIdx = gameState.generatedTiles.length;

	for (let i = 0; i < tilesCountToAdd; i++) {
		const globalIndex = startIdx + i;
		const tileData = pickTileForIndex(globalIndex);
		tileData.globalIndex = globalIndex;
		gameState.generatedTiles.push(tileData);

		// Si es múltiplo de 6 (y no es el inicio), agregar un hito de mes
		if (globalIndex > 0 && globalIndex % 6 === 0) {
			const monthNum = Math.floor(globalIndex / 6) + 1;
			const milestone = document.createElement('div');
			milestone.className = 'road-month-milestone';
			milestone.innerHTML = `
				<div class="icon">🏁</div>
				<div class="title">MES ${monthNum}</div>
				<div class="sub">Tramo Financiero</div>
			`;
			trackContainer.appendChild(milestone);

			const milestoneArrow = document.createElement('div');
			milestoneArrow.className = 'forward-arrow-connector';
			milestoneArrow.innerHTML = '➔';
			trackContainer.appendChild(milestoneArrow);
		} else if (globalIndex > 0) {
			// Flecha hacia adelante entre casillas (➔)
			const arrow = document.createElement('div');
			arrow.className = 'forward-arrow-connector';
			arrow.innerHTML = '➔';
			trackContainer.appendChild(arrow);
		}

		// La casilla individual compacta (160px de ancho)
		const tileCard = createForwardTileDOM(tileData);
		trackContainer.appendChild(tileCard);
	}
}

function pickTileForIndex(index) {
	if (index === 0) {
		return { ...TILE_TYPES.payday, id: index, name: 'SALIDA • DÍA DE PAGO' };
	}

	if (index % 6 === 0) {
		return { ...TILE_TYPES.payday, id: index };
	}

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

function createForwardTileDOM(tile) {
	const card = document.createElement('div');
	card.id = `road-tile-${tile.globalIndex}`;
	card.className = `road-tile-card ${tile.styleClass}`;

	card.innerHTML = `
		<div class="road-tile-badge">#${tile.globalIndex + 1}</div>
		<div class="road-tile-icon">${tile.icon}</div>
		<div class="road-tile-texts">
			<div class="road-tile-title">${tile.name}</div>
			<div class="road-tile-sub">${tile.sub}</div>
		</div>
		<div class="road-tile-pawns" id="road-pawns-${tile.globalIndex}"></div>
	`;

	return card;
}

// ==========================================
// 6. INICIALIZACIÓN Y EVENT LISTENERS
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
	document.querySelectorAll('.setup-count-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			document.querySelectorAll('.setup-count-btn').forEach(b => b.classList.remove('active'));
			e.target.classList.add('active');
			const count = parseInt(e.target.dataset.count, 10);
			setupPlayerInputs(count);
		});
	});

	document.getElementById('btn-start-play')?.addEventListener('click', () => {
		sounds.init();
		startForwardGame();
	});

	document.getElementById('btn-roll-dice')?.addEventListener('click', () => {
		sounds.init();
		rollDiceForward();
	});

	document.getElementById('btn-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});

	document.getElementById('btn-new-game')?.addEventListener('click', () => {
		if (confirm('¿Deseas reiniciar la partida y volver a la configuración?')) {
			document.getElementById('game-hud').classList.add('hidden');
			document.getElementById('game-screen').classList.add('hidden');
			document.getElementById('setup-screen').classList.remove('hidden');
		}
	});

	document.getElementById('btn-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.add('open');
	});
	document.getElementById('btn-close-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.remove('open');
	});

	document.getElementById('btn-request-loan')?.addEventListener('click', () => {
		showLoanModal();
	});

	document.getElementById('btn-pay-debt')?.addEventListener('click', () => {
		showPayDebtModal();
	});

	document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
		document.getElementById('victory-modal').classList.remove('open');
		startForwardGame();
	});
	document.getElementById('btn-victory-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});
}

// ==========================================
// 7. INICIO DE PARTIDA HACIA ADELANTE
// ==========================================

function startForwardGame() {
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
			position: 0,
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

	const trackContainer = document.getElementById('horizontal-track');
	if (trackContainer) trackContainer.innerHTML = '';

	// Generar las primeras 30 casillas lineales hacia adelante
	extendForwardRoad(30);

	document.getElementById('setup-screen').classList.add('hidden');
	document.getElementById('game-hud').classList.remove('hidden');
	document.getElementById('game-screen').classList.remove('hidden');

	renderPlayerTabs();
	updatePawnsOnForwardRoad();
	updateActivePlayerHUD();
	updateFinancialSheet(gameState.selectedTabPlayerIndex);

	scrollToTileHorizontally(0);
}

function renderPlayerTabs() {
	const container = document.getElementById('cf-player-tabs');
	if (!container) return;
	container.innerHTML = '';

	gameState.players.forEach((p, idx) => {
		const tab = document.createElement('div');
		tab.className = `cf-tab ${idx === gameState.selectedTabPlayerIndex ? 'active' : ''} ${idx === gameState.currentPlayerIndex ? 'is-turn' : ''}`;
		tab.id = `cf-tab-${idx}`;
		tab.style.borderLeft = `4px solid ${p.color}`;
		tab.innerHTML = `
			<span style="font-size: 1.25rem;">${p.avatar}</span>
			<span>${p.name.split(' ')[0]}</span>
		`;

		tab.addEventListener('click', () => {
			gameState.selectedTabPlayerIndex = idx;
			document.querySelectorAll('.cf-tab').forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			updateFinancialSheet(idx);
			scrollToTileHorizontally(p.position);
		});

		container.appendChild(tab);
	});
}

function updatePawnsOnForwardRoad() {
	gameState.generatedTiles.forEach(tile => {
		const pawnsContainer = document.getElementById(`road-pawns-${tile.globalIndex}`);
		if (pawnsContainer) pawnsContainer.innerHTML = '';
	});

	gameState.players.forEach(p => {
		const pawnsContainer = document.getElementById(`road-pawns-${p.position}`);
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
	const progressIndicator = document.getElementById('road-progress-indicator');

	if (hudAvatar) hudAvatar.textContent = current.avatar;
	if (hudName) {
		hudName.textContent = `Turno de ${current.name}`;
		hudName.style.color = current.color;
	}
	if (hudProf) hudProf.textContent = current.profession;

	// Resaltar casilla activa
	document.querySelectorAll('.road-tile-card').forEach(t => t.classList.remove('active-step'));
	const activeTile = document.getElementById(`road-tile-${current.position}`);
	if (activeTile) activeTile.classList.add('active-step');

	document.querySelectorAll('.cf-tab').forEach((t, i) => {
		if (i === gameState.currentPlayerIndex) t.classList.add('is-turn');
		else t.classList.remove('is-turn');
	});

	if (progressIndicator) {
		const monthNum = Math.floor(current.position / 6) + 1;
		progressIndicator.textContent = `Casilla #${current.position + 1} • Mes ${monthNum}`;
	}

	if (current.skipTurns > 0) {
		btnRoll.disabled = true;
		statusLog.innerHTML = `<strong style="color:#dc2626;">⚠️ ${current.name} está en cesantía temporal y pierde este turno.</strong>`;
		setTimeout(() => {
			current.skipTurns--;
			endTurn();
		}, 2200);
		return;
	}

	btnRoll.disabled = false;
	btnRoll.textContent = current.hasTwoDice > 0 ? 'Tirar 2 Dados 🎲🎲' : 'Tirar Dado 🎲';
	statusLog.textContent = `Casilla #${current.position + 1} • ¡Lanza el dado para avanzar hacia adelante!`;

	gameState.selectedTabPlayerIndex = gameState.currentPlayerIndex;
	renderPlayerTabs();
	updateFinancialSheet(gameState.currentPlayerIndex);
}

function scrollToTileHorizontally(tileIndex) {
	const tileEl = document.getElementById(`road-tile-${tileIndex}`);
	const trackContainer = document.getElementById('horizontal-track');
	if (tileEl && trackContainer) {
		tileEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
	}
}

// ==========================================
// 8. CÁLCULO FINANCIERO Y BALANCE SHEET (COP)
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

	const sheetName = document.getElementById('sheet-name');
	const sheetProf = document.getElementById('sheet-profession');
	if (sheetName) {
		sheetName.innerHTML = `${p.avatar} ${p.name}`;
		sheetName.style.color = p.color;
	}
	if (sheetProf) sheetProf.textContent = p.profession;

	document.getElementById('sheet-cash-val').textContent = `${formatCOP(p.cash)} COP`;

	document.getElementById('freedom-percentage').textContent = `${fin.freedomProgress}%`;
	document.getElementById('freedom-fill').style.width = `${fin.freedomProgress}%`;
	document.getElementById('freedom-passive').textContent = formatCOP(fin.passiveIncome);
	document.getElementById('freedom-expenses').textContent = formatCOP(fin.totalExpenses);

	const cashflowVal = document.getElementById('sheet-cashflow-val');
	if (cashflowVal) {
		cashflowVal.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}`;
		cashflowVal.style.color = fin.monthlyCashFlow >= 0 ? '#15803d' : '#dc2626';
	}

	document.getElementById('sheet-total-income').textContent = formatCOP(fin.totalIncome);
	document.getElementById('sheet-salary').textContent = formatCOP(p.salary);
	document.getElementById('sheet-passive').textContent = formatCOP(fin.passiveIncome);

	document.getElementById('sheet-total-expenses').textContent = formatCOP(fin.totalExpenses);
	document.getElementById('sheet-fixed-exp').textContent = formatCOP(p.fixedExpenses);
	document.getElementById('sheet-debt-exp').textContent = formatCOP(p.debtExpenses);

	const assetsContainer = document.getElementById('sheet-assets-list');
	if (assetsContainer) {
		if (p.assets.length === 0) {
			assetsContainer.innerHTML = `
				<div style="color:#64748b; font-size:0.75rem; text-align:center; padding:10px;">
					Aún no tienes activos. ¡Aprovecha las casillas de Oportunidad verde!
				</div>
			`;
		} else {
			assetsContainer.innerHTML = p.assets.map(a => `
				<div class="cf-asset-entry">
					<div>
						<div class="cf-asset-name">${a.title}</div>
						<small style="color:#64748b; font-size:0.65rem;">${a.category || 'Activo'}</small>
					</div>
					<div class="cf-asset-gain">+${a.cashFlow ? `${formatCOP(a.cashFlow)}/mes` : '$0'}</div>
				</div>
			`).join('');
		}
	}
}

// ==========================================
// 9. MOVIMIENTO HACIA ADELANTE (SENSACIÓN REAL DE AVANCE)
// ==========================================

function rollDiceForward() {
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

			// Iniciar movimiento paso a paso hacia adelante
			stepForwardOnRoad(player, totalSteps);
		}
	}, 70);
}

function getDiceSymbol(val) {
	const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
	return faces[val - 1] || '🎲';
}

function stepForwardOnRoad(player, totalSteps) {
	let stepsRemaining = totalSteps;
	const statusLog = document.getElementById('hud-status-log');

	const stepInterval = setInterval(() => {
		player.position++;
		stepsRemaining--;

		sounds.step();

		// Si se acerca al final de las casillas cargadas, añadir 20 más a la derecha
		if (player.position >= gameState.generatedTiles.length - 8) {
			extendForwardRoad(20);
		}

		updatePawnsOnForwardRoad();

		// Resaltar casilla actual y centrar cámara horizontalmente
		document.querySelectorAll('.road-tile-card').forEach(t => t.classList.remove('active-step'));
		const tileEl = document.getElementById(`road-tile-${player.position}`);
		if (tileEl) {
			tileEl.classList.add('active-step');
			scrollToTileHorizontally(player.position);
		}

		const currentTileData = gameState.generatedTiles[player.position];

		if (statusLog) {
			statusLog.innerHTML = `<strong>${player.name}</strong> avanzando hacia adelante... (Casilla #${player.position + 1}, ${totalSteps - stepsRemaining}/${totalSteps})`;
		}

		// Cobro si pasa por Día de Pago durante el trayecto
		if (currentTileData && currentTileData.type === 'payday' && stepsRemaining > 0) {
			collectPayday(player, false);
		}

		if (stepsRemaining <= 0) {
			clearInterval(stepInterval);
			gameState.isRolling = false;
			handleForwardLanding(player, currentTileData);
		}
	}, 220);
}

// ==========================================
// 10. EVENTOS DE CASILLAS
// ==========================================

function handleForwardLanding(player, tile) {
	const statusLog = document.getElementById('hud-status-log');
	statusLog.innerHTML = `<strong>${player.name}</strong> llegó a la Casilla #${player.position + 1}: <strong>${tile.name}</strong> (${tile.icon}).`;

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
			desc: `Has recibido tu Flujo de Caja Mensual:<br><strong style="font-size:1.5rem; color:#854d0e; font-family:'Outfit',sans-serif;">+${formatCOP(fin.monthlyCashFlow)} COP</strong>`,
			stats: [
				{ label: 'Ingresos Totales', value: `+${formatCOP(fin.totalIncome)}`, color: 'green' },
				{ label: 'Gastos Totales', value: `-${formatCOP(fin.totalExpenses)}`, color: 'red' },
				{ label: 'Nuevo Efectivo Disponible', value: `${formatCOP(player.cash)} COP`, color: 'green' }
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
		desc: 'Elige si deseas explorar un <strong>Pequeño Negocio</strong> (enganche accesible) o un <strong>Gran Negocio</strong> (mayor capital y alto flujo pasivo en bienes raíces).',
		stats: [
			{ label: 'Tu Efectivo Disponible', value: `${formatCOP(player.cash)} COP`, color: 'green' }
		],
		buttons: [
			{
				text: '🔍 Pequeño Negocio ($1.8M - $4.5M)',
				class: 'primary',
				action: () => presentOpportunityDeal(player, SMALL_DEALS[Math.floor(Math.random() * SMALL_DEALS.length)])
			},
			{
				text: '🏢 Gran Negocio ($15M+)',
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
		{ label: 'Precio Total', value: `${formatCOP(deal.cost)} COP` },
		{ label: 'Enganche Requerido', value: `${formatCOP(cost)} COP`, color: canAfford ? 'green' : 'red' },
		{ label: 'Flujo Pasivo Mensual', value: `+${deal.cashFlow ? `${formatCOP(deal.cashFlow)}/mes` : '$0'}`, color: 'green' }
	];

	if (deal.roi) {
		stats.push({ label: 'Retorno de Inversión Anual', value: deal.roi, color: 'green' });
	}

	const buttons = [];

	if (canAfford) {
		buttons.push({
			text: `Comprar Activo (-${formatCOP(cost)})`,
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

// Modal Caprichos
function showDoodadModal(player) {
	const doodad = DOODADS[Math.floor(Math.random() * DOODADS.length)];
	sounds.loss();

	showModal({
		headerClass: 'doodad',
		icon: '🛍️',
		title: doodad.title,
		subtitle: 'Gasto Imprevisto',
		desc: `${doodad.desc}<br><br><small style="color:#be185d;">💡 <em>${doodad.lesson}</em></small>`,
		stats: [
			{ label: 'Costo del Capricho', value: `-${formatCOP(doodad.cost)} COP`, color: 'red' },
			{ label: 'Tu Efectivo Disponible', value: `${formatCOP(player.cash)} COP` }
		],
		buttons: [
			{
				text: `Pagar en Efectivo (-${formatCOP(doodad.cost)})`,
				class: 'primary',
				action: () => {
					player.cash -= doodad.cost;
					if (player.cash < 0) {
						const debtNeeded = Math.ceil(Math.abs(player.cash) / 1000000) * 1000000;
						player.totalDebt += debtNeeded;
						player.debtExpenses += (debtNeeded * 0.03);
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

// Modal Mercado
function showMarketModal(player) {
	const event = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)];
	const eligibleAssets = player.assets.filter(a => {
		if (event.appliesTo === 'apartaestudio' && a.propertyType === 'apartaestudio') return true;
		if (event.appliesTo === 'stock_SWT' && a.ticker === 'SWT') return true;
		if (event.appliesTo === 'condo_playa' && a.propertyType === 'condo_playa') return true;
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
				const gain = event.netGain || event.salePrice || 50000000;
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
		desc: 'Donar el 10% de tu sueldo a una causa comunitaria te premia con una aceleración: <strong>podrás lanzar con 2 dados durante tus siguientes 3 turnos</strong> para avanzar con mayor rapidez.',
		stats: [
			{ label: 'Donación (10% del sueldo)', value: `${formatCOP(charityCost)} COP`, color: 'red' },
			{ label: 'Beneficio', value: '2 Dados por 3 turnos 🎲🎲', color: 'green' }
		],
		buttons: [
			{
				text: canAfford ? `Donar (-${formatCOP(charityCost)})` : 'Efectivo insuficiente',
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

// Modal Despido
function showCrisisModal(player) {
	sounds.loss();
	const fin = getPlayerFinancials(player);
	const monthlyExpenses = fin.totalExpenses;

	showModal({
		headerClass: 'crisis',
		icon: '🚨',
		title: '¡Despido Temporal en el Trabajo!',
		subtitle: 'Reestructuración y emergencia',
		desc: 'Tu empresa atraviesa una reestructuración. Debes cubrir los gastos fijos del mes con tus ahorros de emergencia y pierdes tu próximo turno de tirada.<br><br>💡 <em>Lección: Contar con un fondo de reserva de 3 a 6 meses de gastos te mantiene protegido.</em>',
		stats: [
			{ label: 'Gastos a Pagar', value: `-${formatCOP(monthlyExpenses)} COP`, color: 'red' },
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
// 11. PRÉSTAMOS BANCARIOS EN COP
// ==========================================

function showLoanModal(suggestedAmount = 1000000, onComplete = null) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const roundSuggested = Math.max(1000000, Math.ceil(suggestedAmount / 1000000) * 1000000);

	showModal({
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'Préstamo Bancario (Apalancamiento)',
		subtitle: 'Crédito en Pesos Colombianos',
		desc: `El banco te presta en bloques de <strong>$1.000.000 COP</strong>. Cada $1.000.000 COP prestado genera <strong>$30.000 COP/mes de intereses</strong> (3% mensual) que se suman a tus gastos.<br><br>💡 <em>Apalancamiento positivo: Si pides crédito para comprar un inmueble que genera más renta que el pago de intereses, ¡ganas dinero con el capital del banco!</em>`,
		stats: [
			{ label: 'Monto a Solicitar', value: `${formatCOP(roundSuggested)} COP`, color: 'green' },
			{ label: 'Costo Mensual de Intereses (3%)', value: `+${formatCOP(roundSuggested * 0.03)}/mes`, color: 'red' }
		],
		buttons: [
			{
				text: `Aceptar Préstamo de ${formatCOP(roundSuggested)}`,
				class: 'primary',
				action: () => {
					player.cash += roundSuggested;
					player.totalDebt += roundSuggested;
					player.debtExpenses += (roundSuggested * 0.03);
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

	const payAmount = Math.min(player.totalDebt, 1000000);
	const canAfford = player.cash >= payAmount;

	showModal({
		headerClass: 'payday',
		icon: '💳',
		title: 'Pagar Deuda Bancaria',
		subtitle: 'Reduce tus gastos y aumenta tu flujo',
		desc: `Tienes <strong>${formatCOP(player.totalDebt)} COP</strong> en préstamos. Al liquidar un bloque de <strong>${formatCOP(payAmount)} COP</strong>, tus gastos mensuales se reducen en <strong>${formatCOP(payAmount * 0.03)}/mes</strong>.`,
		stats: [
			{ label: 'Tu Efectivo Disponible', value: `${formatCOP(player.cash)} COP` },
			{ label: 'Deuda Restante', value: `${formatCOP(player.totalDebt)} COP`, color: 'red' }
		],
		buttons: [
			{
				text: canAfford ? `Pagar ${formatCOP(payAmount)} COP` : 'Efectivo insuficiente',
				class: 'primary',
				action: () => {
					if (!canAfford) return;
					player.cash -= payAmount;
					player.totalDebt -= payAmount;
					player.debtExpenses -= (payAmount * 0.03);
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
// 12. CONDICIÓN DE VICTORIA Y CAMBIO DE TURNO
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
			Tus <strong>Ingresos Pasivos (${formatCOP(fin.passiveIncome)} COP/mes)</strong> han superado por completo tus <strong>Gastos Totales (${formatCOP(fin.totalExpenses)} COP/mes)</strong>.<br><br>
			¡Ya no dependes de un salario! Has alcanzado la <strong>Libertad Financiera</strong> y escapaste de la Carrera de la Rata.
		`;
	}

	if (summary) {
		summary.innerHTML = `
			<div class="card-stat-line">
				<span class="lbl">Ingresos Pasivos Mensuales</span>
				<span class="val green">+${formatCOP(fin.passiveIncome)} COP/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Gastos Totales Mensuales</span>
				<span class="val red">-${formatCOP(fin.totalExpenses)} COP/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Activos Construidos</span>
				<span class="val green">${player.assets.length} activos</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Efectivo en Mano</span>
				<span class="val green">${formatCOP(player.cash)} COP</span>
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
// 13. MODAL Y CONFETI
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
	const colors = ['#facc15', '#16a34a', '#2563eb', '#db2777', '#ea580c', '#0f172a'];

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
