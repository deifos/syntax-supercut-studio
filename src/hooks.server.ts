import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Handle } from '@sveltejs/kit';

/**
 * Load secrets from the sibling repo's .env (if present) at boot so we don't
 * have to duplicate keys like XAI_API_KEY. Local .env files loaded by vite /
 * svelte-kit take precedence since we only set keys that are still undefined.
 */
function hydrateEnvFromSibling() {
	const candidate = resolve(
		process.cwd(),
		process.env.SYNTAX_REPO_DIR ?? '../syntax-transcripts-2026',
		'.env',
	);
	try {
		const raw = readFileSync(candidate, 'utf8');
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let value = trimmed.slice(eq + 1).trim();
			// Strip surrounding quotes if present.
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	} catch {
		// .env isn't required; silently skip if absent.
	}
}

hydrateEnvFromSibling();

export const handle: Handle = ({ event, resolve: resolveEvent }) => resolveEvent(event);
