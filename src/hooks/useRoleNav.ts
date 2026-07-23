/**
 * useRoleNav
 *
 * Returns the set of top-level sidebar paths visible to the current user
 * based on their org role.
 *
 * UX-1 — Executive IA collapse:
 *   Dashboard · Decisions · Operations · Reports · Governance · Settings
 *
 * Power-user routes live in the "Advanced" drawer (gated separately in
 * DashboardSidebar by role).
 */

export type OrgRole =
  | "owner"
  | "admin"
  | "executive"
  | "analyst"
  | "viewer"
  | "steward"
  | null
  | undefined;

/** Executive sidebar paths (UX-1) */
const ALL_PATHS = new Set([
  "/dashboard",
  "/decisions",
  "/outcomes",
  "/reports",
  "/governance",
  "/settings",
]);

const ROLE_PATHS: Record<NonNullable<Exclude<OrgRole, null | undefined>>, Set<string>> = {
  owner: ALL_PATHS,
  admin: ALL_PATHS,
  executive: ALL_PATHS,
  analyst: ALL_PATHS,
  steward: ALL_PATHS,
  viewer: new Set([
    "/dashboard",
    "/decisions",
    "/outcomes",
    "/reports",
    "/governance",
    "/settings",
  ]),
};

export function getAllowedPaths(role: OrgRole): Set<string> {
  if (!role) return ALL_PATHS;
  return ROLE_PATHS[role] ?? ALL_PATHS;
}

export function useRoleNav(orgRole: OrgRole): Set<string> {
  return getAllowedPaths(orgRole);
}
