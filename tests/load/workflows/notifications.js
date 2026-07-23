// tests/load/workflows/notifications.js
// Notifications + system status pipeline.
import http from "k6/http";
import { check } from "k6";

export function runNotifications(baseUrl, token, orgId, runId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-load-run-id": runId,
  };
  const notif = http.get(
    `${baseUrl}/rest/v1/notification_log?organization_id=eq.${orgId}&select=id,read_at&limit=20`,
    { headers, tags: { name: "rest_read_notifications" } },
  );
  check(notif, { "notif list 200": (r) => r.status === 200 });

  const status = http.get(`${baseUrl}/functions/v1/public-system-status`, {
    tags: { name: "edge_fn_public_status" },
  });
  check(status, { "system status 2xx": (r) => r.status >= 200 && r.status < 300 });
}
