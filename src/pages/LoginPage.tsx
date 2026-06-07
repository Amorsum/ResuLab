import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { checkLocalData } from '../hooks/useCloudResumes';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/builder';

  // 已登录则重定向
  useEffect(() => {
    if (!authLoading && user) {
      navigate(redirectTo, { replace: true });
    }
  }, [authLoading, user, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }

    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }

    // 检查是否有本地数据需要导入
    const localData = checkLocalData();
    if (localData) {
      navigate(`/register?import=1&redirect=${encodeURIComponent(redirectTo)}`, { replace: true });
    } else {
      navigate(redirectTo, { replace: true });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-primary-700">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            ResuLab
          </Link>
          <p className="mt-2 text-gray-500">登录你的账号</p>
        </div>

        {/* 表单卡片 */}
        <div className="section-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
              <input
                type="email"
                className="input-base"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                className="input-base"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={submitting}
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            没有账号？{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              去注册
            </Link>
          </div>
        </div>

        {/* 返回首页 */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-500">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
