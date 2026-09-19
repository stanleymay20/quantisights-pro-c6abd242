import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import {
  PRODUCTION_PUBLIC_CLIENT_CONFIG,
  STAGING_PUBLIC_CLIENT_CONFIG,
  resolveDefaultPublicClientTarget,
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

  // Hosting providers commonly build deploy previews with Vite's `production`
  // mode. That must never make an isolated preview inherit production Supabase.
  // Netlify exposes CONTEXT (production/deploy-preview/branch-deploy); Vercel
  // exposes VERCEL_ENV (production/preview/development). Any explicit
  // non-production provider context fails closed to staging.
  const deploymentContext = process.env.CONTEXT?.trim()
    || process.env.VERCEL_ENV?.trim()
    || null;
  const defaultClientTarget = resolveDefaultPublicClientTarget({
    mode,
    deploymentContext,
  });

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
    deploymentContext,
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
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor packages into their own cacheable
        // chunks instead of letting them inflate the main entry bundle.
        manualChunks: (id: string) => {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]react-router(-dom)?[\\/]/.test(id)) return "vendor-router";
          if (/[\\/]node_modules[\\/]@radix-ui[\\/]/.test(id)) return "vendor-radix";
          if (/[\\/]node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/.test(id)) return "vendor-i18n";
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) return "vendor-motion";
          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id)) return "vendor-charts";
          if (/[\\/]node_modules[\\/]date-fns[\\/]/.test(id)) return "vendor-date-fns";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          if (/[\\/]node_modules[\\/]posthog-js[\\/]/.test(id)) return "vendor-posthog";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) return "vendor-query";
          if (/[\\/]node_modules[\\/](react-hook-form|@hookform)[\\/]/.test(id)) return "vendor-forms";
          if (/[\\/]node_modules[\\/]zod[\\/]/.test(id)) return "vendor-zod";
          if (/[\\/]node_modules[\\/]axe-core[\\/]/.test(id)) return "vendor-axe";
          return undefined;
        },
      },
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
