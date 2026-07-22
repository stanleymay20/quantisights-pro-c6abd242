import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runRts1gEvidenceHarness,
  type Rts1gEvidenceRun,
} from "@/lib/rts-pipeline-evidence";
import { ExtendedContradictionRecordSchema } from "@/lib/contradiction-detection";
import { GatewaySubmissionRecordSchema } from "@/lib/decision-candidate-handoff";
import { DecisionCandidateSchema } from "@/lib/decision-candidate-generation";
import { NormalizedSignalSchema, RawEventSchema } from "@/lib/real-time-signals";
import { EnterpriseVerifiedFactSchema } from "@/lib/verified-fact-promotion";

describe("RTS-1G evidence harness", () => {
  it("creates auditable artifacts for all deterministic RTS pipeline scenarios", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "rts-1g-"));
    const run = await runRts1gEvidenceHarness({
      artifact_root: artifactRoot,
      timestamp: "2026-07-05T12:00:00.000Z",
    });

    expect(run.run_id).toBe("2026-07-05T12-00-00-000Z");
    expect(run.artifact_dir).toBe(join(artifactRoot, "rts-1g", run.run_id));
    expect(run.scenarios).toHaveLength(10);
    expect(run.scenarios.map((scenario) => scenario.scenario_id)).toEqual([
      "clean-operational-signal",
      "expired-signal",
      "contradictory-inventory-signals",
      "accepted-medium-contradiction",
      "critical-tenant-org-mismatch",
      "high-impact-supplier-risk",
      "compliance-regulatory-signal",
      "low-materiality-signal",
      "expired-decision-candidate",
      "deterministic-replay",
    ]);

    await expectArtifact(run, "input-events.json");
    await expectArtifact(run, "normalized-signals.json");
    await expectArtifact(run, "quality-scores.json");
    await expectArtifact(run, "contradictions.json");
    await expectArtifact(run, "verified-facts.json");
    await expectArtifact(run, "decision-candidates.json");
    await expectArtifact(run, "gateway-handoffs.json");
    const report = await readFile(join(run.artifact_dir, "RTS-1G-REPORT.md"), "utf8");
    expect(report).toContain("# RTS-1G Evidence Report");
    expect(report).toContain("Clean high-quality operational signal");
  });

  it("validates every created stage artifact against the RTS schemas", async () => {
    const run = await runInTemp();

    for (const event of await readJson<unknown[]>(run, "input-events.json")) {
      expect(RawEventSchema.safeParse(event).success).toBe(true);
    }
    for (const signal of await readJson<unknown[]>(run, "normalized-signals.json")) {
      expect(NormalizedSignalSchema.safeParse(signal).success).toBe(true);
    }
    for (const contradiction of await readJson<unknown[]>(run, "contradictions.json")) {
      expect(ExtendedContradictionRecordSchema.safeParse(contradiction).success).toBe(true);
    }
    for (const fact of await readJson<unknown[]>(run, "verified-facts.json")) {
      expect(EnterpriseVerifiedFactSchema.safeParse(fact).success).toBe(true);
    }
    for (const candidate of await readJson<unknown[]>(run, "decision-candidates.json")) {
      expect(DecisionCandidateSchema.safeParse(candidate).success).toBe(true);
    }
    for (const handoff of await readJson<Array<{ submission_record: unknown }>>(run, "gateway-handoffs.json")) {
      expect(GatewaySubmissionRecordSchema.safeParse(handoff.submission_record).success).toBe(true);
    }
  });

  it("records rejected paths with deterministic explanations", async () => {
    const run = await runInTemp();

    const rejected = run.scenarios.filter((scenario) => scenario.status === "REJECTED");
    expect(rejected.map((scenario) => scenario.scenario_id)).toEqual([
      "expired-signal",
      "contradictory-inventory-signals",
      "critical-tenant-org-mismatch",
      "low-materiality-signal",
      "expired-decision-candidate",
    ]);
    for (const scenario of rejected) {
      expect(scenario.explanation.length).toBeGreaterThan(0);
      expect(scenario.explanation.join(" ")).toMatch(/not promoted|no candidate|handoff rejected|critical contradiction|expired/i);
    }
  });

  it("proves deterministic replay with identical hashes", async () => {
    const run = await runInTemp();
    const replay = run.scenarios.find((scenario) => scenario.scenario_id === "deterministic-replay");

    expect(replay?.status).toBe("PASSED");
    expect(replay?.deterministic_replay).toEqual({
      first_hash: expect.stringMatching(/^fnv1a-/),
      second_hash: expect.stringMatching(/^fnv1a-/),
      identical: true,
    });
  });

  it("does not use runtime network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const run = await runInTemp();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(run.network_calls_made).toBe(0);
    fetchSpy.mockRestore();
  });
});

async function runInTemp(): Promise<Rts1gEvidenceRun> {
  const artifactRoot = await mkdtemp(join(tmpdir(), "rts-1g-"));
  await mkdir(artifactRoot, { recursive: true });
  return runRts1gEvidenceHarness({
    artifact_root: artifactRoot,
    timestamp: "2026-07-05T12:00:00.000Z",
  });
}

async function expectArtifact(run: Rts1gEvidenceRun, fileName: string): Promise<void> {
  const content = await readFile(join(run.artifact_dir, fileName), "utf8");
  expect(content.length).toBeGreaterThan(10);
}

async function readJson<T>(run: Rts1gEvidenceRun, fileName: string): Promise<T> {
  return JSON.parse(await readFile(join(run.artifact_dir, fileName), "utf8")) as T;
}
