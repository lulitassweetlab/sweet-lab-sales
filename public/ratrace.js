/**
 * RatRace - Sweet Lab Finanzas
 * Juego de mesa financiero multijugador interactivo (1 a 4 jugadores)
 * Inspirado en CashFlow de Robert Kiyosaki
 */

// ==========================================
// 1. CONSTANTES Y CONFIGURACIONES
// ==========================================

const AVATARS = [
	{ id: 'rat-blue', name: 'Quesito Veloz', emoji: '🐭', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' },
	{ id: 'rat-purple', name: 'Don Inversor', emoji: '🐹', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
	{ id: 'rat-amber', name: 'Ahorrador Feliz', emoji: '🐰', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
	{ id: 'rat-rose', name: 'Emprendedor Astuto', emoji: '🦊', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.2)' }
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

// Perímetro del tablero de 7x7 (24 casillas en sentido horario)
const BOARD_TILES = [
	// Fila Superior (0 a 6): row 1, cols 1..7
	{ id: 0, row: 1, col: 1, type: 'payday', title: 'DÍA DE PAGO', icon: '💰', desc: '¡Cobras tu Flujo de Caja mensual!' },
	{ id: 1, row: 1, col: 2, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 2, row: 1, col: 3, type: 'doodad', title: 'CAPRICHO', icon: '🛍️', desc: 'Gasto imprevisto o tentación' },
	{ id: 3, row: 1, col: 4, type: 'market', title: 'MERCADO', icon: '📈', desc: 'Ventas y fluctuaciones económicas' },
	{ id: 4, row: 1, col: 5, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 5, row: 1, col: 6, type: 'charity', title: 'DONACIÓN', icon: '🎁', desc: 'Generosidad y educación' },
	{ id: 6, row: 1, col: 7, type: 'payday', title: 'DÍA DE PAGO', icon: '💰', desc: '¡Cobras tu Flujo de Caja mensual!' },

	// Columna Derecha (7 a 11): rows 2..6, col 7
	{ id: 7, row: 2, col: 7, type: 'doodad', title: 'CAPRICHO', icon: '🛍️', desc: 'Gasto imprevisto o tentación' },
	{ id: 8, row: 3, col: 7, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 9, row: 4, col: 7, type: 'crisis', title: 'CRISIS', icon: '🚨', desc: 'Despido temporal y emergencia' },
	{ id: 10, row: 5, col: 7, type: 'market', title: 'MERCADO', icon: '📈', desc: 'Ventas y fluctuaciones económicas' },
	{ id: 11, row: 6, col: 7, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },

	// Fila Inferior (12 a 18): row 7, cols 7 down to 1
	{ id: 12, row: 7, col: 7, type: 'payday', title: 'DÍA DE PAGO', icon: '💰', desc: '¡Cobras tu Flujo de Caja mensual!' },
	{ id: 13, row: 7, col: 6, type: 'doodad', title: 'CAPRICHO', icon: '🛍️', desc: 'Gasto imprevisto o tentación' },
	{ id: 14, row: 7, col: 5, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 15, row: 7, col: 4, type: 'market', title: 'MERCADO', icon: '📈', desc: 'Ventas y fluctuaciones económicas' },
	{ id: 16, row: 7, col: 3, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 17, row: 7, col: 2, type: 'charity', title: 'DONACIÓN', icon: '🎁', desc: 'Generosidad y educación' },
	{ id: 18, row: 7, col: 1, type: 'payday', title: 'DÍA DE PAGO', icon: '💰', desc: '¡Cobras tu Flujo de Caja mensual!' },

	// Columna Izquierda (19 a 23): rows 6 down to 2, col 1
	{ id: 19, row: 6, col: 1, type: 'doodad', title: 'CAPRICHO', icon: '🛍️', desc: 'Gasto imprevisto o tentación' },
	{ id: 20, row: 5, col: 1, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' },
	{ id: 21, row: 4, col: 1, type: 'market', title: 'MERCADO', icon: '📈', desc: 'Ventas y fluctuaciones económicas' },
	{ id: 22, row: 3, col: 1, type: 'doodad', title: 'CAPRICHO', icon: '🛍️', desc: 'Gasto imprevisto o tentación' },
	{ id: 23, row: 2, col: 1, type: 'opportunity', title: 'OPORTUNIDAD', icon: '🚀', desc: 'Negocios e Inversiones' }
];

// Baraja de Oportunidades (Pequeñas y Grandes)
const SMALL_DEALS = [
	{
		title: 'Máquina Expendedora Sweet Lab',
		type: 'business',
		desc: 'Instalas una máquina expendedora automática de postres y galletas en una oficina con alta afluencia de trabajadores.',
		cost: 1200,
		downPayment: 1200,
		cashFlow: 180,
		roi: '180% anual',
		category: 'Negocio'
	},
	{
		title: 'Acciones de Sweet Tech',
		type: 'stock',
		ticker: 'SWT',
		desc: 'Acciones de una empresa de tecnología local a $20 cada una. Compras un paquete de 50 acciones.',
		cost: 1000,
		downPayment: 1000,
		shares: 50,
		pricePerShare: 20,
		cashFlow: 50, // Pequeño dividendo
		roi: '60% anual',
		category: 'Acciones'
	},
	{
		title: 'Tienda Online de Repostería Creativa',
		type: 'business',
		desc: 'Creas una tienda digital automatizada de envíos de tortas y regalos personalizados.',
		cost: 800,
		downPayment: 800,
		cashFlow: 140,
		roi: '210% anual',
		category: 'Emprendimiento'
	},
	{
		title: 'Fondo de Renta Fija Indexado',
		type: 'fund',
		desc: 'Inviertes en un fondo seguro que reparte intereses mensuales garantizados.',
		cost: 1500,
		downPayment: 1500,
		cashFlow: 170,
		roi: '136% anual',
		category: 'Inversión'
	},
	{
		title: 'Monedas de Oro de Colección',
		type: 'precious_metal',
		desc: 'Compras 2 monedas de oro raras a precio de oferta. No dan flujo mensual pero pueden venderse en Mercado al doble.',
		cost: 600,
		downPayment: 600,
		cashFlow: 0,
		category: 'Coleccionable'
	},
	{
		title: 'Canal de Recetas y Membresías',
		type: 'business',
		desc: 'Creas un club digital de suscriptores que pagan mensualidad por clases de repostería.',
		cost: 1000,
		downPayment: 1000,
		cashFlow: 160,
		roi: '192% anual',
		category: 'Negocio Digital'
	}
];

const BIG_DEALS = [
	{
		title: 'Casa de 2 Habitaciones en Renta',
		type: 'real_estate',
		propertyType: '2bed_house',
		desc: 'Una excelente casa en un buen vecindario. La alquilas a una familia responsable.',
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
		desc: 'Condominio turístico administrado por agencia que genera ingresos por rentas cortas.',
		cost: 75000,
		downPayment: 8000,
		cashFlow: 750,
		roi: '112% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Local Comercial en Plaza Central',
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
		title: 'Edificio Residencial de 4 Apartamentos',
		type: 'real_estate',
		propertyType: '4plex',
		desc: 'Propiedad multifamiliar que produce 4 rentas simultáneas cada mes.',
		cost: 160000,
		downPayment: 18000,
		cashFlow: 1750,
		roi: '116% anual',
		category: 'Bienes Raíces'
	},
	{
		title: 'Franquicia Express Sweet Lab',
		type: 'business',
		desc: 'Punto de venta franquiciado con personal capacitado operando de forma autónoma.',
		cost: 55000,
		downPayment: 6000,
		cashFlow: 650,
		roi: '130% anual',
		category: 'Franquicia'
	}
];

// Baraja de Caprichos (Doodads)
const DOODADS = [
	{
		title: 'Último Teléfono Inteligente',
		desc: 'Salió el nuevo modelo con 5 cámaras. La publicidad te convenció de comprarlo.',
		cost: 850,
		lesson: '¿Era una necesidad o un deseo? Comprar caprichos sin activos retrasa tu libertad.'
	},
	{
		title: 'Cena Gourmet de Cumpleaños',
		desc: 'Invitaste a cenar a tus amigos a un restaurante de lujo para celebrar.',
		cost: 320,
		lesson: 'Disfrutar la vida es genial, pero presupuestar tus salidas evita sorpresas.'
	},
	{
		title: 'Reparación Imprevista del Auto',
		desc: 'La batería y los frenos fallaron en camino al trabajo.',
		cost: 480,
		lesson: '¡Para esto sirve el Fondo de Emergencia! Evita pedir prestado para imprevistos.'
	},
	{
		title: 'Televisor Gigante 4K en Oferta',
		desc: 'Una súper pantalla para ver tus series favoritas los fines de semana.',
		cost: 650,
		lesson: 'Un televisor es un pasivo: saca dinero de tu bolsillo y se deprecia con el tiempo.'
	},
	{
		title: 'Compras Impulsivas en el Centro Comercial',
		desc: 'Ropa, zapatos y accesorios que realmente no necesitabas.',
		cost: 380,
		lesson: 'El gasto hormiga y las compras por impulso restan capital para tus inversiones.'
	},
	{
		title: 'Suscripciones que olvidaste cancelar',
		desc: 'Servicios de streaming, apps y gimnasio que llevas meses sin usar.',
		cost: 190,
		lesson: 'Revisa periódicamente tus gastos fijos para eliminar fugas de dinero.'
	}
];

// Baraja de Mercado
const MARKET_EVENTS = [
	{
		title: '¡Auge en Bienes Raíces!',
		desc: 'Un fondo de inversión busca casas de 2 habitaciones. Ofrece pagar $95,000 por cada una. Quien tenga una casa de 2 habitaciones puede venderla hoy.',
		appliesTo: '2bed_house',
		salePrice: 95000,
		netGain: 50000,
		actionText: 'Vender Casa por $95,000 (Ganancia neta: +$50,000)'
	},
	{
		title: 'Boom Tecnológico: Acciones Sweet Tech',
		desc: 'Sweet Tech anuncia récord de utilidades. Las acciones suben a $60 c/u (compradas a $20). Quien tenga acciones puede liquidarlas con 200% de ganancia.',
		appliesTo: 'stock_SWT',
		newPrice: 60,
		actionText: 'Vender Acciones Sweet Tech a $60 c/u'
	},
	{
		title: 'Comprador para Apartamentos en la Playa',
		desc: 'Un grupo hotelero ofrece comprar apartamentos turísticos con $35,000 de plusvalía neta al propietario.',
		appliesTo: 'condo',
		salePrice: 110000,
		netGain: 35000,
		actionText: 'Vender Apartamento Vacacional (Ganancia neta: +$35,000)'
	},
	{
		title: 'Subasta de Oro y Coleccionables',
		desc: 'Los coleccionistas buscan monedas de oro. Pagan $1,500 por lote (comprado a $600).',
		appliesTo: 'precious_metal',
		salePrice: 1500,
		netGain: 900,
		actionText: 'Vender Monedas de Oro por $1,500'
	},
	{
		title: 'Economía Estable',
		desc: 'Los mercados se mantienen tranquilos este mes. Buen momento para acumular ahorros y planear tus próximas compras.',
		appliesTo: null
	}
];

// ==========================================
// 2. ESTADO DEL JUEGO
// ==========================================

const gameState = {
	players: [],
	currentPlayerIndex: 0,
	selectedTabPlayerIndex: 0,
	isRolling: false,
	turnStep: 'awaiting_roll', // 'awaiting_roll', 'action_pending', 'turn_ended'
	roundCount: 1,
	audioEnabled: true
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
			// Ignore audio context blocks
		}
	}

	roll() {
		for (let i = 0; i < 5; i++) {
			setTimeout(() => this.playTone(200 + Math.random() * 250, 0.08, 'triangle', 0.08), i * 70);
		}
	}

	cash() {
		this.playTone(523.25, 0.1, 'sine', 0.12); // C5
		setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.12), 100); // E5
		setTimeout(() => this.playTone(783.99, 0.25, 'sine', 0.15), 200); // G5
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
// 4. INICIALIZACIÓN Y CONFIGURACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
	setupPlayerConfigInputs(2);
	renderBoardTiles();
	wireEventListeners();
});

function setupPlayerConfigInputs(count) {
	const container = document.getElementById('player-configs');
	if (!container) return;
	container.innerHTML = '';

	for (let i = 0; i < count; i++) {
		const avatar = AVATARS[i];
		const defaultNames = ['Jorge', 'Lulita', 'Mateo', 'Valeria'];
		const name = defaultNames[i] || `Jugador ${i + 1}`;

		const row = document.createElement('div');
		row.className = 'player-config-row';
		row.innerHTML = `
			<div class="player-badge" style="background: ${avatar.bg}; border: 2px solid ${avatar.color};">
				${avatar.emoji}
			</div>
			<input type="text" id="player-name-${i}" class="player-name-input" value="${name}" placeholder="Nombre del jugador ${i + 1}" maxlength="18" />
			<span style="font-size: 0.85rem; font-weight: 700; color: ${avatar.color};">${avatar.name}</span>
		`;
		container.appendChild(row);
	}
}

function wireEventListeners() {
	// Selector de cantidad de jugadores
	document.querySelectorAll('.player-count-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
			e.target.classList.add('active');
			const count = parseInt(e.target.dataset.count, 10);
			setupPlayerConfigInputs(count);
		});
	});

	// Comenzar Partida
	document.getElementById('btn-start')?.addEventListener('click', () => {
		sounds.init();
		startNewGame();
	});

	// Botón Tirar Dado
	document.getElementById('btn-roll')?.addEventListener('click', () => {
		sounds.init();
		rollDiceTurn();
	});

	// Botón Volver
	document.getElementById('btn-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});

	// Botón Nueva Partida
	document.getElementById('btn-new-game')?.addEventListener('click', () => {
		if (confirm('¿Deseas reiniciar la partida y volver a la configuración?')) {
			document.getElementById('game-screen').classList.add('hidden');
			document.getElementById('setup-screen').classList.remove('hidden');
		}
	});

	// Botón Reglas
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

	// Botones de Victoria
	document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
		document.getElementById('victory-modal').classList.remove('open');
		startNewGame();
	});
	document.getElementById('btn-victory-exit')?.addEventListener('click', () => {
		window.location.href = '/index.html';
	});
}

