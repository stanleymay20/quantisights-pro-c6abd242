import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

const root = process.cwd();
const entry = resolve(root, "src/lib/supplier-risk-runtime-pipeline.ts");
const outDir = resolve(root, "supabase/functions/supplier-risk-runtime-ingest/_generated");
const outputPath = resolve(outDir, "supplier-risk-runtime-pipeline.mjs");

await build({
  configFile: false,
  logLevel: "info",
  resolve: {
    alias: [{ find: "@", replacement: resolve(root, "src") }],
  },
  build: {
    target: "es2022",
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "supplier-risk-runtime-pipeline.mjs",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

const bundle = await readFile(outputPath, "utf8");
const unresolved = ["@/lib/", 'from "zod"', "from 'zod'"];
const found = unresolved.filter((token) => bundle.includes(token));
if (found.length > 0) {
  throw new Error(`Supplier-risk Edge bundle still contains unresolved imports: ${found.join(", ")}`);
}
if (!bundle.includes("runSupplierRiskRuntimePipeline")) {
  throw new Error("Supplier-risk Edge bundle does not export runSupplierRiskRuntimePipeline");
}

console.log(`Prepared self-contained supplier-risk Edge runtime bundle (${Buffer.byteLength(bundle)} bytes).`);
