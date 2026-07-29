// Answering an attention item. The ONE endpoint behind both surfaces, because
// the toast and the WAITING FOR YOU card render the same component against it.
//
// Two shapes, one guard:
//   { id, answer }        a question or a notice. The answer row is appended.
//   { id, handled: true } a review ask. The same closing row, with no text.
//
// The route is deliberately thin. Validation of the SHAPE happens here (that is
// the HTTP layer's job) and validation of the FACTS happens in the lib, which
// owns the append-only rule, the open-item guard and the ledger row. A refusal
// comes back with the reason so the surface can render it instead of a shrug:
// answering something a second tab already answered is a normal thing to do,
// and "it was answered somewhere else" is a useful sentence.
import { NextResponse } from "next/server";
import { answerItem, resolveItem } from "@/lib/attention";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // falls through to the refusal below, which names what was expected
  }
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const id = typeof raw["id"] === "string" ? raw["id"] : "";
  if (id.length === 0) {
    return NextResponse.json(
      { ok: false, message: "expected { id, answer } or { id, handled: true }" },
      { status: 400 },
    );
  }

  const result = raw["handled"] === true
    ? await resolveItem(id)
    : await answerItem(id, typeof raw["answer"] === "string" ? raw["answer"] : "");

  // A refusal that never reached the ledger is a 4xx: nothing happened, and the
  // caller can act on that. A failure WITH a ledger row is a real attempt that
  // did not work, so it is 200 with ok:false and the row is there to inspect.
  return NextResponse.json(result, { status: result.ledgerId === null ? 409 : 200 });
}
