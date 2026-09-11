/**
 * RatRace - Carrera de la Rata (CashFlow)
 * Edición Sweet Lab Finanzas - Versión Colombia (Pesos Colombianos COP)
 * Modo Minimalista con Perspectiva Frontal 3D (Hacia el Horizonte) y Dados Grandes Realistas
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

// Tipos de casillas oficiales CashFlow
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
	selectedDrawerPlayerIndex: 0,
	isRolling: false,
	generatedTiles: []
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
			// Silencioso
		}
	}

	roll() {
		for (let i = 0; i < 6; i++) {
			setTimeout(() => this.playTone(200 + Math.random() * 300, 0.08, 'triangle', 0.09), i * 65);
		}
	}

	step() {
		this.playTone(340, 0.05, 'sine', 0.08);
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
// 5. GENERACIÓN DE LA PISTA HACIA EL HORIZONTE
// ==========================================

function extendPerspectiveRoad(countToAdd = 25) {
	const trackContainer = document.getElementById('road-lane-track');
	if (!trackContainer) return;

	const startIdx = gameState.generatedTiles.length;

	for (let i = 0; i < countToAdd; i++) {
		const globalIndex = startIdx + i;
		const tileData = pickTileForIndex(globalIndex);
		tileData.globalIndex = globalIndex;
		gameState.generatedTiles.push(tileData);

		const tileCard = createLaneTileDOM(tileData);
		// Debido a column-reverse, appendChild lo coloca más arriba (hacia el horizonte en la perspectiva)
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

function createLaneTileDOM(tile) {
	const card = document.createElement('div');
	card.id = `lane-tile-${tile.globalIndex}`;
	card.className = `tile-lane-card ${tile.styleClass}`;

	card.innerHTML = `
		<div class="tile-header-row">
			<span class="tile-badge-num">#${tile.globalIndex + 1}</span>
			<div class="tile-pawns-slot" id="lane-pawns-${tile.globalIndex}"></div>
		</div>
		<div class="tile-body-row">
			<div class="tile-icon-bubble">${tile.icon}</div>
			<div class="tile-title-box">
				<span class="name">${tile.name}</span>
				<span class="desc">${tile.sub}</span>
			</div>
		</div>
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
		startGame();
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
			document.getElementById('floating-status-pill').classList.add('hidden');
			document.getElementById('setup-screen').classList.remove('hidden');
		}
	});

	// Drawer de Balance Financiero Completo
	document.getElementById('btn-toggle-balance')?.addEventListener('click', () => {
		openBalanceDrawer();
	});
	document.getElementById('btn-close-balance')?.addEventListener('click', () => {
		closeBalanceDrawer();
	});
	document.getElementById('balance-drawer-overlay')?.addEventListener('click', (e) => {
		if (e.target.id === 'balance-drawer-overlay') closeBalanceDrawer();
	});

	// Reglas
	document.getElementById('btn-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.add('open');
	});
	document.getElementById('btn-close-rules')?.addEventListener('click', () => {
		document.getElementById('rules-modal').classList.remove('open');
	});

	// Préstamos dentro del drawer
	document.getElementById('btn-drawer-loan')?.addEventListener('click', () => {
		closeBalanceDrawer();
		showLoanModal();
	});
	document.getElementById('btn-drawer-pay-debt')?.addEventListener('click', () => {
		closeBalanceDrawer();
		showPayDebtModal();
	});

	// Victoria
	document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
		document.getElementById('victory-modal').classList.remove('open');
		startGame();
	});
	document.getElementById('btn-victory-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});
}

function openBalanceDrawer() {
	gameState.selectedDrawerPlayerIndex = gameState.currentPlayerIndex;
	renderDrawerPlayerTabs();
	updateDrawerFinancials(gameState.selectedDrawerPlayerIndex);
	document.getElementById('balance-drawer-overlay')?.classList.add('open');
}

function closeBalanceDrawer() {
	document.getElementById('balance-drawer-overlay')?.classList.remove('open');
}

// ==========================================
// 7. INICIO DE PARTIDA
// ==========================================

function startGame() {
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
	gameState.isRolling = false;
	gameState.generatedTiles = [];

	const trackContainer = document.getElementById('road-lane-track');
	if (trackContainer) trackContainer.innerHTML = '';

	// Generar las primeras 25 casillas
	extendPerspectiveRoad(25);

	document.getElementById('setup-screen').classList.add('hidden');
	document.getElementById('game-hud').classList.remove('hidden');
	document.getElementById('game-screen').classList.remove('hidden');
	document.getElementById('floating-status-pill').classList.remove('hidden');

	updatePawnsOnRoad();
	updateHUD();
	centerPerspectiveOnTile(0);
}

function updatePawnsOnRoad() {
	gameState.generatedTiles.forEach(tile => {
		const pawnsContainer = document.getElementById(`lane-pawns-${tile.globalIndex}`);
		if (pawnsContainer) pawnsContainer.innerHTML = '';
	});

	gameState.players.forEach(p => {
		const pawnsContainer = document.getElementById(`lane-pawns-${p.position}`);
		if (pawnsContainer) {
			const pawn = document.createElement('div');
			pawn.className = 'mini-pawn';
			pawn.style.background = p.color;
			pawn.title = p.name;
			pawn.innerHTML = p.avatar;
			pawnsContainer.appendChild(pawn);
		}
	});
}

function updateHUD() {
	const current = gameState.players[gameState.currentPlayerIndex];
	const fin = getPlayerFinancials(current);

	document.getElementById('hud-avatar').textContent = current.avatar;
	const nameEl = document.getElementById('hud-name');
	nameEl.textContent = `Turno de ${current.name}`;
	nameEl.style.color = current.color;
	document.getElementById('hud-profession').textContent = current.profession;

	document.getElementById('hud-cash-val').textContent = `${formatCOP(current.cash)} COP`;
	const cashflowEl = document.getElementById('hud-cashflow-val');
	cashflowEl.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}/mes`;
	cashflowEl.style.color = fin.monthlyCashFlow >= 0 ? '#16a34a' : '#dc2626';

	document.getElementById('hud-freedom-pct').textContent = `${fin.freedomProgress}%`;
	document.getElementById('hud-freedom-bar').style.width = `${fin.freedomProgress}%`;

	// Resaltar casilla activa
	document.querySelectorAll('.tile-lane-card').forEach(t => t.classList.remove('active-step'));
	const activeTile = document.getElementById(`lane-tile-${current.position}`);
	if (activeTile) activeTile.classList.add('active-step');

	const btnRoll = document.getElementById('btn-roll-dice');
	const pill = document.getElementById('floating-status-pill');

	if (current.skipTurns > 0) {
		btnRoll.disabled = true;
		pill.textContent = `⚠️ ${current.name} en cesantía temporal. Pierde el turno.`;
		setTimeout(() => {
			current.skipTurns--;
			endTurn();
		}, 2000);
		return;
	}

	btnRoll.disabled = false;
	btnRoll.textContent = current.hasTwoDice > 0 ? 'Lanzar 2 Dados 🎲🎲' : 'Lanzar Dado 🎲';
	const monthNum = Math.floor(current.position / 6) + 1;
	pill.textContent = `${current.name} • Casilla #${current.position + 1} (Mes ${monthNum})`;
}

/**
 * Sensación de avanzar hacia el frente/horizonte:
 * En lugar de subir el scroll de la página, desplazamos la cinta de la pista (transform translateY)
 * haciendo que la casilla activa quede justo frente al jugador abajo, y las próximas se proyecten al fondo.
 */
