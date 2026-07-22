// tests/load/lib/thresholds.js
// Per-stage thresholds. Returns a k6 options.thresholds object.
export function thresholds(stage) {
  const base = {
    "http_req_failed": ["rate<0.01"],
    "checks": ["rate>0.99"],
    "cross_tenant_leaks": ["count==0"],
  };
  const byStage = {
    smoke: { "http_req_duration": ["p(95)<800"] },
    small: { "http_req_duration": ["p(95)<800"] },
    "load-50": {
      "http_req_duration{kind:rest_read}": ["p(95)<800"],
      "http_req_duration{kind:rest_write}": ["p(95)<1500"],
      "http_req_failed": ["rate<0.005"],
      "workflow_success_rate": ["rate>0.99"],
    },
    "load-100": {
      "http_req_duration{kind:rest_read}": ["p(95)<1200"],
      "http_req_duration{kind:rest_write}": ["p(95)<2000"],
      "http_req_failed": ["rate<0.01"],
      "workflow_success_rate": ["rate>0.98"],
    },
    "stress-1000": {
      "http_req_duration{kind:rest_read}": ["p(95)<2500"],
      "http_req_duration{kind:rest_write}": ["p(95)<4000"],
      "http_req_failed": ["rate<0.03"],
      "workflow_success_rate": ["rate>0.95"],
    },
  };
  return { ...base, ...(byStage[stage] || {}) };
}
