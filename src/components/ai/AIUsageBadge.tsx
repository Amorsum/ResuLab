import { useAIContext } from '../../hooks/useAIContext';
import { useAuth } from '../../hooks/useAuth';

export function AIUsageBadge() {
  const { session } = useAuth();
  const { membership, loading } = useAIContext();

  if (!session?.access_token) return null;
  if (loading) {
    return <span className="text-[10px] text-gray-400">加载中...</span>;
  }
  if (!membership) return null;

  const tier = membership.tier;
  const generateRemaining = membership.usage.generate.limit - membership.usage.generate.used;
  const polishRemaining = membership.usage.polish.limit - membership.usage.polish.used;

  return (
    <div className="flex items-center gap-2">
      {/* 会员等级标签 */}
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
        ${tier === 'pro'
          ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white'
          : 'bg-gray-100 text-gray-500'
        }`}
      >
        {tier === 'pro' ? (
          <>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            PRO
          </>
        ) : (
          '免费版'
        )}
      </span>

      {/* 剩余次数 */}
      {tier === 'free' && (
        <span className="text-[10px] text-gray-400">
          生成剩{generateRemaining}次 · 润色剩{polishRemaining}次
        </span>
      )}
    </div>
  );
}
