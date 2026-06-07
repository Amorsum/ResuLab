import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, updateEmail, updatePassword, deleteAccount, signOut } = useAuth();

  // ---- 换绑邮箱 ----
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  // ---- 修改密码 ----
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // ---- 注销账号 ----
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteMsg, setDeleteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ==================== 换绑邮箱 ====================
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);

    if (!newEmail.trim()) {
      setEmailMsg({ type: 'error', text: '请输入新邮箱' });
      return;
    }

    setEmailSubmitting(true);
    const { error } = await updateEmail(newEmail.trim());
    setEmailSubmitting(false);

    if (error) {
      setEmailMsg({ type: 'error', text: error });
    } else {
      setEmailMsg({ type: 'success', text: '验证邮件已发送到新邮箱，请查收确认' });
      setNewEmail('');
    }
  };

  // ==================== 修改密码 ====================
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: '新密码至少需要 6 位字符' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ type: 'error', text: '两次输入的密码不一致' });
      return;
    }

    setPasswordSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setPasswordSubmitting(false);

    if (error) {
      setPasswordMsg({ type: 'error', text: error });
    } else {
      setPasswordMsg({ type: 'success', text: '密码修改成功' });
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  // ==================== 注销账号 ====================
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== '确认注销') {
      setDeleteMsg({ type: 'error', text: '请输入"确认注销"以继续' });
      return;
    }

    setDeleteSubmitting(true);
    const { error } = await deleteAccount();
    setDeleteSubmitting(false);

    if (error) {
      setDeleteMsg({ type: 'error', text: error });
    } else {
      await signOut();
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* 导航栏 */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary-700">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            ResuLab
          </Link>
          <Link to="/my-resumes" className="text-sm text-gray-500 hover:text-gray-700">
            我的简历
          </Link>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">账号设置</h1>

        <div className="space-y-8">
          {/* ========== 当前账号信息 ========== */}
          <div className="section-card">
            <h2 className="font-semibold text-gray-900 mb-3">账号信息</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">
                {(user?.email?.charAt(0) || 'U').toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user?.email?.split('@')[0] || '用户'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* ========== 换绑邮箱 ========== */}
          <div className="section-card">
            <h2 className="font-semibold text-gray-900 mb-4">换绑邮箱</h2>
            <form onSubmit={handleUpdateEmail} className="space-y-3">
              {emailMsg && (
                <div className={`p-3 rounded-lg text-sm ${
                  emailMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
                }`}>
                  {emailMsg.text}
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">当前邮箱</label>
                <input type="email" className="input-base bg-gray-50" value={user?.email || ''} disabled />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">新邮箱</label>
                <input
                  type="email"
                  className="input-base"
                  placeholder="输入新邮箱地址"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={emailSubmitting}>
                {emailSubmitting ? '发送验证邮件中...' : '更换邮箱'}
              </button>
            </form>
          </div>

          {/* ========== 修改密码 ========== */}
          <div className="section-card">
            <h2 className="font-semibold text-gray-900 mb-4">修改密码</h2>
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              {passwordMsg && (
                <div className={`p-3 rounded-lg text-sm ${
                  passwordMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
                }`}>
                  {passwordMsg.text}
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">新密码</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="至少 6 位字符"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">确认新密码</label>
                <input
                  type="password"
                  className="input-base"
                  placeholder="再次输入新密码"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={passwordSubmitting}>
                {passwordSubmitting ? '修改中...' : '修改密码'}
              </button>
            </form>
          </div>

          {/* ========== 注销账号 ========== */}
          <div className="section-card border-red-200">
            <h2 className="font-semibold text-red-600 mb-2">注销账号</h2>
            <p className="text-sm text-gray-500 mb-4">
              注销后，你的账号和所有云端简历数据将被永久删除，无法恢复。
            </p>

            {deleteMsg && (
              <div className={`p-3 rounded-lg text-sm mb-4 ${
                deleteMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
              }`}>
                {deleteMsg.text}
              </div>
            )}

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn-danger"
              >
                注销账号
              </button>
            ) : (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700 mb-3">
                  请输入 <span className="font-bold">确认注销</span> 以确认此操作
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-base flex-1"
                    placeholder="确认注销"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                  />
                  <button
                    onClick={handleDeleteAccount}
                    className="btn-danger"
                    disabled={deleteSubmitting}
                  >
                    {deleteSubmitting ? '注销中...' : '确认注销'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteMsg(null); }}
                    className="btn-secondary"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 返回 */}
        <div className="mt-8 text-center">
          <Link to="/my-resumes" className="text-sm text-gray-400 hover:text-gray-500">
            ← 返回我的简历
          </Link>
        </div>
      </div>
    </div>
  );
}
