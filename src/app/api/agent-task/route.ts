import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { NextResponse } from "next/server";

type Assignee = "me" | "alex" | "sam" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "done";

function normalizeAssignee(value: unknown): Assignee {
  const v = String(value ?? "sam").toLowerCase();
  if (v === "alex" || v === "sam" || v === "me" || v === "agent") return v;
  return "sam";
}

function normalizeStatus(value: unknown): Status {
  const v = String(value ?? "suggested").toLowerCase();
  if (v === "suggested" || v === "backlog" || v === "in_progress" || v === "done") return v;
  return "suggested";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const title = String(body?.title ?? body?.task ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }

    const description = String(body?.description ?? "").trim() || undefined;
    const assigned_to = normalizeAssignee(body?.assigned_to ?? body?.agentName ?? "sam");
    const status = normalizeStatus(body?.status ?? "suggested");

    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_CONVEX_URL is not set" }, { status: 500 });
    }

    const client = new ConvexHttpClient(url);
    const id = await client.mutation(api.tasks.create, {
      title,
      description,
      assigned_to,
      status,
    });

    return NextResponse.json({ ok: true, id, status, assigned_to });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
