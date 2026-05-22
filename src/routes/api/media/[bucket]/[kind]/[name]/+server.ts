import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { resolveBuckets, isInsideAllowedRoot } from '$lib/server/paths';

const CONTENT_TYPES: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mkv': 'video/x-matroska',
	'.mov': 'video/quicktime',
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.flac': 'audio/flac',
};

export const GET: RequestHandler = async ({ params, request }) => {
	const bucketName = decodeURIComponent(params.bucket);
	const kind = params.kind;
	const rawName = decodeURIComponent(params.name);

	if (kind !== 'videos' && kind !== 'supercuts') throw error(404, 'Unknown media kind');
	if (rawName.includes('/') || rawName.includes('\\') || rawName.startsWith('.')) {
		throw error(400, 'Invalid filename');
	}

	const [bucket] = await resolveBuckets([bucketName]).catch(() => []);
	if (!bucket) throw error(404, 'Unknown bucket');

	const root = kind === 'videos' ? bucket.videosDir : bucket.supercutsDir;
	const filePath = resolve(join(root, rawName));
	if (!isInsideAllowedRoot(filePath)) throw error(403, 'Forbidden');

	const info = await stat(filePath).catch(() => null);
	if (!info || !info.isFile()) throw error(404, 'Not found');

	const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
	const total = info.size;
	const rangeHeader = request.headers.get('range');

	if (rangeHeader) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
		if (match) {
			const startStr = match[1];
			const endStr = match[2];
			const start = startStr === '' ? Math.max(0, total - parseInt(endStr, 10)) : parseInt(startStr, 10);
			const end = endStr === '' ? total - 1 : parseInt(endStr, 10);
			if (
				Number.isNaN(start) ||
				Number.isNaN(end) ||
				start > end ||
				end >= total ||
				start < 0
			) {
				return new Response(null, {
					status: 416,
					headers: { 'Content-Range': `bytes */${total}` },
				});
			}
			const stream = createReadStream(filePath, { start, end });
			const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
			return new Response(webStream, {
				status: 206,
				headers: {
					'Content-Type': contentType,
					'Content-Length': String(end - start + 1),
					'Content-Range': `bytes ${start}-${end}/${total}`,
					'Accept-Ranges': 'bytes',
					'Cache-Control': 'private, max-age=3600',
				},
			});
		}
	}

	const stream = createReadStream(filePath);
	const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
	return new Response(webStream, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Length': String(total),
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'private, max-age=3600',
		},
	});
};
