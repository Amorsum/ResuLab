import { useEffect, useRef } from 'react';
import type { ExportIssue } from '../../utils/exportChecks';
export function ExportPreflight({ format, pages, issues, proceed, close, locate }: { format: string; pages: number; issues: ExportIssue[]; proceed: () => void; close: () => void; locate: (section: ExportIssue['section']) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }} className="export-preflight" aria-labelledby="export-preflight-title"><h2 id="export-preflight-title">导出前检查</h2><p>{pages ? `当前预览共 ${pages} 页` : '预览正在准备'} · {format}</p>{issues.length ? <ul>{issues.map(issue => <li key={issue.message}><span>{issue.message}</span><button className="career-button" onClick={() => locate(issue.section)}>前往修改</button></li>)}</ul> : <p>未发现必填信息缺失或明显横向溢出。请确认内容和个人贡献。</p>}<p className="career-muted">检查只提示信息和排版问题，不代替事实核对。手动排版与智能一页均可撤销。</p><div className="career-actions"><button className="career-button career-primary" onClick={proceed}>确认导出 {format}</button><button className="career-button" onClick={close}>返回编辑</button></div></dialog>;
}
