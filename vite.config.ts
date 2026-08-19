import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

const resolveGitCommit = () => {
  const deploymentCommit = [
    process.env.GITHUB_SHA,
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.COMMIT_REF,
  ].find((value) => value?.trim());

  if (deploymentCommit) return deploymentCommit.trim();

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
  } catch {
    // Preview sandboxes and source archives may not contain Git metadata.
    return "unknown";
  }
};

const gitCommit = resolveGitCommit();
const buildTimestamp = process.env.QUANTIVIS_BUILD_TIMESTAMP ?? new Date().toISOString();
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID
  ?? process.env.CF_PAGES_COMMIT_SHA
  ?? process.env.LOVABLE_DEPLOYMENT_ID
  ?? null;

const releaseMetadata = {
  version: packageVersion,
  gitCommit,
  buildTimestamp,
  deploymentId,
  migrationVersion: "20260813124440",
};

// Public client configuration is safe to embed. Lovable normally injects these
// values at build time; the fallbacks prevent a deployment from shipping an
// unusable bootstrap bundle when that injection is unavailable.
const CLOUD_URL_FALLBACK = "https://itpwpnwzzitkelffttyx.supabase.co";
const CLOUD_PUBLISHABLE_KEY_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cHdwbnd6eml0a2VsZmZ0dHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTIxNTMsImV4cCI6MjA4NzM2ODE1M30.sjrNIlSiU_udZXmE4o822K0bOmbhqNCk_47mSKK86xY";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const cloudUrl = process.env.VITE_SUPABASE_URL?.trim()
    || env.VITE_SUPABASE_URL?.trim()
    || CLOUD_URL_FALLBACK;
  const cloudPublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || CLOUD_PUBLISHABLE_KEY_FALLBACK;

  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    __QUANTIVIS_RELEASE__: JSON.stringify(releaseMetadata),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
  },
  resolve: {
    alias: [
      {
        find: "@/lib/data-upload-utils",
        replacement: path.resolve(import.meta.dirname, "./src/lib/data-upload-utils-safe.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(import.meta.dirname, "./src"),
      },
    ],
  },
  });
});
