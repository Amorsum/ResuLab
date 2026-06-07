import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ResumeProvider } from './context/ResumeContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ResumeProvider>
          <App />
        </ResumeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// 注册 PWA Service Worker（Tauri 环境跳过，避免拦截自定义协议）
const isTauri = '__TAURI_INTERNALS__' in window;
if ('serviceWorker' in navigator && import.meta.env.PROD && !isTauri) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Service Worker 注册失败不影响应用正常运行
  });
}
