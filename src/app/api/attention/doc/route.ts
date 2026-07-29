// Reading a file an attention item points at, so it opens IN the hub.
//
// An item can carry two file references, and this one endpoint serves both:
//   { id, which: "link" }    the thing the item is about. A note, a diff, a log.
//   { id, which: "prompt" }  a ready-to-paste prompt. The surface renders a copy
//                            button, which is the whole point of the field: when
//                            this fires, hand me the exact thing to run.
//
// THE BROWSER NEVER NAMES A PATH. It names an ITEM, and the lib resolves the
// path from the feed. So this endpoint cannot be walked into reading anything
// the feed was not already pointing at, which is a stronger property than any
// prefix check and needs no configuration to be correct.
import { NextResponse } from "next/server";
import { readAttachment } from "@/lib/attention";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // falls through to the refusal below
  }
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const id = typeof raw["id"] === "string" ? raw["id"] : "";
  const which = raw["which"] === "prompt" ? "prompt" : "link";
  if (id.length === 0) {
    return NextResponse.json({ ok: false, message: 'expected { id, which: "link" | "prompt" }' }, { status: 400 });
  }
  const result = readAttachment(id, which);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
