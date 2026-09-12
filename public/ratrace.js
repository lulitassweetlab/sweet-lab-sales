/**
 * RatRace - Carrera de la Rata (CashFlow)
 * Edición Sweet Lab Finanzas - Versión Colombia (Pesos Colombianos)
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

// 12 Empleos básicos de inicio seleccionados por el usuario (Calibrados 2026: Salario mínimo base $1.750.000)
const STARTER_JOBS = [
	{ id: 1, title: 'Cocinero 👨‍🍳', salary: 1850000, icon: '👨‍🍳', desc: 'Preparas platos deliciosos y coordinas la cocina con gran sazón.' },
	{ id: 2, title: 'Tendero 🏪', salary: 1780000, icon: '🏪', desc: 'Atiendes a los clientes de tu barrio y mantienes la tienda surtida.' },
	{ id: 3, title: 'Auxiliar Veterinario 🐾', salary: 1950000, icon: '🐾', desc: 'Cuidas y asistes en la atención médica de perritos y gatos.' },
	{ id: 4, title: 'Domiciliario 🛵', salary: 1800000, icon: '🛵', desc: 'Entregas pedidos y paquetes de manera ágil por toda la zona.' },
	{ id: 5, title: 'Recreacionista 🎈', salary: 1920000, icon: '🎈', desc: 'Organizas dinámicas, juegos y figuras con globos en fiestas.' },
	{ id: 6, title: 'Jardinero 🌱', salary: 1760000, icon: '🌱', desc: 'Siembras flores, podas prados y cuidas zonas verdes hermosas.' },
	{ id: 7, title: 'Constructor 🔨', salary: 1980000, icon: '🔨', desc: 'Ayudas en obras, mampostería y acabados de edificaciones.' },
	{ id: 8, title: 'Vendedor 🏷️', salary: 1900000, icon: '🏷️', desc: 'Asesoras a clientes para elegir los mejores productos en el local.' },
	{ id: 9, title: 'Fotógrafo 📸', salary: 2100000, icon: '📸', desc: 'Tomas fotografías en eventos sociales y sesiones de retratos.' },
	{ id: 10, title: 'Lavacarros 🚗', salary: 1750000, icon: '🚗', desc: 'Dejas brillantes los automóviles con lavado y encerado profesional.' },
	{ id: 11, title: 'Servicio al Cliente 🎧', salary: 1880000, icon: '🎧', desc: 'Resuelves dudas y ayudas a personas con amabilidad y paciencia.' },
	{ id: 12, title: 'Traductor 🗣️', salary: 2250000, icon: '🗣️', desc: 'Traduces textos y conversaciones entre diferentes idiomas.' }
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

// Opciones de Nuevo Trabajo para cambiar de empleo con diferentes sueldos (Calibrados 2026)
const NEW_JOBS = [
	{ title: 'Barista en Cafetería ☕', salary: 1950000, desc: 'Preparando cafés especiales y malteadas deliciosas.' },
	{ title: 'Pastelero en Sweet Lab 🍰', salary: 2100000, desc: 'Creando tortas decoradas y postres para eventos.' },
	{ title: 'Entrenador Deportivo ⚽', salary: 2200000, desc: 'Guiando entrenamientos y partidos de fútbol juvenil.' },
	{ title: 'Profesor de Música 🎸', salary: 2300000, desc: 'Enseñando guitarra, piano y canto a nuevos talentos.' },
	{ title: 'Fotógrafo de Moda 📸', salary: 2400000, desc: 'Tomando fotos para marcas juveniles y redes sociales.' },
	{ title: 'Técnico de Celulares 📱', salary: 2450000, desc: 'Arreglando pantallas y repuestos de teléfonos.' },
	{ title: 'Administrador de Local 🏪', salary: 2550000, desc: 'Coordinando el equipo y las ventas de la tienda.' },
	{ title: 'Diseñador Digital 🎨', salary: 2750000, desc: 'Diseñando marcas, logos y publicidad para internet.' },
	{ title: 'Programador Junior 💻', salary: 3000000, desc: 'Creando aplicaciones móviles y páginas web modernas.' },
	{ title: 'Piloto de Drones 🛸', salary: 3200000, desc: 'Grabando tomas aéreas para películas y comerciales.' }
];

// Ascensos dentro del trabajo con mejor pago (Calibrados 2026, sin bonos sorpresa)
const PROMOTIONS = [
	{ title: '¡Coordinador de Turno! ⭐', desc: 'Te nombraron líder de tu turno por tu compromiso y puntualidad.', raise: 180000 },
	{ title: '¡Empleado del Mes! 🏆', desc: 'Recibes reconocimiento oficial con aumento de sueldo.', raise: 220000 },
	{ title: '¡Subiste de Nivel! 🚀', desc: 'Superaste las metas del mes y te asignaron mejor categoría laboral.', raise: 250000 },
	{ title: '¡Especialista Senior! 🎖️', desc: 'Tus clientes te calificaron con 5 estrellas y tu jefe te subió el sueldo.', raise: 300000 },
	{ title: '¡Mano Derecha del Jefe! 💼', desc: 'Ahora ayudas en la toma de decisiones con un pago mucho mayor.', raise: 350000 }
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
		name: 'IMPREVISTO',
		icon: '💸',
		sub: 'Gasto o antojo',
		badge: 'Gasto'
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
	},
	housing: {
		type: 'housing',
		styleClass: 'tile-color-housing',
		name: 'MEJORA VIVIENDA',
		icon: '🏡',
		sub: 'Mejora tu hogar',
		badge: 'Mejora Hogar'
	}
};

// Escala de Mejoras de Vivienda (Alquiler progresivo calibrado a solicitud)
const HOUSING_LEVELS = [
	{ level: 0, title: 'Habitación Básica', rent: 500000, icon: '🛏️', desc: 'Habitación sencilla independiente o compartida para iniciar tu carrera.' },
	{ level: 1, title: 'Habitación Mejor', rent: 600000, icon: '🚪', desc: 'Habitación con ventana exterior, mejor iluminación y espacio más cómodo.' },
	{ level: 2, title: 'Súper Habitación', rent: 700000, icon: '🛋️', desc: 'Habitación amplia con baño privado y clóset espacioso.' },
	{ level: 3, title: 'Habitación de Lujo', rent: 1000000, icon: '⭐', desc: 'Habitación premium en sector exclusivo, acabados modernos y servicios incluidos.' },
	{ level: 4, title: 'Apartaestudio', rent: 1300000, icon: '🏢', desc: 'Espacio totalmente independiente con cocina americana y baño privado.' },
	{ level: 5, title: 'Apartaestudio Mejor', rent: 1400000, icon: '🏙️', desc: 'Apartaestudio con balcón, excelente ventilación y zona de ropas.' },
	{ level: 6, title: 'Súper Apartaestudio', rent: 1500000, icon: '✨', desc: 'Apartaestudio contemporáneo en edificio inteligente con gimnasio.' },
	{ level: 7, title: 'Apartamento 2 Habitaciones', rent: 1700000, icon: '🏠', desc: 'Apartamento de dos cuartos, sala comedor y cocina integral.' },
	{ level: 8, title: 'Apartamento 2 Habitaciones Mejor', rent: 1800000, icon: '🏡', desc: 'Apartamento de 2 habitaciones remodelado en conjunto cerrado con parqueadero.' },
	{ level: 9, title: 'Súper Apartamento 2 Habitaciones', rent: 1900000, icon: '🌟', desc: 'Apartamento de 2 alcobas con acabados de lujo, terraza y vigilancia 24h.' },
	{ level: 10, title: 'Apartamento 3 Habitaciones', rent: 2000000, icon: '🏘️', desc: 'Apartamento familiar amplio de 3 habitaciones, sala de televisión y estudio.' },
	{ level: 11, title: 'Apartamento 3 Habitaciones Mejor', rent: 2200000, icon: '🏰', desc: 'Apartamento de 3 alcobas en estrato alto con club house, piscina y canchas.' },
	{ level: 12, title: 'Súper Apartamento 3 Habitaciones', rent: 2400000, icon: '💎', desc: 'Exclusivo apartamento de 3 alcobas con vista panorámica y ascensor privado.' },
	{ level: 13, title: 'Penthouse Exclusivo', rent: 2800000, icon: '👑', desc: 'Penthouse de doble altura con terraza privada BBQ y jacuzzi.' },
	{ level: 14, title: 'Casa Campestre Familiar', rent: 3200000, icon: '🌳', desc: 'Residencia campestre privada rodeada de naturaleza y amplios jardines.' }
];

// Gastos fijos obligatorios de inicio calibrados a solicitud del usuario (Total: $1.500.000)
const DEFAULT_FIXED_EXPENSES = {
	rent: 500000,           // Arriendo (Habitación Básica inicial)
	groceries: 450000,      // Mercado
	utilities: 180000,      // Servicios públicos (agua, luz, gas)
	transport: 160000,      // Transporte
	internet: 80000,        // Internet fijo
	phone: 40000,           // Plan datos
	other: 90000            // Otros
};

// Barajas de cartas adaptadas al capital inicial ($500.000) y salarios 2026
// Utilidades mensuales calibradas a solicitud del usuario:
// - Ocasiones regulares: 0.3%, 0.5%, 0.7%, 0.8%, 0.9%, 1%, 1.2%, 1.5%, 1.6%, 1.7%, 2%
// - En extrañas ocasiones: 2.5%, 3%, 3.5%
// - En más extrañas situaciones: 4%, 5%
const SMALL_DEALS = [
	// ==========================================
	// OCASIONES REGULARES (0.3% a 2%)
	// ==========================================

	// --- 0.3% DE GANANCIA MENSUAL ---
	{
		title: 'Cuenta de Ahorro a la Vista 🏦',
		type: 'stock',
		ticker: 'AHORRO',
		desc: 'Depósito a la vista seguro en entidad financiera con disponibilidad diaria.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 1500, // 0.3%
		roiPercent: 0.3,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '🏦'
	},
	{
		title: 'Microbono de Deuda Soberana 📑',
		type: 'stock',
		ticker: 'M-TES',
		desc: 'Título público de renta fija con máxima calificación de riesgo soberano.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 1800, // 0.3%
		roiPercent: 0.3,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '📑'
	},
	{
		title: 'Depósito Remunerado Seguro 💳',
		type: 'stock',
		ticker: 'REMUN',
		desc: 'Saldo remunerado en cuenta bancaria corporativa con rendimiento garantizado.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 1200, // 0.3%
		roiPercent: 0.3,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '💳'
	},

	// --- 0.5% DE GANANCIA MENSUAL ---
	{
		title: 'Fondo Fiduciario de Renta Fija 🏛️',
		type: 'stock',
		ticker: 'FIDUCIA',
		desc: 'Fideicomiso administrado por fiduciaria bancaria invertido en pagarés de bajo riesgo.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 2500, // 0.5%
		roiPercent: 0.5,
		category: 'Fondos',
		rarity: 'common',
		icon: '🏛️'
	},
	{
		title: 'Bono Bancario de Alta Calificación 💵',
		type: 'stock',
		ticker: 'BON-BANC',
		desc: 'Bono emitido por banca nacional con pago mensual de cupones fijos.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 2000, // 0.5%
		roiPercent: 0.5,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '💵'
	},
	{
		title: 'Certificado Fiduciario Tranquilo 🛡️',
		type: 'stock',
		ticker: 'CERT-FID',
		desc: 'Participación en cartera colectiva de muy bajo perfil de riesgo.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 3000, // 0.5%
		roiPercent: 0.5,
		category: 'Fondos',
		rarity: 'common',
		icon: '🛡️'
	},

	// --- 0.7% DE GANANCIA MENSUAL ---
	{
		title: 'CDT Digital Garantizado 📈',
		type: 'stock',
		ticker: 'CDT-DIG',
		desc: 'Certificado de depósito a término digital con pago mensual automático.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 3500, // 0.7%
		roiPercent: 0.7,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '📈'
	},
	{
		title: 'Cartera Colectiva Conservadora 📂',
		type: 'stock',
		ticker: 'CCC',
		desc: 'Fondo de inversión con diversificación en títulos del tesoro y depósitos a plazo.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 2800, // 0.7%
		roiPercent: 0.7,
		category: 'Fondos',
		rarity: 'common',
		icon: '📂'
	},
	{
		title: 'Fondo Monetario de Liquidez 💰',
		type: 'stock',
		ticker: 'LIQ-MON',
		desc: 'Fondo en moneda local respaldado por títulos del Banco de la República.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 4200, // 0.7%
		roiPercent: 0.7,
		category: 'Fondos',
		rarity: 'common',
		icon: '💰'
	},

	// --- 0.8% DE GANANCIA MENSUAL ---
	{
		title: 'Fondo de Títulos Corporativos 🏢',
		type: 'stock',
		ticker: 'FTC',
		desc: 'Títulos de deuda emitidos por las 50 empresas más sólidas del país.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 4000, // 0.8%
		roiPercent: 0.8,
		category: 'Fondos',
		rarity: 'common',
		icon: '🏢'
	},
	{
		title: 'Pagaré Comercial Avalado 📝',
		type: 'stock',
		ticker: 'PAG-AVAL',
		desc: 'Instrumento financiero de crédito comercial avalado por una entidad aseguradora.',
		cost: 450000,
		downPayment: 450000,
		cashFlow: 3600, // 0.8%
		roiPercent: 0.8,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '📝'
	},
	{
		title: 'Participación en Fideicomiso Comercial 🏬',
		type: 'property',
		propertyType: 'fideicomiso',
		desc: 'Derechos fiduciarios sobre locales de centros comerciales con rentas compartidas.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 4800, // 0.8%
		roiPercent: 0.8,
		category: 'Fondos',
		rarity: 'common',
		icon: '🏬'
	},

	// --- 0.9% DE GANANCIA MENSUAL ---
	{
		title: 'Fondo Inmobiliario de Renta Comercial 🏬',
		type: 'property',
		propertyType: 'comercial',
		desc: 'Portafolio de oficinas y locales con arrendatarios corporativos estables.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 4500, // 0.9%
		roiPercent: 0.9,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🏬'
	},
	{
		title: 'Crédito Colectivo con Garantía Real 🔒',
		type: 'stock',
		ticker: 'CRED-REAL',
		desc: 'Financiamiento colectivo con hipoteca de respaldo que distribuye intereses.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 3600, // 0.9%
		roiPercent: 0.9,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '🔒'
	},
	{
		title: 'Participación en Bodegaje Modular 📦',
		type: 'property',
		propertyType: 'bodega',
		desc: 'Unidad de almacenamiento en parque logístico que renta mensualmente a pymes.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 5400, // 0.9%
		roiPercent: 0.9,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '📦'
	},

	// --- 1% DE GANANCIA MENSUAL ---
	{
		title: 'Acciones Preferenciales de Servicios Públicos ⚡',
		type: 'stock',
		ticker: 'ENER-PREF',
		desc: 'Acciones preferenciales de empresa eléctrica con dividendo mensual protegido.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 5000, // 1%
		roiPercent: 1,
		category: 'Acciones',
		rarity: 'common',
		icon: '⚡'
	},
	{
		title: 'Fondo Inmobiliario Residencial 🏡',
		type: 'property',
		propertyType: 'residencial',
		desc: 'Fondo especializado en departamentos y apartaestudios en arriendo continuo.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 4000, // 1%
		roiPercent: 1,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🏡'
	},
	{
		title: 'Bono del Tesoro a Mediano Plazo 📜',
		type: 'stock',
		ticker: 'TES-M',
		desc: 'Título del tesoro con maduración a 5 años y pago puntual de rendimiento mensual.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 6000, // 1%
		roiPercent: 1,
		category: 'Renta Fija',
		rarity: 'common',
		icon: '📜'
	},

	// --- 1.2% DE GANANCIA MENSUAL ---
	{
		title: 'Bodega de Almacenamiento Compartida 📦',
		type: 'property',
		propertyType: 'bodega',
		desc: 'Espacio alquilado a comerciantes barriales para guardar mercancía con pago fijo.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 6000, // 1.2%
		roiPercent: 1.2,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '📦'
	},
	{
		title: 'Parqueadero de Bicicletas y Motos 🚲',
		type: 'property',
		propertyType: 'parqueadero',
		desc: 'Puesto seguro para guardar motocicletas y ciclas cerca a estación de transporte.',
		cost: 450000,
		downPayment: 450000,
		cashFlow: 5400, // 1.2%
		roiPercent: 1.2,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🚲'
	},
	{
		title: 'Fondo de Desarrollo Urbano 🏙️',
		type: 'property',
		propertyType: 'urbano',
		desc: 'Cartera fiduciaria con participación en proyectos de renovación habitacional.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 7200, // 1.2%
		roiPercent: 1.2,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🏙️'
	},

	// --- 1.5% DE GANANCIA MENSUAL ---
	{
		title: 'Cupo en Parqueadero Comunitario Techado 🚗',
		type: 'property',
		propertyType: 'parqueadero',
		desc: 'Espacio de estacionamiento bajo techo que se arrienda mes a mes a un vecino.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 7500, // 1.5%
		roiPercent: 1.5,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🚗'
	},
	{
		title: 'Estación de Carga de Patinetas Eléctricas ⚡',
		type: 'business',
		desc: 'Punto de recarga rápida y anclaje en una universidad con pago por minuto.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 6000, // 1.5%
		roiPercent: 1.5,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '⚡'
	},
	{
		title: 'Fondo Colectivo de Renta Automotriz 🚐',
		type: 'stock',
		ticker: 'FLOTA',
		desc: 'Participación en leasing de camionetas de reparto urbano con reparto mensual.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 9000, // 1.5%
		roiPercent: 1.5,
		category: 'Fondos',
		rarity: 'common',
		icon: '🚐'
	},

	// --- 1.6% DE GANANCIA MENSUAL ---
	{
		title: 'Máquina Dispensadora de Agua Purificada 💧',
		type: 'business',
		desc: 'Equipo automático de recarga de botellones y termos en un gimnasio.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 8000, // 1.6%
		roiPercent: 1.6,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '💧'
	},
	{
		title: 'Casillero Inteligente de Paquetes 📬',
		type: 'business',
		desc: 'Locker electrónico instalado en una portería para entrega de encomiendas 24/7.',
		cost: 450000,
		downPayment: 450000,
		cashFlow: 7200, // 1.6%
		roiPercent: 1.6,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '📬'
	},
	{
		title: 'Puesto de Fotocopiadora Automática 🖨️',
		type: 'business',
		desc: 'Kiosco autoservicio de impresión para estudiantes universitarios.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 9600, // 1.6%
		roiPercent: 1.6,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '🖨️'
	},

	// --- 1.7% DE GANANCIA MENSUAL ---
	{
		title: 'Tótem de Carga y Publicidad Digital 📱',
		type: 'business',
		desc: 'Estación de recarga de celulares con pantalla de pautas publicitarias locales.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 8500, // 1.7%
		roiPercent: 1.7,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '📱'
	},
	{
		title: 'Nevera Inteligente de Snacks en Coworking 🥤',
		type: 'business',
		desc: 'Frigobar con lector QR y cobro automático instalado en oficinas compartidas.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 6800, // 1.7%
		roiPercent: 1.7,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '🥤'
	},
	{
		title: 'Máquina Despachadora de Café Caliente ☕',
		type: 'business',
		desc: 'Dispensadora automática de tinto y capuchino en sala de espera médica.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 10200, // 1.7%
		roiPercent: 1.7,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '☕'
	},

	// --- 2% DE GANANCIA MENSUAL ---
	{
		title: 'Acciones Sweet Lab con Dividendo Regular 🍩',
		type: 'stock',
		ticker: 'SWT',
		desc: 'Compraste acciones de Sweet Lab con excelente distribución mensual de dividendos.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 10000, // 2%
		roiPercent: 2,
		category: 'Acciones',
		rarity: 'common',
		icon: '🍩'
	},
	{
		title: 'Lavadora Comunitaria a Monedas 🧺',
		type: 'business',
		desc: 'Servicio de lavado automático para estudiantes que deja renta mensual estable.',
		cost: 450000,
		downPayment: 450000,
		cashFlow: 9000, // 2%
		roiPercent: 2,
		category: 'Servicio Automático',
		rarity: 'common',
		icon: '🧺'
	},
	{
		title: 'Habitación en Arriendo en Casa Compartida 🛏️',
		type: 'property',
		propertyType: 'habitacion',
		desc: 'Pieza amoblada que genera una renta fija mensual con servicios compartidos.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 12000, // 2%
		roiPercent: 2,
		category: 'Propiedad Raíz',
		rarity: 'common',
		icon: '🛏️'
	},

	// ==========================================
	// EN EXTRAÑAS OCASIONES (2.5%, 3%, 3.5%)
	// ==========================================

	// --- 2.5% DE GANANCIA MENSUAL (Ocasión Extraña) ---
	{
		title: 'Máquina Expendedora de Café Especial ☕',
		type: 'business',
		desc: 'Vending de café de origen en un edificio corporativo con gran demanda.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 12500, // 2.5%
		roiPercent: 2.5,
		category: 'Servicio Automático',
		rarity: 'rare',
		icon: '☕'
	},
	{
		title: 'Taller Artesanal de Confección y Arreglos 🧵',
		type: 'business',
		desc: 'Negocio propio de arreglos de sastrería y prendas de vestir personalizadas.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 10000, // 2.5%
		roiPercent: 2.5,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🧵'
	},
	{
		title: 'Puesto de Accesorios para Celulares 📱',
		type: 'business',
		desc: 'Mostrador en pasillo comercial con alta rotación de protectores y cables.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 15000, // 2.5%
		roiPercent: 2.5,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '📱'
	},

	// --- 3% DE GANANCIA MENSUAL (Ocasión Extraña) ---
	{
		title: 'Kiosco de Impresiones y Trámites Digitales 🖨️',
		type: 'business',
		desc: 'Local de pagos de servicios, fotocopias y diligencias en zona comercial.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 15000, // 3%
		roiPercent: 3,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🖨️'
	},
	{
		title: 'Puesto de Cupcakes y Postres Artesanales 🧁',
		type: 'business',
		desc: 'Cajitas de repostería dulce para cumpleaños y pedidos especiales de fin de semana.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 12000, // 3%
		roiPercent: 3,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🧁'
	},
	{
		title: 'Taller de Reparación de Bicicletas y Patinetas 🚲',
		type: 'business',
		desc: 'Taller de mantenimiento preventivo sobre ciclorruta principal con clientes fieles.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 18000, // 3%
		roiPercent: 3,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🚲'
	},

	// --- 3.5% DE GANANCIA MENSUAL (Ocasión Extraña) ---
	{
		title: 'Alquiler de Consolas y Simuladores Gamer 🎮',
		type: 'business',
		desc: 'Sala de videojuegos y torneos los fines de semana con cobro por hora.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 17500, // 3.5%
		roiPercent: 3.5,
		category: 'Servicio Automático',
		rarity: 'rare',
		icon: '🎮'
	},
	{
		title: 'Minifranquicia de Batidos y Frutas Frescas 🥤',
		type: 'business',
		desc: 'Puesto express de batidos y jugos naturales frente a complejo deportivo.',
		cost: 400000,
		downPayment: 400000,
		cashFlow: 14000, // 3.5%
		roiPercent: 3.5,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🥤'
	},
	{
		title: 'Carro de Comidas Rápidas Gourmet 🌭',
		type: 'business',
		desc: 'Puesto móvil de hamburguesas y perros calientes en zona de eventos nocturnos.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 21000, // 3.5%
		roiPercent: 3.5,
		category: 'Negocio Propio',
		rarity: 'rare',
		icon: '🌭'
	},

	// ==========================================
	// EN MÁS EXTRAÑAS SITUACIONES (4% y 5%)
	// ==========================================

	// --- 4% DE GANANCIA MENSUAL (Ocasión Muy Extraña) ---
	{
		title: '¡Socio en Fábrica de Galletas Sweet Lab! 🍪',
		type: 'stock',
		ticker: 'SWT-IND',
		desc: '¡Oportunidad excepcional! Participación societaria en la nueva línea industrial de galletas.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 20000, // 4%
		roiPercent: 4,
		category: 'Acciones',
		rarity: 'very_rare',
		icon: '🍪'
	},
	{
		title: '¡Máquina de Dulces en Terminal Multimodal! 🍬',
		type: 'business',
		desc: '¡Ubicación de oro! Máquina automática en el punto de transbordo más concurrido de la ciudad.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 24000, // 4%
		roiPercent: 4,
		category: 'Servicio Automático',
		rarity: 'very_rare',
		icon: '🍬'
	},

	// --- 5% DE GANANCIA MENSUAL (Ocasión Muy Extraña) ---
	{
		title: '¡Franquicia Estrella de Waffles Sweet Lab! 🍦',
		type: 'business',
		desc: '¡Situación extraordinaria! Kiosco franquiciado con exclusividad total y clientela desbordante.',
		cost: 500000,
		downPayment: 500000,
		cashFlow: 25000, // 5%
		roiPercent: 5,
		category: 'Negocio Propio',
		rarity: 'very_rare',
		icon: '🍦'
	},
	{
		title: '¡Patente Tecnológica con Licenciamiento! 💡',
		type: 'business',
		desc: '¡Gran hallazgo! Licencia tecnológica con regalías mensuales directas de grandes empresas.',
		cost: 600000,
		downPayment: 600000,
		cashFlow: 30000, // 5%
		roiPercent: 5,
		category: 'Negocio Propio',
		rarity: 'very_rare',
		icon: '💡'
	}
];

// Gastos imprevistos y antojos calibrados a escala real 2026 (6x más variedad, 64 opciones):
// "una salida con amigos debe salir en 120.000 más o menos, pero no siempre el mismo valor"
const DOODADS = [
	// --- 1. SALIDAS Y REUNIONES CON AMIGOS (~$120.000 con variación natural) ---
	{
		title: 'Salida a Cenar Pizzas con Amigos 🍕',
		desc: 'Una pizza grande con gaseosas y buena charla de fin de semana con tus amigos.',
		cost: 120000,
		category: 'Salida con Amigos',
		icon: '🍕'
	},
	{
		title: 'Salida de Café y Postres con Amigos ☕',
		desc: 'Tarde relajada en cafetería de especialidad compartiendo capuchinos y torta.',
		cost: 105000,
		category: 'Salida con Amigos',
		icon: '☕'
	},
	{
		title: 'Tarde de Bolos y Cerveza con Amigos 🎳',
		desc: 'Dos líneas de bolos, alquiler de zapatos y bebidas compartidas con el grupo.',
		cost: 135000,
		category: 'Salida con Amigos',
		icon: '🎳'
	},
	{
		title: 'Salida al Bar con Música y Amigos 🍹',
		desc: 'Ronda de cócteles, picada y buena música para celebrar el fin de semana.',
		cost: 140000,
		category: 'Salida con Amigos',
		icon: '🍹'
	},
	{
		title: 'Hamburguesas Artesanales con Amigos 🍔',
		desc: 'Hamburguesas especiales con papas rústicas y malteadas con los parceros.',
		cost: 115000,
		category: 'Salida con Amigos',
		icon: '🍔'
	},
	{
		title: 'Entrada a Cine VIP con Combo Crispetas 🍿',
		desc: 'Boletas de estreno con crispetas gigantes, gaseosas y nachos con queso.',
		cost: 95000,
		category: 'Salida con Amigos',
		icon: '🍿'
	},
	{
		title: 'Asado Dominical con Amigos 🥩',
		desc: 'Aporte para la carne, chorizos, mazorcas y gaseosas del domingo.',
		cost: 125000,
		category: 'Salida con Amigos',
		icon: '🥩'
	},
	{
		title: 'Noche de Tacos y Margaritas con Amigos 🌮',
		desc: 'Ronda de tacos al pastor y bebidas mexicanas compartidas con amigos.',
		cost: 120000,
		category: 'Salida con Amigos',
		icon: '🌮'
	},
	{
		title: 'Cena de Sushi con Amigos 🍣',
		desc: 'Rollos de sushi variados y bebidas en restaurante oriental con amigos.',
		cost: 130000,
		category: 'Salida con Amigos',
		icon: '🍣'
	},
	{
		title: 'Picada Criolla de Fin de Semana 🥓',
		desc: 'Chicharrón, plátano maduro, arepas y gaseosas compartidas con amigos.',
		cost: 125000,
		category: 'Salida con Amigos',
		icon: '🥓'
	},
	{
		title: 'Salida a Bailar y Discoteca 🪩',
		desc: 'Cover de entrada y ronda de bebidas con tus amigos en la discoteca.',
		cost: 110000,
		category: 'Salida con Amigos',
		icon: '🪩'
	},
	{
		title: 'Desayuno y Brunch con Amigos 🥞',
		desc: 'Pancakes, huevos benedictinos, fruta y café de origen en la mañana del sábado.',
		cost: 90000,
		category: 'Salida con Amigos',
		icon: '🥞'
	},
	{
		title: 'Almuerzo Campestre Fuera de la Ciudad 🌳',
		desc: 'Salida a un mirador en la montaña a almorzar sancocho con amigos.',
		cost: 135000,
		category: 'Salida con Amigos',
		icon: '🌳'
	},
	{
		title: 'Helados Gourmet y Waffles con Amigos 🍨',
		desc: 'Copas de helado artesanal, barquillos y waffles dulces de postre.',
		cost: 75000,
		category: 'Salida con Amigos',
		icon: '🍨'
	},
	{
		title: 'Tarde de Parrilla y Picadas con Amigos 🍢',
		desc: 'Mazorcas desgranadas, pinchos de carne y bebidas frías en la noche.',
		cost: 110000,
		category: 'Salida con Amigos',
		icon: '🍢'
	},
	{
		title: 'Cena de Celebración Especial con Amigos 🍽️',
		desc: 'Cena de cumpleaños o logro especial en restaurante con tus mejores amigos.',
		cost: 145000,
		category: 'Salida con Amigos',
		icon: '🍽️'
	},

	// --- 2. GASTOS IMPREVISTOS DEL HOGAR Y SERVICIOS ---
	{
		title: 'Fuga de Agua en el Lavaplatos 🔧',
		desc: 'Tuviste que llamar a un plomero de urgencia y cambiar el sifón del lavaplatos.',
		cost: 85000,
		category: 'Hogar y Servicios',
		icon: '🔧'
	},
	{
		title: 'Cambio Urgente de Cerradura 🔑',
		desc: 'La llave se partió adentro de la chapa de la puerta principal al llegar tarde.',
		cost: 110000,
		category: 'Hogar y Servicios',
		icon: '🔑'
	},
	{
		title: 'Recibo de Luz Más Alto este Mes 💡',
		desc: 'Uso intensivo de calentador y electrodomésticos; la factura de energía subió.',
		cost: 145000,
		category: 'Hogar y Servicios',
		icon: '💡'
	},
	{
		title: 'Destape de Cañería de Emergencia 🪠',
		desc: 'El desagüe del baño colapsó y requirió motobomba y servicio de fontanería.',
		cost: 95000,
		category: 'Hogar y Servicios',
		icon: '🪠'
	},
	{
		title: 'Bombillos LED Quemados y Cableado 🔌',
		desc: 'Un bajonazo de luz dañó varios bombillos LED y un interruptor del pasillo.',
		cost: 60000,
		category: 'Hogar y Servicios',
		icon: '🔌'
	},
	{
		title: 'Reparación de la Lavadora 🧺',
		desc: 'Se soltó la correa del tambor de centrifugado y tocó llamar al técnico.',
		cost: 175000,
		category: 'Hogar y Servicios',
		icon: '🧺'
	},
	{
		title: 'Filtro de Agua y Mantenimiento de Purificador 💧',
		desc: 'Cambio periódico de cartuchos de carbón activado del filtro del agua de la cocina.',
		cost: 70000,
		category: 'Hogar y Servicios',
		icon: '💧'
	},
	{
		title: 'Cuota Extraordinaria del Edificio 🏢',
		desc: 'Aporte comunitario imprevisto para pintar la fachada y reparar el portón comunal.',
		cost: 130000,
		category: 'Hogar y Servicios',
		icon: '🏢'
	},
	{
		title: 'Pintura e Impermeabilización de Pared 🖌️',
		desc: 'Una humedad manchó la pared del cuarto y compraste sellador, lija y galón de pintura.',
		cost: 115000,
		category: 'Hogar y Servicios',
		icon: '🖌️'
	},
	{
		title: 'Candado de Alta Seguridad y Llaves 🔒',
		desc: 'Refuerzo de seguridad para la reja exterior y duplicados de llaves de seguridad.',
		cost: 55000,
		category: 'Hogar y Servicios',
		icon: '🔒'
	},
	{
		title: 'Mantenimiento del Calentador de Gas 🔥',
		desc: 'Revisión técnica anual obligatoria y limpieza de inyectores para evitar fugas.',
		cost: 120000,
		category: 'Hogar y Servicios',
		icon: '🔥'
	},
	{
		title: 'Reemplazo de Grifería de la Ducha 🚿',
		desc: 'El mezclador de agua caliente y fría goteaba día y noche; tocó reemplazarlo.',
		cost: 100000,
		category: 'Hogar y Servicios',
		icon: '🚿'
	},

	// --- 3. GASTOS IMPREVISTOS DE SALUD Y FARMACIA ---
	{
		title: 'Consulta Médica Prioritaria 🩺',
		desc: 'Molestia física aguda que obligó a pagar una consulta médica particular sin demora.',
		cost: 110000,
		category: 'Salud y Farmacia',
		icon: '🩺'
	},
	{
		title: 'Fórmula Médica en la Droguería 💊',
		desc: 'Antibióticos, analgésicos y jarabes recetados para cortar una fuerte virosis.',
		cost: 75000,
		category: 'Salud y Farmacia',
		icon: '💊'
	},
	{
		title: 'Urgencia Odontológica y Calza Dental 🦷',
		desc: 'Se cayó una calza comiendo tostadas y tocó acudir de inmediato al odontólogo.',
		cost: 140000,
		category: 'Salud y Farmacia',
		icon: '🦷'
	},
	{
		title: 'Exámenes de Laboratorio Clínico 🧪',
		desc: 'Copago y toma de muestras de sangre para control médico solicitado por el doctor.',
		cost: 65000,
		category: 'Salud y Farmacia',
		icon: '🧪'
	},
	{
		title: 'Multivitamínicos y Suplementos Inmunes 🍊',
		desc: 'Complejo B, vitamina C y suplementos de defensas recomendados para el cansancio.',
		cost: 80000,
		category: 'Salud y Farmacia',
		icon: '🍊'
	},
	{
		title: 'Reparación de Montura de Gafas 👓',
		desc: 'Se zafó la patilla de tus gafas formuladas y compraste una montura nueva.',
		cost: 165000,
		category: 'Salud y Farmacia',
		icon: '👓'
	},
	{
		title: 'Lágrimas Artificiales y Gotas Oftálmicas 👁️',
		desc: 'Ojos secos y enrojecimiento tras largas jornadas frente a pantallas.',
		cost: 50000,
		category: 'Salud y Farmacia',
		icon: '👁️'
	},
	{
		title: 'Fisioterapia por Dolor Lumbar 💆',
		desc: 'Sesión de masajes y terapia muscular para desinflamar la espalda tras hacer fuerza.',
		cost: 95000,
		category: 'Salud y Farmacia',
		icon: '💆'
	},

	// --- 4. GASTOS IMPREVISTOS DE MASCOTAS ---
	{
		title: 'Vacuna Anual y Pipeta Antipulgas 🐶',
		desc: 'Refuerzo de vacuna séxtuple y antipulgas de tu perrito en la veterinaria.',
		cost: 85000,
		category: 'Mascotas',
		icon: '🐶'
	},
	{
		title: 'Urgencia Veterinaria por Indigestión 🐱',
		desc: 'Tu mascota comió algo indebido y requirió examen clínico y suero en la clínica.',
		cost: 120000,
		category: 'Mascotas',
		icon: '🐱'
	},
	{
		title: 'Baño Dermatológico y Peluquería Canina ✂️',
		desc: 'Baño antiparasitario especial, corte de pelo y cepillado higiénico para tu mascota.',
		cost: 70000,
		category: 'Mascotas',
		icon: '✂️'
	},
	{
		title: 'Bulto de Alimento Medicado Especial 🦴',
		desc: 'Dieta veterinaria gastrointestinal formulada para el cuidado de tu mascota.',
		cost: 95000,
		category: 'Mascotas',
		icon: '🦴'
	},
	{
		title: 'Cojín y Juguete Nuevo para Mascota 🧸',
		desc: 'Tu mascota destrozó su cama y compraste un cojín acolchado y resistente.',
		cost: 55000,
		category: 'Mascotas',
		icon: '🧸'
	},

	// --- 5. GASTOS IMPREVISTOS DE TECNOLOGÍA Y CELULAR ---
	{
		title: 'Cambio de Vidrio Templado y Pantalla 📱',
		desc: 'El celular resbaló de tus manos y tocó cambiar el vidrio protector y display.',
		cost: 180000,
		category: 'Tecnología',
		icon: '📱'
	},
	{
		title: 'Cargador Original de Carga Rápida ⚡',
		desc: 'El cable se dobló y dejó de hacer contacto; tocó comprar cargador de buena marca.',
		cost: 75000,
		category: 'Tecnología',
		icon: '⚡'
	},
	{
		title: 'Audífonos Inalámbricos Bluetooth 🎧',
		desc: 'Se cayó un audífono al subir al bus y compraste unos nuevos para tus trayectos.',
		cost: 155000,
		category: 'Tecnología',
		icon: '🎧'
	},
	{
		title: 'Mouse Ergonómico y Teclado Nuevo 🖱️',
		desc: 'El scroll del mouse falló en plena jornada de trabajo y compraste uno ergonómico.',
		cost: 85000,
		category: 'Tecnología',
		icon: '🖱️'
	},
	{
		title: 'Memoria USB y Disco de Respaldo 💾',
		desc: 'Compraste unidad de almacenamiento para respaldar fotos y archivos indispensables.',
		cost: 90000,
		category: 'Tecnología',
		icon: '💾'
	},
	{
		title: 'Renovación de Almacenamiento en la Nube ☁️',
		desc: 'Cobro imprevisto de renovación anual de tu cuenta en la nube para no perder fotos.',
		cost: 105000,
		category: 'Tecnología',
		icon: '☁️'
	},
	{
		title: 'Mantenimiento y Pasta Térmica del Portátil 💻',
		desc: 'El computador se calentaba y apagaba solo; tocó hacerle limpieza profunda.',
		cost: 135000,
		category: 'Tecnología',
		icon: '💻'
	},

	// --- 6. GASTOS IMPREVISTOS DE TRANSPORTE Y MOVILIDAD ---
	{
		title: 'Pinchazo de Llanta en la Vía 🛵',
		desc: 'Un clavo en la llanta de la moto/bici obligó a pagar parche vulcanizado y desvare.',
		cost: 55000,
		category: 'Transporte',
		icon: '🛵'
	},
	{
		title: 'Carreras de Taxi por Aguacero Torrencial 🚕',
		desc: 'Llovió torrencialmente en hora pico y tocó pedir transporte de aplicación con tarifa alta.',
		cost: 65000,
		category: 'Transporte',
		icon: '🚕'
	},
	{
		title: 'Pastillas de Frenos y Guayas de Moto 🛑',
		desc: 'Desgaste severo en los frenos detectado en el taller; cambio obligado por seguridad.',
		cost: 115000,
		category: 'Transporte',
		icon: '🛑'
	},
	{
		title: 'Cambio de Aceite y Filtro de Motor 🛢️',
		desc: 'Mantenimiento del motor para evitar daños mayores en tus desplazamientos diarios.',
		cost: 90000,
		category: 'Transporte',
		icon: '🛢️'
	},
	{
		title: 'Servicio de Grúa o Carga de Batería 🔋',
		desc: 'La batería se descargó al dejar las luces prendidas y tocó pagar servicio eléctrico.',
		cost: 85000,
		category: 'Transporte',
		icon: '🔋'
	},
	{
		title: 'Casco o Chaleco Reflectivo Reglamentario 🦺',
		desc: 'Renovación de implementos de seguridad vial exigidos por las normas de tránsito.',
		cost: 125000,
		category: 'Transporte',
		icon: '🦺'
	},

	// --- 7. COMPROMISOS SOCIALES, FAMILIARES Y REGALOS ---
	{
		title: 'Regalo de Cumpleaños Familiar 🎁',
		desc: 'Celebración de un familiar querido al que no podías llegar con las manos vacías.',
		cost: 115000,
		category: 'Compromisos y Regalos',
		icon: '🎁'
	},
	{
		title: 'Cuota para Baby Shower o Despedida 👶',
		desc: 'Aporte grupal para la ancheta y pañales de un compañero en la oficina.',
		cost: 65000,
		category: 'Compromisos y Regalos',
		icon: '👶'
	},
	{
		title: 'Amigo Secreto y Detalle Grupal 🎅',
		desc: 'Intercambio tradicional de regalos con el parche de amigos o compañeros.',
		cost: 70000,
		category: 'Compromisos y Regalos',
		icon: '🎅'
	},
	{
		title: 'Flores y Chocolates para Fecha Especial 💐',
		desc: 'Ramo de rosas y caja de chocolates para sorprender a alguien muy especial.',
		cost: 85000,
		category: 'Compromisos y Regalos',
		icon: '💐'
	},

	// --- 8. ANTOJOS PERSONALES Y ROPA ---
	{
		title: 'Gorra o Zapatillas Urbanas con Estilo 👟',
		desc: 'Viste unos tenis o gorra en oferta en el centro comercial y decidiste comprarlos.',
		cost: 170000,
		category: 'Antojos y Ropa',
		icon: '👟'
	},
	{
		title: 'Perfume o Fragancia en Promoción Irresistible 🧴',
		desc: 'Tu colonia preferida estaba con descuento temporal y la compraste sin pensarlo.',
		cost: 145000,
		category: 'Antojos y Ropa',
		icon: '🧴'
	},
	{
		title: 'Boleta para Festival o Concierto Juvenil 🎟️',
		desc: 'Entrada para ver en vivo a tus artistas favoritos en el festival de la ciudad.',
		cost: 190000,
		category: 'Antojos y Ropa',
		icon: '🎟️'
	},
	{
		title: 'Corte de Cabello y Arreglo de Barba / Peinado 💈',
		desc: 'Sesión de estilista, hidratación capilar y corte antes de un evento importante.',
		cost: 90000,
		category: 'Antojos y Ropa',
		icon: '💈'
	},
	{
		title: 'Arreglo de Ropa en la Sastrería 🧵',
		desc: 'Ajuste de bota de dos pantalones y cambio de cremallera de tu chaqueta favorita.',
		cost: 50000,
		category: 'Antojos y Ropa',
		icon: '🧵'
	},
	{
		title: 'Antojos y Domicilios a Medianoche 🍫',
		desc: 'Pedidos de comida rápida y golosinas a domicilio durante el fin de semana.',
		cost: 85000,
		category: 'Antojos y Ropa',
		icon: '🍫'
	}
];

const MARKET_EVENTS = [
	{
		title: '¡Compran tu Habitación en Alquiler o Terreno! 🏞️',
		desc: 'Un inversionista te ofrece comprar tu propiedad raíz con excelente ganancia en efectivo.',
		appliesTo: 'Propiedad Raíz',
		salePrice: 1500000
	},
	{
		title: '¡Suben las Acciones de Sweet Lab! 📈',
		desc: 'La empresa abrió nuevas tiendas y tus acciones valen el triple.',
		appliesTo: 'Acciones',
		salePrice: 1800000
	},
	{
		title: '¡Compran tu Negocio de Cupcakes o Taller! 🧁',
		desc: 'Una cafetería vecina te ofrece una excelente oferta para quedarse con tu emprendimiento.',
		appliesTo: 'Emprendimiento',
		salePrice: 1200000
	},
	{
		title: '¡Compran tu Máquina Automática! 🍬',
		desc: 'Un centro comercial te compra la máquina con todo su inventario.',
		appliesTo: 'Negocio Automático',
		salePrice: 1400000
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

	diceRoll() {
		try {
			this.init();
			if (!this.ctx) return;
			if (this.ctx.state === 'suspended') {
				this.ctx.resume();
			}

			const now = this.ctx.currentTime;

			// Síntesis acústica de impacto físico de dados (resina/acrílico rebotando en fieltro/madera)
			const playDieClick = (time, intensity = 1.0, pitchMod = 1.0) => {
				const duration = 0.045;

				// 1. Ruido en banda para el 'clack' seco de plástico/resina
				const sampleRate = this.ctx.sampleRate || 44100;
				const bufferSize = Math.floor(sampleRate * duration);
				const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
				const output = noiseBuffer.getChannelData(0);
				for (let i = 0; i < bufferSize; i++) {
					output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.20));
				}

				const whiteNoise = this.ctx.createBufferSource();
				whiteNoise.buffer = noiseBuffer;

				const filter = this.ctx.createBiquadFilter();
				filter.type = 'bandpass';
				filter.frequency.setValueAtTime((2700 + (Math.random() - 0.5) * 600) * pitchMod, time);
				filter.Q.setValueAtTime(5.5, time);

				const noiseGain = this.ctx.createGain();
				noiseGain.gain.setValueAtTime(0.24 * intensity, time);
				noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

				whiteNoise.connect(filter);
				filter.connect(noiseGain);
				noiseGain.connect(this.ctx.destination);
				whiteNoise.start(time);
				whiteNoise.stop(time + duration);

				// 2. Golpe grave de mesa (resonancia de madera hueca)
				const osc = this.ctx.createOscillator();
				const oscGain = this.ctx.createGain();
				osc.type = 'triangle';
				const startFreq = (190 + (Math.random() - 0.5) * 50) * pitchMod;
				osc.frequency.setValueAtTime(startFreq, time);
				osc.frequency.exponentialRampToValueAtTime(55, time + duration);

				oscGain.gain.setValueAtTime(0.18 * intensity, time);
				oscGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

				osc.connect(oscGain);
				oscGain.connect(this.ctx.destination);
				osc.start(time);
				osc.stop(time + duration);
			};

			// Secuencia acústica realista de 2 dados rodando y rebotando sobre la mesa:
			// Agite inicial
			playDieClick(now + 0.00, 0.40, 1.15);
			playDieClick(now + 0.045, 0.35, 0.92);
			playDieClick(now + 0.095, 0.50, 1.08);

			// Golpe firme inicial contra la mesa
			playDieClick(now + 0.17, 1.00, 1.00);
			playDieClick(now + 0.205, 0.85, 1.18);

			// Varios rebotes y giros mientras desaceleran los dos dados
			playDieClick(now + 0.28, 0.70, 0.94);
			playDieClick(now + 0.325, 0.62, 1.12);
			playDieClick(now + 0.41, 0.50, 1.05);
			playDieClick(now + 0.455, 0.42, 0.88);
			playDieClick(now + 0.54, 0.32, 1.10);
			playDieClick(now + 0.62, 0.22, 0.96);
			playDieClick(now + 0.69, 0.16, 1.14);
			playDieClick(now + 0.75, 0.10, 1.02);
		} catch (e) {
			// Silencioso
		}
	}

	roll() {
		this.diceRoll();
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

	// Casilla de Mejora de Vivienda: aparece cada 5 salarios (5 * 24 = 120 casillas)
	// Ejemplo: en la casilla 126 (después de 5 salarios: Mes 5 en casilla 120), casilla 246 (Mes 10), etc.
	if (index >= 120 && index % 120 === 6) {
		const cycleNum = Math.floor(index / 120);
		return { ...TILE_TYPES.housing, id: index, badge: `Hogar #${cycleNum}` };
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
			document.getElementById('game-hud')?.classList.add('hidden');
			document.getElementById('game-hud-left')?.classList.add('hidden');
			document.getElementById('game-hud-right')?.classList.add('hidden');
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

function openBalanceDrawer(playerIndex) {
	const targetIndex = (typeof playerIndex === 'number') ? playerIndex : (gameState.selectedDrawerPlayerIndex ?? gameState.currentPlayerIndex);
	gameState.selectedDrawerPlayerIndex = targetIndex;
	renderDrawerPlayerHeader(targetIndex);
	updateDrawerFinancials(targetIndex);
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
		const initialExpensePct = Math.floor(Math.random() * 9) + 90; // 90% a 98% de su salario

		players.push({
			id: i,
			name: name,
			avatar: avatar.emoji,
			color: avatar.color,
			bg: avatar.bg,
			profession: 'Sin empleo',
			salary: 0,
			initialExpensePct: initialExpensePct,
			housingLevel: 0,
			rentExpense: DEFAULT_FIXED_EXPENSES.rent,
			groceriesExpense: DEFAULT_FIXED_EXPENSES.groceries,
			utilitiesExpense: DEFAULT_FIXED_EXPENSES.utilities,
			transportExpense: DEFAULT_FIXED_EXPENSES.transport,
			internetExpense: DEFAULT_FIXED_EXPENSES.internet,
			phoneExpense: DEFAULT_FIXED_EXPENSES.phone,
			otherExpenses: DEFAULT_FIXED_EXPENSES.other,
			fixedExpenses: DEFAULT_FIXED_EXPENSES.rent + DEFAULT_FIXED_EXPENSES.groceries + DEFAULT_FIXED_EXPENSES.utilities + DEFAULT_FIXED_EXPENSES.transport + DEFAULT_FIXED_EXPENSES.internet + DEFAULT_FIXED_EXPENSES.phone + DEFAULT_FIXED_EXPENSES.other,
			debtExpenses: 0,
			totalDebt: 0,
			cash: 500000, // Efectivo inicial calibrado a escala salario actual (500.000)
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
	document.getElementById('game-hud')?.classList.remove('hidden');
	document.getElementById('game-hud-left')?.classList.remove('hidden');
	document.getElementById('game-hud-right')?.classList.remove('hidden');
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
	const hudLeft = document.getElementById('game-hud-left');
	const hudRight = document.getElementById('game-hud-right');
	const legacyContainer = document.getElementById('game-hud');

	if (hudLeft) hudLeft.innerHTML = '';
	if (hudRight) hudRight.innerHTML = '';
	if (legacyContainer) legacyContainer.innerHTML = '';

	const isParallelTwo = gameState.players.length === 2;

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
			openBalanceDrawer(idx);
		});

		// Si hay dos jugadores: jugador 1 a la izquierda de su camino, jugador 2 a la derecha de su camino
		if (isParallelTwo) {
			if (idx === 0) {
				(hudLeft || legacyContainer)?.appendChild(pill);
			} else {
				(hudRight || legacyContainer)?.appendChild(pill);
			}
		} else if (gameState.players.length > 2) {
			if (idx % 2 === 0) {
				(hudLeft || legacyContainer)?.appendChild(pill);
			} else {
				(hudRight || legacyContainer)?.appendChild(pill);
			}
		} else {
			// 1 solo jugador: a la izquierda de su camino
			(hudLeft || legacyContainer)?.appendChild(pill);
		}
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

	// Animación y sonido real de dados rodando
	dice1?.classList.add('aladdin-magic');
	dice2?.classList.add('aladdin-magic');
	sounds.diceRoll();

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
// 8.5. ANIMACIÓN DE TRANSACCIONES HACIA EL BALANCE Y COMPARATIVO ANTES/AHORA
// ==========================================

function savePlayerFinancialSnapshot(player, reason = 'Transacción') {
	if (!player) return;
	const fin = getPlayerFinancials(player);
	player.previousSnapshot = {
		reason,
		time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
		cash: player.cash,
		salary: player.salary,
		passiveIncome: fin.passiveIncome,
		fixedExpenses: player.fixedExpenses,
		rentExpense: player.rentExpense || DEFAULT_FIXED_EXPENSES.rent,
		groceriesExpense: player.groceriesExpense || DEFAULT_FIXED_EXPENSES.groceries,
		utilitiesExpense: player.utilitiesExpense || DEFAULT_FIXED_EXPENSES.utilities,
		transportExpense: player.transportExpense || DEFAULT_FIXED_EXPENSES.transport,
		internetExpense: player.internetExpense || DEFAULT_FIXED_EXPENSES.internet,
		phoneExpense: player.phoneExpense || DEFAULT_FIXED_EXPENSES.phone,
		otherExpenses: player.otherExpenses || DEFAULT_FIXED_EXPENSES.other,
		housingLevel: player.housingLevel || 0,
		debtExpenses: player.debtExpenses,
		totalExpenses: fin.totalExpenses,
		monthlyCashFlow: fin.monthlyCashFlow,
		totalDebt: player.totalDebt,
		assetsCount: player.assets.length,
		assets: player.assets.map(a => ({ title: a.title, cashFlow: a.cashFlow || 0 }))
	};
}

/**
 * Muestra el botón para que el usuario confirme y cierre el modal manualmente,
 * garantizando que el modal y el balance NO se cierren solos.
 */
