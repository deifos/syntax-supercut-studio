import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { resolveBuckets, VIDEO_EXTS, AUDIO_EXTS, type Bucket } from '../paths.js';
import { runFfmpeg, throwIfAborted, type LogFn } from '../ffmpeg.js';

// Every extension the transcriber can accept as input. Must match the set
// the library loader uses so the UI count and the pipeline count agree.
const MEDIA_EXTS = new Set<string>([...VIDEO_EXTS, ...AUDIO_EXTS, '.opus']);

const STT_URL = 'https://api.x.ai/v1/stt';

export interface STTWord {
	text: string;
	start: number;
	end: number;
	confidence?: number;
	speaker?: number;
}

export interface STTResponse {
	text: string;
	language: string;
	duration: number;
	words?: STTWord[];
}

function apiKey(): string {
	const k = process.env.XAI_API_KEY;
	if (!k) throw new Error('XAI_API_KEY environment variable is not set');
	return k;
}

export async function transcribeFile(
	filePath: string,
	options: { language?: string; diarize?: boolean; signal?: AbortSignal } = {},
): Promise<STTResponse> {
	const { language = 'en', diarize = false, signal } = options;
	const buffer = await readFile(filePath);
	const filename = basename(filePath);
	const ext = extname(filePath).toLowerCase().replace('.', '') || 'mp4';

	const form = new FormData();
	form.append('language', language);
	if (diarize) form.append('diarize', 'true');
	const blob = new Blob([new Uint8Array(buffer)], { type: `audio/${ext}` });
	form.append('file', blob, filename);

	const res = await fetch(STT_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey()}` },
		body: form,
		signal,
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`STT request failed (${res.status}): ${errText}`);
	}
	return (await res.json()) as STTResponse;
}

/** Upload size cap enforced by Cloudflare in front of the xAI STT endpoint. */
const UPLOAD_CAP_MB = 500;

/**
 * Extract an mp3 from a source media file to a sibling `<slug>.mp3` in the
 * bucket's videos/ folder. Uses libmp3lame at V2 quality which gives ~128 kbps
 * spoken audio — plenty for speech-to-text, and shrinks typical podcast mp4s
 * by 10–30x.
 */
async function extractMp3(
	sourcePath: string,
	destPath: string,
	onLog: LogFn,
	signal?: AbortSignal,
): Promise<void> {
	onLog(`Extracting mp3 -> ${basename(destPath)}`);
	await runFfmpeg(
		[
			'-i',
			sourcePath,
			'-vn',
			'-c:a',
			'libmp3lame',
			'-q:a',
			'2',
			'-ar',
			'44100',
			'-ac',
			'2',
			destPath,
		],
		onLog,
		signal,
	);
}

export interface TranscribeOneOptions {
	/** Bucket name the media lives in. */
	bucket: string;
	/** Media filename stem (no extension). */
	slug: string;
	language?: string;
	diarize?: boolean;
	overwrite?: boolean;
	onLog?: LogFn;
	signal?: AbortSignal;
}

export interface TranscribeOneResult {
	outFile: string;
	durationSec: number;
	words: number;
	uploadedMB: number;
	bucket: string;
	extractedMp3: boolean;
}

/**
 * Transcribe a single media file by its bucket + slug. Prefers `<slug>.mp3`
 * over other extensions for upload size. Writes to the bucket's transcripts/
 * folder.
 */
export async function transcribeOne(opts: TranscribeOneOptions): Promise<TranscribeOneResult> {
	const onLog = opts.onLog ?? (() => {});
	const [bucket] = await resolveBuckets([opts.bucket]);

	await mkdir(bucket.transcriptsDir, { recursive: true });
	const outFile = join(bucket.transcriptsDir, `${opts.slug}.json`);
	if (!opts.overwrite) {
		const existing = await stat(outFile).catch(() => null);
		if (existing) throw new Error(`Transcript already exists for ${opts.slug}`);
	}

	const mp3Path = join(bucket.videosDir, `${opts.slug}.mp3`);
	const hasMp3 = await stat(mp3Path).then(() => true, () => false);

	let inputPath = mp3Path;
	let originalPath: string | null = null;
	if (!hasMp3) {
		const entries = await readdir(bucket.videosDir);
		const match = entries.find((f) => basename(f, extname(f)) === opts.slug);
		if (!match) throw new Error(`No media file found for ${opts.slug} in bucket ${bucket.name}`);
		inputPath = join(bucket.videosDir, match);
		originalPath = inputPath;
	}

	let info = await stat(inputPath);
	let sizeMb = info.size / 1024 / 1024;

	// If the source is over the upload cap, auto-extract an mp3 next to it and
	// retarget. The extracted .mp3 lives in the bucket so the next run will
	// pick it up automatically.
	let extractedMp3 = false;
	if (sizeMb > UPLOAD_CAP_MB) {
		if (hasMp3) {
			// This shouldn't happen — having an mp3 already means inputPath is
			// the mp3 — but guard against absurd mp3s just in case.
			throw new Error(
				`${basename(inputPath)} is ${sizeMb.toFixed(1)} MB (> ${UPLOAD_CAP_MB} MB upload cap).`,
			);
		}
		onLog(
			`${basename(inputPath)} is ${sizeMb.toFixed(1)} MB (> ${UPLOAD_CAP_MB} MB upload cap). Extracting mp3 first...`,
		);
		await extractMp3(inputPath, mp3Path, onLog, opts.signal);
		extractedMp3 = true;
		inputPath = mp3Path;
		info = await stat(inputPath);
		sizeMb = info.size / 1024 / 1024;
		onLog(
			`Extracted ${basename(mp3Path)} (${sizeMb.toFixed(1)} MB${originalPath ? `, from ${(await stat(originalPath)).size / 1024 / 1024 | 0} MB source` : ''}).`,
		);
		if (sizeMb > UPLOAD_CAP_MB) {
			throw new Error(
				`Even the extracted mp3 is ${sizeMb.toFixed(1)} MB (> ${UPLOAD_CAP_MB} MB). Source is too long to transcribe in one shot.`,
			);
		}
	}

	onLog(`Uploading ${basename(inputPath)} (${sizeMb.toFixed(1)} MB)...`);
	const started = Date.now();
	const result = await transcribeFile(inputPath, {
		language: opts.language,
		diarize: opts.diarize,
		signal: opts.signal,
	});
	const elapsed = (Date.now() - started) / 1000;
	onLog(
		`Received ${result.duration}s of audio, ${result.words?.length ?? 0} words in ${elapsed.toFixed(1)}s`,
	);

	await writeFile(outFile, JSON.stringify(result, null, 2));
	onLog(`Wrote ${outFile}`);

	return {
		outFile,
		durationSec: result.duration,
		words: result.words?.length ?? 0,
		uploadedMB: Number(sizeMb.toFixed(1)),
		bucket: bucket.name,
		extractedMp3,
	};
}

export interface TranscribeAllMissingOptions {
	/** Buckets to scan. null/empty = all buckets. */
	buckets?: string[] | null;
	language?: string;
	concurrency?: number;
	onLog?: LogFn;
	signal?: AbortSignal;
}

export interface TranscribeAllMissingResult {
	attempted: number;
	succeeded: number;
	failed: { bucket: string; slug: string; error: string }[];
}

/**
 * Find every media file in the selected buckets that doesn't yet have a
 * matching transcript and transcribe them, up to `concurrency` at a time.
 */
export async function transcribeAllMissing(
	opts: TranscribeAllMissingOptions = {},
): Promise<TranscribeAllMissingResult> {
	const buckets = await resolveBuckets(opts.buckets);
	const concurrency = opts.concurrency ?? 3;
	const onLog = opts.onLog ?? (() => {});

	const queue: { bucket: Bucket; slug: string }[] = [];

	for (const bucket of buckets) {
		await mkdir(bucket.transcriptsDir, { recursive: true });

		let entries: string[] = [];
		try {
			entries = await readdir(bucket.videosDir);
		} catch {
			continue;
		}
		const slugs = new Set<string>();
		for (const f of entries) {
			if (!MEDIA_EXTS.has(extname(f).toLowerCase())) continue;
			slugs.add(basename(f, extname(f)));
		}

		let transcripts = new Set<string>();
		try {
			transcripts = new Set(
				(await readdir(bucket.transcriptsDir))
					.filter((f) => f.endsWith('.json'))
					.map((f) => basename(f, '.json')),
			);
		} catch {
			// transcripts dir absent; already created above, but stay safe.
		}

		for (const slug of slugs) {
			if (transcripts.has(slug)) continue;
			queue.push({ bucket, slug });
		}
	}

	onLog(`${queue.length} missing transcript(s) across ${buckets.length} bucket(s)`);

	const failed: { bucket: string; slug: string; error: string }[] = [];
	let succeeded = 0;

	let cursor = 0;
	async function worker(): Promise<void> {
		while (cursor < queue.length) {
			throwIfAborted(opts.signal);
			const { bucket, slug } = queue[cursor++];
			try {
				await transcribeOne({
					bucket: bucket.name,
					slug,
					language: opts.language,
					onLog,
					signal: opts.signal,
				});
				succeeded++;
			} catch (err) {
				if (err instanceof Error && err.name === 'CancelledError') throw err;
				failed.push({
					bucket: bucket.name,
					slug,
					error: err instanceof Error ? err.message : String(err),
				});
				onLog(`  x [${bucket.name}] ${slug}: ${err instanceof Error ? err.message : err}`);
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
	);

	return { attempted: queue.length, succeeded, failed };
}
