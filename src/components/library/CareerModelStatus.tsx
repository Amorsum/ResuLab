import { useEffect, useState } from 'react';

interface ModelStatus { configured: boolean; id?: string | null }
export function CareerModelStatus({ local, onReadyChange }: { local: boolean; onReadyChange: (ready: boolean | null) => void }) {
  const [status, setStatus] = useState<ModelStatus | null>(null), [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(''); onReadyChange(null);
    const base = (import.meta.env.VITE_AGENT_API_BASE || 'http://localhost:8788').replace(/\/$/, '');
    void fetch(`${base}/api/health`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]), cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('模型状态暂时无法读取，请检查本地后端是否运行');
      const value = await response.json();
      if (typeof value?.dependencies?.modelConfigured !== 'boolean') throw new Error('后端未返回有效的模型状态');
      if (!abort.signal.aborted) {
        const next = { configured: value.dependencies.modelConfigured, id: typeof value.model?.id === 'string' ? value.model.id : null };
        setStatus(next); onReadyChange(next.configured);
      }
    }).catch(e => { if (!abort.signal.aborted) { setStatus(null); onReadyChange(null); setError(e instanceof Error && e.message.startsWith('后端未返回') ? e.message : '无法读取模型状态，请检查本地后端连接后刷新'); } });
    return () => { abort.abort(); };
  }, [refresh, onReadyChange]);
  return <section className="career-model-status career-fact" aria-label="Agent 模型状态">
    <p role="status"><strong>Agent 模型：</strong>{error || (status ? status.configured ? status.id || '后端模型已配置' : '尚未配置模型服务' : '正在检查模型配置…')}</p>
    {status && !status.configured && <p className="career-muted">模型由{local ? '本地' : '服务'}后端统一配置，页面无需另选。手动选材和原文填入仍可使用。</p>}
    <div className="career-actions"><button type="button" className="career-button" aria-expanded={expanded} aria-controls="career-model-setup" onClick={() => setExpanded(v => !v)}>{expanded ? '收起配置说明' : '模型配置说明'}</button><button type="button" className="career-button" onClick={() => { setStatus(null); setRefresh(v => v + 1); }}>刷新模型状态</button></div>
    {expanded && <div id="career-model-setup" className="career-model-setup">
      {local ? <><h3>配置本地 Agent 模型</h3><p>在项目的 <code>server/.env</code> 文件中填写模型服务商提供的三项配置：</p>
        <pre className="career-text">{'MODEL_BASE_URL=模型服务的 API 根地址\nMODEL_ID=服务商提供的模型名称\nMODEL_API_KEY=你的 API Key'}</pre>
        <p className="career-muted">当前接入支持 OpenAI 兼容的 Chat Completions 与 JSON 输出。地址填写到 API 根路径，后端会追加 /chat/completions；模型名称按服务商提供的实际标识填写。</p>
        <p>API Key 只填入本机配置文件。保存后本地启动器会重新加载后端；点击“刷新模型状态”确认，再使用 Agent 推荐。</p>
      </> : <p>请由服务维护者配置后端模型服务；模型就绪后刷新状态即可使用 Agent。你的经历和手动操作不受影响。</p>}
    </div>}
  </section>;
}