function showModalContinueButton(onContinue) {
	const footerEl = document.getElementById('modal-footer');
	if (!footerEl) {
		if (onContinue) onContinue();
		return;
	}
	footerEl.innerHTML = '';
	const contBtn = document.createElement('button');
	contBtn.className = 'cf-dialog-btn primary btn-continue-pulse';
	contBtn.style.width = '100%';
	contBtn.style.padding = '14px 20px';
	contBtn.style.fontSize = '1.05rem';
	contBtn.style.fontWeight = '900';
	contBtn.style.borderRadius = '14px';
	contBtn.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
	contBtn.style.boxShadow = '0 6px 20px rgba(22, 163, 74, 0.4)';
	contBtn.innerHTML = '¡Balance Actualizado! Continuar Turno ➔';
	contBtn.addEventListener('click', () => {
		if (onContinue) onContinue();
	});
	footerEl.appendChild(contBtn);
}

function animateTransactionNumbersToBalance({
	amount,
	category = 'cash', // 'cash' | 'flow' | 'salary' | 'debt' | 'expense'
	sourceEl = null,
	label = '',
	onComplete = null
}) {
	if (amount === 0 || isNaN(amount)) {
		if (onComplete) onComplete();
		return;
	}

	// Elemento destino en el widget de balance o en el HUD
	let targetEl = null;
	if (category === 'cash') {
		targetEl = document.getElementById('side-bal-cash') || document.querySelector('.player-hud-pill.is-turn .p-cash');
	} else if (category === 'flow') {
		targetEl = document.getElementById('side-bal-flow') || document.querySelector('.player-hud-pill.is-turn .p-flow');
	} else if (category === 'salary') {
		targetEl = document.getElementById('side-bal-salary') || document.getElementById('side-bal-flow');
	} else if (category === 'debt') {
		targetEl = document.getElementById('side-bal-total-debt') || document.getElementById('side-bal-cash');
	} else if (category === 'expense') {
		targetEl = document.getElementById('side-bal-rent-exp') || document.getElementById('side-bal-total-exp');
	}

	// Posición de inicio (origen del número volador)
	let startX = window.innerWidth * 0.45;
	let startY = window.innerHeight * 0.48;
	if (sourceEl && sourceEl.getBoundingClientRect) {
		const r = sourceEl.getBoundingClientRect();
		if (r.width > 0 && r.height > 0) {
			startX = r.left + r.width / 2;
			startY = r.top + r.height / 2;
		}
	} else {
		const modalFront = document.getElementById('flying-card-back') || document.getElementById('flying-card-wrapper');
		if (modalFront && modalFront.getBoundingClientRect) {
			const r = modalFront.getBoundingClientRect();
			if (r.width > 0) {
				startX = r.left + r.width / 2;
				startY = r.top + r.height / 2;
			}
		}
	}

	// Posición de destino
	let endX = window.innerWidth - 180;
	let endY = window.innerHeight * 0.5;
	if (targetEl && targetEl.getBoundingClientRect) {
		const r = targetEl.getBoundingClientRect();
		if (r.width > 0 && r.height > 0) {
			endX = r.left + r.width / 2;
			endY = r.top + r.height / 2;
		}
	}

	// Crear el chip con los números que volarán al balance
	const chip = document.createElement('div');
	chip.className = 'flying-transaction-chip';

	const isPositive = amount > 0;
	const formattedVal = formatCOP(Math.abs(amount));
	const sign = isPositive ? '+' : '-';

	if (category === 'flow') {
		chip.classList.add(isPositive ? 'flying-chip-gain' : 'flying-chip-loss');
		chip.innerHTML = `${sign}${formattedVal}/m 📈`;
	} else if (category === 'salary') {
		chip.classList.add('flying-chip-gain');
		chip.innerHTML = `+${formattedVal}/m 💼`;
	} else if (category === 'debt') {
		chip.classList.add(isPositive ? 'flying-chip-loss' : 'flying-chip-gain');
		chip.innerHTML = `${sign}${formattedVal} 💳`;
	} else if (category === 'expense') {
		chip.classList.add(isPositive ? 'flying-chip-loss' : 'flying-chip-gain');
		chip.innerHTML = `${isPositive ? '+' : '-'}${formattedVal}/m 🏡`;
	} else {
		chip.classList.add(isPositive ? 'flying-chip-gain' : 'flying-chip-loss');
		chip.innerHTML = `${sign}${formattedVal} ${isPositive ? '💵' : '💸'}`;
	}

	chip.style.left = `${startX}px`;
	chip.style.top = `${startY}px`;
	chip.style.transform = 'translate(-50%, -50%) scale(0.65)';
	chip.style.opacity = '0';
	chip.style.transition = 'all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)';

	document.body.appendChild(chip);

	// Sonido inicial
	if (isPositive) sounds.cash();
	else sounds.loss();

	// Fase 1: Crecer y aparecer en la tarjeta de donde sale
	requestAnimationFrame(() => {
		chip.style.opacity = '1';
		chip.style.transform = 'translate(-50%, -50%) scale(1.15)';

		// Fase 2: Viajar pausadamente hacia el balance (1 segundo más de duración: 1550ms)
		setTimeout(() => {
			const flyDuration = 1550;
			chip.style.transition = `left ${flyDuration}ms cubic-bezier(0.22, 1, 0.36, 1), top ${flyDuration}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${flyDuration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${flyDuration}ms ease`;
			chip.style.left = `${endX}px`;
			chip.style.top = `${endY}px`;
			chip.style.transform = 'translate(-50%, -50%) scale(0.85)';
			chip.style.opacity = '0.95';

			// Fase 3: Impacto en el balance lateral
			setTimeout(() => {
				chip.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
				chip.style.transform = 'translate(-50%, -50%) scale(1.35)';
				chip.style.opacity = '0';

				// Destello y pulso en el elemento destino
				if (targetEl) {
					const flashClass = isPositive ? 'balance-updated-flash-green' : 'balance-updated-flash-red';
					targetEl.classList.remove('balance-updated-flash-green', 'balance-updated-flash-red');
					void targetEl.offsetWidth;
					targetEl.classList.add(flashClass);
				}

				// Sonido de confirmación al impactar
				if (isPositive) sounds.cash();
				else sounds.loss();

				// Actualizar de inmediato las cifras del balance
				renderModalSideBalance();
				updateHUDAndHeaders();

				setTimeout(() => {
					chip.remove();
					if (onComplete) onComplete();
				}, 150);
			}, flyDuration);
		}, 180);
	});
}

