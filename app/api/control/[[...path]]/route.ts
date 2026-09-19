import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const controllerUrl = process.env.CONTROLLER_URL ?? "http://127.0.0.1:3100";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const target = new URL(path.map(encodeURIComponent).join("/"), `${controllerUrl}/`);
  target.search = request.nextUrl.search;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: body ? { "content-type": request.headers.get("content-type") ?? "application/json" } : undefined,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Controller unavailable: ${error.message}`
            : "Controller unavailable.",
      },
      { status: 503 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
