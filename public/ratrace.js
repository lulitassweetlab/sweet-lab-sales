/**
 * RatRace - Carrera de la Rata (CashFlow)
 * Edición Sweet Lab Finanzas - Versión Colombia (Pesos Colombianos COP)
 * - 2 Dados Grandes 3D simultáneos
 * - Fichas con nombre en la mitad, bien visible, sin '#'
 * - Exploración hacia adelante/atrás sin mover la ficha (Botones ▲ / 🎯 / ▼)
 * - Modo 2 jugadores en paralelo (caminos idénticos lado a lado)
 * - Datos de efectivo y flujo mensual ubicados justo arriba de cada camino
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

// 12 Empleos básicos de inicio seleccionados por el usuario
const STARTER_JOBS = [
	{ id: 1, title: 'Cocinero 👨‍🍳', salary: 400000, icon: '👨‍🍳', desc: 'Preparas platos deliciosos y coordinas la cocina con gran sazón.' },
	{ id: 2, title: 'Tendero 🏪', salary: 380000, icon: '🏪', desc: 'Atiendes a los clientes de tu barrio y mantienes la tienda surtida.' },
	{ id: 3, title: 'Auxiliar Veterinario 🐾', salary: 420000, icon: '🐾', desc: 'Cuidas y asistes en la atención médica de perritos y gatos.' },
	{ id: 4, title: 'Domiciliario 🛵', salary: 390000, icon: '🛵', desc: 'Entregas pedidos y paquetes de manera ágil por toda la zona.' },
	{ id: 5, title: 'Recreacionista 🎈', salary: 410000, icon: '🎈', desc: 'Organizas dinámicas, juegos y figuras con globos en fiestas.' },
	{ id: 6, title: 'Jardinero 🌱', salary: 380000, icon: '🌱', desc: 'Siembras flores, podas prados y cuidas zonas verdes hermosas.' },
	{ id: 7, title: 'Constructor 🔨', salary: 430000, icon: '🔨', desc: 'Ayudas en obras, mampostería y acabados de edificaciones.' },
	{ id: 8, title: 'Vendedor 🏷️', salary: 390000, icon: '🏷️', desc: 'Asesoras a clientes para elegir los mejores productos en el local.' },
	{ id: 9, title: 'Fotógrafo 📸', salary: 440000, icon: '📸', desc: 'Tomas fotografías en eventos sociales y sesiones de retratos.' },
	{ id: 10, title: 'Lavacarros 🚗', salary: 380000, icon: '🚗', desc: 'Dejas brillantes los automóviles con lavado y encerado profesional.' },
	{ id: 11, title: 'Servicio al Cliente 🎧', salary: 400000, icon: '🎧', desc: 'Resuelves dudas y ayudas a personas con amabilidad y paciencia.' },
	{ id: 12, title: 'Traductor 🗣️', salary: 450000, icon: '🗣️', desc: 'Traduces textos y conversaciones entre diferentes idiomas.' }
];

// Escalafón completo de 20 títulos de ascenso para cada una de las 12 profesiones
const JOB_PROMOTIONS_20 = {
	'Cocinero': [
		'Cocinero 👨‍🍳',
		'Ayudante de Cocina 👨‍🍳',
		'Cocinero de Preparación 👨‍🍳',
		'Cocinero de Línea 👨‍🍳',
		'Cocinero de Turno 👨‍🍳',
		'Cocinero Especialista en Parrilla 👨‍🍳',
		'Cocinero Pastelero / Repostero 👨‍🍳',
		'Demi Chef de Partie 👨‍🍳',
		'Chef de Partie (Jefe de Partida) 👨‍🍳',
		'Sous Chef Junior 👨‍🍳',
		'Sous Chef Principal 👨‍🍳',
		'Chef de Cuisine (Jefe de Cocina) 👨‍🍳',
		'Chef Ejecutivo de Restaurante 👨‍🍳',
		'Chef Director de Menú & Recetas 👨‍🍳',
		'Chef Corporativo Multisede 👨‍🍳',
		'Asesor Gastronómico Gourmet 👨‍🍳',
		'Master Chef & Juez Culinario 👨‍🍳',
		'Director de Innovación Culinaria 👨‍🍳',
		'Chef Propietario de Restaurante 👨‍🍳',
		'Magnate Culinario Internacional 👨‍🍳'
	],
	'Tendero': [
		'Tendero 🏪',
		'Auxiliar de Bodega y Abarrotes 🏪',
		'Reponedor y Cajero de Tienda 🏪',
		'Dependiente de Mostrador 🏪',
		'Tendero de Turno 🏪',
		'Tendero Encargado 🏪',
		'Jefe de Inventario y Surtido 🏪',
		'Coordinador de Compras Barriales 🏪',
		'Subadministrador de Tienda 🏪',
		'Administrador de Autoservicio 🏪',
		'Gerente de Minimercado 🏪',
		'Supervisor de Red de Tiendas 🏪',
		'Gerente de Surtido y Proveedores 🏪',
		'Director Comercial de Supermercado 🏪',
		'Gerente de Expansión de Puntos 🏪',
		'Director Nacional de Retail Barrial 🏪',
		'Propietario de Cadena de Tiendas 🏪',
		'Franquiciador de Autoservicios 🏪',
		'Mayorista Distribuidor de Alimentos 🏪',
		'Magnate de Distribución y Retail 🏪'
	],
	'Auxiliar': [
		'Auxiliar Veterinario 🐾',
		'Pasante de Cuidados de Mascotas 🐾',
		'Auxiliar de Hospitalización Animal 🐾',
		'Asistente de Consultorio Clínico 🐾',
		'Cuidador y Enfermero Veterinario 🐾',
		'Asistente de Cirugía Veterinaria 🐾',
		'Técnico de Laboratorio Animal 🐾',
		'Auxiliar de Urgencias Veterinarias 🐾',
		'Coordinador de Área Médica 🐾',
		'Terapeuta y Rehabilitador Animal 🐾',
		'Supervisor de Clínica Veterinaria 🐾',
		'Administrador de Hospital de Mascotas 🐾',
		'Especialista en Nutrición Animal 🐾',
		'Director Operativo Veterinario 🐾',
		'Coordinador de Rescate y Refugios 🐾',
		'Director de Red de Clínicas 🐾',
		'Propietario de Clínica de Mascotas 🐾',
		'Fundador de Hospital Veterinario 24h 🐾',
		'Director de Red de Hospitales Animales 🐾',
		'Líder Mundial de Bienestar Veterinario 🐾'
	],
	'Domiciliario': [
		'Domiciliario 🛵',
		'Repartidor Ciclista Urbano 🛵',
		'Domiciliario Motorizado Novato 🛵',
		'Repartidor Exprés de Zona 🛵',
		'Domiciliario VIP de Restaurantes 🛵',
		'Mensajero Corporativo Confiable 🛵',
		'Líder de Cuadrilla de Reparto 🛵',
		'Despachador de Rutas y Envíos 🛵',
		'Coordinador de Flota Local 🛵',
		'Supervisor de Entregas y Tiempos 🛵',
		'Jefe de Base de Domicilios 🛵',
		'Analista de Rutas y Logística 🛵',
		'Administrador de Hub de Envíos 🛵',
		'Gerente de Operaciones de Mensajería 🛵',
		'Director Logístico de Última Milla 🛵',
		'Propietario de Flota de Envíos 🛵',
		'Fundador de App de Mensajería Local 🛵',
		'Operador Logístico de Carga Ligera 🛵',
		'Proveedor Nacional de Transporte Exprés 🛵',
		'Magnate de Logística y Envíos Globales 🛵'
	],
	'Recreacionista': [
		'Recreacionista 🎈',
		'Asistente de Animación Infantil 🎈',
		'Recreacionista de Juegos y Rondas 🎈',
		'Mago y Globoflexista de Fiestas 🎈',
		'Pintucaritas y Animador de Cumpleaños 🎈',
		'Recreacionista Principal de Eventos 🎈',
		'Coordinador de Dinámicas y Juegos 🎈',
		'Animador Maestro de Ceremonias 🎈',
		'Diseñador de Shows Infantiles 🎈',
		'Productor de Fiestas Temáticas 🎈',
		'Coordinador Logístico de Eventos 🎈',
		'Director de Elenco de Recreación 🎈',
		'Gerente de Agencia de Eventos 🎈',
		'Diseñador de Experiencias Corporativas 🎈',
		'Productor de Festivales Familiares 🎈',
		'Director de Parque de Inflables 🎈',
		'Propietario de Empresa de Eventos 🎈',
		'Creador de Franquicias Recreativas 🎈',
		'Dueño de Cadena de Entretenimiento 🎈',
		'Magnate del Entretenimiento Familiar 🎈'
	],
	'Jardinero': [
		'Jardinero 🌱',
		'Asistente de Corte y Limpieza 🌱',
		'Operario de Podas y Césped 🌱',
		'Jardinero Residencial Cuidador 🌱',
		'Sembrador de Vivero y Plantas 🌱',
		'Jardinero de Poda Artística Topiaria 🌱',
		'Especialista en Riegos y Abonos 🌱',
		'Encargado de Huertas y Viveros 🌱',
		'Cuidador de Jardines Botánicos 🌱',
		'Asesor de Mantenimiento Verde 🌱',
		'Supervisor de Cuadrilla de Paisajismo 🌱',
		'Diseñador de Jardines y Terrazas 🌱',
		'Arquitecto de Paisajismo Natural 🌱',
		'Director de Reforestación Urbana 🌱',
		'Consultor de Muros y Techos Vivos 🌱',
		'Propietario de Vivero y Paisajismo 🌱',
		'Proveedor de Zonas Verdes Corporativas 🌱',
		'Desarrollador de Parques Ecológicos 🌱',
		'Dueño de Red de Centros de Jardinería 🌱',
		'Líder Mundial de Paisajismo Ecológico 🌱'
	],
	'Constructor': [
		'Constructor 🔨',
		'Ayudante Raso de Obra 🔨',
		'Oficial de Mampostería 🔨',
		'Instalador de Drywall y Acabados 🔨',
		'Oficial de Enchapado y Pintura 🔨',
		'Carpintero y Armador de Estructuras 🔨',
		'Técnico Electricista de Obra 🔨',
		'Maestro de Obra Auxiliar 🔨',
		'Maestro de Obra General 🔨',
		'Supervisor de Seguridad y Obras 🔨',
		'Residente de Acabados y Reformas 🔨',
		'Contratista de Reformas Residenciales 🔨',
		'Director de Obras Civiles 🔨',
		'Gerente de Construcción y Costos 🔨',
		'Ingeniero Residente de Edificaciones 🔨',
		'Contratista General de Proyectos 🔨',
		'Propietario de Constructora Residencial 🔨',
		'Desarrollador de Conjuntos Urbanos 🔨',
		'Constructor de Centros Comerciales 🔨',
		'Magnate de Megaestructuras y Urbanismo 🔨'
	],
	'Vendedor': [
		'Vendedor 🏷️',
		'Promotor de Piso y Mostrador 🏷️',
		'Vendedor de Tienda Comercial 🏷️',
		'Asesor de Ventas Telefónicas 🏷️',
		'Ejecutivo de Ventas Junior 🏷️',
		'Asesor Comercial de Cuentas Clave 🏷️',
		'Representante de Ventas en Terreno 🏷️',
		'Asesor Comercial VIP Corporativo 🏷️',
		'Capacitador de Técnicas de Cierre 🏷️',
		'Líder de Equipo Comercial 🏷️',
		'Supervisor Regional de Ventas 🏷️',
		'Subgerente de Canales Comerciales 🏷️',
		'Gerente Comercial de Sucursal 🏷️',
		'Gerente de Expansión de Clientes 🏷️',
		'Director Comercial Regional 🏷️',
		'Vicepresidente Comercial Corporativo 🏷️',
		'Propietario de Agencia Comercial 🏷️',
		'Socio de Importaciones y Ventas 🏷️',
		'Fundador de Red de Franquicias Retail 🏷️',
		'Magnate de Comercio y Ventas Globales 🏷️'
	],
	'Fotógrafo': [
		'Fotógrafo 📸',
		'Asistente de Iluminación y Estudio 📸',
		'Retocador Digital y Editor 📸',
		'Fotógrafo de Retratos Escolares 📸',
		'Fotógrafo de Eventos y Fiestas 📸',
		'Fotógrafo de Bodas y Celebraciones 📸',
		'Fotógrafo de Producto y E-commerce 📸',
		'Fotógrafo Gastronómico de Restaurantes 📸',
		'Fotoperiodista y Reportero Gráfico 📸',
		'Fotógrafo Inmobiliario y Arquitectura 📸',
		'Fotógrafo de Moda y Pasarelas 📸',
		'Director de Fotografía en Estudio 📸',
		'Productor Visual Publicitario 📸',
		'Fotógrafo de Portadas y Revistas 📸',
		'Director Creativo de Agencia Visual 📸',
		'Propietario de Estudio Fotográfico 📸',
		'Productor de Documentales y Marcas 📸',
		'Artista Visual con Galería Propia 📸',
		'Fundador de Productora Audiovisual 📸',
		'Leyenda y Maestro de las Artes Visuales 📸'
	],
	'Lavacarros': [
		'Lavacarros 🚗',
		'Operario de Enjuague y Aspirado 🚗',
		'Lavador de Chasis y Motor 🚗',
		'Lavador Profesional de Exteriores 🚗',
		'Especialista en Limpieza de Cojinería 🚗',
		'Técnico en Descontaminación de Pintura 🚗',
		'Pulidor y Brillador de Carrocerías 🚗',
		'Detallador Automotriz Junior 🚗',
		'Master Detailer en Corrección de Pintura 🚗',
		'Aplicador de Recubrimientos Cerámicos 🚗',
		'Jefe de Línea de Lavado y Acabados 🚗',
		'Encargado de Lavadero Automotriz 🚗',
		'Administrador de Centro de Detailing 🚗',
		'Gerente de Servicios Automotrices 🚗',
		'Diseñador de Autolavados Automatizados 🚗',
		'Propietario de Centro de Detailing 🚗',
		'Franquiciador de Lavaderos Ecológicos 🚗',
		'Dueño de Cadena de Autolavados Express 🚗',
		'Distribuidor Nacional de Insumos Car-Care 🚗',
		'Magnate de Estaciones de Detailing Automotriz 🚗'
	],
	'Servicio': [
		'Servicio al Cliente 🎧',
		'Operador Telefónico de Recepción 🎧',
		'Agente de Soporte por Chat 🎧',
		'Asesor de Atención en Mostrador 🎧',
		'Agente de Soporte Técnico Básico 🎧',
		'Especialista en Retención y Fidelización 🎧',
		'Asesor de Casos Especiales y PQR 🎧',
		'Auditor de Calidad en Atención 🎧',
		'Entrenador de Nuevos Asesores 🎧',
		'Team Leader de Atención 🎧',
		'Supervisor de Centro de Contacto 🎧',
		'Coordinador de Experiencia del Cliente CX 🎧',
		'Analista de Métricas y Satisfacción 🎧',
		'Jefe de Operaciones de Call Center 🎧',
		'Gerente de Relación con el Cliente CRM 🎧',
		'Director de Experiencia del Usuario 🎧',
		'Consultor Estratégico de Servicio 🎧',
		'Propietario de Centro de Contacto BPO 🎧',
		'Vicepresidente de Éxito del Cliente CX 🎧',
		'Magnate Global de Experiencia y Servicios BPO 🎧'
	],
	'Traductor': [
		'Traductor 🗣️',
		'Transcriptor y Asistente de Textos 🗣️',
		'Traductor de Documentos Simples 🗣️',
		'Corrector de Estilo Bilingüe 🗣️',
		'Traductor de Subtítulos y Web 🗣️',
		'Traductor Técnico de Manuales 🗣️',
		'Intérprete Consecutivo de Enlace 🗣️',
		'Traductor Literario de Artículos 🗣️',
		'Traductor Jurídico y Comercial 🗣️',
		'Intérprete Simultáneo de Negocios 🗣️',
		'Traductor Oficial Certificado 🗣️',
		'Intérprete de Foros Internacionales 🗣️',
		'Líder de Localización de Software 🗣️',
		'Consultor Lingüístico Multinacional 🗣️',
		'Intérprete Diplomático de Embajadas 🗣️',
		'Director de Agencia de Traducción 🗣️',
		'Propietario de Empresa de Idiomas 🗣️',
		'Intérprete de Cumbres de la ONU 🗣️',
		'Creador de Software de Traducción 🗣️',
		'Líder Mundial de Diplomacia e Idiomas 🗣️'
	]
};

function getPromotedTitle(currentTitle, tier = 1) {
	for (const [key, ladder] of Object.entries(JOB_PROMOTIONS_20)) {
		if (currentTitle.includes(key)) {
			const idx = Math.min(Math.max(0, tier - 1), ladder.length - 1);
			return ladder[idx];
		}
	}
	return `${currentTitle} ⭐`;
}

// Opciones de Nuevo Trabajo para cambiar de empleo con diferentes sueldos
const NEW_JOBS = [
	{ title: 'Barista en Cafetería ☕', salary: 520000, desc: 'Preparando cafés especiales y malteadas deliciosas.' },
	{ title: 'Pastelero en Sweet Lab 🍰', salary: 600000, desc: 'Creando tortas decoradas y postres para eventos.' },
	{ title: 'Programador Junior 💻', salary: 750000, desc: 'Creando aplicaciones móviles y páginas web modernas.' },
	{ title: 'Fotógrafo de Moda 📸', salary: 580000, desc: 'Tomando fotos para marcas juveniles y redes sociales.' },
	{ title: 'Técnico de Celulares 📱', salary: 650000, desc: 'Arreglando pantallas y repuestos de teléfonos.' },
	{ title: 'Diseñador Digital 🎨', salary: 700000, desc: 'Diseñando marcas, logos y publicidad para internet.' },
	{ title: 'Administrador de Local 🏪', salary: 680000, desc: 'Coordinando el equipo y las ventas de la tienda.' },
	{ title: 'Entrenador Deportivo ⚽', salary: 550000, desc: 'Guiando entrenamientos y partidos de fútbol juvenil.' },
	{ title: 'Profesor de Música 🎸', salary: 500000, desc: 'Enseñando guitarra, piano y canto a nuevos talentos.' },
	{ title: 'Piloto de Drones 🛸', salary: 800000, desc: 'Grabando tomas aéreas para películas y comerciales.' }
];

// Ascensos dentro del trabajo con mejor pago y bono sorpresa
const PROMOTIONS = [
	{ title: '¡Coordinador de Turno! ⭐', desc: 'Te nombraron líder de tu turno por tu compromiso y puntualidad.', raise: 80000, bonus: 40000 },
	{ title: '¡Empleado del Mes! 🏆', desc: 'Recibes reconocimiento oficial con aumento de sueldo.', raise: 100000, bonus: 50000 },
	{ title: '¡Subiste de Nivel! 🚀', desc: 'Superaste las metas del mes y te asignaron mejor categoría laboral.', raise: 120000, bonus: 60000 },
	{ title: '¡Especialista Senior! 🎖️', desc: 'Tus clientes te calificaron con 5 estrellas y tu jefe te subió el sueldo.', raise: 150000, bonus: 80000 },
	{ title: '¡Mano Derecha del Jefe! 💼', desc: 'Ahora ayudas en la toma de decisiones con un pago mucho mayor.', raise: 90000, bonus: 45000 }
];

// Tipos de casillas físicas del camino (Pocas palabras, lenguaje familiar y juvenil)
const TILE_TYPES = {
	payday: {
		type: 'payday',
		styleClass: 'tile-color-payday',
		name: 'DÍA DE PAGO',
		icon: '💰',
		sub: 'Cobras tu plata',
		badge: 'Cobro'
	},
	opportunity: {
		type: 'opportunity',
		styleClass: 'tile-color-opportunity',
		name: 'OPORTUNIDAD',
		icon: '🚀',
		sub: 'Gana más al mes',
		badge: 'Inversión'
	},
	job: {
		type: 'job',
		styleClass: 'tile-color-job',
		name: 'NUEVO EMPLEO',
		icon: '💼',
		sub: 'Cambiar de trabajo',
		badge: 'Empleo'
	},
	promotion: {
		type: 'promotion',
		styleClass: 'tile-color-promotion',
		name: 'ASCENSO',
		icon: '⭐',
		sub: '¡Mejor sueldo!',
		badge: 'Aumento'
	},
	doodad: {
		type: 'doodad',
		styleClass: 'tile-color-doodad',
		name: 'ANTOJO',
		icon: '🛍️',
		sub: 'Gasto de salida',
		badge: 'Capricho'
	},
	market: {
		type: 'market',
		styleClass: 'tile-color-market',
		name: 'VENTA',
		icon: '📈',
		sub: 'Compran tu negocio',
		badge: 'Ganancia'
	},
	charity: {
		type: 'charity',
		styleClass: 'tile-color-charity',
		name: 'DONACIÓN',
		icon: '🎁',
		sub: 'Dar con generosidad',
		badge: 'Donación'
	},
	crisis: {
		type: 'crisis',
		styleClass: 'tile-color-crisis',
		name: 'PAUSA',
		icon: '⏸️',
		sub: 'Descansas 1 turno',
		badge: 'Pausa'
	}
};

// Barajas de cartas adaptadas al capital inicial ($100.000 COP)
// Utilidades mensuales calibradas a solicitud: 0%, 1%, 2%, 3%, 4% y 5%
const SMALL_DEALS = [
	// --- 0% DE GANANCIA MENSUAL (Bienes de colección / Lotes de engorde / Plusvalía futura) ---
	{
		title: 'Lote de Terreno en Engorde 🏞️',
		type: 'property',
		propertyType: 'terreno',
		desc: 'Un pequeño lote rural. No genera arriendo mensual, pero esperas venderlo más caro en el mercado.',
		cost: 70000,
		downPayment: 70000,
		cashFlow: 0,
		roiPercent: 0,
		category: 'Tierra / Engorde'
	},
	{
		title: 'Colección de Cartas Raras y Cómics 🃏',
		type: 'business',
		desc: 'Artículos de colección vintage. No generan dinero mensual, pero los coleccionistas pagan fortunas.',
		cost: 40000,
		downPayment: 40000,
		cashFlow: 0,
		roiPercent: 0,
		category: 'Coleccionables'
	},
	{
		title: 'Patente de Invento Registrada 💡',
		type: 'business',
		desc: 'Registro de marca y diseño innovador. No deja flujo mensual aún, pero puedes venderla en el mercado.',
		cost: 80000,
		downPayment: 80000,
		cashFlow: 0,
		roiPercent: 0,
		category: 'Propiedad Intelectual'
	},

	// --- 1% DE GANANCIA MENSUAL (Renta fija conservadora y muy segura) ---
	{
		title: 'Cuenta de Ahorros con Rendimiento 🏦',
		type: 'stock',
		ticker: 'AHORRO',
		desc: 'Dinero protegido en el banco que genera un rendimiento seguro y garantizado mes a mes.',
		cost: 100000,
		downPayment: 100000,
		cashFlow: 1000, // 1%
		roiPercent: 1,
		category: 'Renta Fija'
	},
	{
		title: 'Bono del Tesoro Seguro 📑',
		type: 'stock',
		ticker: 'TES',
		desc: 'Inversión de bajo riesgo con respaldo financiero que te paga un interés mensual tranquilo.',
		cost: 60000,
		downPayment: 60000,
		cashFlow: 600, // 1%
		roiPercent: 1,
		category: 'Bonos'
	},
	{
		title: 'Fondo de Liquidez Inmediata 💳',
		type: 'stock',
		ticker: 'LIQ',
		desc: 'Un fondo estable de retiro libre que suma un pequeño interés automático cada mes.',
		cost: 80000,
		downPayment: 80000,
		cashFlow: 800, // 1%
		roiPercent: 1,
		category: 'Fondos'
	},

	// --- 2% DE GANANCIA MENSUAL (Fondos colectivos y participaciones tranquilas) ---
	{
		title: 'Fondo de Inversión Colectiva 📊',
		type: 'stock',
		ticker: 'FIC',
		desc: 'Inversión diversificada en empresas estables con reparto mensual de utilidades.',
		cost: 70000,
		downPayment: 70000,
		cashFlow: 1400, // 2%
		roiPercent: 2,
		category: 'Fondos'
	},
	{
		title: 'Participación en Parqueadero Comunitario 🚗',
		type: 'property',
		propertyType: 'parqueadero',
		desc: 'Socio en un espacio de parqueo en el barrio con ingresos mensuales recurrentes.',
		cost: 100000,
		downPayment: 100000,
		cashFlow: 2000, // 2%
		roiPercent: 2,
		category: 'Alquiler de Espacio'
	},
	{
		title: 'Puesto de Alquiler de Libros y Mangas 📚',
		type: 'business',
		desc: 'Pequeño club de lectura donde los jóvenes pagan suscripción mensual para leer novedades.',
		cost: 50000,
		downPayment: 50000,
		cashFlow: 1000, // 2%
		roiPercent: 2,
		category: 'Alquiler'
	},

	// --- 3% DE GANANCIA MENSUAL (Acciones, bodegaje y microservicios) ---
	{
		title: 'Acciones Sweet Lab 📈',
		type: 'stock',
		ticker: 'SWT',
		desc: 'Compraste una partecita de Sweet Lab y recibes dividendos constantes cada mes.',
		cost: 100000,
		downPayment: 100000,
		cashFlow: 3000, // 3%
		roiPercent: 3,
		category: 'Acciones'
	},
	{
		title: 'Bodega de Almacenamiento Compartida 📦',
		type: 'property',
		propertyType: 'bodega',
		desc: 'Espacio alquilado a comerciantes para guardar mercancía con pago mensual fijo.',
		cost: 80000,
		downPayment: 80000,
		cashFlow: 2400, // 3%
		roiPercent: 3,
		category: 'Alquiler de Espacio'
	},
	{
		title: 'Tótem de Carga de Celulares 🔋',
		type: 'business',
		desc: 'Estación de recarga rápida instalada en una cafetería con pago por uso continuo.',
		cost: 60000,
		downPayment: 60000,
		cashFlow: 1800, // 3%
		roiPercent: 3,
		category: 'Servicio Automático'
	},

	// --- 4% DE GANANCIA MENSUAL (Máquinas automáticas y talleres activos) ---
	{
		title: 'Máquina Vendedora de Café y Snacks ☕',
		type: 'business',
		desc: 'Expendedora automática en una sala de espera con alto consumo de café a diario.',
		cost: 75000,
		downPayment: 75000,
		cashFlow: 3000, // 4%
		roiPercent: 4,
		category: 'Negocio Automático'
	},
	{
		title: 'Taller de Joyería y Pulseras 💍',
		type: 'business',
		desc: 'Diseñas accesorios artesanales de moda con pedidos regulares todos los meses.',
		cost: 50000,
		downPayment: 50000,
		cashFlow: 2000, // 4%
		roiPercent: 4,
		category: 'Negocio Propio'
	},
	{
		title: 'Alquiler de Consola de Videojuegos 🎮',
		type: 'business',
		desc: 'Torneos juveniles los fines de semana que dejan un flujo mensual constante.',
		cost: 90000,
		downPayment: 90000,
		cashFlow: 3600, // 4%
		roiPercent: 4,
		category: 'Entretenimiento'
	},

	// --- 5% DE GANANCIA MENSUAL (Negocios de alto rendimiento y autoservicios) ---
	{
		title: 'Puesto de Cupcakes y Postres 🧁',
		type: 'business',
		desc: 'Cajitas de postres deliciosos para cumpleaños y eventos pedidos con anticipación.',
		cost: 50000,
		downPayment: 50000,
		cashFlow: 2500, // 5%
		roiPercent: 5,
		category: 'Negocio Propio'
	},
	{
		title: 'Máquina de Dulces y Juguetes 🍬',
		type: 'business',
		desc: 'Máquina automática en un minimercado concurrido que vende solita día y noche.',
		cost: 80000,
		downPayment: 80000,
		cashFlow: 4000, // 5%
		roiPercent: 5,
		category: 'Negocio Automático'
	},
	{
		title: 'Lavadora Comunitaria de Ropa 🧺',
		type: 'business',
		desc: 'Servicio de lavado con monedas para estudiantes que deja un arriendo mensual garantizado.',
		cost: 100000,
		downPayment: 100000,
		cashFlow: 5000, // 5%
		roiPercent: 5,
		category: 'Servicio Automático'
	},
	{
		title: 'Carrito de Jugos y Limonadas 🍋',
		type: 'business',
		desc: 'Puesto móvil de bebidas naturales en la cancha deportiva del barrio.',
		cost: 60000,
		downPayment: 60000,
		cashFlow: 3000, // 5%
		roiPercent: 5,
		category: 'Negocio Propio'
	}
];

const DOODADS = [
	{
		title: 'Salida de Helados con Amigos 🍨',
		desc: 'Fuiste por unos helados gigantes después de clase.',
		cost: 20000
	},
	{
		title: 'Entrada a Cine con Crispetas 🍿',
		desc: 'Fuiste a ver la película de moda en pantalla gigante.',
		cost: 30000
	},
	{
		title: 'Audífonos Bluetooth Nuevos 🎧',
		desc: 'Se te dañaron los viejos y te compraste unos de tu color favorito.',
		cost: 45000
	},
	{
		title: 'Hamburguesa y Malteada Especial 🍔',
		desc: 'Un antojito delicioso de fin de semana para celebrar.',
		cost: 25000
	},
	{
		title: 'Gorra o Camiseta con Estilo 🧢',
		desc: 'Viste una prenda en descuento que te combinaba perfecto.',
		cost: 35000
	},
	{
		title: 'Snacks y Chocolates de la Semana 🍫',
		desc: 'Pequeñas compras dulces que se sumaron día a día.',
		cost: 15000
	}
];

const MARKET_EVENTS = [
	{
		title: '¡Compran tu Habitación en Alquiler! 🏠',
		desc: 'Un inversionista te compra la habitación por el doble de lo que te costó.',
		appliesTo: 'Propiedad Raíz',
		salePrice: 500000
	},
	{
		title: '¡Suben las Acciones de Sweet Lab! 📈',
		desc: 'La empresa abrió nuevas tiendas y tus acciones valen el triple.',
		appliesTo: 'Acciones',
		salePrice: 300000
	},
	{
		title: '¡Compran tu Negocio de Cupcakes! 🧁',
		desc: 'Una cafetería vecina te ofrece una excelente oferta para quedarse con tu puesto.',
		appliesTo: 'Emprendimiento',
		salePrice: 150000
	},
	{
		title: '¡Compran tu Máquina de Dulces! 🍬',
		desc: 'Un centro comercial te compra la máquina con todo y dulces.',
		appliesTo: 'Negocio Automático',
		salePrice: 220000
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
	isCardFlying: false,
	pendingEndTurn: false,
	generatedTiles: [],
	cameraViewOffset: 0 // Para explorar casillas siguientes/anteriores sin mover el ficho
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
		for (let i = 0; i < 7; i++) {
			setTimeout(() => this.playTone(200 + Math.random() * 320, 0.08, 'triangle', 0.09), i * 60);
		}
	}

	genieMagic() {
		const magicPitches = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
		magicPitches.forEach((p, idx) => {
			setTimeout(() => this.playTone(p, 0.25, 'sine', 0.12), idx * 90);
		});
	}

	cardLand() {
		this.playTone(360, 0.07, 'triangle', 0.1);
		setTimeout(() => this.playTone(460, 0.1, 'sine', 0.08), 35);
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
// 5. GENERACIÓN DE CASILLAS Y PISTAS PARALELAS
// ==========================================

function extendPerspectiveRoad(countToAdd = 25) {
	const startIdx = gameState.generatedTiles.length;
	const isParallelTwo = gameState.players.length === 2;

	for (let i = 0; i < countToAdd; i++) {
		const globalIndex = startIdx + i;
		const tileData = pickTileForIndex(globalIndex);
		tileData.globalIndex = globalIndex;
		gameState.generatedTiles.push(tileData);

		if (isParallelTwo) {
			// Añadir exactamente la misma casilla a ambos caminos paralelos
			const track0 = document.getElementById('road-lane-track-0');
			const track1 = document.getElementById('road-lane-track-1');
			if (track0) track0.appendChild(createLaneTileDOM(tileData, 0));
			if (track1) track1.appendChild(createLaneTileDOM(tileData, 1));
		} else {
			const singleTrack = document.getElementById('road-lane-track-0');
			if (singleTrack) singleTrack.appendChild(createLaneTileDOM(tileData, 0));
		}
	}
}

function pickTileForIndex(index) {
	if (index === 0) {
		return { ...TILE_TYPES.payday, id: index, name: 'SALIDA • PAGO', badge: 'Inicio' };
	}

	// Casilla 1: "Nada" (paso libre / descanso para que los 12 empleos inicien desde la 2 hasta la 13)
	if (index === 1) {
		return {
			type: 'nothing',
			styleClass: 'tile-color-nothing',
			name: 'NADA',
			icon: '⚪',
			sub: 'Paso libre',
			badge: 'Libre',
			id: index
		};
	}

	// Casillas 2 a 13: Los 12 empleos básicos de inicio visibles directamente en el tablero
	if (index >= 2 && index <= 13) {
		const job = STARTER_JOBS[index - 2];
		return {
			type: 'job',
			isStarterJob: true,
			starterJob: job,
			styleClass: 'tile-color-job',
			name: job.title.toUpperCase(),
			icon: job.icon,
			sub: `${formatCOP(job.salary)} / mes`,
			badge: `#${index} Empleo`,
			id: index
		};
	}

	// Día de Pago aparece espaciado (cada 24 casillas, aprox. cada 3 minutos de juego)
	if (index % 24 === 0) {
		const monthNum = Math.floor(index / 24);
		return { ...TILE_TYPES.payday, id: index, badge: `Mes ${monthNum}` };
	}

	const cycle = index % 24;
	let typeKey = 'opportunity';

	switch (cycle) {
		case 14: typeKey = 'market'; break;
		case 15: typeKey = 'promotion'; break;
		case 16: typeKey = 'opportunity'; break;
		case 17: typeKey = 'doodad'; break;
		case 18: typeKey = 'crisis'; break;
		case 19: typeKey = 'opportunity'; break;
		case 20: typeKey = 'job'; break;
		case 21: typeKey = 'promotion'; break;
		case 22: typeKey = 'market'; break;
		case 23: typeKey = 'charity'; break;
		// Para siguientes vueltas de la pista (después del Mes 1):
		case 1: typeKey = 'opportunity'; break;
		case 2: typeKey = 'job'; break;
		case 3: typeKey = 'doodad'; break;
		case 4: typeKey = 'promotion'; break;
		case 5: typeKey = 'opportunity'; break;
		case 6: typeKey = 'market'; break;
		case 7: typeKey = 'job'; break;
		case 8: typeKey = 'charity'; break;
		case 9: typeKey = 'opportunity'; break;
		case 10: typeKey = 'promotion'; break;
		case 11: typeKey = 'doodad'; break;
		case 12: typeKey = 'opportunity'; break;
		case 13: typeKey = 'job'; break;
		default: typeKey = 'opportunity';
	}

	return { ...TILE_TYPES[typeKey], id: index };
}

/**
 * Crea el DOM de la casilla individual:
 * - Sin '#'
 * - Nombre centrado en la mitad, muy visible
 */