function centerPerspectiveOnTile(tileIndex) {
	const track = document.getElementById('road-lane-track');
	if (!track) return;
	// Cada casilla mide 110px + 16px gap = 126px
	// Como la orientación es column-reverse (inicio abajo, horizonte arriba),
	// avanzar significa desplazar el track hacia abajo para traer la nueva casilla a primer plano
	const stepHeight = 126;
	const translateY = tileIndex * stepHeight;
	track.style.transform = `rotateX(24deg) translateY(${translateY}px)`;
}

// ==========================================
// 8. DADOS GRANDES Y REALISTAS CON PUNTOS
// ==========================================

function setDiceFace(faceNumber) {
	const grid = document.getElementById('dice-pips-grid');
	if (!grid) return;
	grid.className = `dice-face-grid face-${faceNumber}`;
}

function rollDiceForward() {
	if (gameState.isRolling) return;
	const player = gameState.players[gameState.currentPlayerIndex];
	const btnRoll = document.getElementById('btn-roll-dice');
	const diceBox = document.getElementById('hud-dice-3d');
	const pill = document.getElementById('floating-status-pill');

	gameState.isRolling = true;
	btnRoll.disabled = true;
	diceBox.classList.add('rolling');
	sounds.roll();

	let rollCount = 0;
	const interval = setInterval(() => {
		const tempVal = Math.floor(Math.random() * 6) + 1;
		setDiceFace(tempVal);
		rollCount++;

		if (rollCount > 9) {
			clearInterval(interval);
			diceBox.classList.remove('rolling');

			const d1 = Math.floor(Math.random() * 6) + 1;
			let totalSteps = d1;
			setDiceFace(d1);

			if (player.hasTwoDice > 0) {
				const d2 = Math.floor(Math.random() * 6) + 1;
				totalSteps = d1 + d2;
				player.hasTwoDice--;
				pill.textContent = `¡Tiraste ${d1} + ${d2} = ${totalSteps} pasos hacia adelante!`;
			} else {
				pill.textContent = `¡Sacaste un ${d1}! Avanzando...`;
			}

			// Iniciar movimiento paso a paso
			stepForwardOnRoad(player, totalSteps);
		}
	}, 65);
}

