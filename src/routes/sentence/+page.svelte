<script lang="ts">
	import JobPanel from '$lib/JobPanel.svelte';
	import BucketPicker from '$lib/BucketPicker.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let sentence = $state('');
	let useSeed = $state(false);
	let seed = $state(42);
	let debug = $state(false);
	let submitting = $state(false);
	let buckets: string[] = $state([]);

	const jobId = $derived($page.url.searchParams.get('job'));

	async function submit(e: Event) {
		e.preventDefault();
		submitting = true;
		try {
			const body: Record<string, unknown> = {
				kind: 'sentence',
				sentence: sentence.trim(),
				buckets,
				debug,
			};
			if (useSeed) body.seed = seed;
			const res = await fetch('/api/jobs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const { message } = await res.json().catch(() => ({ message: 'error' }));
				alert(`Failed: ${message}`);
				return;
			}
			const { id } = await res.json();
			goto(`/sentence?job=${id}`, { keepFocus: true });
		} finally {
			submitting = false;
		}
	}
</script>

<section class="hero">
	<h1>
		<mark>Sentence</mark> mashup.
	</h1>
	<p class="muted">
		Pick one clip for each word and stitch them into a sentence they never said.
	</p>
</section>

<section class="split">
	<form onsubmit={submit} class="stack">
		<h3>Parameters</h3>

		<BucketPicker bind:selected={buckets} />

		<div class="field">
			<label for="sentence">Sentence</label>
			<textarea
				id="sentence"
				rows="3"
				placeholder="e.g. i love to code in the cloud"
				bind:value={sentence}
				required
			></textarea>
			<div class="help">
				Each word is matched independently. Common morphology variants (plurals,
				-ing, -ed, possessive) fall back automatically.
			</div>
		</div>

		<div class="field">
			<label class="field-check">
				<input type="checkbox" bind:checked={useSeed} />
				Use fixed seed (reproducible)
			</label>
			{#if useSeed}
				<input type="number" bind:value={seed} style="max-width: 10rem;" />
			{/if}
		</div>

		<label class="field-check">
			<input type="checkbox" bind:checked={debug} />
			Debug overlay (burn each word onto its clip)
		</label>

		<div>
			<button type="submit" class="btn-primary" disabled={submitting}>
				{submitting ? 'Starting…' : 'Build sentence'}
			</button>
		</div>
	</form>

	<div>
		<JobPanel {jobId} />
	</div>
</section>
