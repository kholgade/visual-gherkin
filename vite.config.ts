import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serverPort = parseInt(env.PORT || '17771', 10)
  const uiPort = parseInt(env.UI_PORT || '18881', 10)

  return {
    plugins: [react()],
    root: 'src/client',
    build: {
      outDir: '../../dist/client',
      emptyOutDir: true,
      minify: 'terser',
      sourcemap: false,
    },
    server: {
      port: uiPort,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@client': path.resolve(__dirname, 'src/client'),
      },
    },
  }
})
