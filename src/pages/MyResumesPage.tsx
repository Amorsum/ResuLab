import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCloudResumes } from '../hooks/useCloudResumes';
import { useResume } from '../hooks/useResume';
import { createEmptyResume } from '../constants/defaultResume';
import type { CloudResumeMeta } from '../types/resume';

export default function MyResumesPage() {
  const navigate = useNavigate();
  const { listResumes, loadCloudResume, deleteResume } = useCloudResumes();
  const { loadResume } = useResume();

  const [resumes, setResumes] = useState<CloudResumeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadList = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listResumes();
      setResumes(list);
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (cloudId: string) => {
    try {
      await loadCloudResume(cloudId);
      navigate(`/builder`);
    } catch {
      setError('加载简历失败');
    }
  };

  const handleDelete = async (cloudId: string) => {
    if (!window.confirm('确定要删除这份简历吗？此操作不可恢复。')) return;

    setDeleting(cloudId);
    try {
      await deleteResume(cloudId);
      setResumes((prev) => prev.filter((r) => r.id !== cloudId));
    } catch {
      setError('删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const handleNew = () => {
    loadResume(createEmptyResume());
    navigate('/builder');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* 导航栏 */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary-700">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            ResuLab
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">我的简历</h1>
          <button onClick={handleNew} className="btn-primary">
            + 新建简历
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
            <button className="ml-2 underline" onClick={loadList}>重试</button>
          </div>
        )}

        {/* 加载态 */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* 空状态 */}
        {!loading && resumes.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">还没有简历</h2>
            <p className="text-gray-500 mb-6">创建你的第一份简历，或从本地导入</p>
            <button onClick={handleNew} className="btn-primary">
              创建简历
            </button>
          </div>
        )}

        {/* 简历列表 */}
        {!loading && resumes.length > 0 && (
          <div className="space-y-4">
            {resumes.map((r) => (
              <div
                key={r.id}
                className="section-card flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{r.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    最后编辑：{formatDate(r.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(r.id)}
                    className="btn-secondary text-sm py-1.5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="btn-danger text-sm py-1.5"
                  >
                    {deleting === r.id ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部提示 */}
        <div className="mt-8 text-center">
          <Link to="/builder" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            继续编辑本地简历 →
          </Link>
        </div>
      </div>
    </div>
  );
}
