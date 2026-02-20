import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

type Assignee = "me" | "alex" | "sam" | "lyra" | "agent";
type Status = "suggested" | "backlog" | "in_progress" | "done";

function normalizeAssignee(value: unknown): Assignee {
  const v = String(value ?? "sam").toLowerCase();
  if (v === "alex" || v === "sam" || v === "lyra" || v === "me" || v === "agent") return v;
  return "sam";
}

function normalizeStatus(value: unknown): Status {
  const v = String(value ?? "suggested").toLowerCase();
  if (v === "suggested" || v === "backlog" || v === "in_progress" || v === "done") return v;
  return "suggested";
}

function threeHourWindowIso(): string {
  const d = new Date();
  const h = d.getUTCHours();
  const bucket = Math.floor(h / 3) * 3;
  const windowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), bucket, 0, 0));
  return windowStart.toISOString();
}

function buildIdempotencyKey(title: string, assignedTo: Assignee, intentWindow: string): string {
  const payload = `${title.trim().toLowerCase()}|${assignedTo}|${intentWindow}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
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

    const intent_window = String(body?.intent_window ?? body?.intentWindow ?? threeHourWindowIso());
    const idempotency_key = String(
      body?.idempotency_key ?? body?.idempotencyKey ?? buildIdempotencyKey(title, assigned_to, intent_window)
    );

    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_CONVEX_URL is not set" }, { status: 500 });
    }

    const client = new ConvexHttpClient(url);
    // Best-effort idempotency without schema migration: dedupe within same intent window by title+assignee
    const existing = await client.query(api.tasks.list, {});
    const duplicate = existing.find((t) => {
      const created = Date.parse(t.created_at);
      const windowStart = Date.parse(intent_window);
      const inWindow = Number.isFinite(created) && Number.isFinite(windowStart) ? created >= windowStart : false;
      return (
        t.title.trim().toLowerCase() === title.trim().toLowerCase() &&
        t.assigned_to === assigned_to &&
        (t.status === "suggested" || t.status === "backlog") &&
        inWindow
      );
    });

    const id = duplicate
      ? duplicate._id
      : await client.mutation(api.tasks.create, {
          title,
          description,
          assigned_to,
          status,
        });

    return NextResponse.json({ ok: true, id, status, assigned_to, idempotency_key, intent_window, workflow_contract_version: "v2", deduped: Boolean(duplicate) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
