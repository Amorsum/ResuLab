import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), removeCrossorigin()],
  base: '/',
  server: {
    port: 3000,
    open: true,
  },
});
