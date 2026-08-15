type UserResult = {
  data: { user: { id: string } | null };
  error: unknown;
};

type RpcResult = {
  data: unknown;
  error: unknown;
};

export interface ConnectorUserAuthClient {
  auth: {
    getUser(): PromiseLike<UserResult>;
  };
}

export interface ConnectorMembershipClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

/**
 * Exclusive authorization result.
 *
 * The `?: never` fields keep the runtime objects minimal while making every
 * branch-specific property part of the union's public shape. This preserves
 * reliable control-flow typing in both the relaxed Supabase/Deno compiler
 * configuration and stricter TypeScript consumers.
 */
export type ConnectorInvocationDecision =
  | {
      allowed: true;
      actor: "service_role" | "user";
      userId: string | null;
      status?: never;
      reason?: never;
    }
  | {
      allowed: false;
      status: 401 | 403;
      reason: "unauthorized" | "forbidden";
      actor?: never;
      userId?: never;
    };

/** Exact bearer comparison only; substring/prefix matching would weaken service-role identity. */
export function isExactServiceRoleBearer(authHeader: string | null, serviceRoleKey: string): boolean {
  return Boolean(serviceRoleKey) && authHeader === `Bearer ${serviceRoleKey}`;
}

/**
 * Authorize a privileged connector run.
 * Internal service-role traffic is trusted. User traffic must authenticate and prove
 * membership in the connector's organization before any service-role side effects occur.
 */
export async function authorizeConnectorInvocation(input: {
  authHeader: string | null;
  serviceRoleKey: string;
  organizationId: string;
  userClient: ConnectorUserAuthClient | null;
  membershipClient: ConnectorMembershipClient;
}): Promise<ConnectorInvocationDecision> {
  if (isExactServiceRoleBearer(input.authHeader, input.serviceRoleKey)) {
    return { allowed: true, actor: "service_role", userId: null };
  }

  if (!input.authHeader || !input.userClient) {
    return { allowed: false, status: 401, reason: "unauthorized" };
  }

  const { data, error } = await input.userClient.auth.getUser();
  const user = error ? null : data.user;
  if (!user?.id) return { allowed: false, status: 401, reason: "unauthorized" };

  const membership = await input.membershipClient.rpc("is_org_member", {
    _user_id: user.id,
    _org_id: input.organizationId,
  });
  if (membership.error || membership.data !== true) {
    return { allowed: false, status: 403, reason: "forbidden" };
  }

  return { allowed: true, actor: "user", userId: user.id };
}
