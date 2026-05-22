<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	const links = [
		{ href: '/', label: 'Library' },
		{ href: '/clips', label: 'Clips' },
		{ href: '/supercut', label: 'Supercut' },
		{ href: '/sentence', label: 'Sentence' },
		{ href: '/songify', label: 'Songify' },
		{ href: '/transcribe', label: 'Transcribe' },
		{ href: '/stats', label: 'Stats' },
	];

	let { children } = $props();
</script>

<header class="topbar">
	<a href="/" class="wordmark">
		Super<mark>cut</mark> Studio
	</a>
	<nav class="nav">
		{#each links as link}
			<a
				href={link.href}
				aria-current={$page.url.pathname === link.href ? 'page' : undefined}
			>
				{link.label}
			</a>
		{/each}
	</nav>
</header>

<main class="shell">
	{@render children()}
</main>
