import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI exact-head evidence contract", () => {
  it("defines the literal PR head as the pull-request quality candidate", () => {
    expect(ci).toContain(
      "QUALITY_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
    );
    expect(ci).toContain("group: ci-${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}");
  });

  it("checks out and verifies the exact quality candidate before running quality gates", () => {
    expect(ci).toContain("- name: Checkout exact quality candidate");
    expect(ci).toContain("ref: ${{ env.QUALITY_SHA }}");
    expect(ci).toContain("- name: Verify checked-out quality SHA");
    expect(ci).toContain('actual="$(git rev-parse HEAD)"');
    expect(ci).toContain('test "$actual" = "$QUALITY_SHA"');

    const verify = ci.indexOf("- name: Verify checked-out quality SHA");
    const install = ci.indexOf("- name: Install dependencies");
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(verify);
  });

  it("labels generated CI evidence with the SHA actually tested", () => {
    expect(ci).toContain("name: quantivis-production-dist-${{ env.QUALITY_SHA }}");
    expect(ci).toContain("name: npm-audit-${{ env.QUALITY_SHA }}");
    expect(ci).not.toContain("name: npm-audit-${{ github.sha }}");
  });

  it("does not present the synthetic PR merge SHA as exact-head quality evidence", () => {
    expect(ci).toContain("Do not use GitHub's synthetic PR merge SHA as exact-head");
    expect(ci).toContain("Base/merge compatibility is a separate merge-time concern.");
  });
});
