// tests/load/lib/auth.js
// Password-grant only. No OAuth round-trip.
import http from "k6/http";
import { check } from "k6";

const URL = __ENV.LOAD_SUPABASE_URL;
const ANON = __ENV.LOAD_SUPABASE_ANON_KEY;

export function signIn(email, password) {
  const res = http.post(
    `${URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: { "Content-Type": "application/json", apikey: ANON },
      tags: { name: "auth_signin", kind: "auth" },
    },
  );
  check(res, { "auth 200": (r) => r.status === 200 });
  if (res.status !== 200) return null;
  const body = res.json();
  return { token: body.access_token, refresh: body.refresh_token, user: body.user };
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: ANON,
    "Content-Type": "application/json",
    "x-test-mock": __ENV.LOAD_AI === "mock" ? "1" : "0",
  };
}
