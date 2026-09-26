/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. When missing, the app runs offline as a local guest. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key; safe to ship in the browser because RLS protects data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
