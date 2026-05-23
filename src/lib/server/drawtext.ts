/**
 * Font used for the debug overlay that burns the matched text onto the frame.
 * macOS ships Arial Black at this path; set DRAWTEXT_FONT to override.
 */
const DEFAULT_FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf';
const FONT = process.env.DRAWTEXT_FONT ?? DEFAULT_FONT;

/**
 * Build an ffmpeg `drawtext=...` filter snippet that burns `text` into the
 * frame. Shared across the supercut and sentence pipelines so they all look
 * identical when debug mode is on.
 *
 * `fontSize` defaults to 120 for full-frame renders; tile renders pass a
 * smaller size sized to the tile cell.
 */
export function drawTextFilter(text: string, fontSize = 120): string {
	// ffmpeg quoting rules (av_get_token): inside '…' everything is literal
	// with NO escape processing — a ' simply closes the quote. To embed a
	// literal quote: close the current quote, emit \' (which is an escaped
	// quote outside of quotes), then reopen: 'foo'\''bar' → foo'bar.
	// Colons, backslashes and % still need escaping at the option-value level.
	const esc = text
		.replace(/\\/g, '\\\\')
		.replace(/:/g, '\\:')
		.replace(/'/g, "'\\''")
		.replace(/%/g, '\\%');
	const parts = [
		`fontfile=${FONT}`,
		`text='${esc}'`,
		`fontsize=${fontSize}`,
		'fontcolor=white',
		`borderw=${Math.max(2, Math.round(fontSize / 20))}`,
		'bordercolor=black',
		'box=1',
		'boxcolor=black@0.55',
		`boxborderw=${Math.max(6, Math.round(fontSize / 6))}`,
		'x=(w-text_w)/2',
		`y=h-text_h-${Math.max(20, Math.round(fontSize / 1.5))}`,
	];
	return `drawtext=${parts.join(':')}`;
}
