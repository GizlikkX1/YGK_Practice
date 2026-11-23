import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API реализован на Python (FastAPI) в папке app/. Vite проксирует к нему запросы.
const apiTarget = process.env.API_URL || 'http://127.0.0.1:8000';
const proxy = {
  '/api': apiTarget,
  '/categories': apiTarget,
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy,
  },
  preview: {
    proxy,
  },
});
