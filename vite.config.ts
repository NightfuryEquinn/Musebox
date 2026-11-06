import { defineConfig } from 'vite';
export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], encoding: ['mediabunny'], react: ['react', 'react-dom'] } } } },
});
