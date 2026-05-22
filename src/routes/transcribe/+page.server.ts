import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { PageServerLoad } from './$types';
import { listBuckets, VIDEO_EXTS, AUDIO_EXTS } from '$lib/server/paths';

export interface MissingEntry {
	bucket: string;
	slug: string;
	sizeMB: number;
	hasMp3: boolean;
}

export const load: PageServerLoad = async () => {
	const buckets = await listBuckets();
	const missing: MissingEntry[] = [];
	let transcribedCount = 0;

	for (const bucket of buckets) {
		const slugInfo = new Map<string, { size: number; hasMp3: boolean }>();
		try {
			for (const file of await readdir(bucket.videosDir)) {
				const ext = extname(file).toLowerCase();
				const slug = basename(file, extname(file));
				if (!VIDEO_EXTS.has(ext) && !AUDIO_EXTS.has(ext)) continue;
				const info = await stat(join(bucket.videosDir, file)).catch(() => null);
				if (!info) continue;
				const prev = slugInfo.get(slug);
				if (!prev) {
					slugInfo.set(slug, { size: info.size, hasMp3: ext === '.mp3' });
				} else if (ext === '.mp3') {
					prev.hasMp3 = true;
				}
			}
		} catch {}

		const transcribed = new Set<string>();
		try {
			for (const f of await readdir(bucket.transcriptsDir)) {
				if (f.endsWith('.json')) transcribed.add(basename(f, '.json'));
			}
		} catch {}

		transcribedCount += transcribed.size;

		for (const [slug, info] of slugInfo) {
			if (transcribed.has(slug)) continue;
			missing.push({
				bucket: bucket.name,
				slug,
				sizeMB: Number((info.size / 1024 / 1024).toFixed(1)),
				hasMp3: info.hasMp3,
			});
		}
	}

	missing.sort(
		(a, b) => a.bucket.localeCompare(b.bucket) || a.slug.localeCompare(b.slug),
	);

	return {
		buckets: buckets.map((b) => b.name),
		missing,
		transcribedCount,
	};
};
