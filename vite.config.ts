import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { validateApiBaseUrl } from './config/env.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = validateApiBaseUrl(env.VITE_API_BASE_URL)
  const proxy = {
    '^/api(?:/|$)': {
      target: new URL(apiBaseUrl).origin,
      changeOrigin: true,
    },
  }

  return {
    plugins: [vue(), vueDevTools(), tailwindcss()],
    optimizeDeps: { include: ['axios'] },
    server: { proxy },
    preview: { proxy },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
