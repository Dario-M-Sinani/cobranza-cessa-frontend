import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
// Para desarrollar contra un backend remoto (ej. el de test en la .88) sin CORS:
// en .env.development.local poner VITE_API_BASE_URL=/api y DEV_PROXY_TARGET=https://10.1.1.88
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const destino = env.DEV_PROXY_TARGET

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: destino
        ? { '/api': { target: destino, changeOrigin: true, secure: false } }
        : undefined,
    },
  }
})
