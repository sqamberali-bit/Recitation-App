import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2021',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, lazily-used libraries into their own chunks so the core
        // app shell stays small and loads instantly on mobile.
        manualChunks: {
          ocr: ['tesseract.js'],
          search: ['minisearch'],
          db: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.ico', 'fonts/*.woff2'],
      manifest: {
        id: '/',
        name: 'Recitation — Poetry & Noha Library',
        short_name: 'Recitation',
        description:
          'Offline-first library for Urdu & English poems and nohas — fast search, reading mode, and camera uploads for Majalis and events.',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // Manifest strings themselves are English; poem content direction is
        // handled per-record at runtime.
        lang: 'en',
        dir: 'ltr',
        categories: ['books', 'education', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Search', url: '/?focus=search' },
          { name: 'Add poem', url: '/editor/new' },
          { name: 'Favourites', url: '/favourites' },
        ],
      },
      workbox: {
        // Precache the app shell. Fonts / wasm can be large, so raise the cap.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Tesseract.js core + language data are fetched from a CDN on first
            // OCR run; cache them so subsequent OCR works fully offline.
            urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
