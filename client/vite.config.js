import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on port 3000; Vite forwards /api there,
// so the browser sees one site, the same as on Netlify.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
