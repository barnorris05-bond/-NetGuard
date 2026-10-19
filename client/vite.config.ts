import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Use IPv4 explicitly: on Windows `localhost` may resolve to ::1 while
        // the Express server binds 127.0.0.1.
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
