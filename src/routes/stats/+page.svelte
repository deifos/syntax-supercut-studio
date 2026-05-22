<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function hours(sec: number) {
		return (sec / 3600).toFixed(1);
	}
</script>

<section class="hero">
	<h1>
		<mark>Stats</mark>.
	</h1>
	<p class="muted">
		{data.totalFiles} transcripts, {data.totalWords.toLocaleString()} words,
		{hours(data.totalDurationSec)} hours.
	</p>
</section>

<section class="split">
	<div class="stack">
		<h3>Top words</h3>
		<ol class="stack-tight" style="padding: 0; list-style: none; font-variant-numeric: tabular-nums;">
			{#each data.top1 as item, i (item.phrase)}
				<li class="row" style="gap: 1rem; border-block-end: 1px solid var(--ink); padding-block: 0.5rem;">
					<span class="caps muted" style="min-inline-size: 2.5rem;">{i + 1}</span>
					<span style="flex: 1; font-weight: 600;">{item.phrase}</span>
					<span>{item.count.toLocaleString()}</span>
				</li>
			{/each}
		</ol>
	</div>

	<div class="stack">
		<h3>Top 2-grams</h3>
		<ol class="stack-tight" style="padding: 0; list-style: none; font-variant-numeric: tabular-nums;">
			{#each data.top2 as item, i (item.phrase)}
				<li class="row" style="gap: 1rem; border-block-end: 1px solid var(--ink); padding-block: 0.5rem;">
					<span class="caps muted" style="min-inline-size: 2.5rem;">{i + 1}</span>
					<span style="flex: 1; font-weight: 600;">{item.phrase}</span>
					<span>{item.count.toLocaleString()}</span>
				</li>
			{/each}
		</ol>
	</div>
</section>

<section class="split">
	<div class="stack">
		<h3>Top 3-grams</h3>
		<ol class="stack-tight" style="padding: 0; list-style: none; font-variant-numeric: tabular-nums;">
			{#each data.top3 as item, i (item.phrase)}
				<li class="row" style="gap: 1rem; border-block-end: 1px solid var(--ink); padding-block: 0.5rem;">
					<span class="caps muted" style="min-inline-size: 2.5rem;">{i + 1}</span>
					<span style="flex: 1; font-weight: 600;">{item.phrase}</span>
					<span>{item.count.toLocaleString()}</span>
				</li>
			{/each}
		</ol>
	</div>

	<div class="stack">
		<h3>Top 4-grams</h3>
		<ol class="stack-tight" style="padding: 0; list-style: none; font-variant-numeric: tabular-nums;">
			{#each data.top4 as item, i (item.phrase)}
				<li class="row" style="gap: 1rem; border-block-end: 1px solid var(--ink); padding-block: 0.5rem;">
					<span class="caps muted" style="min-inline-size: 2.5rem;">{i + 1}</span>
					<span style="flex: 1; font-weight: 600;">{item.phrase}</span>
					<span>{item.count.toLocaleString()}</span>
				</li>
			{/each}
		</ol>
	</div>
</section>
