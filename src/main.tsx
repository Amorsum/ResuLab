import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ResumeProvider } from './context/ResumeContext';
import App from './App';
import './index.css';

const isTauri = '__TAURI_INTERNALS__' in window;

// Tauri WebView 不支持 HTML5 History API（自定义协议），必须使用 HashRouter
// Web 部署继续使用 BrowserRouter
const Router = isTauri ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <ResumeProvider>
          <App />
        </ResumeProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>
);

// 注册 PWA Service Worker（Tauri 环境跳过，避免拦截自定义协议）
if ('serviceWorker' in navigator && import.meta.env.PROD && !isTauri) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Service Worker 注册失败不影响应用正常运行
  });
}
