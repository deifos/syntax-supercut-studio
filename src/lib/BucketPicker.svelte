<script lang="ts">
	import { onMount } from 'svelte';

	interface BucketSummary {
		name: string;
		videoCount: number;
		transcriptCount: number;
		supercutCount: number;
	}

	let {
		selected = $bindable<string[]>([]),
		label = 'Buckets',
		help = 'Pick one or more buckets to pull clips from. None selected = all.',
	}: {
		selected?: string[];
		label?: string;
		help?: string;
	} = $props();

	let buckets: BucketSummary[] = $state([]);
	let loading = $state(true);
	let err: string | null = $state(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/buckets');
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			buckets = data.buckets;
			// Default to all buckets selected (== [], but that's confusing visually).
			// Start with just the first one selected if the caller gave us an empty list.
			if (selected.length === 0 && buckets.length > 0) {
				selected = [buckets[0].name];
			}
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	});

	function toggle(name: string) {
		if (selected.includes(name)) {
			selected = selected.filter((n) => n !== name);
		} else {
			selected = [...selected, name];
		}
	}

	function selectAll() {
		selected = buckets.map((b) => b.name);
	}

	function selectNone() {
		selected = [];
	}
</script>

<div class="field">
	<div class="row" style="justify-content: space-between; align-items: baseline;">
		<!-- svelte-ignore a11y_label_has_associated_control -->
		<label>{label}</label>
		{#if buckets.length > 1}
			<div class="row" style="gap: 0.5rem;">
				<button type="button" class="btn-small btn-ghost" onclick={selectAll}>All</button>
				<button type="button" class="btn-small btn-ghost" onclick={selectNone}>None</button>
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="help">Loading buckets…</div>
	{:else if err}
		<div class="help" style="color: red;">Error: {err}</div>
	{:else if buckets.length === 0}
		<div class="help">
			No buckets found. Make a folder under <code>videos/</code> with a <code>videos/</code>
			subfolder inside it.
		</div>
	{:else}
		<div class="row" style="gap: 0.5rem; flex-wrap: wrap;">
			{#each buckets as b (b.name)}
				<button
					type="button"
					class="btn-small"
					class:btn-primary={selected.includes(b.name)}
					class:btn-ghost={!selected.includes(b.name)}
					onclick={() => toggle(b.name)}
				>
					{b.name}
					<span style="opacity: 0.6; margin-inline-start: 0.4em; font-weight: 400;">
						{b.transcriptCount}/{b.videoCount}
					</span>
				</button>
			{/each}
		</div>
		{#if help}
			<div class="help" style="margin-block-start: 0.5rem;">{help}</div>
		{/if}
	{/if}
</div>
