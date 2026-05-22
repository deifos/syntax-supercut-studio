import { error, json } from '@sveltejs/kit';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RequestHandler } from './$types';
import { resolveBuckets, isInsideAllowedRoot } from '$lib/server/paths';

export const DELETE: RequestHandler = async ({ params }) => {
	const bucketName = decodeURIComponent(params.bucket);
	const name = decodeURIComponent(params.name);
	if (name.includes('/') || name.includes('\\') || name.startsWith('.')) {
		throw error(400, 'Invalid filename');
	}
	const [bucket] = await resolveBuckets([bucketName]).catch(() => []);
	if (!bucket) throw error(404, 'Unknown bucket');

	const full = resolve(join(bucket.supercutsDir, name));
	if (!isInsideAllowedRoot(full)) throw error(403, 'Forbidden');
	await unlink(full).catch((err) => {
		throw error(404, err.message);
	});
	return json({ ok: true });
};