/**
 * Muestra temporalmente en el widget de balance las cifras de cómo estaba antes,
 * mientras el usuario mantiene presionado el botón.
 */
function showPreviousBalanceState(player) {
	if (!player || !player.previousSnapshot) return;
	const prev = player.previousSnapshot;

	const sideBalanceEl = document.getElementById('modal-side-balance');
	if (sideBalanceEl) sideBalanceEl.classList.add('viewing-past-state');

	const historyBtn = document.getElementById('btn-side-bal-history');
	if (historyBtn) {
		historyBtn.classList.add('active');
		historyBtn.innerHTML = '⏪ Viendo ANTES (suelta para volver)';
	}

	// Efectivo y Flujo
	const cashEl = document.getElementById('side-bal-cash');
	const flowEl = document.getElementById('side-bal-flow');
	if (cashEl) {
		cashEl.textContent = `${formatCOP(prev.cash)}`;
		cashEl.className = `val cash ${prev.cash < 0 ? 'red' : ''} past-val-highlight`;
	}
	if (flowEl) {
		flowEl.textContent = `${prev.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(prev.monthlyCashFlow)}/m`;
		flowEl.className = `val flow ${prev.monthlyCashFlow < 0 ? 'red' : ''} past-val-highlight`;
	}

	// 1. Ingresos
	const salaryEl = document.getElementById('side-bal-salary');
	const passiveEl = document.getElementById('side-bal-passive');
	const totalIncomeEl = document.getElementById('side-bal-total-income');
	if (salaryEl) {
		salaryEl.textContent = formatCOP(prev.salary);
		salaryEl.classList.add('past-val-highlight');
	}
	if (passiveEl) {
		passiveEl.textContent = `+${formatCOP(prev.passiveIncome)}`;
		passiveEl.classList.add('past-val-highlight');
	}
	if (totalIncomeEl) {
		totalIncomeEl.textContent = formatCOP((prev.salary || 0) + (prev.passiveIncome || 0));
		totalIncomeEl.classList.add('past-val-highlight');
	}

	// 2. Salidas / Gastos
	const rentExpEl = document.getElementById('side-bal-rent-exp');
	const groceriesExpEl = document.getElementById('side-bal-groceries-exp');
	const utilitiesExpEl = document.getElementById('side-bal-utilities-exp');
	const transportExpEl = document.getElementById('side-bal-transport-exp');
	const internetExpEl = document.getElementById('side-bal-internet-exp');
	const phoneExpEl = document.getElementById('side-bal-phone-exp');
	const otherExpEl = document.getElementById('side-bal-other-exp');
	const debtExpEl = document.getElementById('side-bal-debt-exp');
	const totalExpEl = document.getElementById('side-bal-total-exp');

	const prevRent = prev.rentExpense || DEFAULT_FIXED_EXPENSES.rent;
	const prevGroceries = prev.groceriesExpense || DEFAULT_FIXED_EXPENSES.groceries;
	const prevUtilities = prev.utilitiesExpense || DEFAULT_FIXED_EXPENSES.utilities;
	const prevTransport = prev.transportExpense || DEFAULT_FIXED_EXPENSES.transport;
	const prevInternet = prev.internetExpense || DEFAULT_FIXED_EXPENSES.internet;
	const prevPhone = prev.phoneExpense || DEFAULT_FIXED_EXPENSES.phone;
	const prevOther = prev.otherExpenses || DEFAULT_FIXED_EXPENSES.other;
	const prevDebt = prev.debtExpenses || 0;
	const prevTotalExp = prev.totalExpenses || (prevRent + prevGroceries + prevUtilities + prevTransport + prevInternet + prevPhone + prevOther + prevDebt);

	if (rentExpEl) {
		rentExpEl.textContent = `-${formatCOP(prevRent)}`;
		rentExpEl.classList.add('past-val-highlight');
	}
	if (groceriesExpEl) {
		groceriesExpEl.textContent = `-${formatCOP(prevGroceries)}`;
		groceriesExpEl.classList.add('past-val-highlight');
	}
	if (utilitiesExpEl) {
		utilitiesExpEl.textContent = `-${formatCOP(prevUtilities)}`;
		utilitiesExpEl.classList.add('past-val-highlight');
	}
	if (transportExpEl) {
		transportExpEl.textContent = `-${formatCOP(prevTransport)}`;
		transportExpEl.classList.add('past-val-highlight');
	}
	if (internetExpEl) {
		internetExpEl.textContent = `-${formatCOP(prevInternet)}`;
		internetExpEl.classList.add('past-val-highlight');
	}
	if (phoneExpEl) {
		phoneExpEl.textContent = `-${formatCOP(prevPhone)}`;
		phoneExpEl.classList.add('past-val-highlight');
	}
	if (otherExpEl) {
		otherExpEl.textContent = `-${formatCOP(prevOther)}`;
		otherExpEl.classList.add('past-val-highlight');
	}
	if (debtExpEl) {
		debtExpEl.textContent = prevDebt > 0 ? `-${formatCOP(prevDebt)}` : '$0';
		debtExpEl.classList.add('past-val-highlight');
	}
	if (totalExpEl) {
		totalExpEl.textContent = `-${formatCOP(prevTotalExp)}`;
		totalExpEl.classList.add('past-val-highlight');
	}

	// 3. Activos
	const assetsCountEl = document.getElementById('side-bal-assets-count');
	const assetsListEl = document.getElementById('side-bal-assets-list');
	if (assetsCountEl) assetsCountEl.textContent = `${prev.assetsCount || 0} negocios (Antes)`;
	if (assetsListEl && prev.assets) {
		if (prev.assets.length > 0) {
			assetsListEl.innerHTML = prev.assets.map(a => `
				<div class="k-item past-val-highlight">
					<span class="lbl" title="${a.title}">${a.title}</span>
					<span class="val green">+${formatCOP(a.cashFlow || 0)}/m</span>
				</div>
			`).join('');
		} else {
			assetsListEl.innerHTML = `<span class="k-empty">Sin negocios antes</span>`;
		}
	}

	// 4. Pasivos
	const totalDebtEl = document.getElementById('side-bal-total-debt');
	const debtValEl = document.getElementById('side-bal-debt-val');
	const debtPayEl = document.getElementById('side-bal-debt-payment');
	if (totalDebtEl) totalDebtEl.textContent = prev.totalDebt > 0 ? `${formatCOP(prev.totalDebt)}` : '$0';
	if (debtValEl) debtValEl.textContent = prev.totalDebt > 0 ? `${formatCOP(prev.totalDebt)}` : '$0';
	if (debtPayEl) debtPayEl.textContent = prev.debtExpenses > 0 ? `-${formatCOP(prev.debtExpenses)}/m` : '$0/m';
}