// ==========================================
// 5. RENDERIZADO DEL TABLERO
// ==========================================

function renderBoardTiles() {
	const grid = document.getElementById('board-grid');
	if (!grid) return;

	// Remover casillas viejas preservando el centro
	grid.querySelectorAll('.tile').forEach(t => t.remove());

	BOARD_TILES.forEach(tile => {
		const el = document.createElement('div');
		el.id = `tile-${tile.id}`;
		el.className = `tile tile-${tile.type}`;
		el.style.gridRow = tile.row;
		el.style.gridColumn = tile.col;

		el.innerHTML = `
			<span class="tile-num">${tile.id + 1}</span>
			<span class="tile-icon">${tile.icon}</span>
			<span class="tile-title">${tile.title}</span>
			<div class="tile-pawns" id="tile-pawns-${tile.id}"></div>
		`;

		grid.appendChild(el);
	});
}

// ==========================================
// 6. CREACIÓN Y GESTIÓN DE JUGADORES
// ==========================================

function startNewGame() {
	const count = parseInt(document.querySelector('.player-count-btn.active')?.dataset.count || '2', 10);
	const players = [];

	// Mezclar profesiones para asignar aleatoriamente
	const shuffledProfessions = [...PROFESSIONS].sort(() => 0.5 - Math.random());

	for (let i = 0; i < count; i++) {
		const nameInput = document.getElementById(`player-name-${i}`);
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
			hasTwoDice: 0, // Turnos restantes con 2 dados
			skipTurns: 0 // Turnos a perder por crisis
		});
	}

	gameState.players = players;
	gameState.currentPlayerIndex = 0;
	gameState.selectedTabPlayerIndex = 0;
	gameState.turnStep = 'awaiting_roll';
	gameState.roundCount = 1;

	// Cambiar a pantalla de juego
	document.getElementById('setup-screen').classList.add('hidden');
	document.getElementById('game-screen').classList.remove('hidden');

	renderPlayerTabs();
	updatePawnsOnBoard();
	updateActivePlayerUI();
	updateFinancialSheet(gameState.selectedTabPlayerIndex);
}

