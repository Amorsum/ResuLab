import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { checkLocalData, importLocalResume } from '../hooks/useCloudResumes';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signUp } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/builder';
  const showImportPrompt = searchParams.get('import') === '1';

  // 已登录则重定向
  useEffect(() => {
    if (!authLoading && user) {
      handlePostLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const handlePostLogin = async () => {
    // 检测是否有本地数据需要导入
    if (showImportPrompt || checkLocalData()) {
      // 直接导入并跳转
      const success = await importLocalResume();
      if (success) {
        navigate('/my-resumes', { replace: true });
      } else {
        navigate(redirectTo, { replace: true });
      }
    } else {
      navigate(redirectTo, { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }

    if (password.length < 6) {
      setError('密码至少需要 6 位字符');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password);
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }

    // 需要邮箱验证 → 显示提示，不跳转
    if (needsEmailConfirmation) {
      setNeedsConfirmation(true);
      return;
    }
    // 如果不需要邮箱验证（Supabase 已关闭确认），useEffect 会自动处理跳转
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
          <p className="mt-2 text-gray-500">创建你的账号，云端保存简历</p>
        </div>

        {/* 注册成功 — 邮箱验证提示 */}
        {needsConfirmation && (
          <div className="section-card text-center">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">验证你的邮箱</h2>
            <p className="text-gray-500 mb-2">
              我们已向 <span className="font-medium text-gray-700">{email}</span> 发送了一封验证邮件
            </p>
            <p className="text-sm text-gray-400 mb-6">
              请点击邮件中的链接完成注册（如未收到请检查垃圾邮件箱）
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => { setNeedsConfirmation(false); setError(''); }}
                className="btn-secondary"
              >
                ← 返回
              </button>
              <Link to="/login" className="btn-primary">
                去登录
              </Link>
            </div>
          </div>
        )}

        {/* 表单卡片 */}
        {!needsConfirmation && (
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
                placeholder="至少 6 位字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
              <input
                type="password"
                className="input-base"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={submitting}
            >
              {submitting ? '注册中...' : '注册'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            已有账号？{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              去登录
            </Link>
          </div>
        </div>
        )}

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