/**
 * Restaura la información actualizada en el balance al soltar el botón.
 */
function restoreCurrentBalanceState() {
	const sideBalanceEl = document.getElementById('modal-side-balance');
	if (sideBalanceEl) sideBalanceEl.classList.remove('viewing-past-state');

	const historyBtn = document.getElementById('btn-side-bal-history');
	if (historyBtn) {
		historyBtn.classList.remove('active');
		historyBtn.innerHTML = '🕒 Mantén presionado: ¿Cómo era antes?';
	}

	document.querySelectorAll('.past-val-highlight').forEach(el => el.classList.remove('past-val-highlight'));

	renderModalSideBalance();
}

/**
 * Conecta los eventos de "mantener presionado" y "soltar" de forma robusta
 * para dispositivos móviles (touch) y desktop (mouse / pointer).
 */
function attachHoldToPeekEvents(buttonEl, onHold, onRelease) {
	if (!buttonEl) return;

	let isHolding = false;

	const startHold = (e) => {
		if (e && e.button !== undefined && e.button !== 0) return; // solo click principal izquierdo
		if (!isHolding) {
			isHolding = true;
			onHold();
		}
	};

	const endHold = () => {
		if (isHolding) {
			isHolding = false;
			onRelease();
		}
	};

	// Evitar menú contextual, selección y llamadas en móviles
	buttonEl.style.userSelect = 'none';
	buttonEl.style.webkitUserSelect = 'none';
	buttonEl.style.webkitTouchCallout = 'none';
	buttonEl.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); return false; };

	// Pointer Events modernos con captura de puntero
	buttonEl.onpointerdown = (e) => {
		if (e && e.button !== undefined && e.button !== 0) return;
		try { buttonEl.setPointerCapture(e.pointerId); } catch (_) {}
		startHold(e);
	};
	buttonEl.onpointerup = (e) => {
		try { buttonEl.releasePointerCapture(e.pointerId); } catch (_) {}
		endHold();
	};
	buttonEl.onpointercancel = endHold;
	buttonEl.onpointerleave = (e) => {
		if (e.pointerType === 'mouse') endHold();
	};

	// Touch Events de respaldo
	buttonEl.ontouchstart = (e) => {
		startHold(e);
	};
	buttonEl.ontouchend = endHold;
	buttonEl.ontouchcancel = endHold;

	// Mouse Events de respaldo
	buttonEl.onmousedown = startHold;
	buttonEl.onmouseup = endHold;
	buttonEl.onmouseleave = endHold;

	// Respaldo global por si se suelta fuera del botón
	window.addEventListener('mouseup', () => {
		if (isHolding) endHold();
	}, { passive: true });
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
			player.housingLevel = player.housingLevel || 0;

			// Gastos iniciales calibrados aleatoriamente entre el 90% y el 98% del salario
			const expensePct = player.initialExpensePct || (Math.floor(Math.random() * 9) + 90);
			player.initialExpensePct = expensePct;
			const targetTotalExpenses = Math.round((player.salary * (expensePct / 100)) / 1000) * 1000;
			const scale = targetTotalExpenses / 1500000;

			player.rentExpense = Math.round((DEFAULT_FIXED_EXPENSES.rent * scale) / 1000) * 1000;
			player.groceriesExpense = Math.round((DEFAULT_FIXED_EXPENSES.groceries * scale) / 1000) * 1000;
			player.utilitiesExpense = Math.round((DEFAULT_FIXED_EXPENSES.utilities * scale) / 1000) * 1000;
			player.transportExpense = Math.round((DEFAULT_FIXED_EXPENSES.transport * scale) / 1000) * 1000;
			player.internetExpense = Math.round((DEFAULT_FIXED_EXPENSES.internet * scale) / 1000) * 1000;
			player.phoneExpense = Math.round((DEFAULT_FIXED_EXPENSES.phone * scale) / 1000) * 1000;
			player.otherExpenses = targetTotalExpenses - (player.rentExpense + player.groceriesExpense + player.utilitiesExpense + player.transportExpense + player.internetExpense + player.phoneExpense);
			player.fixedExpenses = targetTotalExpenses;
			player.salariesCollected = 0;
			player.jobTier = 1;

			sounds.genieMagic();
			updateHUDAndHeaders();

			const netFlow = player.salary - player.fixedExpenses;
			showModal({
				typeName: '🎉 ¡CONTRATADO EN TU PRIMER EMPLEO!',
				headerClass: 'job',
				icon: job.icon,
				title: `¡Eres ${job.title}!`,
				detailedInfo: `¡Felicitaciones, <strong>${player.name}</strong>! Tus dados te han conseguido el empleo de <strong>${job.title}</strong>.<br><br>⏱️ <em>Tu salario mensual es de <strong>${formatCOP(job.salary)}</strong>. Recuerda que no se cobra de inmediato: se cobrará en cada Día de Pago.</em>`,
				stats: [
					{ label: 'Sueldo mensual:', value: `${formatCOP(job.salary)} / mes`, color: 'green' },
					{ label: 'Gastos fijos base:', value: `-${formatCOP(player.fixedExpenses)} / mes`, color: 'red' },
					{ label: 'Plata libre al mes:', value: `${netFlow >= 0 ? '+' : ''}${formatCOP(netFlow)} / mes`, color: netFlow >= 0 ? 'green' : 'red' }
				],
				buttons: [
					{
						text: '¡Comenzar mi Carrera! 🚀',
						class: 'primary',
						action: () => {
							savePlayerFinancialSnapshot(player, `Primer Empleo: ${job.title}`);
							const btnEl = document.querySelector('#modal-footer button');
							animateTransactionNumbersToBalance({
								amount: job.salary,
								category: 'salary',
								sourceEl: btnEl,
								label: job.title,
								onComplete: () => {
									showModalContinueButton(() => {
										closeModal(() => endTurn());
									});
								}
							});
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
		case 'housing':
			showHousingModal(player);
			break;
		default:
			endTurn();
	}
}

/**
 * 1.5. Mejora de Vivienda (Aparece cada 5 salarios = 120 casillas)
 * El jugador escala peldaño a peldaño en su vivienda pagando un alquiler mayor acorde a su estilo de vida.
 */
function showHousingModal(player) {
	const currentLevel = player.housingLevel || 0;
	const currentHousing = HOUSING_LEVELS[currentLevel] || HOUSING_LEVELS[0];
	const isMaxLevel = currentLevel >= HOUSING_LEVELS.length - 1;

	if (isMaxLevel) {
		showModal({
			typeName: '🏡 ¡VIVIENDA DE ENSUEÑO!',
			headerClass: 'housing',
			icon: currentHousing.icon,
			title: currentHousing.title,
			detailedInfo: `¡Increíble, <strong>${player.name}</strong>! Ya vives en el nivel máximo de vivienda: <strong>${currentHousing.title}</strong>.<br><em>${currentHousing.desc}</em><br><br>Disfrutas del mayor confort pagando tu alquiler de <strong>${formatCOP(currentHousing.rent)}/mes</strong> sin necesidad de mudarte más.`,
			stats: [
				{ label: 'Vivienda actual:', value: currentHousing.title },
				{ label: 'Alquiler actual:', value: `${formatCOP(currentHousing.rent)}/mes`, color: 'red' }
			],
			buttons: [
				{
					text: 'Disfrutar mi Hogar ➔',
					class: 'primary',
					action: () => {
						closeModal(() => endTurn());
					}
				}
			]
		});
		return;
	}

	const nextLevel = currentLevel + 1;
	const nextHousing = HOUSING_LEVELS[nextLevel];
	const rentDiff = nextHousing.rent - currentHousing.rent;

	showModal({
		typeName: '🏡 ¡MEJORA DE VIVIENDA!',
		headerClass: 'housing',
		icon: nextHousing.icon,
		title: nextHousing.title,
		detailedInfo: `¡Enhorabuena, <strong>${player.name}</strong>! Has encontrado una excelente oportunidad de mudanza y mejoras tu calidad de vida.<br><br>Pagas alquiler de vivienda, pasando de <strong>${currentHousing.title}</strong> a <strong>${nextHousing.title}</strong>.<br><em>${nextHousing.desc}</em>`,
		stats: [
			{ label: 'Vivienda anterior:', value: `${currentHousing.title} (${formatCOP(currentHousing.rent)}/mes)` },
			{ label: 'Nueva vivienda:', value: nextHousing.title },
			{ label: 'Nuevo alquiler mensual:', value: `${formatCOP(nextHousing.rent)} / mes`, color: 'red' },
			{ label: 'Aumento en alquiler:', value: `+${formatCOP(rentDiff)} / mes`, color: 'red' }
		],
		buttons: [
			{
				text: `¡Mudarme a ${nextHousing.title}! 🔑`,
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, `Mudanza: ${nextHousing.title}`);
					player.housingLevel = nextLevel;
					player.rentExpense = nextHousing.rent;
					player.fixedExpenses = player.rentExpense + (player.groceriesExpense || DEFAULT_FIXED_EXPENSES.groceries) + (player.utilitiesExpense || DEFAULT_FIXED_EXPENSES.utilities) + (player.transportExpense || DEFAULT_FIXED_EXPENSES.transport) + (player.internetExpense || DEFAULT_FIXED_EXPENSES.internet) + (player.phoneExpense || DEFAULT_FIXED_EXPENSES.phone) + (player.otherExpenses || DEFAULT_FIXED_EXPENSES.other);
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: rentDiff,
						category: 'expense',
						sourceEl: btnEl,
						label: nextHousing.title,
						onComplete: () => {
							showModalContinueButton(() => {
								closeModal(() => endTurn());
							});
						}
					});
				}
			}
		]
	});
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
		bubble.innerHTML = `+${formatCOP(amount)} 💵`;
	} else if (amount < 0) {
		bubble.innerHTML = `-${formatCOP(Math.abs(amount))} 💸`;
		bubble.classList.add('negative');
	} else {
		bubble.innerHTML = `+$0 ⚖️`;
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
	savePlayerFinancialSnapshot(player, `Día de Pago (Cobro #${count})`);
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
		savePlayerFinancialSnapshot(player, 'Aumento 5% Antigüedad');
		player.salary += raise5;
		updateHUDAndHeaders();
		setTimeout(() => {
			showModal({
				typeName: '¡AUMENTO POR ANTIGÜEDAD! 📈',
				headerClass: 'promotion',
				icon: '🎖️',
				title: '¡Aumento del 5% por Constancia!',
				detailedInfo: `¡Felicitaciones, <strong>${player.name}</strong>! Has cobrado <strong>${count} salarios</strong> en tu trayectoria laboral.<br><br>Por tu antigüedad, recibes un aumento automático del <strong>5%</strong> (+${formatCOP(raise5)}/mes) sin cambio de puesto.`,
				stats: [
					{ label: 'Salarios cobrados:', value: `${count} salarios` },
					{ label: 'Aumento otorgado:', value: `+${formatCOP(raise5)} / mes (5%)`, color: 'green' },
					{ label: 'Nuevo sueldo:', value: `${formatCOP(player.salary)} / mes`, color: 'green' }
				],
				buttons: [
					{
						text: '¡Excelente! Continuar ➔',
						class: 'primary',
						action: () => {
							const btnEl = document.querySelector('#modal-footer button');
							animateTransactionNumbersToBalance({
								amount: raise5,
								category: 'salary',
								sourceEl: btnEl,
								label: 'Aumento 5%',
								onComplete: () => {
									showModalContinueButton(() => {
										closeModal();
									});
								}
							});
						}
					}
				]
			});
		}, 1200);
	}
	// 2. Cada 10 salarios cobrados (que no sea 25): Ascenso laboral con 10% redondeado
	else if (count > 0 && count % 10 === 0) {
		const raise10 = Math.round((player.salary * 0.10) / 1000) * 1000;
		player.jobTier = (player.jobTier || 1) + 1;
		const newTitle = getPromotedTitle(player.profession, player.jobTier);
		savePlayerFinancialSnapshot(player, `Ascenso: ${newTitle}`);
		player.salary += raise10;
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
					{ label: 'Aumento por ascenso:', value: `+${formatCOP(raise10)} / mes (10%)`, color: 'green' },
					{ label: 'Sueldo actualizado:', value: `${formatCOP(player.salary)} / mes`, color: 'green' }
				],
				buttons: [
					{
						text: '¡Celebrar mi Ascenso! 🚀',
						class: 'primary',
						action: () => {
							const btnEl = document.querySelector('#modal-footer button');
							animateTransactionNumbersToBalance({
								amount: raise10,
								category: 'salary',
								sourceEl: btnEl,
								label: 'Ascenso 10%',
								onComplete: () => {
									showModalContinueButton(() => {
										closeModal();
									});
								}
							});
						}
					}
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
				{ label: 'Plata limpia que cobras:', value: `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}`, color: fin.monthlyCashFlow > 0 ? 'green' : (fin.monthlyCashFlow < 0 ? 'red' : '') },
				{ label: 'Total en tu bolsillo:', value: `${formatCOP(player.cash)}`, color: 'green' }
			],
			buttons: [
				{
					text: '¡Guardar Plata y Seguir! ➔',
					class: 'primary',
					action: () => {
						if (fin.monthlyCashFlow !== 0) {
							const btnEl = document.querySelector('#modal-footer button');
							animateTransactionNumbersToBalance({
								amount: fin.monthlyCashFlow,
								category: 'cash',
								sourceEl: btnEl,
								label: 'Cobro de Mes',
								onComplete: () => {
									showModalContinueButton(() => {
										closeModal(() => endTurn());
									});
								}
							});
						} else {
							closeModal(() => endTurn());
						}
					}
				}
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
		detailedInfo: `¿Quieres cambiar de empleo? Te ofrecen trabajar como <strong>${newJob.title}</strong> con un sueldo de <strong>${formatCOP(newJob.salary)}/mes</strong>.`,
		stats: stats,
		buttons: [
			{
				text: '¡Aceptar este Trabajo! 💼',
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, `Nuevo Empleo: ${newJob.title}`);
					const oldSalary = player.salary;
					player.profession = newJob.title;
					player.salary = newJob.salary;
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: newJob.salary - oldSalary,
						category: 'salary',
						sourceEl: btnEl,
						label: 'Nuevo Sueldo'
					});

					showModal({
						typeName: '¡ESTRENAS TRABAJO! 🎉',
						headerClass: 'job',
						icon: '🎉',
						title: newJob.title,
						detailedInfo: `¡Felicitaciones! Ahora trabajas como <strong>${newJob.title}</strong> y tu sueldo es de <strong>${formatCOP(newJob.salary)}</strong> al mes.`,
						stats: [
							{ label: 'Nuevo sueldo:', value: `${formatCOP(newJob.salary)}/mes`, color: 'green' }
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
		{ label: 'Tu sueldo sube:', value: `+${formatCOP(promo.raise)} / mes`, color: 'green' }
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
					savePlayerFinancialSnapshot(player, `Ascenso: ${promo.title}`);
					player.salary += promo.raise;
					if (nextTitle !== player.profession) {
						player.jobTier = nextTier;
						player.profession = nextTitle;
					}
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: promo.raise,
						category: 'salary',
						sourceEl: btnEl,
						label: 'Aumento Sueldo',
						onComplete: () => {
							showModalContinueButton(() => {
								closeModal(() => endTurn());
							});
						}
					});
				}
			}
		]
	});
}