function renderPlayerTabs() {
	const container = document.getElementById('player-tabs');
	if (!container) return;
	container.innerHTML = '';

	gameState.players.forEach((p, idx) => {
		const tab = document.createElement('div');
		tab.className = `player-tab ${idx === gameState.selectedTabPlayerIndex ? 'active' : ''} ${idx === gameState.currentPlayerIndex ? 'is-turn' : ''}`;
		tab.id = `player-tab-${idx}`;
		tab.style.borderTop = `3px solid ${p.color}`;
		tab.innerHTML = `
			<span style="font-size: 1.1rem;">${p.avatar}</span>
			<span>${p.name.split(' ')[0]}</span>
		`;

		tab.addEventListener('click', () => {
			gameState.selectedTabPlayerIndex = idx;
			document.querySelectorAll('.player-tab').forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			updateFinancialSheet(idx);
		});

		container.appendChild(tab);
	});
}

function updatePawnsOnBoard() {
	// Limpiar todos los pawns
	BOARD_TILES.forEach(tile => {
		const el = document.getElementById(`tile-pawns-${tile.id}`);
		if (el) el.innerHTML = '';
	});

	// Añadir pawns a las casillas actuales
	gameState.players.forEach(p => {
		const pawnsContainer = document.getElementById(`tile-pawns-${p.position}`);
		if (pawnsContainer) {
			const pawn = document.createElement('div');
			pawn.className = 'pawn';
			pawn.style.background = p.color;
			pawn.style.borderColor = 'white';
			pawn.title = p.name;
			pawn.innerHTML = p.avatar;
			pawnsContainer.appendChild(pawn);
		}
	});
}

