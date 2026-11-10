/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

/** Build metadata embedded in the production bundle by Vite. */
declare const __MODERN_LEAGUE_BUILD__: { version: string; builtAt: string; commit: string };
