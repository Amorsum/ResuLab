/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AI_API_BASE: string;
  readonly VITE_AGENT_API_BASE?: string;
  readonly VITE_AGENT_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
