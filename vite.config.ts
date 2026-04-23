import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const gtmProxy = {
  target: 'https://www.googletagmanager.com',
  changeOrigin: true,
  secure: true,
  rewrite: (p: string) => p.replace(/^\/api\/gtm/, '/gtm.js'),
} as const

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api/gtm': gtmProxy } },
  preview: { proxy: { '/api/gtm': gtmProxy } },
})
