export interface Env {
  ROOMS: DurableObjectNamespace;
  /** Present only when the Worker is deployed with the SPA as static assets. */
  ASSETS?: Fetcher;
  ENVIRONMENT: 'development' | 'production';
  /** Comma-separated frontend origins allowed to use the API and WebSocket. Empty = any. */
  ALLOWED_ORIGINS?: string;
}
