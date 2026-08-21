export const PUBLIC_ROUTE_ALIASES = {
  "/contact": "/enterprise/contact",
  "/about": "/decision-intelligence-platforms",
} as const;

export type PublicRouteAlias = keyof typeof PUBLIC_ROUTE_ALIASES;
