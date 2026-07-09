import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }

    setSubmitting(true);
    const { error: err } = await resetPassword(email.trim());
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  };

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
          <p className="mt-2 text-gray-500">重置你的密码</p>
        </div>

        {/* 发送成功提示 */}
        {sent && (
          <div className="section-card text-center">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">查收重置邮件</h2>
            <p className="text-gray-500 mb-2">
              如果 <span className="font-medium text-gray-700">{email}</span> 已注册，我们将发送一封密码重置邮件
            </p>
            <p className="text-sm text-gray-400 mb-6">
              请点击邮件中的链接设置新密码。如未收到，请检查垃圾邮件箱
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => { setSent(false); setError(''); }}
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
        {!sent && (
        <div className="section-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">注册邮箱</label>
              <input
                type="email"
                className="input-base"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-400">
                输入你注册时使用的邮箱，我们将发送重置链接
              </p>
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={submitting}
            >
              {submitting ? '发送中...' : '发送重置邮件'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            想起密码了？{' '}
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
