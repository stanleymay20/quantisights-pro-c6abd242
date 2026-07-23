# RTS-1G Evidence Report

Generated at: 2026-07-05T12:00:00.000Z

This report was generated from deterministic synthetic enterprise scenarios. No connectors, UI, runtime ingestion, HTTP calls, Supabase calls, or AG-2 invocations were executed.

## Scenario Results

### Clean high-quality operational signal → EVF → Decision Candidate → AG-2 handoff

- ID: clean-operational-signal
- Status: PASSED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 96. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-d42f06c2 version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 96, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated OPERATIONAL Decision Candidate candidate-56e8d686. EVF evf-d42f06c2 supports candidate generation: Supplier X delivery is at risk within 36 hours. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-56e8d686 before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is OPERATIONAL. candidate expires at 2026-07-06T12:00:00.000Z. handoff payload built for AG-2 version ag-2.0.0. gateway request hash is fnv1a-9318a9fb. scenario reached expected status PASSED.

### Expired signal → rejected before EVF

- ID: expired-signal
- Status: REJECTED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 84. submitted confidence is 90. supporting evidence count is 1. contradiction count is 0. not promoted: signal signal_tenant-a_erp_e1a2862e has expired evidence. not promoted: quality 84 is below NORMAL threshold 85. no candidate: EVF promotion did not produce a fact. policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 84. submitted confidence is 90. supporting evidence count is 1. contradiction count is 0. not promoted: signal signal_tenant-a_erp_e1a2862e has expired evidence. not promoted: quality 84 is below NORMAL threshold 85. scenario reached expected status REJECTED.

### Contradictory inventory signals → contradiction detected → no promotion unless accepted

- ID: contradictory-inventory-signals
- Status: REJECTED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 90. supporting evidence count is 2. contradiction count is 2. not promoted: unresolved contradiction contradiction-520565aa is not allowed by NORMAL. no candidate: EVF promotion did not produce a fact. policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 90. supporting evidence count is 2. contradiction count is 2. not promoted: unresolved contradiction contradiction-520565aa is not allowed by NORMAL. scenario reached expected status REJECTED.

### Accepted medium contradiction → EVF promoted under NORMAL policy

- ID: accepted-medium-contradiction
- Status: PASSED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 90. supporting evidence count is 2. contradiction count is 2. promoted Enterprise Verified Fact evf-4d73c2b2 version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 90, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated OPERATIONAL Decision Candidate candidate-bf2fe492. EVF evf-4d73c2b2 supports candidate generation: Operational process delay has an accepted medium contradiction. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-bf2fe492 before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is OPERATIONAL. candidate expires at 2026-07-06T12:00:00.000Z. handoff payload built for AG-2 version ag-2.0.0. gateway request hash is fnv1a-84e071b0. scenario reached expected status PASSED.

### Critical tenant/org mismatch → rejected

- ID: critical-tenant-org-mismatch
- Status: REJECTED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 95. supporting evidence count is 2. contradiction count is 1. not promoted: tenant/organization mismatch across supporting signals. not promoted: critical contradiction contradiction-a09026c1 is present. not promoted: unresolved contradiction contradiction-a09026c1 is not allowed by NORMAL. no candidate: EVF promotion did not produce a fact. policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 95. supporting evidence count is 2. contradiction count is 1. not promoted: tenant/organization mismatch across supporting signals. not promoted: critical contradiction contradiction-a09026c1 is present. not promoted: unresolved contradiction contradiction-a09026c1 is not allowed by NORMAL. scenario reached expected status REJECTED.

### High-impact supplier risk → STRATEGIC/OPERATIONAL candidate

- ID: high-impact-supplier-risk
- Status: PASSED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 97. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-f1ed0f83 version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 97, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated STRATEGIC Decision Candidate candidate-a58e3664. EVF evf-f1ed0f83 supports candidate generation: Strategic supplier will miss delivery within 72 hours. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-a58e3664 before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is STRATEGIC. candidate expires at 2026-07-06T12:00:00.000Z. handoff payload built for AG-2 version ag-2.0.0. gateway request hash is fnv1a-55d30e25. scenario reached expected status PASSED.

### Compliance/regulatory signal → REGULATORY candidate

- ID: compliance-regulatory-signal
- Status: PASSED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 95. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-888012ed version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 95, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated REGULATORY Decision Candidate candidate-320d33cd. EVF evf-888012ed supports candidate generation: Regulatory compliance evidence gap requires governance review. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-320d33cd before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is REGULATORY. candidate expires at 2026-07-06T12:00:00.000Z. handoff payload built for AG-2 version ag-2.0.0. gateway request hash is fnv1a-68655d00. scenario reached expected status PASSED.

### Low materiality signal → no candidate

- ID: low-materiality-signal
- Status: REJECTED
- Explanation: policy PERMISSIVE requires quality >=70 and confidence >=70. calculated quality score is 90. submitted confidence is 75. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-cd3a4aea version 1. Promoted because PERMISSIVE policy thresholds were met with quality 90, confidence 75, evidence present, and no disallowed contradictions. no candidate: low materiality signal intentionally stopped before RTS-1E decision candidate generation. scenario reached expected status REJECTED.

### Expired Decision Candidate → no AG-2 handoff

- ID: expired-decision-candidate
- Status: REJECTED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 95. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-cff11069 version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 95, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated OPERATIONAL Decision Candidate candidate-9e6dbb94. EVF evf-cff11069 supports candidate generation: Supplier Z decision candidate should expire before handoff. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-9e6dbb94 before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is OPERATIONAL. candidate expires at 2026-07-05T11:59:00.000Z. handoff rejected: candidate candidate-9e6dbb94 is expired. handoff rejected: invalid candidate hash: expected fnv1a-097decdd but received fnv1a-2d8e3ff5. scenario reached expected status REJECTED.

### Deterministic replay → identical hashes

- ID: deterministic-replay
- Status: PASSED
- Explanation: policy NORMAL requires quality >=85 and confidence >=80. calculated quality score is 100. submitted confidence is 96. supporting evidence count is 1. contradiction count is 0. promoted Enterprise Verified Fact evf-c89a6181 version 1. Promoted because NORMAL policy thresholds were met with quality 100, confidence 96, evidence present, and no disallowed contradictions. generation policy STANDARD requires quality >=85 and confidence >=80. evaluated 1 Enterprise Verified Fact. generated OPERATIONAL Decision Candidate candidate-d9a001b5. EVF evf-c89a6181 supports candidate generation: Replay supplier risk produces identical deterministic hashes. All supporting EVFs are VERIFIED or ACTIVE. Generation policy STANDARD thresholds were satisfied. No blocking contradictions were present. Candidate is deterministic and contains complete lineage. RTS-1F validates candidate candidate-d9a001b5 before AG-2 handoff. candidate status is READY_FOR_GATEWAY. candidate class is OPERATIONAL. candidate expires at 2026-07-06T12:00:00.000Z. handoff payload built for AG-2 version ag-2.0.0. gateway request hash is fnv1a-426a204f. scenario reached expected status PASSED.
- Replay identical: true
- Replay hash: fnv1a-711c355f