function updateActivePlayerUI() {
	const current = gameState.players[gameState.currentPlayerIndex];
	const turnAvatar = document.getElementById('turn-avatar');
	const turnName = document.getElementById('turn-name');
	const btnRoll = document.getElementById('btn-roll');
	const centerLog = document.getElementById('center-log');

	if (turnAvatar) turnAvatar.textContent = current.avatar;
	if (turnName) {
		turnName.textContent = `Turno de ${current.name}`;
		turnName.style.color = current.color;
	}

	// Resaltar casilla activa
	document.querySelectorAll('.tile').forEach(t => t.classList.remove('tile-active-highlight'));
	const currentTile = document.getElementById(`tile-${current.position}`);
	if (currentTile) currentTile.classList.add('tile-active-highlight');

	// Actualizar tabs
	document.querySelectorAll('.player-tab').forEach((t, i) => {
		if (i === gameState.currentPlayerIndex) {
			t.classList.add('is-turn');
		} else {
			t.classList.remove('is-turn');
		}
	});

	if (current.skipTurns > 0) {
		btnRoll.disabled = true;
		centerLog.innerHTML = `<span style="color:#f87171;">⚠️ ${current.name} está en crisis y pierde este turno.</span>`;
		setTimeout(() => {
			current.skipTurns--;
			endTurn();
		}, 2000);
		return;
	}

	btnRoll.disabled = false;
	btnRoll.textContent = current.hasTwoDice > 0 ? 'Tirar 2 Dados 🎲🎲' : 'Tirar Dado 🎲';
	centerLog.textContent = '¡Lanza el dado para avanzar por el tablero!';

	// Enfocar la hoja financiera del jugador actual
	gameState.selectedTabPlayerIndex = gameState.currentPlayerIndex;
	renderPlayerTabs();
	updateFinancialSheet(gameState.currentPlayerIndex);
}

