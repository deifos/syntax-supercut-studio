import { readdir, stat } from 'node:fs/promises';
import { resolve, join, basename, relative } from 'node:path';

/**
 * Root of all buckets. Lives inside this app by default at ./videos.
 * Each direct subfolder inside here is a bucket. A bucket contains three
 * subfolders: videos/, transcripts/, supercuts/. The outer "videos" name is
 * a bit unfortunate but matches how the project was laid out.
 *
 *   videos/                                <- BUCKETS_ROOT
 *     syntax/                              <- a bucket name
 *       videos/        *.mp4  *.mp3        <- source media
 *       transcripts/   *.json              <- STT output
 *       supercuts/     *.mp4               <- generated clips
 *     some-other-bucket/
 *       ...
 *
 * Override the root with SYNTAX_BUCKETS_DIR=/abs/path if you want.
 */
export const BUCKETS_ROOT = resolve(
	process.env.SYNTAX_BUCKETS_DIR ?? join(process.cwd(), 'videos'),
);

export const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi']);
export const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac']);

export interface Bucket {
	name: string;
	dir: string;
	videosDir: string;
	transcriptsDir: string;
	supercutsDir: string;
}

function bucketPaths(name: string): Bucket {
	const dir = resolve(BUCKETS_ROOT, name);
	return {
		name,
		dir,
		videosDir: join(dir, 'videos'),
		transcriptsDir: join(dir, 'transcripts'),
		supercutsDir: join(dir, 'supercuts'),
	};
}

/**
 * Discover every bucket (subdir of BUCKETS_ROOT that has a videos/ subdir).
 * Any folder without a videos/ child is ignored so random junk in videos/
 * doesn't show up in the picker.
 */
export async function listBuckets(): Promise<Bucket[]> {
	let entries: string[] = [];
	try {
		entries = await readdir(BUCKETS_ROOT);
	} catch {
		return [];
	}

	const buckets: Bucket[] = [];
	for (const name of entries) {
		if (name.startsWith('.')) continue;
		const abs = join(BUCKETS_ROOT, name);
		const info = await stat(abs).catch(() => null);
		if (!info || !info.isDirectory()) continue;
		// Only consider dirs that have a videos/ subfolder (even if empty for now).
		const videosChild = await stat(join(abs, 'videos')).catch(() => null);
		if (!videosChild || !videosChild.isDirectory()) continue;
		buckets.push(bucketPaths(name));
	}
	buckets.sort((a, b) => a.name.localeCompare(b.name));
	return buckets;
}

/**
 * Resolve a list of bucket names to their directory info. Unknown names throw
 * so the UI can't ask the server to render from a bogus bucket. If `names` is
 * empty, returns all discovered buckets (the common "pick everything" case).
 */
export async function resolveBuckets(names: string[] | undefined | null): Promise<Bucket[]> {
	const all = await listBuckets();
	if (!names || names.length === 0) return all;
	const byName = new Map(all.map((b) => [b.name, b]));
	const out: Bucket[] = [];
	for (const n of names) {
		const b = byName.get(n);
		if (!b) throw new Error(`Unknown bucket: ${n}`);
		out.push(b);
	}
	return out;
}

/**
 * Figure out which bucket a filesystem path belongs to. Returns null if it
 * doesn't live inside any bucket's videos/ or supercuts/ dir. Used for the
 * /api/media endpoint so we can serve any bucket's files while rejecting
 * path-traversal attempts.
 */
export function bucketForPath(target: string): { bucket: string; kind: 'videos' | 'supercuts' } | null {
	const abs = resolve(target);
	const rel = relative(BUCKETS_ROOT, abs);
	if (rel.startsWith('..')) return null;
	const parts = rel.split('/');
	if (parts.length < 3) return null;
	const [bucket, kind] = parts;
	if (kind !== 'videos' && kind !== 'supercuts') return null;
	return { bucket, kind };
}

/**
 * Safety-check: is `target` inside a bucket's videos/ or supercuts/ folder?
 */
export function isInsideAllowedRoot(target: string): boolean {
	return bucketForPath(target) !== null;
}

/**
 * Convenience for callers that want the first/only bucket.
 */
export function bucketFor(name: string): Bucket {
	return bucketPaths(name);
}

/**
 * Path to the pitch-detection cache for songify. Shared across all buckets
 * since (video, start, end) is globally unique. Lives alongside the buckets
 * folder so it travels with the media.
 */
export const PITCH_CACHE_FILE = resolve(BUCKETS_ROOT, '..', '.pitch-cache.json');

export { basename };
