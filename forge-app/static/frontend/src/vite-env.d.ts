/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'web' when built for the Vercel deployment (use the HTTP API). */
  readonly VITE_API_MODE?: string;
  /** API origin. Empty = same-origin (prod). e.g. http://localhost:3001 for local dev. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
