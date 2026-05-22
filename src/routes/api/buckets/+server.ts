import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listBuckets, VIDEO_EXTS } from '$lib/server/paths';

export interface BucketSummary {
	name: string;
	videoCount: number;
	transcriptCount: number;
	supercutCount: number;
}

export const GET: RequestHandler = async () => {
	const buckets = await listBuckets();
	const summaries: BucketSummary[] = [];

	for (const b of buckets) {
		let videoCount = 0;
		let transcriptCount = 0;
		let supercutCount = 0;

		try {
			for (const f of await readdir(b.videosDir)) {
				if (VIDEO_EXTS.has(extname(f).toLowerCase())) videoCount++;
			}
		} catch {}
		try {
			for (const f of await readdir(b.transcriptsDir)) {
				if (f.endsWith('.json')) transcriptCount++;
			}
		} catch {}
		try {
			for (const f of await readdir(b.supercutsDir)) {
				if (extname(f).toLowerCase() === '.mp4') {
					const info = await stat(join(b.supercutsDir, f)).catch(() => null);
					if (info?.isFile()) supercutCount++;
				}
			}
		} catch {}

		summaries.push({
			name: b.name,
			videoCount,
			transcriptCount,
			supercutCount,
		});
	}

	return json({ buckets: summaries });
};
