// Quiet hours. GET reads the live state, POST routes to the two ledgered verbs.
//
//   { manual: boolean }  the sticky toggle. Only a manual flip clears it.
//   { start, end }       the schedule, 24 hour local times.
//
// Every response carries the fresh state, because this is the one piece of hub
// state where the UI control and the truth can disagree for a moment: the
// snapshot arrives on a 1.5 second tick, and a toggle that snaps back for one
// tick reads as a broken switch.
import { NextResponse } from "next/server";
import { quietState, setQuietHours, setQuietManual } from "@/lib/attention";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(quietState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // falls through to the refusal below
  }
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  if (typeof raw["manual"] === "boolean") {
    return NextResponse.json(await setQuietManual(raw["manual"]));
  }
  if (typeof raw["start"] === "string" && typeof raw["end"] === "string") {
    const result = await setQuietHours(raw["start"], raw["end"]);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json(
    {
      ok: false,
      message: 'expected { manual: true|false } or { start, end } as 24 hour times like "22:00"',
      quiet: quietState(),
    },
    { status: 400 },
  );
}