function createLaneTileDOM(tile, laneIndex = 0) {
	const card = document.createElement('div');
	card.id = `lane-tile-${laneIndex}-${tile.globalIndex}`;
	card.className = `tile-lane-card ${tile.styleClass}`;

	card.innerHTML = `
		<div class="tile-bg-art tile-bg-${tile.type}"></div>
		<div class="tile-header-row">
			<span class="tile-sub-badge">${tile.badge || tile.sub}</span>
			<div class="tile-pawns-slot" id="lane-pawns-${laneIndex}-${tile.globalIndex}"></div>
		</div>
		<div class="tile-center-content">
			<div class="tile-icon-bubble">${tile.icon}</div>
			<div class="tile-main-name">${tile.name}</div>
		</div>
		<div class="tile-footer-sub">${tile.sub}</div>
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
		rollTwoDice();
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

	// Drawer de Balance
	document.getElementById('btn-toggle-balance')?.addEventListener('click', () => {
		openBalanceDrawer();
	});
	document.getElementById('btn-close-balance')?.addEventListener('click', () => {
		closeBalanceDrawer();
	});
	document.getElementById('balance-drawer-overlay')?.addEventListener('click', (e) => {
		if (e.target.id === 'balance-drawer-overlay') closeBalanceDrawer();
	});

	// Exploración directa con el Trackpad (scroll de 2 dedos) o arrastre con el cursor
	const viewport = document.getElementById('viewport-touch-track');
	if (viewport) {
		// 1. Control con Trackpad (Gesto de dos dedos / rueda con sensibilidad suave)
		viewport.addEventListener('wheel', (e) => {
			e.preventDefault();
			// Escala suave y amortiguada para evitar saltos bruscos
			const delta = (e.deltaY * 0.007);
			const currentPos = gameState.players[gameState.currentPlayerIndex]?.position || 0;
			const newOffset = gameState.cameraViewOffset + delta;

			// No permitir ir más atrás de la casilla 0
			if (currentPos + newOffset >= 0) {
				gameState.cameraViewOffset = newOffset;
				centerPerspective();
			}
		}, { passive: false });

		// 2. Control con el Cursor (Arrastrar suavemente con trackpad/ratón)
		let isDragging = false;
		let startY = 0;
		let initialOffset = 0;

		viewport.addEventListener('pointerdown', (e) => {
			isDragging = true;
			startY = e.clientY;
			initialOffset = gameState.cameraViewOffset;
			viewport.setPointerCapture(e.pointerId);
		});

		viewport.addEventListener('pointermove', (e) => {
			if (!isDragging) return;
			const diffY = e.clientY - startY;
			// 1 casilla = 180px de arrastre (suave, estable y controlado)
			const tileDelta = -diffY / 180;
			const currentPos = gameState.players[gameState.currentPlayerIndex]?.position || 0;
			const candidateOffset = initialOffset + tileDelta;

			if (currentPos + candidateOffset >= 0) {
				gameState.cameraViewOffset = candidateOffset;
				centerPerspective();
			}
		});

		const stopDrag = (e) => {
			if (isDragging) {
				isDragging = false;
				try { viewport.releasePointerCapture(e.pointerId); } catch(err) {}
			}
		};

		viewport.addEventListener('pointerup', stopDrag);
		viewport.addEventListener('pointercancel', stopDrag);
	}

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
// 7. INICIO DE PARTIDA Y CONFIGURACIÓN PARALELA
// ==========================================

function startGame() {
	const count = parseInt(document.querySelector('.setup-count-btn.active')?.dataset.count || '2', 10);
	const players = [];

	for (let i = 0; i < count; i++) {
		const nameInput = document.getElementById(`player-input-${i}`);
		const name = (nameInput?.value || `Jugador ${i + 1}`).trim();
		const avatar = AVATARS[i];

		players.push({
			id: i,
			name: name,
			avatar: avatar.emoji,
			color: avatar.color,
			bg: avatar.bg,
			profession: 'Sin empleo',
			salary: 0,
			fixedExpenses: 0, // Flujo neto mensual inicia en exactamente 0
			debtExpenses: 0,
			totalDebt: 0,
			cash: 100000, // Efectivo inicial en exactamente 100.000 COP
			position: 0,
			assets: [],
			skipTurns: 0,
			hasJob: false, // Inician sin empleo
			salariesCollected: 0,
			jobTier: 1
		});
	}

	gameState.players = players;
	gameState.currentPlayerIndex = 0;
	gameState.isRolling = false;
	gameState.generatedTiles = [];
	gameState.cameraViewOffset = 0;

	// Configurar contenedor de pistas 3D (1 columna o 2 paralelas lado a lado)
	setupRoad3DScene();

	// Generar las primeras 40 casillas para garantizar visión profunda en el horizonte
	extendPerspectiveRoad(40);

	document.getElementById('setup-screen').classList.add('hidden');
	document.getElementById('game-hud').classList.remove('hidden');
	document.getElementById('game-screen').classList.remove('hidden');
	document.getElementById('floating-status-pill').classList.remove('hidden');

	updatePawnsOnRoad();
	updateHUDAndHeaders();
	centerPerspective();
}

const MEADOW_PROPS = [
	{ icon: '🌳', label: 'Árbol Frondoso' },
	{ icon: '🌲', label: 'Pino Verde' },
	{ icon: '🌸', label: 'Flores Silvestres' },
	{ icon: '🏡', label: 'Cabaña' },
	{ icon: '🌿', label: 'Pradera' },
	{ icon: '🌻', label: 'Girasoles' },
	{ icon: '🌳', label: 'Arboleda' },
	{ icon: '🌷', label: 'Jardín Florido' }
];

const BEACH_PROPS = [
	{ icon: '🌴', label: 'Palmera Tropical' },
	{ icon: '🏖️', label: 'Playa Dorada' },
	{ icon: '🌊', label: 'Olas del Mar' },
	{ icon: '⛵', label: 'Velero en el Océano' },
	{ icon: '🥥', label: 'Cocos' },
	{ icon: '⛱️', label: 'Sombrilla' },
	{ icon: '🌴', label: 'Palma Costera' },
	{ icon: '🏄', label: 'Surf' }
];

/**
 * Genera el camino 3D y la escenografía que lo rodea:
 * - A la izquierda: Praderas verdes, árboles y flores
 * - Al centro: Las pistas de los jugadores
 * - A la derecha: Playa dorada, palmeras y mar turquesa
 */
function setupRoad3DScene() {
	const scene = document.getElementById('road-3d-scene-container');
	if (!scene) return;
	scene.innerHTML = '';

	const tileCount = Math.max(30, gameState.generatedTiles.length || 60);

	// 1. Escenografía Izquierda: Campos Verdes, Árboles y Colinas
	const colMeadow = document.createElement('div');
	colMeadow.className = 'scenery-column';
	const trackMeadow = document.createElement('div');
	trackMeadow.className = 'scenery-3d-track scenery-strip-left';
	trackMeadow.id = 'scenery-lane-left';
	for (let i = 0; i < tileCount; i++) {
		const prop = MEADOW_PROPS[i % MEADOW_PROPS.length];
		const item = document.createElement('div');
		item.className = 'scenery-item-3d';
		item.innerHTML = `
			<div class="scenery-ground-patch meadow"></div>
			<div class="scenery-emoji-prop" title="${prop.label}">${prop.icon}</div>
		`;
		trackMeadow.appendChild(item);
	}
	colMeadow.appendChild(trackMeadow);
	scene.appendChild(colMeadow);

	// 2. Caminos de los Jugadores
	const isParallelTwo = gameState.players.length === 2;
	if (isParallelTwo) {
		const roadGroup = document.createElement('div');
		roadGroup.className = 'road-lanes-group';
		roadGroup.innerHTML = `
			<div class="parallel-road-column"><div class="road-3d-track" id="road-lane-track-0"></div></div>
			<div class="parallel-road-column"><div class="road-3d-track" id="road-lane-track-1"></div></div>
		`;
		scene.appendChild(roadGroup);
	} else {
		const col = document.createElement('div');
		col.className = 'parallel-road-column';
		col.innerHTML = `<div class="road-3d-track" id="road-lane-track-0"></div>`;
		scene.appendChild(col);
	}

	// 3. Escenografía Derecha: Playa Soleada, Palmeras, Sombrillas y Mar
	const colBeach = document.createElement('div');
	colBeach.className = 'scenery-column';
	const trackBeach = document.createElement('div');
	trackBeach.className = 'scenery-3d-track scenery-strip-right';
	trackBeach.id = 'scenery-lane-right';
	for (let i = 0; i < tileCount; i++) {
		const prop = BEACH_PROPS[i % BEACH_PROPS.length];
		const item = document.createElement('div');
		item.className = 'scenery-item-3d';
		item.innerHTML = `
			<div class="scenery-ground-patch sand"></div>
			<div class="scenery-emoji-prop" title="${prop.label}">${prop.icon}</div>
		`;
		trackBeach.appendChild(item);
	}
	colBeach.appendChild(trackBeach);
	scene.appendChild(colBeach);
}

function updatePawnsOnRoad(activeHoppingIndex = -1) {
	const isParallelTwo = gameState.players.length === 2;

	// Limpiar casillas
	gameState.generatedTiles.forEach(tile => {
		if (isParallelTwo) {
			const slot0 = document.getElementById(`lane-pawns-0-${tile.globalIndex}`);
			const slot1 = document.getElementById(`lane-pawns-1-${tile.globalIndex}`);
			if (slot0) slot0.innerHTML = '';
			if (slot1) slot1.innerHTML = '';
		} else {
			const slot = document.getElementById(`lane-pawns-0-${tile.globalIndex}`);
			if (slot) slot.innerHTML = '';
		}
	});

	// Colocar fichas
	gameState.players.forEach((p, idx) => {
		const laneIndex = isParallelTwo ? idx : 0;
		const slot = document.getElementById(`lane-pawns-${laneIndex}-${p.position}`);
		if (slot) {
			const pawn = document.createElement('div');
			pawn.className = `mini-pawn ${idx === activeHoppingIndex ? 'pawn-hopping' : ''}`;
			pawn.style.background = p.color;
			pawn.title = p.name;
			pawn.innerHTML = p.avatar;
			slot.appendChild(pawn);
		}
	});
}

/**
 * Actualiza el HUD flotante minimalista de jugadores en la parte superior
 */
function updateHUDAndHeaders() {
	const container = document.getElementById('game-hud');
	if (!container) return;
	container.innerHTML = '';

	gameState.players.forEach((p, idx) => {
		const fin = getPlayerFinancials(p);
		const isMyTurn = idx === gameState.currentPlayerIndex;

		const pill = document.createElement('div');
		pill.className = `player-hud-pill ${isMyTurn ? 'is-turn' : ''}`;
		pill.title = `Click para ver balance de ${p.name}`;

		pill.innerHTML = `
			<div class="player-hud-avatar" style="background:${p.bg};">${p.avatar}</div>
			<div class="player-hud-data">
				<div class="player-hud-name-row">
					<span class="p-name">${p.name}</span>
					${isMyTurn ? '<span class="p-turn-indicator">Turno</span>' : ''}
				</div>
				<div class="player-hud-stats-row">
					<span class="p-cash">${formatCOP(p.cash)}</span>
					<span class="p-divider">•</span>
					<span class="p-flow ${fin.monthlyCashFlow >= 0 ? 'green' : 'red'}">${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}/m</span>
				</div>
			</div>
		`;

		pill.addEventListener('click', () => {
			gameState.selectedDrawerPlayerIndex = idx;
			openBalanceDrawer();
		});

		container.appendChild(pill);
	});

	// Actualizar pill flotante
	const current = gameState.players[gameState.currentPlayerIndex];
	const pill = document.getElementById('floating-status-pill');
	const monthNum = Math.floor(current.position / 24) + 1;
	if (current && !current.hasJob) {
		pill.textContent = `Turno de ${current.name} • Buscando empleo (¡Tira los dados para conseguir trabajo!)`;
	} else if (current) {
		pill.textContent = `Turno de ${current.name} • ${current.profession} (Mes ${monthNum})`;
	}

	// Resaltar casilla activa
	document.querySelectorAll('.tile-lane-card').forEach(t => t.classList.remove('active-step'));
	const isParallelTwo = gameState.players.length === 2;
	const laneIndex = isParallelTwo ? gameState.currentPlayerIndex : 0;
	const activeTile = document.getElementById(`lane-tile-${laneIndex}-${current.position}`);
	if (activeTile) activeTile.classList.add('active-step');

	const btnRoll = document.getElementById('btn-roll-dice');
	if (current.skipTurns > 0) {
		btnRoll.disabled = true;
		pill.textContent = `⏸️ ${current.name} está descansando este turno.`;
		setTimeout(() => {
			current.skipTurns--;
			endTurn();
		}, 1800);
	} else {
		btnRoll.disabled = false;
		if (!current.hasJob) {
			btnRoll.textContent = '🎲 ¡Tirar para Empleo!';
		} else {
			btnRoll.textContent = '🎲 Tirar Dados 🎲';
		}
	}
}

/**
 * Centra la perspectiva hacia el horizonte.
 * Muestra el recuadro anterior (pos - 1), el actual (pos) y los siguientes 12 recuadros (pos + 1 a pos + 12).
 * Sincroniza tanto los caminos paralelos como la escenografía 3D lateral.
 */
function centerPerspective(smooth = false) {
	const current = gameState.players[gameState.currentPlayerIndex];
	if (!current) return;

	const effectivePos = current.position + gameState.cameraViewOffset;
	// Posiciona la cámara en (pos - 0.95) para que la casilla anterior quede visible en la base de la pantalla
	const cameraTileIndex = Math.max(0, effectivePos - 0.95);
	const stepHeight = 129; // 115px altura de casilla + 14px de separación
	const translateY = cameraTileIndex * stepHeight;

	const track0 = document.getElementById('road-lane-track-0');
	const track1 = document.getElementById('road-lane-track-1');
	const sceneryLeft = document.getElementById('scenery-lane-left');
	const sceneryRight = document.getElementById('scenery-lane-right');

	const transitionStyle = smooth ? 'transform 0.85s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';

	[track0, track1, sceneryLeft, sceneryRight].forEach(el => {
		if (el) {
			el.style.transition = transitionStyle;
			el.style.transform = `rotateX(44deg) translateY(${translateY}px)`;
		}
	});
}

// ==========================================
// 8. DOS DADOS GRANDES Y REALISTAS
// ==========================================

function setDiceFace(diceNumber, faceValue) {
	const grid = document.getElementById(`dice-pips-grid-${diceNumber}`);
	if (!grid) return;
	grid.className = `dice-face-grid face-${faceValue}`;
}

function rollTwoDice() {
	if (gameState.isRolling || gameState.isCardFlying) return;
	const player = gameState.players[gameState.currentPlayerIndex];

	const btnRoll = document.getElementById('btn-roll-dice');
	const dice1 = document.getElementById('hud-dice-3d-1');
	const dice2 = document.getElementById('hud-dice-3d-2');
	const pill = document.getElementById('floating-status-pill');

	gameState.isRolling = true;
	gameState.cameraViewOffset = 0; // Regresar la cámara a la ficha al tirar
	btnRoll.disabled = true;

	// Efecto Aladino en los dados (flotan, brillan y se expanden mágicamente)
	dice1?.classList.add('aladdin-magic');
	dice2?.classList.add('aladdin-magic');
	sounds.genieMagic();

	let rollCount = 0;
	const interval = setInterval(() => {
		const temp1 = Math.floor(Math.random() * 6) + 1;
		const temp2 = Math.floor(Math.random() * 6) + 1;
		setDiceFace(1, temp1);
		setDiceFace(2, temp2);
		rollCount++;

		if (rollCount > 10) {
			clearInterval(interval);
			dice1?.classList.remove('aladdin-magic');
			dice2?.classList.remove('aladdin-magic');

			let d1, d2, totalSteps;

			if (!player.hasJob) {
				// Primer turno: conseguir empleo avanzando por el camino a las casillas 2 a 13 (posibilidad equitativa 1/12)
				totalSteps = Math.floor(Math.random() * 12) + 2; // Rango exacto: 2 a 13
				if (totalSteps <= 12) {
					d1 = Math.min(6, Math.max(1, Math.floor(totalSteps / 2)));
					d2 = totalSteps - d1;
				} else {
					d1 = 6;
					d2 = 7;
				}
				setDiceFace(1, d1);
				setDiceFace(2, d2);
				pill.textContent = `🎲 ¡${player.name} sacó ${d1} + ${d2} = ${totalSteps}! Avanzando a la casilla #${totalSteps} para conseguir empleo...`;
			} else {
				// Tiros regulares con 2 dados estándar
				d1 = Math.floor(Math.random() * 6) + 1;
				d2 = Math.floor(Math.random() * 6) + 1;
				totalSteps = d1 + d2;
				setDiceFace(1, d1);
				setDiceFace(2, d2);
				pill.textContent = `🎲 ¡${player.name} sacó ${d1} + ${d2} = ${totalSteps}! Preparando avance...`;
			}

			// 1 SEGUNDO DE ESPERA antes de que empiece el movimiento de la ficha
			setTimeout(() => {
				stepForwardOnRoad(player, totalSteps);
			}, 1000);
		}
	}, 75);
}

