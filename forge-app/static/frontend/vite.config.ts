import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge ships whatever is in `build/`; the manifest's resource.path points
// here. Relative asset paths keep the bundle portable inside the Forge iframe.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