function stepForwardOnRoad(player, totalSteps) {
	let stepsRemaining = totalSteps;
	const pill = document.getElementById('floating-status-pill');

	const stepInterval = setInterval(() => {
		player.position++;
		stepsRemaining--;

		sounds.step();

		// Cargar más casillas hacia el horizonte dinámicamente
		if (player.position >= gameState.generatedTiles.length - 8) {
			extendPerspectiveRoad(20);
		}

		updatePawnsOnRoad();

		// Resaltar casilla actual y deslizar perspectiva
		document.querySelectorAll('.tile-lane-card').forEach(t => t.classList.remove('active-step'));
		const tileEl = document.getElementById(`lane-tile-${player.position}`);
		if (tileEl) tileEl.classList.add('active-step');

		centerPerspectiveOnTile(player.position);

		const currentTileData = gameState.generatedTiles[player.position];
		pill.textContent = `${player.name} avanzando hacia el frente... (${totalSteps - stepsRemaining}/${totalSteps})`;

		// Cobro al pasar por Día de Pago
		if (currentTileData && currentTileData.type === 'payday' && stepsRemaining > 0) {
			collectPayday(player, false);
		}

		if (stepsRemaining <= 0) {
			clearInterval(stepInterval);
			gameState.isRolling = false;
			handleLanding(player, currentTileData);
		}
	}, 240);
}

// ==========================================
// 9. EVENTOS AL CAER EN CASILLA
// ==========================================

