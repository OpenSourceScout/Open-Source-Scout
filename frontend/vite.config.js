import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Default 8003: port 8001 is often left in a bad state on Windows (ghost listeners → bogus API errors).
const apiProxyTarget =
  process.env.OSS_API_PROXY_TARGET || 'http://localhost:8003'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['./vitest.setup.js'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
        timeout: 600000, // 10 minutes for long-running analysis operations
      },
    },
  },
})
