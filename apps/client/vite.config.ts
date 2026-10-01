import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the build works from any sub-path (GitHub Pages: /hexarchy/).
  base: './',
  plugins: [react()],
});
