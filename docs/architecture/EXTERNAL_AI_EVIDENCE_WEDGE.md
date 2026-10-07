# External AI Evidence Wedge

Status: implementation branch scaffold.

This branch introduces a vendor-neutral evidence path for externally produced AI decisions. The target flow is:

external AI system -> registered AI identity -> authenticated decision intake -> decision ledger linkage -> audit trail -> evidence pack.

Design constraints:
- preserve existing Quantivis decision, approval, execution, audit, and RLS behavior;
- do not delete or freeze existing functions in this change;
- prefer append-only provenance over mutable narrative fields;
- raw prompts and outputs are optional; integrity hashes are first-class;
- retries must be idempotent and cross-tenant references must fail closed;
- regulatory mappings may identify supporting evidence but must not claim certification.

Implementation details are added in the migration, edge function, and tests on this branch.
