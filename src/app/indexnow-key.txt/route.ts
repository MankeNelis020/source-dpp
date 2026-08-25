import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return new NextResponse("INDEXNOW_KEY is not configured", { status: 404 });
  }
  return new NextResponse(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
