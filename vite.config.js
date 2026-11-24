import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Versão = data e hora da publicação (horário de Brasília). Vai no app e em versao.json, que não fica guardado
// no aparelho: assim o app descobre quando está rodando uma versão velha e se atualiza.
const VERSAO = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  base: './',
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  plugins: [
    react(),
    {
      name: 'mukirana-versao',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ versao: VERSAO }) })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,woff2}'], // inclui o leitor de PDF (funciona offline)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mukirana',
        short_name: 'Mukirana',
        description: 'Controle financeiro pessoal: cada tostão conta.',
        lang: 'pt-BR',
        theme_color: '#1d0640',
        background_color: '#14002b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
