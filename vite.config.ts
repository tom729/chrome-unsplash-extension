import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      writeBundle() {
        writeFileSync('dist/manifest.json', JSON.stringify({
          manifest_version: 3,
          name: "Unsplash Wallpaper Changer",
          version: "1.0",
          description: "Periodically changes the new tab wallpaper using images from Unsplash",
          permissions: ["storage", "alarms"],
          background: {
            service_worker: "background.js"
          },
          chrome_url_overrides: {
            newtab: "index.html"
          }
        }, null, 2));
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'background' ? 'background.js' : '[name].[hash].js';
        },
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});