export function GET() {
  return Response.json(
    { ok: true, service: "break-my-agent-web" },
    { headers: { "cache-control": "no-store" } },
  );
}
