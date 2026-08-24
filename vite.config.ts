import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import {
  PRODUCTION_PUBLIC_CLIENT_CONFIG,
  STAGING_PUBLIC_CLIENT_CONFIG,
  resolvePublicClientConfig,
  validatePublicClientConfig,
} from "./config/public-client-config";

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

const baseReleaseMetadata = {
  version: packageVersion,
  gitCommit,
  buildTimestamp,
  deploymentId,
  migrationVersion: "20260821230500",
};

const releaseProvenancePlugin = (releaseMetadata: Record<string, unknown>): Plugin => ({
  name: "quantivis-release-provenance",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "release.json",
      source: `${JSON.stringify(releaseMetadata, null, 2)}\n`,
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");

  // Fail-safe environment separation: only an explicit production-mode build
  // defaults to the production Supabase project. Development, test, preview,
  // and any custom non-production mode default to staging unless a complete
  // VITE_SUPABASE_* pair explicitly overrides the target.
  const defaultClientTarget = mode === "production"
    ? PRODUCTION_PUBLIC_CLIENT_CONFIG
    : STAGING_PUBLIC_CLIENT_CONFIG;

  const publicClientConfig = resolvePublicClientConfig({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim(),
    VITE_SUPABASE_PUBLISHABLE_KEY:
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
      || env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  }, defaultClientTarget);

  const { projectRef: supabaseProjectRef } = validatePublicClientConfig(
    publicClientConfig.supabaseUrl,
    publicClientConfig.supabasePublishableKey,
  );

  const releaseMetadata = {
    ...baseReleaseMetadata,
    buildMode: mode,
    supabaseProjectRef,
    supabaseConfigSource: publicClientConfig.source,
  };

  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [releaseProvenancePlugin(releaseMetadata), react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    __QUANTIVIS_RELEASE__: JSON.stringify(releaseMetadata),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicClientConfig.supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicClientConfig.supabasePublishableKey),
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
