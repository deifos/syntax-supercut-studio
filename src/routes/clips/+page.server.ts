import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { PageServerLoad } from './$types';
import { listBuckets } from '$lib/server/paths';

export interface ClipInfo {
	bucket: string;
	file: string;
	sizeMB: number;
	modified: number;
}

export const load: PageServerLoad = async () => {
	const buckets = await listBuckets();
	const clips: ClipInfo[] = [];

	for (const bucket of buckets) {
		let entries: string[] = [];
		try {
			entries = await readdir(bucket.supercutsDir);
		} catch {
			continue;
		}
		for (const file of entries) {
			if (extname(file).toLowerCase() !== '.mp4') continue;
			const info = await stat(join(bucket.supercutsDir, file)).catch(() => null);
			if (!info || !info.isFile()) continue;
			clips.push({
				bucket: bucket.name,
				file,
				sizeMB: Number((info.size / 1024 / 1024).toFixed(1)),
				modified: info.mtimeMs,
			});
		}
	}

	clips.sort((a, b) => b.modified - a.modified);
	return { clips, buckets: buckets.map((b) => b.name) };
};
