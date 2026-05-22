import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PageServerLoad } from './$types';
import { listBuckets } from '$lib/server/paths';
import { normalize, type Transcript } from '$lib/server/text';

const STOPWORDS = new Set([
	'the',
	'a',
	'an',
	'and',
	'or',
	'but',
	'of',
	'to',
	'in',
	'on',
	'at',
	'for',
	'with',
	'by',
	'from',
	'as',
	'is',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'do',
	'does',
	'did',
	'will',
	'would',
	'could',
	'should',
	'may',
	'might',
	'can',
	'this',
	'that',
	'these',
	'those',
	'i',
	'you',
	'he',
	'she',
	'it',
	'we',
	'they',
	'me',
	'him',
	'her',
	'us',
	'them',
	'my',
	'your',
	'his',
	'its',
	'our',
	'their',
	'so',
	'if',
	'then',
	'than',
	'not',
	'no',
	'yes',
]);

function isContentful(tokens: string[]): boolean {
	return tokens.some((t) => !STOPWORDS.has(t));
}

export const load: PageServerLoad = async () => {
	const buckets = await listBuckets();

	const counts: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map()];
	let totalFiles = 0;
	let totalWords = 0;
	let totalDurationSec = 0;

	for (const bucket of buckets) {
		let files: string[] = [];
		try {
			files = (await readdir(bucket.transcriptsDir)).filter((f) => f.endsWith('.json'));
		} catch {
			continue;
		}

		for (const f of files) {
			let data: Transcript;
			try {
				data = JSON.parse(await readFile(join(bucket.transcriptsDir, f), 'utf8'));
			} catch {
				continue;
			}
			if (!data.words) continue;
			totalFiles++;
			const tokens = data.words.map((w) => normalize(w.text)).filter(Boolean);
			totalWords += tokens.length;
			totalDurationSec += data.duration ?? 0;

			for (let n = 1; n <= 4; n++) {
				const bucketMap = counts[n];
				for (let i = 0; i <= tokens.length - n; i++) {
					const slice = tokens.slice(i, i + n);
					if (n > 1 && !isContentful(slice)) continue;
					const key = slice.join(' ');
					bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
				}
			}
		}
	}

	function top(bucket: Map<string, number>, threshold: number, take = 30) {
		return [...bucket.entries()]
			.filter(([k, c]) => c >= threshold && k.length > 0)
			.sort((a, b) => b[1] - a[1])
			.slice(0, take)
			.map(([phrase, count]) => ({ phrase, count }));
	}

	return {
		totalFiles,
		totalWords,
		totalDurationSec,
		top1: top(counts[1], 50, 50),
		top2: top(counts[2], 20, 40),
		top3: top(counts[3], 10, 30),
		top4: top(counts[4], 5, 20),
	};
};
