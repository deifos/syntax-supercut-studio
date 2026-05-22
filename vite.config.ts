import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5180,
		fs: {
			// Allow serving files from the sibling repo (videos/, supercuts/).
			// The /api/media endpoint does the real access control — this just
			// lets Vite's dev server import from outside the project root if we
			// ever need to.
			allow: ['..'],
		},
	},
});
