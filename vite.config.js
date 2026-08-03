import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ISOLATED BARCODE-TEST config.
// - Vite on :3003, backend on :4001 (kept off the main dev ports 3002/4000).
// - `host: true` binds 0.0.0.0 so a LAN phone can reach it too (fallback path).
// - `allowedHosts` lets the Cloudflare quick-tunnel domain (*.trycloudflare.com)
//   through Vite 5's host check — otherwise the phone gets a blank "host not
//   allowed" page. The leading dot whitelists every subdomain.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    host: true,
    open: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4001',
        changeOrigin: true
      }
    }
  }
})