// ==========================================
// 7. CÁLCULO FINANCIERO Y HOJA DE BALANCE
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
	const cashVal = document.getElementById('sheet-cash-val');
	if (cashVal) cashVal.textContent = `$${p.cash.toLocaleString()}`;

	// Progreso hacia libertad
	const freedomPerc = document.getElementById('freedom-percentage');
	const freedomFill = document.getElementById('freedom-fill');
	const freedomPassive = document.getElementById('freedom-passive');
	const freedomExpenses = document.getElementById('freedom-expenses');

	if (freedomPerc) freedomPerc.textContent = `${fin.freedomProgress}%`;
	if (freedomFill) freedomFill.style.width = `${fin.freedomProgress}%`;
	if (freedomPassive) freedomPassive.textContent = `$${fin.passiveIncome.toLocaleString()}`;
	if (freedomExpenses) freedomExpenses.textContent = `$${fin.totalExpenses.toLocaleString()}`;

	// Flujo de caja
	const cashflowVal = document.getElementById('sheet-cashflow-val');
	if (cashflowVal) {
		cashflowVal.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}$${fin.monthlyCashFlow.toLocaleString()}`;
		cashflowVal.style.color = fin.monthlyCashFlow >= 0 ? '#34d399' : '#f87171';
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
				<div style="color:#64748b; font-size:0.75rem; text-align:center; padding:10px;">
					Aún no tienes activos. ¡Aprovecha las casillas de Oportunidad!
				</div>
			`;
		} else {
			assetsContainer.innerHTML = p.assets.map(a => `
				<div class="asset-card">
					<div>
						<div class="asset-name">${a.title}</div>
						<small style="color:#94a3b8; font-size:0.65rem;">${a.category || 'Activo'}</small>
					</div>
					<div class="asset-flow">+${a.cashFlow ? `$${a.cashFlow.toLocaleString()}/mes` : '$0'}</div>
				</div>
			`).join('');
		}
	}
}

