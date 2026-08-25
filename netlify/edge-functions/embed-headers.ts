import type { Config, Context } from "@netlify/edge-functions";

const EMBED_FRAME_ANCESTORS = "frame-ancestors https:";

export default async (_request: Request, context: Context) => {
  const response = await context.next();
  const securedResponse = new Response(response.body, response);
  const currentCsp = securedResponse.headers.get("Content-Security-Policy") ?? "";
  const directives = currentCsp
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive && !directive.toLowerCase().startsWith("frame-ancestors"));

  directives.push(EMBED_FRAME_ANCESTORS);
  securedResponse.headers.set("Content-Security-Policy", directives.join("; "));
  securedResponse.headers.delete("X-Frame-Options");
  return securedResponse;
};

export const config: Config = {
  path: ["/embed", "/embed/*"],
  onError: "fail",
};
