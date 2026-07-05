import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    open: true,
    proxy: {
      '/api': {
        // Backend default port is 4000 (macOS AirPlay Receiver occupies :5000).
        // Override with VITE_PROXY_TARGET for isolated/test backends
        // (e.g. scripts/test-isolated-platform.sh runs the API on :4100).
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