// ==========================================
// 8. MOVIMIENTO Y TIRADA DE DADOS
// ==========================================

function rollDiceTurn() {
	if (gameState.isRolling) return;
	const player = gameState.players[gameState.currentPlayerIndex];
	const btnRoll = document.getElementById('btn-roll');
	const diceDisplay = document.getElementById('dice-display');

	gameState.isRolling = true;
	btnRoll.disabled = true;
	diceDisplay.classList.add('rolling');
	sounds.roll();

	let rollsCount = 0;
	const interval = setInterval(() => {
		const tempVal = Math.floor(Math.random() * 6) + 1;
		diceDisplay.textContent = getDiceFace(tempVal);
		rollsCount++;

		if (rollsCount > 8) {
			clearInterval(interval);
			diceDisplay.classList.remove('rolling');

			// Resultado final
			const d1 = Math.floor(Math.random() * 6) + 1;
			let totalRoll = d1;

			if (player.hasTwoDice > 0) {
				const d2 = Math.floor(Math.random() * 6) + 1;
				totalRoll = d1 + d2;
				player.hasTwoDice--;
				diceDisplay.textContent = `${d1}+${d2}=${totalRoll}`;
			} else {
				diceDisplay.textContent = getDiceFace(d1);
			}

			// Mover ficha
			movePlayerSteps(player, totalRoll);
		}
	}, 70);
}

function getDiceFace(val) {
	const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
	return faces[val - 1] || '🎲';
}

function movePlayerSteps(player, steps) {
	let remaining = steps;
	const totalTiles = BOARD_TILES.length;

	const stepInterval = setInterval(() => {
		player.position = (player.position + 1) % totalTiles;
		updatePawnsOnBoard();

		// Resaltar casilla
		document.querySelectorAll('.tile').forEach(t => t.classList.remove('tile-active-highlight'));
		document.getElementById(`tile-${player.position}`)?.classList.add('tile-active-highlight');

		// ¿Pasó por Día de Pago durante el camino?
		if (BOARD_TILES[player.position].type === 'payday' && remaining > 1) {
			collectPayday(player, false);
		}

		remaining--;

		if (remaining <= 0) {
			clearInterval(stepInterval);
			gameState.isRolling = false;
			// Procesar casilla de llegada
			handleTileLanding(player, BOARD_TILES[player.position]);
		}
	}, 140);
}

