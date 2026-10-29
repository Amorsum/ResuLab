import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// PDF text extraction needs local character maps for Chinese/non-embedded fonts.
function pdfTextAssets() {
  return { name: 'pdf-text-assets', configResolved() {
    for (const folder of ['cmaps', 'standard_fonts']) {
      const destination = resolve(__dirname, 'public/pdfjs-assets', folder);
      mkdirSync(destination, { recursive: true });
      cpSync(resolve(__dirname, 'node_modules/pdfjs-dist', folder), destination, { recursive: true });
    }
  } };
}

// 剥离 module script 的 crossorigin 属性，修复 Tauri WebView2 白屏
// Tauri 自定义协议不返回 CORS 头，crossorigin 会导致脚本加载失败
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    enforce: 'pre' as const,
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin/g, '');
    },
  };
}

export default defineConfig({
  // Keep source/config resolution stable for local entrypoints launched from server/.
  root: __dirname,
  // Avoid treating generated Tauri/Android HTML and test fixtures as application entrypoints.
  optimizeDeps: { entries: ['index.html'] },
  plugins: [react(), removeCrossorigin(), pdfTextAssets()],
  base: '/',
  server: {
    port: 3000,
    open: true,
  },
});
