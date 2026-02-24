import { ensureSchema, sql } from './_db.js';

export const DEFAULT_GAME_PRIZES = [
	{ type: 'free', label: 'POSTRE GRATIS', value: '🎂', probability: 5, color: '#ff6b9d' },
	{ type: 'discount', label: '70% DESC', value: '70%', probability: 2, color: '#f43f5e' },
	{ type: 'discount', label: '50% DESC', value: '50%', probability: 5, color: '#ec4899' },
	{ type: 'discount', label: '30% DESC', value: '30%', probability: 10, color: '#f472b6' },
	{ type: 'discount', label: '25% DESC', value: '25%', probability: 10, color: '#f472b6' },
	{ type: 'discount', label: '20% DESC', value: '20%', probability: 15, color: '#f9a8d4' },
	{ type: 'discount', label: '15% DESC', value: '15%', probability: 15, color: '#f9a8d4' },
	{ type: 'discount', label: '10% DESC', value: '10%', probability: 20, color: '#fbcfe8' },
	{ type: 'discount', label: '5% DESC', value: '5%', probability: 13, color: '#fce7f3' },
	{ type: 'discount', label: '0% DESC', value: '0%', probability: 5, color: '#fce7f3' }
];

const KNOWN_LABELS = new Set(DEFAULT_GAME_PRIZES.map((prize) => prize.label));

let gameProbabilitiesTableEnsured = false;
let gameProbabilitiesTablePromise = null;

function toBadRequest(message) {
	const err = new Error(message);
	err.statusCode = 400;
	return err;
}

function normalizeProbability(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.round(parsed);
	if (rounded < 0) return null;
	return rounded;
}

async function ensureGameProbabilitiesTable() {
	if (gameProbabilitiesTableEnsured) return;
	if (gameProbabilitiesTablePromise) return gameProbabilitiesTablePromise;

	gameProbabilitiesTablePromise = (async () => {
		await ensureSchema();
		await sql`CREATE TABLE IF NOT EXISTS game_prize_probabilities (
			label TEXT PRIMARY KEY,
			probability INTEGER NOT NULL CHECK (probability >= 0),
			updated_at TIMESTAMPTZ DEFAULT now()
		)`;

		for (const prize of DEFAULT_GAME_PRIZES) {
			await sql`
				INSERT INTO game_prize_probabilities (label, probability)
				VALUES (${prize.label}, ${prize.probability})
				ON CONFLICT (label) DO NOTHING
			`;
		}

		gameProbabilitiesTableEnsured = true;
	})();

	try {
		await gameProbabilitiesTablePromise;
	} finally {
		gameProbabilitiesTablePromise = null;
	}
}

function mergeWithDefaults(rows) {
	const probabilitiesByLabel = {};

	for (const prize of DEFAULT_GAME_PRIZES) {
		probabilitiesByLabel[prize.label] = prize.probability;
	}

	for (const row of rows || []) {
		const label = String(row?.label || '').trim();
		if (!KNOWN_LABELS.has(label)) continue;
		const probability = normalizeProbability(row?.probability);
		if (probability === null) continue;
		probabilitiesByLabel[label] = probability;
	}

	return DEFAULT_GAME_PRIZES.map((prize) => ({
		...prize,
		probability: probabilitiesByLabel[prize.label]
	}));
}

export function getTotalProbability(prizes) {
	return (prizes || []).reduce((sum, prize) => sum + (normalizeProbability(prize?.probability) || 0), 0);
}

export async function getConfiguredGamePrizes() {
	await ensureGameProbabilitiesTable();
	const rows = await sql`SELECT label, probability FROM game_prize_probabilities`;
	return mergeWithDefaults(rows);
}

export async function setGamePrizeProbability(label, probability) {
	const normalizedLabel = String(label || '').trim();
	if (!normalizedLabel || !KNOWN_LABELS.has(normalizedLabel)) {
		throw toBadRequest('Premio inválido');
	}

	const normalizedProbability = normalizeProbability(probability);
	if (normalizedProbability === null) {
		throw toBadRequest('Probabilidad inválida');
	}

	await ensureGameProbabilitiesTable();
	await sql`
		INSERT INTO game_prize_probabilities (label, probability, updated_at)
		VALUES (${normalizedLabel}, ${normalizedProbability}, now())
		ON CONFLICT (label) DO UPDATE
		SET probability = EXCLUDED.probability,
			updated_at = now()
	`;

	return getConfiguredGamePrizes();
}
