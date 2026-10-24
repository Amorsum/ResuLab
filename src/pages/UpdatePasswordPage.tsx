import StudioBrand from '../components/layout/StudioBrand';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function UpdatePasswordPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if user came from reset password email (auth hash in URL)
  useEffect(() => {
    supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setChecking(false);
      } else {
        // No valid recovery session, redirect after a brief check
        const timer = setTimeout(() => {
          setChecking(false);
        }, 1500);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('密码至少需要 6 位字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (err) {
      setError(err.message || '重置失败，请重新发送重置邮件');
      return;
    }
    setSuccess(true);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="studio-utility-page min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <StudioBrand />
          <p className="mt-2 text-gray-500">设置新密码</p>
        </div>

        {success ? (
          <div className="section-card text-center">
            <div className="text-5xl mb-4">🔐</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">密码已重置</h2>
            <p className="text-gray-500 mb-6">你的新密码已生效，现在可以使用新密码登录了</p>
            <Link to="/login" className="btn-primary">去登录</Link>
          </div>
        ) : (
          <div className="section-card">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="至少 6 位字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="再次输入新密码"
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
                {submitting ? '重置中...' : '重置密码'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500">
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                ← 返回登录
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