function stepForwardOnRoad(player, totalSteps) {
	let stepsRemaining = totalSteps;
	const pill = document.getElementById('floating-status-pill');
	const isParallelTwo = gameState.players.length === 2;
	const laneIndex = isParallelTwo ? gameState.currentPlayerIndex : 0;

	const stepInterval = setInterval(() => {
		player.position++;
		stepsRemaining--;

		sounds.step();

		// Cargar más casillas si se acerca al final visible para mantener siempre 12+ hacia el horizonte
		if (player.position >= gameState.generatedTiles.length - 18) {
			extendPerspectiveRoad(25);
		}

		// La ficha salta hacia adelante sobre las casillas (las casillas permanecen quietas)
		updatePawnsOnRoad(gameState.currentPlayerIndex);

		// Resaltar casilla activa
		document.querySelectorAll('.tile-lane-card').forEach(t => t.classList.remove('active-step'));
		const tileEl = document.getElementById(`lane-tile-${laneIndex}-${player.position}`);
		if (tileEl) tileEl.classList.add('active-step');

		const currentTileData = gameState.generatedTiles[player.position];
		pill.textContent = `${player.name} avanzando hacia el frente... (${totalSteps - stepsRemaining}/${totalSteps})`;

		// Cobro al pasar por Día de Pago durante el camino
		if (currentTileData && currentTileData.type === 'payday' && stepsRemaining > 0) {
			collectPayday(player, false);
		}

		if (stepsRemaining <= 0) {
			clearInterval(stepInterval);
			updatePawnsOnRoad(-1); // Asentar ficha al detenerse
			pill.textContent = `✨ ${player.name} llegó a: ${currentTileData.name}... Revelando evento...`;

			// 1 SEGUNDO DE ESPERA en la casilla antes de que salga la información de la tarjeta
			setTimeout(() => {
				gameState.isRolling = false;
				handleLanding(player, currentTileData);
			}, 1000);
		}
	}, 230);
}

