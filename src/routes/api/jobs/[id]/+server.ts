import { json, error } from '@sveltejs/kit';
import { basename } from 'node:path';
import type { RequestHandler } from './$types';
import { cancelJob, getJob } from '$lib/server/jobs';
import { bucketForPath } from '$lib/server/paths';

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = cancelJob(params.id);
	if (!ok) throw error(404, 'Job not found or already finished');
	return json({ ok: true });
};

export const GET: RequestHandler = async ({ params }) => {
	const job = getJob(params.id);
	if (!job) throw error(404, 'Job not found');

	// Build a media URL for the result if it produced one.
	let mediaUrl: string | null = null;
	if (
		job.status === 'done' &&
		job.result &&
		'outFile' in job.result &&
		typeof job.result.outFile === 'string'
	) {
		const abs = job.result.outFile;
		const loc = bucketForPath(abs);
		if (loc) {
			const filename = basename(abs);
			mediaUrl = `/api/media/${encodeURIComponent(loc.bucket)}/${loc.kind}/${encodeURIComponent(filename)}`;
		}
	}

	return json({ job, mediaUrl });
};
