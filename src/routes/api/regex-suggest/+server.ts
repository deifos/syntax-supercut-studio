import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MODEL = 'grok-4.20-0309-reasoning';
const ENDPOINT = 'https://api.x.ai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a regex generator for a podcast supercut tool.

The user will describe in plain English what kinds of phrases they want to find across a transcript corpus. You will return a single JavaScript-flavored regex pattern that matches every variation.

Context about how the regex is used:
- It runs against the raw joined transcript text — punctuation and capitalization are preserved.
- The 'g' and 'i' flags are applied automatically, so do not include flags.
- Do NOT wrap the pattern in slashes. Do NOT add ^ or $ anchors — the pattern will match anywhere in the text.

Rules for preventing false positives (MANDATORY):
- Every alternation group that contains whole words MUST be anchored by \\b on whichever sides face text. Wrap the group like \\b(?:word1|word2|word3)\\b. Without both boundaries, short words like "ass", "is", "in", "a" will match inside longer words (e.g. "ass" matches "associated", "is" matches "this"). This is the #1 bug to avoid — ALWAYS bracket word lists with \\b on both sides unless the pattern is explicitly matching inside another word.
- In particular, if the pattern ends with an alternation of words (e.g. |dumb|stupid|ass), the closing paren MUST be followed by \\b.
- Optional adjective/article groups like (?:a|an|the)? can also cause trouble when followed by more letters — prefer (?:\\b(?:a|an|the)\\b\\s+)? so "a" can't eat the leading letter of the next word.
- When matching contractions or apostrophes, write them explicitly: \\b(?:don't|do not)\\b. Remember apostrophes are NOT word characters, so \\b works correctly around contractions.

Other guidance:
- Prefer alternation groups over many separate patterns.
- Account for natural speech variations: contractions ("don't"/"do not"), filler words between phrases ("i don't even know" -> i (?:don't|do not)(?:\\s+\\w+){0,2}?\\s+know), tense ("got sick", "am sick", "was sick"), and common synonyms.
- Cast a reasonably wide net — the user can scrub through results to narrow down.

Return ONLY a JSON object of the exact shape:
{
  "regex": "the pattern string here",
  "explanation": "one short sentence describing what it matches"
}
No markdown fences. No extra commentary outside the JSON.`;

interface SuggestBody {
	prompt?: string;
}

interface SuggestResponse {
	regex: string;
	explanation: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) throw error(500, 'XAI_API_KEY environment variable is not set');

	const body = (await request.json().catch(() => null)) as SuggestBody | null;
	if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
		throw error(400, 'prompt required');
	}

	const upstream = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: body.prompt },
			],
			response_format: { type: 'json_object' },
			temperature: 0.2,
		}),
	});

	if (!upstream.ok) {
		const errText = await upstream.text();
		throw error(upstream.status, `xAI error: ${errText.slice(0, 500)}`);
	}

	const data = (await upstream.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = data.choices?.[0]?.message?.content?.trim();
	if (!content) throw error(500, 'Empty completion from xAI');

	let parsed: SuggestResponse;
	try {
		parsed = JSON.parse(content);
	} catch {
		// Some models wrap JSON in markdown fences despite instructions — try to recover.
		const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
		try {
			parsed = JSON.parse(stripped);
		} catch {
			throw error(500, `Could not parse model response as JSON: ${content.slice(0, 200)}`);
		}
	}

	if (!parsed.regex || typeof parsed.regex !== 'string') {
		throw error(500, 'Model response missing "regex" field');
	}

	// Validate the regex actually compiles. We don't throw on user-approval
	// regexes elsewhere either, but failing here gives the user a chance to
	// regenerate before wasting a job slot.
	try {
		new RegExp(parsed.regex, 'gi');
	} catch (err) {
		throw error(500, `Model returned an invalid regex: ${(err as Error).message}`);
	}

	return json({
		regex: parsed.regex,
		explanation: parsed.explanation ?? '',
	});
};
