import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Apenas loopback. Expor o servidor de desenvolvimento na rede permitiria
    // que outra pagina do navegador enviasse requisições a ele (GHSA-67mh-4wv8-2f99).
    host: 'localhost',
  },
});
