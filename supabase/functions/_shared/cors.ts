/**
 * Centralized CORS configuration for all edge functions.
 * Restricts origins to known deployment domains.
 */

const ALLOWED_ORIGINS = [
  "https://quantisights-pro.lovable.app",
  "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app",
  "https://28b43e06-9231-4c54-bc18-a49be01a6516.lovableproject.com",
  "https://www.quantivis.io",
  "https://quantivis.io",
  "http://localhost:5173",
  "http://localhost:8080",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

export function corsPreflightResponse(req: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}
