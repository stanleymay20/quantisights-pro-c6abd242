import { describe, expect, it, vi } from "vitest";

import {
  authorizeConnectorInvocation,
  isExactServiceRoleBearer,
} from "../../supabase/functions/_shared/connector-invocation-auth";

describe("connector invocation authorization", () => {
  it("accepts only an exact service-role bearer token", () => {
    expect(isExactServiceRoleBearer("Bearer secret", "secret")).toBe(true);
    expect(isExactServiceRoleBearer("Bearer secret-extra", "secret")).toBe(false);
    expect(isExactServiceRoleBearer("prefix Bearer secret", "secret")).toBe(false);
    expect(isExactServiceRoleBearer(null, "secret")).toBe(false);
  });

  it("allows service-role traffic without invoking user or membership clients", async () => {
    const getUser = vi.fn();
    const rpc = vi.fn();
    const result = await authorizeConnectorInvocation({
      authHeader: "Bearer service-secret",
      serviceRoleKey: "service-secret",
      organizationId: "org-a",
      userClient: { auth: { getUser } },
      membershipClient: { rpc },
    });
    expect(result).toEqual({ allowed: true, actor: "service_role", userId: null });
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires authentication for non-service traffic", async () => {
    const result = await authorizeConnectorInvocation({
      authHeader: null,
      serviceRoleKey: "service-secret",
      organizationId: "org-a",
      userClient: null,
      membershipClient: { rpc: vi.fn() },
    });
    expect(result).toEqual({ allowed: false, status: 401, reason: "unauthorized" });
  });

  it("requires membership in the connector organization", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const result = await authorizeConnectorInvocation({
      authHeader: "Bearer user-token",
      serviceRoleKey: "service-secret",
      organizationId: "org-a",
      userClient: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
        },
      },
      membershipClient: { rpc },
    });
    expect(result).toEqual({ allowed: false, status: 403, reason: "forbidden" });
    expect(rpc).toHaveBeenCalledWith("is_org_member", { _user_id: "user-1", _org_id: "org-a" });
  });

  it("allows an authenticated organization member", async () => {
    const result = await authorizeConnectorInvocation({
      authHeader: "Bearer user-token",
      serviceRoleKey: "service-secret",
      organizationId: "org-a",
      userClient: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
        },
      },
      membershipClient: { rpc: vi.fn(async () => ({ data: true, error: null })) },
    });
    expect(result).toEqual({ allowed: true, actor: "user", userId: "user-1" });
  });
});