function handleLanding(player, tile) {
	const pill = document.getElementById('floating-status-pill');
	pill.textContent = `${player.name} cayó en: ${tile.name} ${tile.icon}`;

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

// 1. Día de Pago
function collectPayday(player, isLanding) {
	const fin = getPlayerFinancials(player);
	player.cash += fin.monthlyCashFlow;
	sounds.cash();
	updateHUD();

	if (isLanding) {
		showModal({
			headerClass: 'payday',
			icon: '💰',
			title: '¡DÍA DE PAGO MENSUAL!',
			subtitle: 'Has cobrado tu Flujo de Caja Neto',
			desc: `Recibes tu sueldo e ingresos pasivos menos tus gastos fijos del mes.`,
			stats: [
				{ label: 'Sueldo Fijo', value: formatCOP(player.salary) },
				{ label: 'Ingresos Pasivos', value: `+${formatCOP(fin.passiveIncome)}`, color: 'green' },
				{ label: 'Gastos Mensuales', value: `-${formatCOP(fin.totalExpenses)}`, color: 'red' },
				{ label: 'Flujo Neto Cobrado', value: `${formatCOP(fin.monthlyCashFlow)} COP`, color: 'green' },
				{ label: 'Nuevo Saldo en Efectivo', value: `${formatCOP(player.cash)} COP`, color: 'green' }
			],
			buttons: [
				{ text: 'Continuar ➔', action: () => { closeModal(); endTurn(); } }
			]
		});
	}
}

// 2. Oportunidades (Pequeño Negocio o Gran Negocio)
function showOpportunityModal(player) {
	showModal({
		headerClass: 'opportunity',
		icon: '🚀',
		title: '¡OPORTUNIDAD DE INVERSIÓN!',
		subtitle: 'Haz que el dinero trabaje para ti',
		desc: `¿Deseas ver una <strong>Oportunidad Pequeña</strong> (bajo costo) o un <strong>Gran Negocio</strong> (bienes raíces con alta plusvalía y flujo)?`,
		stats: [
			{ label: 'Tu Efectivo Disponible', value: `${formatCOP(player.cash)} COP`, color: 'green' }
		],
		buttons: [
			{
				text: 'Negocio Pequeño (hasta $4.5M)',
				class: 'primary',
				action: () => presentDeal(player, pickRandom(SMALL_DEALS))
			},
			{
				text: 'Gran Negocio (Bienes Raíces)',
				class: 'primary',
				action: () => presentDeal(player, pickRandom(BIG_DEALS))
			},
			{
				text: 'Pasar Turno',
				class: 'secondary',
				action: () => { closeModal(); endTurn(); }
			}
		]
	});
}

function presentDeal(player, deal) {
	const canAfford = player.cash >= deal.downPayment;

	const stats = [
		{ label: 'Costo Total', value: `${formatCOP(deal.cost)} COP` },
		{ label: 'Inversión / Cuota Inicial', value: `${formatCOP(deal.downPayment)} COP` },
		{ label: 'Flujo Pasivo Mensual', value: `+${formatCOP(deal.cashFlow)}/mes`, color: 'green' },
		{ label: 'Tu Efectivo Actual', value: `${formatCOP(player.cash)} COP`, color: canAfford ? 'green' : 'red' }
	];

	if (deal.roi) {
		stats.push({ label: 'Retorno Estimado (ROI)', value: deal.roi, color: 'green' });
	}

	const buttons = [];
	if (canAfford) {
		buttons.push({
			text: `Comprar Inversión (${formatCOP(deal.downPayment)})`,
			class: 'primary',
			action: () => {
				player.cash -= deal.downPayment;
				player.assets.push({ ...deal });
				sounds.cash();
				closeModal();
				updateHUD();
				showModal({
					headerClass: 'opportunity',
					icon: '🎉',
					title: '¡FELICITACIONES POR TU ACTIVO!',
					subtitle: deal.title,
					desc: `Has incorporado este activo a tu balance. A partir de ahora sumas <strong>+${formatCOP(deal.cashFlow)} COP/mes</strong> en cada Día de Pago.`,
					buttons: [
						{ text: '¡Excelente!', action: () => { closeModal(); endTurn(); } }
					]
				});
			}
		});
	} else {
		buttons.push({
			text: 'Pedir Préstamo Bancario 🏦',
			class: 'primary',
			action: () => {
				closeModal();
				showLoanModal(() => presentDeal(player, deal));
			}
		});
	}

	buttons.push({
		text: 'Rechazar Oportunidad',
		class: 'secondary',
		action: () => { closeModal(); endTurn(); }
	});

	showModal({
		headerClass: 'opportunity',
		icon: '💼',
		title: deal.title,
		subtitle: deal.category || 'Inversión',
		desc: deal.desc,
		stats: stats,
		buttons: buttons
	});
}

// 3. Caprichos (Doodads)
function showDoodadModal(player) {
	const doodad = pickRandom(DOODADS);
	player.cash -= doodad.cost;
	sounds.loss();
	updateHUD();

	showModal({
		headerClass: 'doodad',
		icon: '🛍️',
		title: '¡CAPRICHO INESPERADO!',
		subtitle: doodad.title,
		desc: `${doodad.desc}<br><br><em style="color:#64748b;">Lección: "${doodad.lesson}"</em>`,
		stats: [
			{ label: 'Gasto Ocurrido', value: `-${formatCOP(doodad.cost)} COP`, color: 'red' },
			{ label: 'Efectivo Restante', value: `${formatCOP(player.cash)} COP`, color: player.cash >= 0 ? 'green' : 'red' }
		],
		buttons: [
			{ text: 'Aceptar y Aprender', action: () => { closeModal(); endTurn(); } }
		]
	});
}

// 4. El Mercado
function showMarketModal(player) {
	const event = pickRandom(MARKET_EVENTS);

	if (!event.appliesTo) {
		showModal({
			headerClass: 'market',
			icon: '📈',
			title: event.title,
			subtitle: 'El Mercado',
			desc: event.desc,
			buttons: [
				{ text: 'Continuar', action: () => { closeModal(); endTurn(); } }
			]
		});
		return;
	}

	const eligibleIndex = player.assets.findIndex(a => {
		if (event.appliesTo === 'apartaestudio' && a.propertyType === 'apartaestudio') return true;
		if (event.appliesTo === 'condo_playa' && a.propertyType === 'condo_playa') return true;
		if (event.appliesTo === 'stock_SWT' && a.ticker === 'SWT') return true;
		if (event.appliesTo === 'precious_metal' && a.type === 'precious_metal') return true;
		return false;
	});

	if (eligibleIndex === -1) {
		showModal({
			headerClass: 'market',
			icon: '📈',
			title: event.title,
			subtitle: 'Oportunidad de Mercado',
			desc: `${event.desc}<br><br><em>No tienes este activo en este momento. ¡Asegúrate de invertir en las casillas verdes para vender cuando haya auge!</em>`,
			buttons: [
				{ text: 'Entendido', action: () => { closeModal(); endTurn(); } }
			]
		});
		return;
	}

	const asset = player.assets[eligibleIndex];
	showModal({
		headerClass: 'market',
		icon: '💰',
		title: event.title,
		subtitle: `¡Tienes un comprador para: ${asset.title}!`,
		desc: `${event.desc}<br><br>¿Deseas vender tu activo hoy y capitalizar tus ganancias?`,
		stats: [
			{ label: 'Precio de Venta Ofrecido', value: `${formatCOP(event.salePrice)} COP`, color: 'green' },
			{ label: 'Ganancia Neta en Efectivo', value: `+${formatCOP(event.netGain)} COP`, color: 'green' }
		],
		buttons: [
			{
				text: '¡Vender y Cobrar Plusvalía!',
				class: 'primary',
				action: () => {
					player.assets.splice(eligibleIndex, 1);
					player.cash += event.salePrice;
					sounds.cash();
					closeModal();
					updateHUD();
					showModal({
						headerClass: 'market',
						icon: '🎉',
						title: '¡VENTA EXITOSA!',
						subtitle: `Ganancia: +${formatCOP(event.netGain)} COP`,
						desc: `Has liquidado tu inversión. Tienes una gran suma en efectivo para adquirir negocios mayores.`,
						buttons: [{ text: 'Continuar', action: () => { closeModal(); endTurn(); } }]
					});
				}
			},
			{
				text: 'Conservar el Activo',
				class: 'secondary',
				action: () => { closeModal(); endTurn(); }
			}
		]
	});
}

// 5. Caridad
function showCharityModal(player) {
	const donation = Math.round(player.salary * 0.1);
	const canAfford = player.cash >= donation;

	showModal({
		headerClass: 'charity',
		icon: '🎁',
		title: '¡CARIDAD Y GENEROSIDAD!',
		subtitle: 'La Ley de la Siembra y la Cosecha',
		desc: `Puedes donar el <strong>10% de tu sueldo mensual (${formatCOP(donation)} COP)</strong> a una causa comunitaria.<br><br>Recompensa: Podrás tirar con <strong>2 dados en tus próximos 3 turnos</strong> para avanzar al doble de velocidad.`,
		stats: [
			{ label: 'Donación Requerida', value: `${formatCOP(donation)} COP` },
			{ label: 'Tu Efectivo', value: `${formatCOP(player.cash)} COP` }
		],
		buttons: [
			{
				text: `Donar ${formatCOP(donation)} (2 Dados x 3 Turnos)`,
				class: 'primary',
				action: () => {
					if (!canAfford) {
						alert('No tienes suficiente efectivo para donar en este momento.');
						return;
					}
					player.cash -= donation;
					player.hasTwoDice = 3;
					sounds.cash();
					closeModal();
					updateHUD();
					endTurn();
				}
			},
			{
				text: 'No donar esta vez',
				class: 'secondary',
				action: () => { closeModal(); endTurn(); }
			}
		]
	});
}

// 6. Despido / Crisis
function showCrisisModal(player) {
	const cost = player.fixedExpenses;
	player.cash -= cost;
	player.skipTurns = 1;
	sounds.loss();
	updateHUD();

	showModal({
		headerClass: 'crisis',
		icon: '🚨',
		title: '¡DESPIDO / CESANTÍA!',
		subtitle: 'Pérdida Temporal de Turno',
		desc: `La empresa pasa por una reestructuración. Cubres tus gastos fijos del mes (${formatCOP(cost)} COP) con tus ahorros y pierdes tu próximo turno buscando nuevas oportunidades.`,
		stats: [
			{ label: 'Gastos Cubiertos', value: `-${formatCOP(cost)} COP`, color: 'red' },
			{ label: 'Efectivo Restante', value: `${formatCOP(player.cash)} COP`, color: player.cash >= 0 ? 'green' : 'red' }
		],
		buttons: [
			{ text: 'Afrontar la Situación', action: () => { closeModal(); endTurn(); } }
		]
	});
}

// ==========================================
// 10. PRÉSTAMOS Y DEUDAS BANCARIAS
// ==========================================

function showLoanModal(callbackAfterLoan) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const loanBlock = 1000000;
	const interest = loanBlock * 0.03; // 3% mensual ($30.000)

	showModal({
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'BANCO SWEET LAB',
		subtitle: 'Solicitud de Crédito de Inversión',
		desc: `Pide préstamos en múltiplos de <strong>$1.000.000 COP</strong> con una tasa preferencial del 3% mensual ($30.000 COP/mes de intereses que se suman a tus gastos fijos).`,
		stats: [
			{ label: 'Préstamo Disponible', value: '+$1.000.000 COP', color: 'green' },
			{ label: 'Interés Mensual', value: '+$30.000 COP/mes', color: 'red' },
			{ label: 'Tu Deuda Actual', value: formatCOP(player.totalDebt) }
		],
		buttons: [
			{
				text: 'Pedir $1.000.000 COP',
				class: 'primary',
				action: () => {
					player.cash += loanBlock;
					player.totalDebt += loanBlock;
					player.debtExpenses += interest;
					sounds.cash();
					closeModal();
					updateHUD();
					if (callbackAfterLoan) callbackAfterLoan();
					else endTurn();
				}
			},
			{
				text: 'Pedir $5.000.000 COP',
				class: 'primary',
				action: () => {
					const block5 = loanBlock * 5;
					player.cash += block5;
					player.totalDebt += block5;
					player.debtExpenses += (interest * 5);
					sounds.cash();
					closeModal();
					updateHUD();
					if (callbackAfterLoan) callbackAfterLoan();
					else endTurn();
				}
			},
			{
				text: 'Cancelar',
				class: 'secondary',
				action: () => { closeModal(); if (!callbackAfterLoan) endTurn(); }
			}
		]
	});
}