// Selección probabilística calibrada de oportunidades:
// - ~87% Ocasiones regulares (0.3% a 2%)
// - ~10% Extrañas ocasiones (2.5%, 3%, 3.5%)
// - ~3% Más extrañas situaciones (4%, 5%)
function getRandomOpportunity() {
	const roll = Math.random() * 100;
	let pool;
	if (roll < 3) {
		// En más extrañas situaciones (4% y 5%)
		pool = SMALL_DEALS.filter(d => d.rarity === 'very_rare');
	} else if (roll < 13) {
		// En extrañas ocasiones (2.5%, 3%, 3.5%)
		pool = SMALL_DEALS.filter(d => d.rarity === 'rare');
	} else {
		// Ocasiones regulares (0.3% a 2%)
		pool = SMALL_DEALS.filter(d => d.rarity === 'common');
	}
	if (!pool || pool.length === 0) pool = SMALL_DEALS;
	return pickRandom(pool);
}

// 4. Negocio / Inversión
function showOpportunityModal(player) {
	const deal = getRandomOpportunity();
	presentDeal(player, deal);
}

function presentDeal(player, deal) {
	const canAfford = player.cash >= deal.downPayment;

	let rarityBadgeHtml = '';
	let modalTypeName = 'OPORTUNIDAD DE INVERSIÓN 🚀';
	if (deal.rarity === 'very_rare') {
		modalTypeName = '¡OCASIÓN MUY EXTRAÑA! 🔥💎';
		rarityBadgeHtml = `<div style="display:inline-block; background:linear-gradient(135deg,#ec4899,#8b5cf6); color:white; font-weight:800; padding:5px 14px; border-radius:20px; font-size:12px; margin-bottom:12px; box-shadow:0 3px 12px rgba(236,72,153,0.45); text-transform:uppercase; letter-spacing:0.5px;">🔥💎 ¡Ocasión Muy Extraña! (${deal.roiPercent}% Ganancia)</div><br>`;
	} else if (deal.rarity === 'rare') {
		modalTypeName = '¡OCASIÓN EXTRAÑA! ⭐';
		rarityBadgeHtml = `<div style="display:inline-block; background:linear-gradient(135deg,#f59e0b,#d97706); color:white; font-weight:800; padding:5px 14px; border-radius:20px; font-size:12px; margin-bottom:12px; box-shadow:0 3px 12px rgba(245,158,11,0.4); text-transform:uppercase; letter-spacing:0.5px;">⭐ ¡Ocasión Extraña! (${deal.roiPercent}% Ganancia)</div><br>`;
	}

	const stats = [
		{ label: 'Inversión inicial:', value: `${formatCOP(deal.downPayment)}` },
		{
			label: 'Ganancia al mes:',
			value: `+${formatCOP(deal.cashFlow)} (${deal.roiPercent}% ganancia)`,
			color: 'green'
		}
	];

	const buttons = [];
	if (canAfford) {
		buttons.push({
			text: `¡Aprovechar Oportunidad! 🚀 (${formatCOP(deal.downPayment)})`,
			class: 'primary',
			action: () => {
				savePlayerFinancialSnapshot(player, `Compra: ${deal.title}`);
				player.cash -= deal.downPayment;
				player.assets.push({ ...deal });
				sounds.cash();
				updateHUDAndHeaders();

				const btnEl = document.querySelector('#modal-footer button');
				animateTransactionNumbersToBalance({
					amount: -deal.downPayment,
					category: 'cash',
					sourceEl: btnEl,
					label: deal.title
				});

				if (deal.cashFlow > 0) {
					setTimeout(() => {
						animateTransactionNumbersToBalance({
							amount: deal.cashFlow,
							category: 'flow',
							sourceEl: document.getElementById('modal-stats') || btnEl,
							label: `+${deal.roiPercent}% Flujo`
						});
					}, 220);
				}

				const successDesc = `¡Excelente decisión! Ahora recibes <strong>+${formatCOP(deal.cashFlow)} extra (${deal.roiPercent}% de ganancia mensual)</strong> todos los meses en tu Día de Pago.`;

				showModal({
					typeName: deal.rarity === 'very_rare' ? '¡OCASIÓN EXTRAORDINARIA! 🔥💎' : (deal.rarity === 'rare' ? '¡OCASIÓN EXTRAÑA APROVECHADA! ⭐' : '¡ÉXITO! 🎉'),
					headerClass: 'opportunity',
					icon: deal.icon || '🎉',
					title: deal.title,
					detailedInfo: successDesc,
					stats: [
						{
							label: 'Ganancia agregada:',
							value: `+${formatCOP(deal.cashFlow)}/mes (${deal.roiPercent}%)`,
							color: 'green'
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
		typeName: modalTypeName,
		headerClass: 'opportunity',
		icon: deal.icon || '💼',
		title: deal.title,
		detailedInfo: `${rarityBadgeHtml}${deal.desc}<br><br><small style="color:#64748b;">💡 Inviertes <strong>${formatCOP(deal.downPayment)}</strong> y genera <strong>+${formatCOP(deal.cashFlow)} cada mes (${deal.roiPercent}% de ganancia mensual)</strong> en tus Días de Pago.</small>`,
		stats,
		buttons
	});
}

// 5. Gastos Imprevistos y Antojos (Doodads)
function showDoodadModal(player) {
	const doodad = pickRandom(DOODADS);
	const remaining = player.cash - doodad.cost;

	const typeTitle = doodad.category
		? `GASTO IMPREVISTO • ${doodad.category.toUpperCase()}`
		: 'GASTO IMPREVISTO 💸';

	showModal({
		typeName: typeTitle,
		headerClass: 'doodad',
		icon: doodad.icon || '💸',
		title: doodad.title,
		detailedInfo: `${doodad.desc}<br><br><small style="color:#64748b;">💡 Consejo: Guardar platica para imprevistos te protege sin frenar tus inversiones en negocios.</small>`,
		stats: [
			{ label: 'Gasto en efectivo:', value: `-${formatCOP(doodad.cost)}`, color: 'red' },
			{ label: 'Te quedará en bolsillo:', value: `${formatCOP(remaining)}`, color: remaining >= 0 ? 'green' : 'red' }
		],
		buttons: [
			{
				text: `¡Pagar ${formatCOP(doodad.cost)} y Seguir! 💸`,
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, doodad.title);
					player.cash -= doodad.cost;
					sounds.loss();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: -doodad.cost,
						category: 'cash',
						sourceEl: btnEl,
						label: doodad.title,
						onComplete: () => {
							showModalContinueButton(() => {
								closeModal(() => endTurn());
							});
						}
					});
				}
			}
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
		if (event.appliesTo === 'Propiedad Raíz' && (a.category === 'Propiedad Raíz' || a.category === 'Tierra / Engorde' || a.title?.includes('Lote') || a.title?.includes('Habitación'))) return true;
		if (event.appliesTo === 'Acciones' && (a.category === 'Acciones' || a.category === 'Renta Fija' || a.category === 'Fondos' || a.title?.includes('Sweet Lab') || a.title?.includes('Bono'))) return true;
		if (event.appliesTo === 'Emprendimiento' && (a.category === 'Emprendimiento' || a.category === 'Negocio Propio' || a.category === 'Coleccionables' || a.category === 'Propiedad Intelectual' || a.title?.includes('Cupcakes') || a.title?.includes('Joyería') || a.title?.includes('Jugos') || a.title?.includes('Cartas'))) return true;
		if (event.appliesTo === 'Negocio Automático' && (a.category === 'Negocio Automático' || a.category === 'Servicio Automático' || a.category === 'Entretenimiento' || a.title?.includes('Máquina') || a.title?.includes('Lavadora') || a.title?.includes('Consolas') || a.title?.includes('Tótem'))) return true;
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
			{ label: 'Pago en efectivo:', value: `${formatCOP(event.salePrice)}`, color: 'green' }
		],
		buttons: [
			{
				text: `¡Vender por ${formatCOP(event.salePrice)}! 💰`,
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, `Venta: ${asset.title}`);
					player.assets.splice(eligibleIndex, 1);
					player.cash += event.salePrice;
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: event.salePrice,
						category: 'cash',
						sourceEl: btnEl,
						label: `Venta: ${asset.title}`
					});

					showModal({
						typeName: '¡VENTA EXITOSA! 🎉',
						headerClass: 'market',
						icon: '🎉',
						title: asset.title,
						detailedInfo: `¡Felicitaciones! Recibiste <strong>${formatCOP(event.salePrice)}</strong> en efectivo para comprar nuevas oportunidades.`,
						stats: [
							{ label: 'Cobraste:', value: `+${formatCOP(event.salePrice)}`, color: 'green' }
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

// 7. Regalo / Solidaridad (Aporte benéfico a la comunidad)
function showCharityModal(player) {
	const donation = 100000;
	const canAfford = player.cash >= donation;

	showModal({
		typeName: 'DONACIÓN SOLIDARIA 💛',
		headerClass: 'charity',
		icon: '💛',
		title: 'Apoyo a la Comunidad',
		detailedInfo: `Puedes aportar <strong>${formatCOP(donation)}</strong> para apoyar a una fundación o causa social del barrio.`,
		stats: [
			{ label: 'Aporte solidario:', value: `-${formatCOP(donation)}`, color: 'red' }
		],
		buttons: [
			...(canAfford ? [{
				text: `Donar ${formatCOP(donation)} 💛`,
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, 'Donación Solidaria');
					player.cash -= donation;
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: donation,
						category: 'cash',
						sourceEl: btnEl,
						label: 'Donación Solidaria',
						onComplete: () => {
							showModalContinueButton(() => {
								closeModal(() => endTurn());
							});
						}
					});
				}
			}] : []),
			{
				text: 'Pasar por ahora ➔',
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
			{ label: 'Tu plata en bolsillo:', value: `${formatCOP(player.cash)}`, color: 'green' }
		],
		buttons: [
			{ text: '¡Descansar y Continuar! ➔', class: 'primary', action: () => { closeModal(() => endTurn()); } }
		]
	});
}

// ==========================================
// 10. PRÉSTAMOS Y DEUDAS BANCARIAS (Calibrado 2026: Bloques de $500.000)
// ==========================================

function showLoanModal(callbackAfterLoan) {
	const player = gameState.players[gameState.currentPlayerIndex];
	const loanBlock = 500000;
	const interest = 25000; // 5% mensual

	showModal({
		typeName: 'BANCO SWEET LAB 🏦',
		headerClass: 'opportunity',
		icon: '🏦',
		title: 'Préstamo Bancario',
		detailedInfo: `Pides dinero prestado para comprar una oportunidad que te dé ganancias mensuales. Por cada ${formatCOP(loanBlock)} prestados, sumas una cuota mensual de ${formatCOP(interest)}.`,
		stats: [
			{ label: 'Dinero prestado:', value: `+${formatCOP(loanBlock)}`, color: 'green' },
			{ label: 'Cuota mensual:', value: `${formatCOP(interest)} / mes`, color: 'red' },
			{ label: 'Tu deuda acumulada:', value: `${formatCOP(player.totalDebt)}` }
		],
		buttons: [
			{
				text: `Pedir ${formatCOP(loanBlock)} al Banco 🏦`,
				class: 'primary',
				action: () => {
					savePlayerFinancialSnapshot(player, 'Préstamo Bancario');
					player.cash += loanBlock;
					player.totalDebt += loanBlock;
					player.debtExpenses += interest;
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: loanBlock,
						category: 'cash',
						sourceEl: btnEl,
						label: 'Préstamo',
						onComplete: () => {
							if (callbackAfterLoan) callbackAfterLoan();
							else showModalContinueButton(() => closeModal(() => endTurn()));
						}
					});
				}
			},
			{
				text: `Pedir ${formatCOP(loanBlock * 2)} al Banco 🏦`,
				class: 'primary',
				action: () => {
					const block2 = loanBlock * 2;
					savePlayerFinancialSnapshot(player, 'Préstamo Bancario 2x');
					player.cash += block2;
					player.totalDebt += block2;
					player.debtExpenses += (interest * 2);
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: block2,
						category: 'cash',
						sourceEl: btnEl,
						label: 'Préstamo',
						onComplete: () => {
							if (callbackAfterLoan) callbackAfterLoan();
							else showModalContinueButton(() => closeModal(() => endTurn()));
						}
					});
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

	const payAmount = Math.min(player.totalDebt, 500000);
	const canAfford = player.cash >= payAmount;

	showModal({
		typeName: 'PAGAR DEUDA 💳',
		headerClass: 'opportunity',
		icon: '💳',
		title: 'Abonar a tu Deuda',
		detailedInfo: `Pagar <strong>${formatCOP(payAmount)}</strong> de tu deuda bancaria reduce tus gastos en $25.000 al mes, aumentando tu plata libre.`,
		stats: [
			{ label: 'Deuda que debes:', value: `${formatCOP(player.totalDebt)}` },
			{ label: 'Tu Plata en Mano:', value: `${formatCOP(player.cash)}`, color: canAfford ? 'green' : 'red' }
		],
		buttons: [
			{
				text: `Pagar cuota de ${formatCOP(payAmount)}`,
				class: 'primary',
				action: () => {
					if (!canAfford) {
						alert('No tienes suficiente plata en mano para pagar esta cuota.');
						return;
					}
					savePlayerFinancialSnapshot(player, 'Abono a Deuda');
					player.cash -= payAmount;
					player.totalDebt -= payAmount;
					player.debtExpenses = Math.max(0, player.debtExpenses - 25000);
					sounds.cash();
					updateHUDAndHeaders();

					const btnEl = document.querySelector('#modal-footer button');
					animateTransactionNumbersToBalance({
						amount: -payAmount,
						category: 'cash',
						sourceEl: btnEl,
						label: 'Pago Deuda',
						onComplete: () => {
							showModalContinueButton(() => {
								closeModal();
							});
						}
					});
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

function renderDrawerPlayerHeader(playerIndex = gameState.selectedDrawerPlayerIndex) {
	const container = document.getElementById('drawer-players-tabs');
	if (!container) return;
	const p = gameState.players[playerIndex];
	if (!p) return;

	container.innerHTML = `
		<div class="drawer-player-single-card" style="display:flex; align-items:center; gap:12px; width:100%; padding:10px 14px; border-radius:16px; background:${p.bg || 'rgba(37,99,235,0.08)'}; border:1.5px solid ${p.color || '#3b82f6'};">
			<div style="width:44px; height:44px; border-radius:50%; background:${p.color || '#3b82f6'}; display:flex; align-items:center; justify-content:center; font-size:1.6rem; color:white; flex-shrink:0;">
				${p.avatar}
			</div>
			<div style="display:flex; flex-direction:column; line-height:1.25;">
				<div style="display:flex; align-items:center; gap:8px;">
					<span style="font-family:'Outfit',sans-serif; font-weight:900; font-size:1.15rem; color:var(--text-main);">${p.name}</span>
					${playerIndex === gameState.currentPlayerIndex ? '<span style="font-size:0.7rem; font-weight:800; color:#15803d; background:#dcfce7; padding:1px 6px; border-radius:6px; text-transform:uppercase;">Turno</span>' : ''}
				</div>
				<small style="color:var(--text-muted); font-size:0.82rem; font-weight:700;">${p.hasJob ? p.profession : 'Buscando empleo'} • ${p.salariesCollected || 0} salarios cobrados</small>
			</div>
		</div>
	`;

	const titleEl = document.querySelector('.drawer-header h2');
	if (titleEl) titleEl.textContent = `📋 Balance de ${p.name}`;
}

const renderDrawerPlayerTabs = renderDrawerPlayerHeader;

function updateDrawerFinancials(playerIndex) {
	const p = gameState.players[playerIndex];
	if (!p) return;
	const fin = getPlayerFinancials(p);

	document.getElementById('drawer-freedom-pct').textContent = `${fin.freedomProgress}%`;
	document.getElementById('drawer-freedom-fill').style.width = `${fin.freedomProgress}%`;

	document.getElementById('drawer-cash-val').textContent = `${formatCOP(p.cash)}`;
	const cashflowEl = document.getElementById('drawer-cashflow-val');
	cashflowEl.textContent = `${fin.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(fin.monthlyCashFlow)}`;
	cashflowEl.style.color = fin.monthlyCashFlow >= 0 ? '#15803d' : '#dc2626';

	document.getElementById('drawer-salary').textContent = formatCOP(p.salary);
	document.getElementById('drawer-passive').textContent = formatCOP(fin.passiveIncome);
	const drawerRentEl = document.getElementById('drawer-rent-exp');
	const drawerGroceriesEl = document.getElementById('drawer-groceries-exp');
	const drawerUtilitiesEl = document.getElementById('drawer-utilities-exp');
	const drawerTransportEl = document.getElementById('drawer-transport-exp');
	const drawerInternetEl = document.getElementById('drawer-internet-exp');
	const drawerPhoneEl = document.getElementById('drawer-phone-exp');
	const drawerOtherEl = document.getElementById('drawer-other-exp');
	const drawerFixedEl = document.getElementById('drawer-fixed-exp');
	const drawerDebtEl = document.getElementById('drawer-debt-exp');

	if (drawerRentEl) drawerRentEl.textContent = formatCOP(p.rentExpense || DEFAULT_FIXED_EXPENSES.rent);
	if (drawerGroceriesEl) drawerGroceriesEl.textContent = formatCOP(p.groceriesExpense || DEFAULT_FIXED_EXPENSES.groceries);
	if (drawerUtilitiesEl) drawerUtilitiesEl.textContent = formatCOP(p.utilitiesExpense || DEFAULT_FIXED_EXPENSES.utilities);
	if (drawerTransportEl) drawerTransportEl.textContent = formatCOP(p.transportExpense || DEFAULT_FIXED_EXPENSES.transport);
	if (drawerInternetEl) drawerInternetEl.textContent = formatCOP(p.internetExpense || DEFAULT_FIXED_EXPENSES.internet);
	if (drawerPhoneEl) drawerPhoneEl.textContent = formatCOP(p.phoneExpense || DEFAULT_FIXED_EXPENSES.phone);
	if (drawerOtherEl) drawerOtherEl.textContent = formatCOP(p.otherExpenses || DEFAULT_FIXED_EXPENSES.other);
	if (drawerFixedEl) drawerFixedEl.textContent = formatCOP(p.fixedExpenses || 1500000);
	if (drawerDebtEl) drawerDebtEl.textContent = formatCOP(p.debtExpenses || 0);

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

	// Historial "Cómo era antes" dentro del Drawer (Mantener presionado)
	const drawerHistBtn = document.getElementById('btn-drawer-history');
	if (drawerHistBtn) {
		if (p.previousSnapshot) {
			drawerHistBtn.parentElement?.classList.remove('hidden');
			drawerHistBtn.innerHTML = '🕒 Mantén presionado: ¿Cómo era antes?';
			attachHoldToPeekEvents(
				drawerHistBtn,
				() => showPreviousDrawerState(p),
				() => restoreCurrentDrawerState(playerIndex)
			);
		} else {
			drawerHistBtn.parentElement?.classList.add('hidden');
		}
	}
}

/**
 * Muestra temporalmente en el Drawer las cifras previas mientras se mantenga presionado el botón.
 */
function showPreviousDrawerState(player) {
	if (!player || !player.previousSnapshot) return;
	const prev = player.previousSnapshot;

	const drawerHistBtn = document.getElementById('btn-drawer-history');
	if (drawerHistBtn) {
		drawerHistBtn.classList.add('active');
		drawerHistBtn.innerHTML = '⏪ Mostrando ANTES (suelta para volver)';
	}

	const cashValEl = document.getElementById('drawer-cash-val');
	const cashflowEl = document.getElementById('drawer-cashflow-val');
	const salaryEl = document.getElementById('drawer-salary');
	const passiveEl = document.getElementById('drawer-passive');
	const rentEl = document.getElementById('drawer-rent-exp');
	const groceriesEl = document.getElementById('drawer-groceries-exp');
	const utilitiesEl = document.getElementById('drawer-utilities-exp');
	const transportEl = document.getElementById('drawer-transport-exp');
	const internetEl = document.getElementById('drawer-internet-exp');
	const phoneEl = document.getElementById('drawer-phone-exp');
	const otherEl = document.getElementById('drawer-other-exp');
	const fixedEl = document.getElementById('drawer-fixed-exp');
	const debtEl = document.getElementById('drawer-debt-exp');

	if (cashValEl) {
		cashValEl.textContent = `${formatCOP(prev.cash)}`;
		cashValEl.classList.add('past-val-highlight');
	}
	if (cashflowEl) {
		cashflowEl.textContent = `${prev.monthlyCashFlow >= 0 ? '+' : ''}${formatCOP(prev.monthlyCashFlow)}`;
		cashflowEl.style.color = prev.monthlyCashFlow >= 0 ? '#15803d' : '#dc2626';
		cashflowEl.classList.add('past-val-highlight');
	}
	if (salaryEl) {
		salaryEl.textContent = formatCOP(prev.salary);
		salaryEl.classList.add('past-val-highlight');
	}
	if (passiveEl) {
		passiveEl.textContent = formatCOP(prev.passiveIncome);
		passiveEl.classList.add('past-val-highlight');
	}
	if (rentEl) {
		rentEl.textContent = formatCOP(prev.rentExpense || DEFAULT_FIXED_EXPENSES.rent);
		rentEl.classList.add('past-val-highlight');
	}
	if (groceriesEl) {
		groceriesEl.textContent = formatCOP(prev.groceriesExpense || DEFAULT_FIXED_EXPENSES.groceries);
		groceriesEl.classList.add('past-val-highlight');
	}
	if (utilitiesEl) {
		utilitiesEl.textContent = formatCOP(prev.utilitiesExpense || DEFAULT_FIXED_EXPENSES.utilities);
		utilitiesEl.classList.add('past-val-highlight');
	}
	if (transportEl) {
		transportEl.textContent = formatCOP(prev.transportExpense || DEFAULT_FIXED_EXPENSES.transport);
		transportEl.classList.add('past-val-highlight');
	}
	if (internetEl) {
		internetEl.textContent = formatCOP(prev.internetExpense || DEFAULT_FIXED_EXPENSES.internet);
		internetEl.classList.add('past-val-highlight');
	}
	if (phoneEl) {
		phoneEl.textContent = formatCOP(prev.phoneExpense || DEFAULT_FIXED_EXPENSES.phone);
		phoneEl.classList.add('past-val-highlight');
	}
	if (otherEl) {
		otherEl.textContent = formatCOP(prev.otherExpenses || DEFAULT_FIXED_EXPENSES.other);
		otherEl.classList.add('past-val-highlight');
	}
	if (fixedEl) {
		fixedEl.textContent = formatCOP(prev.fixedExpenses || 1500000);
		fixedEl.classList.add('past-val-highlight');
	}
	if (debtEl) {
		debtEl.textContent = formatCOP(prev.debtExpenses || 0);
		debtEl.classList.add('past-val-highlight');
	}
}

/**
 * Restaura la información actualizada en el Drawer al soltar el botón.
 */
function restoreCurrentDrawerState(playerIndex) {
	const drawerHistBtn = document.getElementById('btn-drawer-history');
	if (drawerHistBtn) {
		drawerHistBtn.classList.remove('active');
		drawerHistBtn.innerHTML = '🕒 Mantén presionado: ¿Cómo era antes?';
	}
	document.querySelectorAll('.past-val-highlight').forEach(el => el.classList.remove('past-val-highlight'));
	updateDrawerFinancials(playerIndex);
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
			Tus <strong>Ingresos Pasivos (${formatCOP(fin.passiveIncome)}/mes)</strong> han superado por completo tus <strong>Gastos Totales (${formatCOP(fin.totalExpenses)}/mes)</strong>.<br><br>
			¡Ya no dependes de un salario! Has alcanzado la <strong>Libertad Financiera</strong> y escapaste de la Carrera de la Rata.
		`;
	}

	if (summary) {
		summary.innerHTML = `
			<div class="card-stat-line">
				<span class="lbl">Ingresos Pasivos Mensuales</span>
				<span class="val green">+${formatCOP(fin.passiveIncome)}/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Gastos Totales Mensuales</span>
				<span class="val red">-${formatCOP(fin.totalExpenses)}/mes</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Activos Construidos</span>
				<span class="val green">${player.assets.length} activos</span>
			</div>
			<div class="card-stat-line">
				<span class="lbl">Efectivo en Mano</span>
				<span class="val green">${formatCOP(player.cash)}</span>
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
		cashEl.textContent = `${formatCOP(player.cash)}`;
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
	const rentExpEl = document.getElementById('side-bal-rent-exp');
	const groceriesExpEl = document.getElementById('side-bal-groceries-exp');
	const utilitiesExpEl = document.getElementById('side-bal-utilities-exp');
	const transportExpEl = document.getElementById('side-bal-transport-exp');
	const internetExpEl = document.getElementById('side-bal-internet-exp');
	const phoneExpEl = document.getElementById('side-bal-phone-exp');
	const otherExpEl = document.getElementById('side-bal-other-exp');
	const debtExpEl = document.getElementById('side-bal-debt-exp');
	const totalExpEl = document.getElementById('side-bal-total-exp');
	if (rentExpEl) rentExpEl.textContent = `-${formatCOP(player.rentExpense ?? DEFAULT_FIXED_EXPENSES.rent)}`;
	if (groceriesExpEl) groceriesExpEl.textContent = `-${formatCOP(player.groceriesExpense ?? DEFAULT_FIXED_EXPENSES.groceries)}`;
	if (utilitiesExpEl) utilitiesExpEl.textContent = `-${formatCOP(player.utilitiesExpense ?? DEFAULT_FIXED_EXPENSES.utilities)}`;
	if (transportExpEl) transportExpEl.textContent = `-${formatCOP(player.transportExpense ?? DEFAULT_FIXED_EXPENSES.transport)}`;
	if (internetExpEl) internetExpEl.textContent = `-${formatCOP(player.internetExpense ?? DEFAULT_FIXED_EXPENSES.internet)}`;
	if (phoneExpEl) phoneExpEl.textContent = `-${formatCOP(player.phoneExpense ?? DEFAULT_FIXED_EXPENSES.phone)}`;
	if (otherExpEl) otherExpEl.textContent = `-${formatCOP(player.otherExpenses ?? DEFAULT_FIXED_EXPENSES.other)}`;
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

	// 5. Indicadores delta y botón de historial "Cómo era antes"
	const prev = player.previousSnapshot;
	const historyBtn = document.getElementById('btn-side-bal-history');
	const cashDeltaEl = document.getElementById('side-bal-cash-delta');
	const flowDeltaEl = document.getElementById('side-bal-flow-delta');
	const cashMetricBox = document.getElementById('side-bal-metric-cash');
	const flowMetricBox = document.getElementById('side-bal-metric-flow');
	const incomeQuad = document.getElementById('k-quad-income');

	if (prev) {
		if (historyBtn) {
			historyBtn.classList.remove('hidden');
			historyBtn.innerHTML = '🕒 Mantén presionado: ¿Cómo era antes?';
			attachHoldToPeekEvents(
				historyBtn,
				() => showPreviousBalanceState(player),
				() => restoreCurrentBalanceState()
			);
		}

		// Delta en Efectivo
		const cashDiff = player.cash - prev.cash;
		if (cashDeltaEl) {
			if (cashDiff !== 0) {
				const sign = cashDiff > 0 ? '+' : '-';
				cashDeltaEl.textContent = `${sign}${formatCOP(Math.abs(cashDiff))} (Antes: ${formatCOP(prev.cash)})`;
				cashDeltaEl.className = `bal-delta-pill ${cashDiff > 0 ? 'gain' : 'loss'}`;
				cashDeltaEl.classList.remove('hidden');
			} else {
				cashDeltaEl.classList.add('hidden');
			}
		}

		// Delta en Flujo Libre
		const flowDiff = fin.monthlyCashFlow - prev.monthlyCashFlow;
		if (flowDeltaEl) {
			if (flowDiff !== 0) {
				const sign = flowDiff > 0 ? '+' : '-';
				flowDeltaEl.textContent = `${sign}${formatCOP(Math.abs(flowDiff))}/m (Antes: ${formatCOP(prev.monthlyCashFlow)}/m)`;
				flowDeltaEl.className = `bal-delta-pill ${flowDiff > 0 ? 'gain' : 'loss'}`;
				flowDeltaEl.classList.remove('hidden');
			} else {
				flowDeltaEl.classList.add('hidden');
			}
		}

		// Si el usuario también mantiene presionadas las métricas de efectivo o flujo, muestra cómo era antes
		if (cashMetricBox) {
			attachHoldToPeekEvents(
				cashMetricBox,
				() => showPreviousBalanceState(player),
				() => restoreCurrentBalanceState()
			);
		}
		if (flowMetricBox) {
			attachHoldToPeekEvents(
				flowMetricBox,
				() => showPreviousBalanceState(player),
				() => restoreCurrentBalanceState()
			);
		}
	} else {
		if (historyBtn) historyBtn.classList.add('hidden');
		if (cashDeltaEl) cashDeltaEl.classList.add('hidden');
		if (flowDeltaEl) flowDeltaEl.classList.add('hidden');
	}

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

	if (sideBal) sideBal.classList.remove('active', 'viewing-past-state');
	const historyBtn = document.getElementById('btn-side-bal-history');
	if (historyBtn) historyBtn.classList.remove('active');
	document.querySelectorAll('.past-val-highlight').forEach(el => el.classList.remove('past-val-highlight'));

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
