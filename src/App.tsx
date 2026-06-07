import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import BuilderPage from './pages/BuilderPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MyResumesPage from './pages/MyResumesPage';
import ProtectedRoute from './components/auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/builder/:templateId" element={<BuilderPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/my-resumes"
        element={
          <ProtectedRoute>
            <MyResumesPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
