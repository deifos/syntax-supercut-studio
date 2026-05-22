import { spawn } from 'node:child_process';

export type LogFn = (line: string) => void;

/**
 * Thrown when a running ffmpeg (or pipeline) is cancelled via its AbortSignal.
 * The job handler recognizes this to mark the job as cancelled rather than
 * errored.
 */
export class CancelledError extends Error {
	constructor() {
		super('Cancelled');
		this.name = 'CancelledError';
	}
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new CancelledError();
}

/**
 * Run ffmpeg and return once it exits. stdout/stderr lines are forwarded to
 * `onLog` so job observers can stream them into the UI. Non-zero exit codes
 * reject with the collected stderr. If an AbortSignal is passed and fires,
 * the child is killed and the promise rejects with a CancelledError.
 */
export function runFfmpeg(
	args: string[],
	onLog: LogFn = () => {},
	signal?: AbortSignal,
): Promise<void> {
	if (signal?.aborted) return Promise.reject(new CancelledError());

	return new Promise((resolvePromise, rejectPromise) => {
		const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
		let stderr = '';
		let cancelled = false;

		function forward(chunk: Buffer) {
			const text = chunk.toString('utf8');
			for (const line of text.split(/\r?\n/)) {
				if (line.length > 0) onLog(line);
			}
		}

		const onAbort = () => {
			cancelled = true;
			// SIGTERM gives ffmpeg a chance to close output cleanly; it usually
			// exits in <100ms. SIGKILL as a follow-up in case it ignores it.
			try {
				p.kill('SIGTERM');
			} catch {
				// child may already be gone
			}
			setTimeout(() => {
				try {
					p.kill('SIGKILL');
				} catch {
					// ignore
				}
			}, 500).unref();
		};
		signal?.addEventListener('abort', onAbort, { once: true });

		p.stdout?.on('data', forward);
		p.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
			forward(chunk);
		});
		p.on('error', (err) => {
			signal?.removeEventListener('abort', onAbort);
			rejectPromise(err);
		});
		p.on('close', (code) => {
			signal?.removeEventListener('abort', onAbort);
			if (cancelled) {
				rejectPromise(new CancelledError());
				return;
			}
			if (code === 0) resolvePromise();
			else rejectPromise(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-500)}`));
		});
	});
}

/**
 * ffmpeg's `atempo` filter only accepts 0.5–2.0 per stage. Chain stages to
 * reach any target speed ratio.
 */
export function atempoChain(speed: number): string {
	const stages: number[] = [];
	let remaining = speed;
	while (remaining > 2.0) {
		stages.push(2.0);
		remaining /= 2.0;
	}
	while (remaining < 0.5) {
		stages.push(0.5);
		remaining /= 0.5;
	}
	stages.push(remaining);
	return stages.map((s) => `atempo=${s.toFixed(4)}`).join(',');
}
