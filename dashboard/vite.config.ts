import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
    // esbuild (Vite's default minifier) can split large const objects
    // and lose keys in the process – a known issue with the TRANSLATIONS object.
    // Terser is more conservative and is guaranteed to keep all object properties.
    minify: 'terser',
    terserOptions: {
      compress: {
        dead_code: false,
        pure_getters: false,
      },
    },
    rollupOptions: {
      output: {
        // Heavy dependencies in their own vendor chunks – smaller initial bundle,
        // better caching (they rarely change).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
