import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Derive proxy target from VITE_API_URL (strip trailing /api if present)
  const apiUrl = env.VITE_API_URL || 'http://localhost:8088/api'
  const proxyTarget = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            ui: ['lucide-react', 'zustand'],
          },
        },
      },
    },
    esbuild: {
      // Skip type checking during build
      logOverride: { 'this-is-undefined-in-esm': 'silent' },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
