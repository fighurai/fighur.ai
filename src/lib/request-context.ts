export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function userAgent(request: Request): string {
  return (request.headers.get("user-agent") || "unknown").slice(0, 512);
}
