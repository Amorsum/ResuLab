import { useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import AppHeader from './components/layout/AppHeader';
import HomePage from './pages/HomePage';
import BuilderPage from './pages/BuilderPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import MyResumesPage from './pages/MyResumesPage';
import AccountPage from './pages/AccountPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import CareerLibraryPage from './pages/CareerLibraryPage';
import JobsPage from './pages/JobsPage';
import ExtensionPage from './pages/ExtensionPage';

export default function App() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    // Local versions may appear after the IndexedDB read finishes.
    const reveal = () => { const element = document.getElementById(hash.slice(1)); element?.scrollIntoView({ block: 'start' }); return Boolean(element); };
    if (reveal()) return;
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    observer.observe(document.body, { subtree: true, childList: true });
    const timeout = setTimeout(() => observer.disconnect(), 5000);
    return () => { observer.disconnect(); clearTimeout(timeout); };
  }, [pathname, hash]);
  const authPage = ['/login', '/register', '/reset-password', '/update-password'].includes(pathname);
  return (
    <>
    {authPage && <AppHeader />}
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/builder/:templateId" element={<BuilderPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />
      <Route path="/library" element={<CareerLibraryPage />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/extension" element={<ExtensionPage />} />
      <Route
        path="/my-resumes"
        element={
          <ProtectedRoute>
            <MyResumesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<><AppHeader /><main className="missing-page"><h1>这个页面不存在</h1><p>你可以回到首页查看全部功能，或继续编辑当前简历。</p><Link to="/" className="studio-cta">返回首页</Link></main></>} />
    </Routes>
    </>
  );
}
