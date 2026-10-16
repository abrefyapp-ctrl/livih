import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Empacota o componente do orçamento para Node (serviço livih-pdf). React e @react-pdf ficam de fora do pacote e
// são instalados no contêiner (pdf-servico/package.json), nas mesmas versões do app.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    ssr: 'pdf-servico/entrada.ts',
    outDir: 'pdf-servico/dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { external: ['react', 'react/jsx-runtime', '@react-pdf/renderer'], output: { format: 'es' } },
  },
})
