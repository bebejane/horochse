// Shared guard for Vercel Cron routes. Vercel sends the Authorization header;
// `?secret=` is allowed for local curl.

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const query = new URL(request.url).searchParams.get("secret");
  return query === secret;
}
