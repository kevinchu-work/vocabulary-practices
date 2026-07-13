// Single-user auth for Phase 1: a static bearer token shared by the Mac app and
// the practice page. Not real auth — sufficient for a single-user PoC only.
export function checkAuth(request: Request, token: string): boolean {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/);
  return match !== null && match[1] === token;
}
