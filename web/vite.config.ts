import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Rutas relativas: la web se sirve bajo /<repositorio>/ en GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Sin esto Vite sube a buscar el postcss.config.js de la raíz del repositorio.
  css: { postcss: { plugins: [] } },
  server: { fs: { allow: ['..'] } },
  build: { chunkSizeWarningLimit: 900 },
});