function showPayDebtModal() {
	const player = gameState.players[gameState.currentPlayerIndex];
	if (player.totalDebt <= 0) {
		alert('¡No tienes deudas bancarias activas!');
		return;
	}

	const payAmount = Math.min(player.totalDebt, 1000000);
	const canAfford = player.cash >= payAmount;

	showModal({
		headerClass: 'opportunity',
		icon: '💳',
		title: 'AMORTIZACIÓN DE CRÉDITO',
		subtitle: 'Pagar Deudas para Bajar Gastos',
		desc: `Pagar <strong>${formatCOP(payAmount)} COP</strong> de tu crédito reducirá tus gastos fijos en $30.000 COP/mes, aumentando de inmediato tu Flujo de Caja mensual.`,
		stats: [
			{ label: 'Deuda Total', value: formatCOP(player.totalDebt) },
			{ label: 'Tu Efectivo', value: formatCOP(player.cash), color: canAfford ? 'green' : 'red' }
		],
		buttons: [
			{
				text: `Abonar ${formatCOP(payAmount)} COP`,
				class: 'primary',
				action: () => {
					if (!canAfford) {
						alert('No tienes suficiente efectivo para abonar.');
						return;
					}
					player.cash -= payAmount;
					player.totalDebt -= payAmount;
					player.debtExpenses -= (payAmount * 0.03);
					sounds.cash();
					closeModal();
					updateHUD();
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
// 11. CÁLCULO FINANCIERO Y DRAWER DE BALANCE
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

function renderDrawerPlayerTabs() {
	const container = document.getElementById('drawer-players-tabs');
	if (!container) return;
	container.innerHTML = '';

	gameState.players.forEach((p, idx) => {
		const btn = document.createElement('button');
		btn.className = `drawer-tab ${idx === gameState.selectedDrawerPlayerIndex ? 'active' : ''}`;
		btn.innerHTML = `${p.avatar} ${p.name.split(' ')[0]}`;
		btn.addEventListener('click', () => {
			gameState.selectedDrawerPlayerIndex = idx;
			renderDrawerPlayerTabs();
			updateDrawerFinancials(idx);
		});
		container.appendChild(btn);
	});
}

function updateDrawerFinancials(playerIndex) {
	const p = gameState.players[playerIndex];
	if (!p) return;
	const fin = getPlayerFinancials(p);

	document.getElementById('drawer-freedom-pct').textContent = `${fin.freedomProgress}%`;
	document.getElementById('drawer-freedom-fill').style.width = `${fin.freedomProgress}%`;

	document.getElementById('drawer-cash-val').textContent = `${formatCOP(p.cash)} COP`;
	const cashflowEl = document.getElementById('drawer-cashflow-val');
	cashflowEl.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}`;
	cashflowEl.style.color = fin.monthlyCashFlow >= 0 ? '#15803d' : '#dc2626';

	document.getElementById('drawer-salary').textContent = formatCOP(p.salary);
	document.getElementById('drawer-passive').textContent = formatCOP(fin.passiveIncome);
	document.getElementById('drawer-fixed-exp').textContent = formatCOP(p.fixedExpenses);
	document.getElementById('drawer-debt-exp').textContent = formatCOP(p.debtExpenses);

	const assetsList = document.getElementById('drawer-assets-list');
	if (assetsList) {
		if (p.assets.length === 0) {
			assetsList.innerHTML = `<small style="color:#64748b;">No tienes activos adquiridos aún.</small>`;
		} else {
			assetsList.innerHTML = p.assets.map(a => `
				<div style="background:var(--bg-subtle); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; border:1px solid var(--border-color);">
					<div>
						<strong style="color:#2563eb;">${a.title}</strong><br>
						<small style="color:#64748b;">${a.category || 'Activo'}</small>
					</div>
					<div style="font-weight:900; color:#16a34a; font-family:'Outfit',sans-serif;">
						+${a.cashFlow ? `${formatCOP(a.cashFlow)}/mes` : '$0'}
					</div>
				</div>
			`).join('');
		}
	}
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
}

function endTurn() {
	const current = gameState.players[gameState.currentPlayerIndex];
	if (checkVictoryCondition(current)) return;

	gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
	gameState.isRolling = false;
	updateHUD();
	centerPerspectiveOnTile(gameState.players[gameState.currentPlayerIndex].position);
}

// ==========================================
// 13. MODALES DE TARJETAS
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

function pickRandom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
