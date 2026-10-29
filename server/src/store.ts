import type { SupabaseClient } from "@supabase/supabase-js";
import { type RunView, type ResumeSnapshot } from "../../shared/agent.js";
import { databaseError } from "./errors.js";
export interface RunRecord {
  kind?: 'resume_optimize' | 'career_tailor' | 'project_analysis';
  project_context?: import('../../shared/project.js').ProjectRunContext;
  career_context?: import('../../shared/careerEntries.js').CareerRunContext;
  id: string;
  owner_id: string;
  status: RunView["status"];
  jd_text: string;
  resume_snapshot: ResumeSnapshot;
  resume_revision: string;
  run_view: RunView;
  stage: number;
  retry_count: number;
  lease_token: string;
  lease_expires_at: string | null;
  created_at: string;
  finished_at: string | null;
  awaiting_since: string | null;
  waiting_ms: number;
}
export interface Store {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
}
export function supabaseStore(client: SupabaseClient): Store {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw databaseError(error);
      return data as T;
    },
  };
}
export function publicView(run: RunRecord, now = Date.now()): RunView {
  const view = structuredClone(run.run_view);
  view.status = run.status;
  view.usage.elapsedMs = Math.max(
    0,
    (run.finished_at ? Date.parse(run.finished_at) : now) -
      Date.parse(run.created_at),
  );
  view.usage.waitingMs =
    Number(run.waiting_ms) +
    (run.awaiting_since
      ? Math.max(0, now - Date.parse(run.awaiting_since))
      : 0);
  return view;
}
