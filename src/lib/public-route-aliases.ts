export const PUBLIC_ROUTE_ALIASES = {
  "/contact": "/enterprise/contact",
  "/about": "/decision-intelligence-platforms",
  "/documentation": "/docs",
  "/deliberation": "/ai-boardroom",
  "/contradictions": "/executive/contradictions",
  "/admin/connectors/sap": "/admin/sap-connector",
} as const;

export type PublicRouteAlias = keyof typeof PUBLIC_ROUTE_ALIASES;