// ==========================================
// 9. EVENTOS AL CAER EN CASILLA
// ==========================================

function handleLanding(player, tile) {
	const pill = document.getElementById('floating-status-pill');
	pill.textContent = `${player.name} llegó a: ${tile.name} ${tile.icon}`;

	// Si cae en una de las 12 casillas de empleo inicial (casillas 2 a 13)
	if (tile.isStarterJob || (tile.globalIndex >= 2 && tile.globalIndex <= 13 && tile.starterJob)) {
		const job = tile.starterJob || STARTER_JOBS[tile.globalIndex - 2];

		if (!player.hasJob) {
			player.hasJob = true;
			player.profession = job.title;
			player.salary = job.salary;
			player.fixedExpenses = job.salary; // Flujo neto mensual = 0 COP al inicio
			player.salariesCollected = 0;
			player.jobTier = 1;

			sounds.genieMagic();
			updateHUDAndHeaders();

			showModal({
				typeName: '🎉 ¡CONTRATADO EN TU PRIMER EMPLEO!',
				headerClass: 'job',
				icon: job.icon,
				title: `¡Eres ${job.title}!`,
				detailedInfo: `¡Felicitaciones, <strong>${player.name}</strong>! Tus dados te llevaron a la casilla <strong>#${tile.globalIndex}</strong> y has conseguido el empleo de <strong>${job.title}</strong>.<br><br>⏱️ <em>Tu salario mensual es de <strong>${formatCOP(job.salary)} COP</strong>. Recuerda que no se cobra de inmediato: se cobrará periódicamente cada 3 minutos cuando cruces o caigas en las casillas de Día de Pago.</em>`,
				stats: [
					{ label: 'Empleo obtenido:', value: job.title },
					{ label: 'Casilla alcanzada:', value: `#${tile.globalIndex}` },
					{ label: 'Sueldo mensual:', value: `${formatCOP(job.salary)} COP / mes`, color: 'green' }
				],
				buttons: [
					{
						text: '¡Comenzar mi Carrera! 🚀',
						class: 'primary',
						action: () => {
							closeModal(() => endTurn());
						}
					}
				]
			});
			return;
		}
	}

	// Casilla 1: "Nada" (paso libre / descanso)
	if (tile.type === 'nothing') {
		showModal({
			typeName: 'CASILLA VACÍA ⚪',
			headerClass: 'neutral',
			icon: '⚪',
			title: 'Paso Libre',
			detailedInfo: `¡Hola <strong>${player.name}</strong>! En la casilla <strong>#1</strong> no hay ningún empleo ni costo. Puedes descansar y prepararte para tu próximo turno.`,
			stats: [],
			buttons: [
				{
					text: 'Continuar ➔',
					class: 'primary',
					action: () => {
						closeModal(() => endTurn());
					}
				}
			]
		});
		return;
	}

	switch (tile.type) {
		case 'payday':
			collectPayday(player, true);
			break;
		case 'opportunity':
			showOpportunityModal(player);
			break;
		case 'job':
			showJobModal(player);
			break;
		case 'promotion':
			showPromotionModal(player);
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

/**
 * Muestra el valor del pago flotando directamente sobre la casilla de Día de Pago y desapareciendo en 1 segundo
 */
function showFloatingPaydayBubble(tileIndex, laneIndex, amount) {
	const tileEl = document.getElementById(`lane-tile-${laneIndex}-${tileIndex}`);
	if (!tileEl) return;

	const bubble = document.createElement('div');
	bubble.className = 'floating-payday-bubble';

	if (amount > 0) {
		bubble.innerHTML = `+${formatCOP(amount)} COP 💵`;
	} else if (amount < 0) {
		bubble.innerHTML = `-${formatCOP(Math.abs(amount))} COP 💸`;
		bubble.classList.add('negative');
	} else {
		bubble.innerHTML = `+$0 COP ⚖️`;
		bubble.classList.add('neutral');
	}

	tileEl.appendChild(bubble);

	// Se desvanece y desaparece exactamente en 1 segundo (1000ms)
	setTimeout(() => {
		bubble.remove();
	}, 1050);
}

// 1. Día de Pago
function collectPayday(player, isLanding) {
	if (!player.hasJob || player.salary === 0) {
		return;
	}

	player.salariesCollected = (player.salariesCollected || 0) + 1;
	const count = player.salariesCollected;

	const fin = getPlayerFinancials(player);
	player.cash += fin.monthlyCashFlow;
	sounds.cash();
	updateHUDAndHeaders();

	// Destello visual al actualizar el saldo en la casilla del jugador
	const playerPills = document.querySelectorAll('.player-hud-pill');
	if (playerPills[gameState.currentPlayerIndex]) {
		const targetPill = playerPills[gameState.currentPlayerIndex];
		targetPill.classList.remove('pill-payday-flash');
		void targetPill.offsetWidth;
		targetPill.classList.add('pill-payday-flash');
	}

	// Si el balance lateral o modal están visibles, actualizarlos en tiempo real con destello
	renderModalSideBalance();
	const sideCash = document.getElementById('side-bal-cash');
	if (sideCash) {
		sideCash.classList.remove('value-payday-flash');
		void sideCash.offsetWidth;
		sideCash.classList.add('value-payday-flash');
	}

	// Efecto visual flotante del valor del pago sobre la casilla física
	const isParallelTwo = gameState.players.length === 2;
	const laneIndex = isParallelTwo ? gameState.currentPlayerIndex : 0;
	showFloatingPaydayBubble(player.position, laneIndex, fin.monthlyCashFlow);

	// 1. Cada 25 salarios cobrados: Aumento por antigüedad del 5% sin cambio de puesto
	if (count > 0 && count % 25 === 0) {
		const raise5 = Math.round((player.salary * 0.05) / 1000) * 1000;
		player.salary += raise5;
		updateHUDAndHeaders();
		setTimeout(() => {
			showModal({
				typeName: '¡AUMENTO POR ANTIGÜEDAD! 📈',
				headerClass: 'promotion',
				icon: '🎖️',
				title: '¡Aumento del 5% por Constancia!',
				detailedInfo: `¡Felicitaciones, <strong>${player.name}</strong>! Has cobrado <strong>${count} salarios</strong> en tu trayectoria laboral.<br><br>Por tu antigüedad, recibes un aumento automático del <strong>5%</strong> (+${formatCOP(raise5)} COP/mes) sin cambio de puesto.`,
				stats: [
					{ label: 'Salarios cobrados:', value: `${count} salarios` },
					{ label: 'Aumento otorgado:', value: `+${formatCOP(raise5)} COP / mes (5%)`, color: 'green' },
					{ label: 'Nuevo sueldo:', value: `${formatCOP(player.salary)} COP / mes`, color: 'green' }
				],
				buttons: [
					{ text: '¡Excelente! Continuar ➔', class: 'primary', action: () => { closeModal(); } }
				]
			});
		}, 1200);
	}
	// 2. Cada 10 salarios cobrados (que no sea 25): Ascenso laboral con 10% redondeado
	else if (count > 0 && count % 10 === 0) {
		const raise10 = Math.round((player.salary * 0.10) / 1000) * 1000;
		player.salary += raise10;
		player.jobTier = (player.jobTier || 1) + 1;
		const newTitle = getPromotedTitle(player.profession, player.jobTier);
		player.profession = newTitle;
		updateHUDAndHeaders();

		setTimeout(() => {
			showModal({
				typeName: '¡ASCENSO LABORAL! ⭐',
				headerClass: 'promotion',
				icon: '⭐',
				title: '¡Has sido Ascendido!',
				detailedInfo: `¡Bravo, <strong>${player.name}</strong>! Has acumulado <strong>${count} salarios</strong> cobrados en tu trabajo.<br><br>Tu esfuerzo ha sido premiado: ¡recibes un <strong>Ascenso de Cargo</strong> con un <strong>10% de aumento</strong> redondeado!`,
				stats: [
					{ label: 'Nuevo cargo:', value: newTitle },
					{ label: 'Aumento por ascenso:', value: `+${formatCOP(raise10)} COP / mes (10%)`, color: 'green' },
					{ label: 'Sueldo actualizado:', value: `${formatCOP(player.salary)} COP / mes`, color: 'green' }
				],
				buttons: [
					{ text: '¡Celebrar mi Ascenso! 🚀', class: 'primary', action: () => { closeModal(); } }
				]
			});
		}, 1200);
	}

	if (isLanding) {
		const isZeroFlow = fin.monthlyCashFlow === 0;
		showModal({
			typeName: 'DÍA DE PAGO 💰',
			headerClass: 'payday',
			icon: '💰',
			title: '¡Día de Pago!',
			detailedInfo: isZeroFlow
				? `Tus ingresos cubrieron tus gastos del mes (Cobro #${count}).<br><br>💡 <em>¡Llega a 10 cobros para conseguir un ascenso, cambia a un trabajo mejor o compra una oportunidad para aumentar tu plata libre!</em>`
				: `¡Llegó tu plata del mes (Cobro #${count})! Cobraste tu sueldo y las ganancias de tus negocios.`,
			stats: [
				{ label: 'Cobros acumulados:', value: `${count} salarios cobrados` },
				{ label: 'Plata limpia que cobras:', value: `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)} COP`, color: fin.monthlyCashFlow > 0 ? 'green' : (fin.monthlyCashFlow < 0 ? 'red' : '') },
				{ label: 'Total en tu bolsillo:', value: `${formatCOP(player.cash)} COP`, color: 'green' }
			],
			buttons: [
				{ text: '¡Guardar Plata y Seguir! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
			]
		});
	}
}

// 2. Nuevo Trabajo / Cambio de Empleo
function showJobModal(player) {
	const eligible = NEW_JOBS.filter(j => j.title !== player.profession);
	const newJob = pickRandom(eligible.length ? eligible : NEW_JOBS);

	const currentSalary = player.salary;
	const diff = newJob.salary - currentSalary;

	const stats = [
		{ label: 'Empleo propuesto:', value: newJob.title },
		{ label: 'Sueldo nuevo:', value: `${formatCOP(newJob.salary)} / mes` }
	];

	if (diff > 0) {
		stats.push({ label: 'Ganancia mensual mejora:', value: `+${formatCOP(diff)} / mes más`, color: 'green' });
	} else if (diff < 0) {
		stats.push({ label: 'Ganancia mensual bajaría:', value: `-${formatCOP(Math.abs(diff))} / mes`, color: 'red' });
	}

	showModal({
		typeName: 'NUEVO EMPLEO 💼',
		headerClass: 'job',
		icon: '💼',
		title: newJob.title,
		detailedInfo: `¿Quieres cambiar de empleo? Te ofrecen trabajar como <strong>${newJob.title}</strong> con un sueldo de <strong>${formatCOP(newJob.salary)} COP/mes</strong>.`,
		stats: stats,
		buttons: [
			{
				text: '¡Aceptar este Trabajo! 💼',
				class: 'primary',
				action: () => {
					player.profession = newJob.title;
					player.salary = newJob.salary;
					sounds.cash();
					updateHUDAndHeaders();
					showModal({
						typeName: '¡ESTRENAS TRABAJO! 🎉',
						headerClass: 'job',
						icon: '🎉',
						title: newJob.title,
						detailedInfo: `¡Felicitaciones! Ahora trabajas como <strong>${newJob.title}</strong> y tu sueldo es de <strong>${formatCOP(newJob.salary)} COP</strong> al mes.`,
						stats: [
							{ label: 'Nuevo sueldo:', value: `${formatCOP(newJob.salary)} COP/mes`, color: 'green' }
						],
						buttons: [
							{ text: '¡Continuar Jugando! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
						]
					});
				}
			},
			{
				text: 'Conservar Trabajo Actual ➔',
				class: 'secondary',
				action: () => { closeModal(() => endTurn()); }
			}
		]
	});
}

// 3. Ascenso en el Trabajo
function showPromotionModal(player) {
	const promo = pickRandom(PROMOTIONS);
	const nextTier = (player.jobTier || 1) + 1;
	const nextTitle = getPromotedTitle(player.profession, nextTier);

	const stats = [
		{ label: 'Tu sueldo sube:', value: `+${formatCOP(promo.raise)} / mes`, color: 'green' },
		{ label: 'Bono sorpresa en mano:', value: `+${formatCOP(promo.bonus)} COP`, color: 'green' }
	];
	if (nextTitle !== player.profession) {
		stats.unshift({ label: 'Nuevo cargo alcanzado:', value: nextTitle });
	}

	showModal({
		typeName: 'ASCENSO LABORAL ⭐',
		headerClass: 'promotion',
		icon: '⭐',
		title: promo.title,
		detailedInfo: `¡Felicitaciones por tu esfuerzo y constancia! ${promo.desc}`,
		stats,
		buttons: [
			{
				text: '¡Celebrar y Recibir Aumento! 🎉',
				class: 'primary',
				action: () => {
					player.salary += promo.raise;
					player.cash += promo.bonus;
					if (nextTitle !== player.profession) {
						player.jobTier = nextTier;
						player.profession = nextTitle;
					}
					sounds.cash();
					updateHUDAndHeaders();
					closeModal(() => endTurn());
				}
			}
		]
	});
}

// 4. Negocio / Inversión
function showOpportunityModal(player) {
	const deal = pickRandom(SMALL_DEALS);
	presentDeal(player, deal);
}

function presentDeal(player, deal) {
	const canAfford = player.cash >= deal.downPayment;

	const stats = [
		{ label: 'Inversión inicial:', value: `${formatCOP(deal.downPayment)} COP` },
		{
			label: 'Ganancia al mes:',
			value: deal.cashFlow > 0 ? `+${formatCOP(deal.cashFlow)} COP (${deal.roiPercent}% ganancia)` : `$0 COP (${deal.roiPercent}% ganancia / plusvalía)`,
			color: deal.cashFlow > 0 ? 'green' : 'blue'
		}
	];

	const buttons = [];
	if (canAfford) {
		buttons.push({
			text: `¡Aprovechar Oportunidad! 🚀 (${formatCOP(deal.downPayment)})`,
			class: 'primary',
			action: () => {
				player.cash -= deal.downPayment;
				player.assets.push({ ...deal });
				sounds.cash();
				updateHUDAndHeaders();

				const successDesc = deal.cashFlow > 0
					? `¡Excelente decisión! Ahora recibes <strong>+${formatCOP(deal.cashFlow)} COP extra (${deal.roiPercent}% de ganancia)</strong> todos los meses en tu Día de Pago.`
					: `¡Adquiriste este activo! Aunque su ganancia mensual es del <strong>0% ($0 COP/mes)</strong>, podrás venderlo por un precio mayor cuando caigas en casillas de Venta en el Mercado.`;

				showModal({
					typeName: '¡ÉXITO! 🎉',
					headerClass: 'opportunity',
					icon: '🎉',
					title: deal.title,
					detailedInfo: successDesc,
					stats: [
						{
							label: 'Ganancia agregada:',
							value: deal.cashFlow > 0 ? `+${formatCOP(deal.cashFlow)} COP/mes (${deal.roiPercent}%)` : `$0 COP/mes (${deal.roiPercent}%)`,
							color: deal.cashFlow > 0 ? 'green' : 'blue'
						}
					],
					buttons: [
						{ text: '¡Continuar Jugando! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
					]
				});
			}
		});
	} else {
		buttons.push({
			text: 'Pedir Préstamo al Banco 🏦',
			class: 'primary',
			action: () => {
				showLoanModal(() => presentDeal(player, deal));
			}
		});
	}

	buttons.push({
		text: 'Pasar Oportunidad ➔',
		class: 'secondary',
		action: () => {
			closeModal(() => endTurn());
		}
	});

	showModal({
		typeName: 'OPORTUNIDAD 🚀',
		headerClass: 'opportunity',
		icon: '💼',
		title: deal.title,
		desc: deal.desc,
		stats,
		buttons
	});
}

// 5. Antojos (Doodads)
function showDoodadModal(player) {
	const doodad = pickRandom(DOODADS);
	player.cash -= doodad.cost;
	sounds.loss();
	updateHUDAndHeaders();

	showModal({
		typeName: 'ANTOJITO 🛍️',
		headerClass: 'doodad',
		icon: '🛍️',
		title: doodad.title,
		detailedInfo: `${doodad.desc}<br><br><small style="color:#64748b;">💡 Consejo: Guardar platica para los negocios te ayuda a ganar más rápido.</small>`,
		stats: [
			{ label: 'Gasto en efectivo:', value: `-${formatCOP(doodad.cost)} COP`, color: 'red' },
			{ label: 'Te queda en bolsillo:', value: `${formatCOP(player.cash)} COP`, color: player.cash >= 0 ? 'green' : 'red' }
		],
		buttons: [
			{ text: '¡Seguir Jugando! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
		]
	});
}

// 6. El Mercado / Venta
function showMarketModal(player) {
	if (!player.assets || player.assets.length === 0) {
		showModal({
			typeName: 'MERCADO 📈',
			headerClass: 'market',
			icon: '🛍️',
			title: 'Compradores en la Ciudad',
			detailedInfo: 'Hoy llegaron varios inversionistas con dinero buscando comprar negocios, pero aún no tienes ninguno.<br><br><em>¡Aprovecha las casillas verdes para comprar activos y venderlos aquí con grandes ganancias!</em>',
			stats: [],
			buttons: [
				{ text: 'Continuar ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
			]
		});
		return;
	}

	const event = pickRandom(MARKET_EVENTS);

	if (!event.appliesTo) {
		showModal({
			typeName: 'MERCADO 📈',
			headerClass: 'market',
			icon: '🌤️',
			title: 'Economía Estable',
			detailedInfo: 'La economía está tranquila este mes. ¡Sigue comprando oportunidades en las casillas verdes!',
			stats: [],
			buttons: [
				{ text: 'Continuar ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
			]
		});
		return;
	}

	const eligibleIndex = player.assets.findIndex(a => {
		if (event.appliesTo === 'Propiedad Raíz' && (a.category === 'Propiedad Raíz' || a.title?.includes('Habitación'))) return true;
		if (event.appliesTo === 'Acciones' && (a.category === 'Acciones' || a.category === 'Inversión Pasiva' || a.title?.includes('Sweet Lab') || a.title?.includes('Bono'))) return true;
		if (event.appliesTo === 'Emprendimiento' && (a.category === 'Emprendimiento' || a.category === 'Negocio Propio' || a.title?.includes('Cupcakes') || a.title?.includes('Limonada') || a.title?.includes('Stickers') || a.title?.includes('Bicicletas') || a.title?.includes('Pulseras'))) return true;
		if (event.appliesTo === 'Negocio Automático' && (a.category === 'Negocio Automático' || a.category === 'Alquiler de Equipos' || a.title?.includes('Máquina') || a.title?.includes('Lavadora') || a.title?.includes('Consolas'))) return true;
		return false;
	});

	if (eligibleIndex === -1) {
		showModal({
			typeName: 'OFERTA DE MERCADO 📈',
			headerClass: 'market',
			icon: '📈',
			title: event.title,
			detailedInfo: `Un comprador está buscando adquirir negocios, pero tú aún no tienes este activo.<br><br><em>¡Asegúrate de invertir en las casillas verdes para vender cuando haya compradores!</em>`,
			stats: [],
			buttons: [
				{ text: '¡Entendido! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
			]
		});
		return;
	}

	const asset = player.assets[eligibleIndex];
	showModal({
		typeName: 'OFERTA DE COMPRA 💰',
		headerClass: 'market',
		icon: '💰',
		title: event.title,
		detailedInfo: `Hay un comprador interesado en adquirir tu negocio <strong>${asset.title}</strong> hoy mismo. ¿Deseas venderlo y recibir el pago en efectivo?`,
		stats: [
			{ label: 'Pago en efectivo:', value: `${formatCOP(event.salePrice)} COP`, color: 'green' }
		],
		buttons: [
			{
				text: `¡Vender por ${formatCOP(event.salePrice)} COP! 💰`,
				class: 'primary',
				action: () => {
					player.assets.splice(eligibleIndex, 1);
					player.cash += event.salePrice;
					sounds.cash();
					updateHUDAndHeaders();
					showModal({
						typeName: '¡VENTA EXITOSA! 🎉',
						headerClass: 'market',
						icon: '🎉',
						title: asset.title,
						detailedInfo: `¡Felicitaciones! Recibiste <strong>${formatCOP(event.salePrice)} COP</strong> en efectivo para comprar nuevas oportunidades.`,
						stats: [
							{ label: 'Cobraste:', value: `+${formatCOP(event.salePrice)} COP`, color: 'green' }
						],
						buttons: [{ text: 'Continuar ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }]
					});
				}
			},
			{
				text: 'Conservar mi Oportunidad ➔',
				class: 'secondary',
				action: () => { closeModal(() => endTurn()); }
			}
		]
	});
}

// 7. Regalo / Solidaridad (Ultra-Minimalista: Botones Predominantes y Botón de Info Alejado)
function showCharityModal(player) {
	const donation = 20000;
	const reward = 30000;
	const canAfford = player.cash >= donation;

	showModal({
		typeName: 'DONACIÓN 💛',
		headerClass: 'charity',
		icon: '🎁',
		title: 'Donación Solidaria',
		detailedInfo: `Donas <strong>${formatCOP(donation)} COP</strong> para apoyar a una fundación benéfica. Como agradecimiento por tu solidaridad, recibes una sorpresa de <strong>+${formatCOP(reward)} COP</strong>.`,
		stats: [], // Sin lista de texto central para máxima limpieza visual
		buttons: [
			...(canAfford ? [{
				text: `Donar $20.000 COP 💛`,
				class: 'primary',
				action: () => {
					player.cash -= donation;
					player.cash += reward;
					sounds.cash();
					updateHUDAndHeaders();
					closeModal(() => endTurn());
				}
			}] : []),
			{
				text: 'Pasar ➔',
				class: 'secondary',
				action: () => { closeModal(() => endTurn()); }
			}
		]
	});
}

// 8. Pausa / Descanso
function showCrisisModal(player) {
	player.skipTurns = 1;
	sounds.loss();
	updateHUDAndHeaders();

	showModal({
		typeName: 'PAUSA / DESCANSO ⏸️',
		headerClass: 'crisis',
		icon: '🏖️',
		title: 'Pausa de un Turno',
		detailedInfo: `Te tomas unos días de vacaciones para recargar pilas, compartir con amigos y pensar nuevas metas financieras.`,
		stats: [
			{ label: 'Descanso:', value: 'Pausas 1 turno' },
			{ label: 'Tu plata en bolsillo:', value: `${formatCOP(player.cash)} COP`, color: 'green' }
		],
		buttons: [
			{ text: '¡Descansar y Continuar! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
		]
	});
}

// ==========================================
// 10. PRÉSTAMOS Y DEUDAS BANCARIAS
// ==========================================

function showLoanModal(callbackAfterLoan) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const loanBlock = 100000;
	const interest = 5000;

	showModal({
		typeName: 'BANCO SWEET LAB 🏦',
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'Préstamo Bancario',
		detailedInfo: `Pides dinero prestado para comprar una oportunidad que te dé ganancias mensuales. Por cada $100.000 COP prestados, sumas una cuota mensual de $5.000 COP.`,
		stats: [
			{ label: 'Dinero prestado:', value: '+100.000 COP', color: 'green' },
			{ label: 'Cuota mensual:', value: '$5.000 COP / mes', color: 'red' },
			{ label: 'Tu deuda acumulada:', value: `${formatCOP(player.totalDebt)} COP` }
		],
		buttons: [
			{
				text: 'Pedir $100.000 COP al Banco 🏦',
				class: 'primary',
				action: () => {
					player.cash += loanBlock;
					player.totalDebt += loanBlock;
					player.debtExpenses += interest;
					sounds.cash();
					updateHUDAndHeaders();
					if (callbackAfterLoan) callbackAfterLoan();
					else closeModal(() => endTurn());
				}
			},
			{
				text: 'Pedir $200.000 COP al Banco 🏦',
				class: 'primary',
				action: () => {
					const block2 = loanBlock * 2;
					player.cash += block2;
					player.totalDebt += block2;
					player.debtExpenses += (interest * 2);
					sounds.cash();
					updateHUDAndHeaders();
					if (callbackAfterLoan) callbackAfterLoan();
					else closeModal(() => endTurn());
				}
			},
			{
				text: 'Cancelar ➔',
				class: 'secondary',
				action: () => {
					if (callbackAfterLoan) callbackAfterLoan();
					else closeModal(() => endTurn());
				}
			}
		]
	});
}

function showPayDebtModal() {
	const player = gameState.players[gameState.currentPlayerIndex];
	if (player.totalDebt <= 0) {
		alert('¡No tienes deudas activas!');
		return;
	}

	const payAmount = Math.min(player.totalDebt, 100000);
	const canAfford = player.cash >= payAmount;

	showModal({
		typeName: 'PAGAR DEUDA 💳',
		headerClass: 'opportunity',
		icon: '💳',
		title: 'Abonar a tu Deuda',
		detailedInfo: `Pagar <strong>${formatCOP(payAmount)} COP</strong> de tu deuda bancaria reduce tus gastos en $5.000 COP al mes, aumentando tu plata libre.`,
		stats: [
			{ label: 'Deuda que debes:', value: `${formatCOP(player.totalDebt)} COP` },
			{ label: 'Tu Plata en Mano:', value: `${formatCOP(player.cash)} COP`, color: canAfford ? 'green' : 'red' }
		],
		buttons: [
			{
				text: `Pagar cuota de ${formatCOP(payAmount)} COP`,
				class: 'primary',
				action: () => {
					if (!canAfford) {
						alert('No tienes suficiente plata en mano para pagar esta cuota.');
						return;
					}
					player.cash -= payAmount;
					player.totalDebt -= payAmount;
					player.debtExpenses = Math.max(0, player.debtExpenses - 5000);
					sounds.cash();
					closeModal();
					updateHUDAndHeaders();
				}
			},
			{
				text: 'Cerrar ➔',
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

let currentFlyingTileEl = null;

function endTurn() {
	if (gameState.isCardFlying) {
		gameState.pendingEndTurn = true;
		return;
	}

	const current = gameState.players[gameState.currentPlayerIndex];
	if (checkVictoryCondition(current)) return;

	gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
	gameState.isRolling = false;
	gameState.cameraViewOffset = 0;
	updateHUDAndHeaders();
	centerPerspective(true); // Al terminar el turno, deslizar suavemente las casillas para centrar al siguiente jugador
}

/**
 * Renderiza el widget de balance a mano derecha mientras se muestra la tarjeta central
 */
function renderModalSideBalance() {
	const sideBalanceEl = document.getElementById('modal-side-balance');
	if (!sideBalanceEl) return;

	// Solo el balance del jugador activo en turno, sin opciones de cambio
	const player = gameState.players[gameState.currentPlayerIndex];
	if (!player) return;

	const fin = getPlayerFinancials(player);

	// Header
	const avatarEl = document.getElementById('side-bal-avatar');
	const nameEl = document.getElementById('side-bal-name');
	const jobEl = document.getElementById('side-bal-job');
	if (avatarEl) {
		avatarEl.textContent = player.avatar;
		avatarEl.style.background = player.bg;
	}
	if (nameEl) nameEl.textContent = `${player.name} (Turno)`;
	if (jobEl) {
		const count = player.salariesCollected || 0;
		if (player.hasJob) {
			jobEl.textContent = `${player.profession} • ${count} salarios cobrados`;
		} else {
			jobEl.textContent = 'Buscando empleo 🔍';
		}
	}

	// Resumen Superior: Efectivo y Flujo Libre
	const cashEl = document.getElementById('side-bal-cash');
	const flowEl = document.getElementById('side-bal-flow');
	if (cashEl) {
		cashEl.textContent = `${formatCOP(player.cash)} COP`;
		cashEl.className = `val cash ${player.cash < 0 ? 'red' : ''}`;
	}
	if (flowEl) {
		flowEl.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}/m`;
		flowEl.className = `val flow ${fin.monthlyCashFlow < 0 ? 'red' : ''}`;
	}

	// 1. INGRESOS
	const salaryEl = document.getElementById('side-bal-salary');
	const passiveEl = document.getElementById('side-bal-passive');
	const totalIncomeEl = document.getElementById('side-bal-total-income');
	if (salaryEl) salaryEl.textContent = formatCOP(player.salary);
	if (passiveEl) passiveEl.textContent = `+${formatCOP(fin.passiveIncome)}`;
	if (totalIncomeEl) totalIncomeEl.textContent = formatCOP(fin.totalIncome);

	// 2. SALIDAS / GASTOS
	const fixedExpEl = document.getElementById('side-bal-fixed-exp');
	const debtExpEl = document.getElementById('side-bal-debt-exp');
	const totalExpEl = document.getElementById('side-bal-total-exp');
	if (fixedExpEl) fixedExpEl.textContent = `-${formatCOP(player.fixedExpenses)}`;
	if (debtExpEl) debtExpEl.textContent = player.debtExpenses > 0 ? `-${formatCOP(player.debtExpenses)}` : '$0';
	if (totalExpEl) totalExpEl.textContent = `-${formatCOP(fin.totalExpenses)}`;

	// 3. ACTIVOS
	const assetsCountEl = document.getElementById('side-bal-assets-count');
	const assetsListEl = document.getElementById('side-bal-assets-list');
	if (assetsCountEl) {
		const count = player.assets.length;
		assetsCountEl.textContent = count === 1 ? '1 negocio' : `${count} negocios`;
	}
	if (assetsListEl) {
		if (player.assets.length > 0) {
			assetsListEl.innerHTML = player.assets.map(a => `
				<div class="k-item">
					<span class="lbl" title="${a.title}">${a.title}</span>
					<span class="val green">+${formatCOP(a.cashFlow || 0)}/m</span>
				</div>
			`).join('');
		} else {
			assetsListEl.innerHTML = `<span class="k-empty">Sin negocios aún</span>`;
		}
	}

	// 4. PASIVOS
	const totalDebtEl = document.getElementById('side-bal-total-debt');
	const debtValEl = document.getElementById('side-bal-debt-val');
	const debtPayEl = document.getElementById('side-bal-debt-payment');
	if (totalDebtEl) totalDebtEl.textContent = player.totalDebt > 0 ? `${formatCOP(player.totalDebt)}` : '$0';
	if (debtValEl) debtValEl.textContent = player.totalDebt > 0 ? `${formatCOP(player.totalDebt)}` : '$0';
	if (debtPayEl) debtPayEl.textContent = player.debtExpenses > 0 ? `-${formatCOP(player.debtExpenses)}/m` : '$0/m';

	sideBalanceEl.classList.add('active');
}

// ==========================================
// 13. MODALES DE TARJETAS (Efecto 3D Levantar, Voltear y Regresar)
// ==========================================

function showModal({ typeName, headerClass, icon, title, subtitle, desc, stats = [], buttons = [], detailedInfo = '' }) {
	const overlay = document.getElementById('flying-card-overlay');
	const wrapper = document.getElementById('flying-card-wrapper');
	const flipper = document.getElementById('flying-card-flipper');
	const frontFace = document.getElementById('flying-card-front');

	const badgeEl = document.getElementById('modal-badge');
	const infoToggleEl = document.getElementById('modal-info-toggle');
	const iconEl = document.getElementById('modal-icon');
	const titleEl = document.getElementById('modal-title');
	const descEl = document.getElementById('modal-desc');
	const statsEl = document.getElementById('modal-stats');
	const balanceValEl = document.getElementById('modal-balance-val');
	const footerEl = document.getElementById('modal-footer');

	const current = gameState.players[gameState.currentPlayerIndex];

	if (!wrapper || !flipper) return;

	// Configurar contenido de la tarjeta minimalista (blanco y gris 1%)
	const defaultType = typeName || (headerClass ? headerClass.toUpperCase() : 'OPORTUNIDAD');
	if (badgeEl) badgeEl.textContent = defaultType;
	if (iconEl) iconEl.textContent = icon || '🚀';
	if (titleEl) titleEl.textContent = title || '';

	// Botón de información alejado (Top-Right) y descripción oculta por defecto
	const detailText = detailedInfo || desc || '';
	if (descEl) {
		descEl.innerHTML = detailText;
		descEl.classList.add('hidden');
	}
	if (infoToggleEl) {
		if (detailText) {
			infoToggleEl.classList.remove('hidden');
			infoToggleEl.textContent = 'ℹ️ Info';
			infoToggleEl.onclick = (e) => {
				e.stopPropagation();
				const isHidden = descEl.classList.toggle('hidden');
				infoToggleEl.textContent = isHidden ? 'ℹ️ Info' : '✕ Cerrar';
			};
		} else {
			infoToggleEl.classList.add('hidden');
			infoToggleEl.onclick = null;
		}
	}

	// Estadísticas minimalistas
	if (statsEl) {
		if (stats && stats.length > 0) {
			statsEl.innerHTML = stats.map(s => `
				<div class="mini-stat-line">
					<span class="lbl">${s.label}</span>
					<span class="val ${s.color || ''}">${s.value}</span>
				</div>
			`).join('');
			statsEl.style.display = 'flex';
		} else {
			statsEl.innerHTML = '';
			statsEl.style.display = 'none';
		}
	}

	// Mostrar widget lateral minimalista a mano derecha
	renderModalSideBalance(gameState.currentPlayerIndex);

	// Botones predominantes
	if (footerEl) {
		footerEl.innerHTML = '';
		buttons.forEach(b => {
			const btn = document.createElement('button');
			btn.className = `cf-dialog-btn ${b.class || 'primary'}`;
			btn.textContent = b.text;
			btn.addEventListener('click', () => {
				if (b.action) b.action();
			});
			footerEl.appendChild(btn);
		});
	}

	// Si la tarjeta ya está en el centro (ej. confirmación, préstamo o felicitación):
	if (gameState.isCardFlying) {
		flipper.style.transform = 'rotateX(0deg) rotateY(180deg) scale(1.02)';
		setTimeout(() => {
			flipper.style.transform = 'rotateX(0deg) rotateY(180deg) scale(1)';
		}, 150);
		return;
	}

	// 1. Obtener la casilla activa del camino donde cayó el jugador
	const isParallelTwo = gameState.players.length === 2;
	const laneIndex = isParallelTwo ? gameState.currentPlayerIndex : 0;
	const activeTile = document.getElementById(`lane-tile-${laneIndex}-${current.position}`);

	gameState.isCardFlying = true;
	currentFlyingTileEl = activeTile;

	if (activeTile && frontFace) {
		// Clonar la apariencia física exacta de la casilla en la cara frontal
		const tileData = gameState.generatedTiles[current.position];
		frontFace.className = `flying-card-face flying-card-front tile-lane-card ${tileData ? tileData.styleClass : 'opportunity'}`;
		frontFace.innerHTML = activeTile.innerHTML;
		frontFace.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

		// Medir posición y dimensiones exactas en la pantalla de la casilla en el camino
		const rect = activeTile.getBoundingClientRect();
		const startW = activeTile.offsetWidth || 236;
		const startH = activeTile.offsetHeight || 115;
		const startX = rect.left + rect.width / 2 - startW / 2;
		const startY = rect.top + rect.height / 2 - startH / 2;

		// Dimensiones destino en el centro de la pantalla (ampliada y proporcionada)
		const targetW = Math.min(450, Math.floor(window.innerWidth * 0.92));
		const targetH = Math.min(540, Math.floor(window.innerHeight * 0.88));
		let targetX = Math.floor((window.innerWidth - targetW) / 2);
		const targetY = Math.floor((window.innerHeight - targetH) / 2);

		// En pantallas amplias (>= 1380px), desplazar hacia la izquierda para que no compita con el balance a la derecha
		if (window.innerWidth >= 1380) {
			targetX = Math.floor((window.innerWidth - targetW - 540) / 2);
		}

		// Posicionar la tarjeta voladora exactamente sobre la casilla del camino con su ángulo 3D (42deg)
		wrapper.style.display = 'block';
		wrapper.style.pointerEvents = 'none';
		wrapper.style.transition = 'none';
		flipper.style.transition = 'none';

		wrapper.style.width = `${startW}px`;
		wrapper.style.height = `${startH}px`;
		wrapper.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;
		flipper.style.transform = 'rotateX(42deg) rotateY(0deg)';

		// Atenuar la casilla en el camino para dar la sensación física de que se desprendió
		activeTile.style.transition = 'opacity 0.25s ease';
		activeTile.style.opacity = '0.12';

		// Forzar reflujo
		void wrapper.offsetWidth;

		// Sonido mágico al despegar
		sounds.genieMagic();

		// Animar elevación, expansión a la mitad de la pantalla y volteo 3D a 180°
		// 0.5s más pausada (1.25s) para una experiencia fluida y fácil de contemplar
		const animDuration = '1.25s cubic-bezier(0.22, 1, 0.36, 1)';
		wrapper.style.transition = `transform ${animDuration}, width ${animDuration}, height ${animDuration}`;
		flipper.style.transition = `transform ${animDuration}`;

		overlay.classList.add('active');
		wrapper.style.width = `${targetW}px`;
		wrapper.style.height = `${targetH}px`;
		wrapper.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
		flipper.style.transform = 'rotateX(0deg) rotateY(180deg)';

		setTimeout(() => {
			wrapper.style.pointerEvents = 'auto';
		}, 1250);
	} else {
		// Modo de respaldo
		overlay.classList.add('active');
		wrapper.style.pointerEvents = 'auto';
	}
}

function closeModal(callback) {
	const overlay = document.getElementById('flying-card-overlay');
	const wrapper = document.getElementById('flying-card-wrapper');
	const flipper = document.getElementById('flying-card-flipper');
	const sideBal = document.getElementById('modal-side-balance');

	if (sideBal) sideBal.classList.remove('active');

	if (!wrapper || !gameState.isCardFlying) {
		if (overlay) overlay.classList.remove('active');
		if (callback) callback();
		if (gameState.pendingEndTurn) {
			gameState.pendingEndTurn = false;
			endTurn();
		}
		return;
	}

	wrapper.style.pointerEvents = 'none';
	sounds.cardLand();

	const activeTile = currentFlyingTileEl;

	if (activeTile) {
		// Re-medir la posición actual de la casilla en el camino por si cambió la vista
		const rect = activeTile.getBoundingClientRect();
		const startW = activeTile.offsetWidth || 236;
		const startH = activeTile.offsetHeight || 115;
		const startX = rect.left + rect.width / 2 - startW / 2;
		const startY = rect.top + rect.height / 2 - startH / 2;

		// Animar de regreso 0.5s más pausada (1.15s)
		const returnDuration = '1.15s cubic-bezier(0.22, 1, 0.36, 1)';
		wrapper.style.transition = `transform ${returnDuration}, width ${returnDuration}, height ${returnDuration}`;
		flipper.style.transition = `transform ${returnDuration}`;

		overlay.classList.remove('active');

		// Animar de regreso: reducir tamaño, des-voltear a 0° y volver a colocarse en el camino en 42°
		wrapper.style.width = `${startW}px`;
		wrapper.style.height = `${startH}px`;
		wrapper.style.transform = `translate3d(${startX}px, ${startY}px, 0)`;
		flipper.style.transform = 'rotateX(42deg) rotateY(0deg)';

		setTimeout(() => {
			wrapper.style.display = 'none';
			activeTile.style.opacity = '1';

			// Sutil efecto de asentamiento físico en el tablero
			activeTile.classList.remove('tile-landing-thump');
			void activeTile.offsetWidth;
			activeTile.classList.add('tile-landing-thump');

			gameState.isCardFlying = false;
			currentFlyingTileEl = null;

			if (callback) callback();
			if (gameState.pendingEndTurn) {
				gameState.pendingEndTurn = false;
				endTurn();
			}
		}, 1150);
	} else {
		overlay.classList.remove('active');
		wrapper.style.display = 'none';
		gameState.isCardFlying = false;
		currentFlyingTileEl = null;
		if (callback) callback();
		if (gameState.pendingEndTurn) {
			gameState.pendingEndTurn = false;
			endTurn();
		}
	}
}

function pickRandom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