// ==========================================
// 9. EVENTOS DE LAS CASILLAS
// ==========================================

function handleTileLanding(player, tile) {
	const centerLog = document.getElementById('center-log');
	centerLog.innerHTML = `<strong>${player.name}</strong> cayó en <strong>${tile.title}</strong> (${tile.icon}).`;

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
function collectPayday(player, showNotification = true) {
	const fin = getPlayerFinancials(player);
	player.cash += fin.monthlyCashFlow;
	sounds.cash();
	updateFinancialSheet(gameState.currentPlayerIndex);

	if (showNotification) {
		showModal({
			headerClass: 'payday',
			icon: '💰',
			title: '¡DÍA DE PAGO!',
			subtitle: 'Tu flujo de caja mensual ha ingresado',
			desc: `Has recibido tu Flujo de Caja Mensual:<br><strong style="font-size:1.3rem; color:#34d399;">+$${fin.monthlyCashFlow.toLocaleString()}</strong>`,
			stats: [
				{ label: 'Ingresos Totales', value: `+$${fin.totalIncome.toLocaleString()}`, color: 'green' },
				{ label: 'Gastos Totales', value: `-$${fin.totalExpenses.toLocaleString()}`, color: 'red' },
				{ label: 'Nuevo Saldo en Efectivo', value: `$${player.cash.toLocaleString()}`, color: 'green' }
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
		subtitle: '¿Qué tipo de negocio deseas explorar?',
		desc: 'Elige si quieres ver un <strong>Pequeño Negocio</strong> (bajo costo de entrada) o un <strong>Gran Negocio</strong> (mayor rendimiento y más capital requerido).',
		stats: [
			{ label: 'Tu Efectivo Disponible', value: `$${player.cash.toLocaleString()}`, color: 'green' }
		],
		buttons: [
			{
				text: '🔍 Pequeño Negocio ($500 - $2,000)',
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
		subtitle: 'Gasto imprevisto',
		desc: `${doodad.desc}<br><br><small style="color:#fca5a5;">💡 <em>${doodad.lesson}</em></small>`,
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
						// Endeudamiento automático si no alcanza
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

// Modal Mercado (Market)
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
			text: `¡Vender Activo con Ganancia!`,
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

// Modal Donación / Educación
function showCharityModal(player) {
	const charityCost = Math.round(player.salary * 0.1);
	const canAfford = player.cash >= charityCost;

	showModal({
		headerClass: 'charity',
		icon: '🎁',
		title: 'Donación y Educación Financiera',
		subtitle: 'Sé generoso e invierte en tu mente',
		desc: 'Donar el 10% de tu sueldo a una causa noble o pagar un taller de finanzas te llena de energía: <strong>podrás lanzar con 2 dados durante tus siguientes 3 turnos</strong> para moverte más rápido por el tablero.',
		stats: [
			{ label: 'Costo (10% de tu sueldo)', value: `$${charityCost.toLocaleString()}`, color: 'red' },
			{ label: 'Beneficio', value: '2 Dados por 3 turnos 🎲🎲', color: 'green' }
		],
		buttons: [
			{
				text: canAfford ? `Donar / Capacitarme (-$${charityCost.toLocaleString()})` : 'Efectivo insuficiente',
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

// Modal Crisis / Despido
function showCrisisModal(player) {
	sounds.loss();
	const fin = getPlayerFinancials(player);
	const monthlyExpenses = fin.totalExpenses;

	showModal({
		headerClass: 'crisis',
		icon: '🚨',
		title: '¡Crisis Temporal en el Trabajo!',
		subtitle: 'Recorte de personal y emergencia',
		desc: 'Tu empresa atraviesa una reestructuración. Debes pagar los gastos fijos del mes con tus ahorros de emergencia y pierdes tu próximo turno buscando nuevas fuentes de ingreso.<br><br>💡 <em>Lección: Tener 3 a 6 meses de gastos en ahorros te protege de cualquier crisis.</em>',
		stats: [
			{ label: 'Gastos a Pagar', value: `-$${monthlyExpenses.toLocaleString()}`, color: 'red' },
			{ label: 'Penalización', value: 'Pierdes 1 turno', color: 'red' }
		],
		buttons: [
			{
				text: 'Pagar Gastos y Afrontar Crisis',
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
// 10. PRÉSTAMOS Y GESTIÓN DE DEUDAS
// ==========================================

function showLoanModal(suggestedAmount = 1000, onComplete = null) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const roundSuggested = Math.ceil(suggestedAmount / 1000) * 1000;

	showModal({
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'Préstamo Bancario',
		subtitle: 'Apalancamiento Financiero',
		desc: 'El banco te presta dinero en bloques de <strong>$1,000</strong>. Cada $1,000 prestados añade <strong>$100/mes de gasto en intereses</strong> (10% mensual).<br><br>💡 <em>La "deuda buena" es la que usas para comprar activos que producen más dinero del que pagas en intereses.</em>',
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
		desc: `Tienes <strong>$${player.totalDebt.toLocaleString()}</strong> en deudas. Al pagar un bloque de <strong>$${payAmount.toLocaleString()}</strong>, reduces tus gastos mensuales en <strong>$100/mes</strong>.`,
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
// 11. CONDICIÓN DE VICTORIA Y FIN DE TURNO
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
			¡Enhorabuena, <strong>${player.name}</strong>! 🎉<br>
			Tus <strong>Ingresos Pasivos ($${fin.passiveIncome.toLocaleString()})</strong> han superado por completo tus <strong>Gastos Totales ($${fin.totalExpenses.toLocaleString()})</strong>.<br><br>
			Ya no dependes de un sueldo fijo. ¡Has alcanzado la <strong>Libertad Financiera</strong> y has escapado de la Carrera de la Rata!
		`;
	}

	if (summary) {
		summary.innerHTML = `
			<div class="card-stat-row">
				<span class="stat-label">Ingresos Pasivos Mensuales</span>
				<span class="stat-value green">+$${fin.passiveIncome.toLocaleString()}/mes</span>
			</div>
			<div class="card-stat-row">
				<span class="stat-label">Gastos Totales Mensuales</span>
				<span class="stat-value red">-$${fin.totalExpenses.toLocaleString()}/mes</span>
			</div>
			<div class="card-stat-row">
				<span class="stat-label">Activos Construidos</span>
				<span class="stat-value green">${player.assets.length} inversiones</span>
			</div>
			<div class="card-stat-row">
				<span class="stat-label">Efectivo Acumulado</span>
				<span class="stat-value green">$${player.cash.toLocaleString()}</span>
			</div>
		`;
	}

	document.getElementById('victory-modal').classList.add('open');
	launchVictoryConfetti();
}

function endTurn() {
	// Verificar victoria antes de cambiar
	const current = gameState.players[gameState.currentPlayerIndex];
	if (checkVictoryCondition(current)) return;

	// Pasar al siguiente jugador
	gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
	if (gameState.currentPlayerIndex === 0) {
		gameState.roundCount++;
	}

	gameState.isRolling = false;
	updateActivePlayerUI();
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

	header.className = `card-header ${headerClass || 'opportunity'}`;
	iconEl.textContent = icon || 'ℹ️';
	titleEl.textContent = title;
	subEl.textContent = subtitle || '';
	descEl.innerHTML = desc;

	statsEl.innerHTML = stats.map(s => `
		<div class="card-stat-row">
			<span class="stat-label">${s.label}</span>
			<span class="stat-value ${s.color || ''}">${s.value}</span>
		</div>
	`).join('');

	footerEl.innerHTML = '';
	buttons.forEach(b => {
		const btn = document.createElement('button');
		btn.className = `card-btn ${b.class || 'primary'}`;
		btn.textContent = b.text;
		btn.addEventListener('click', b.action);
		footerEl.appendChild(btn);
	});

	modal.classList.add('open');
}

function closeModal() {
	document.getElementById('card-modal')?.classList.remove('open');
}

// Micro-confeti con Canvas puro integrado
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
	const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff'];

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
