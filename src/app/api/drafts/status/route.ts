import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../../../convex/_generated/api";

type Assignee = "me" | "alex" | "sam" | "lyra" | "nova" | "ops" | "agent";

const ASSIGNEE_WORKSPACES: Record<"alex" | "sam" | "lyra" | "nova" | "ops", string> = {
  alex: "/home/ubuntu/.openclaw/workspace",
  sam: "/home/ubuntu/.openclaw/workspace-sam",
  lyra: "/home/ubuntu/.openclaw/workspace-lyra",
  nova: "/home/ubuntu/.openclaw/workspace-nova",
  ops: "/home/ubuntu/.openclaw/workspace-ops",
};

function requiresDraft(assignee: Assignee): assignee is keyof typeof ASSIGNEE_WORKSPACES {
  return assignee === "alex" || assignee === "sam" || assignee === "lyra" || assignee === "nova" || assignee === "ops";
}

function validateDraftContent(raw: string): { ok: boolean; reason?: string } {
  const normalized = raw.toLowerCase();
  const requiredSections = ["objective", "plan", "validation", "deploy"];
  const missingSection = requiredSections.find((section) => !normalized.includes(section));
  if (missingSection) return { ok: false, reason: `missing_section:${missingSection}` };

  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  if (words < 80) return { ok: false, reason: "too_short" };

  return { ok: true };
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_CONVEX_URL is not set" }, { status: 500 });
    }

    const client = new ConvexHttpClient(url);
    const tasks = await client.query(api.tasks.list, {});
    const activeTasks = tasks.filter((task) => task.status === "backlog" || task.status === "in_progress");

    const items = await Promise.all(
      activeTasks.map(async (task) => {
        if (!requiresDraft(task.assigned_to)) {
          return {
            id: String(task._id),
            assignee: task.assigned_to,
            status: "ok" as const,
            reason: "not_required",
            draftPath: null as string | null,
          };
        }

        const draftPath = `${ASSIGNEE_WORKSPACES[task.assigned_to]}/autonomy/drafts/${String(task._id)}.md`;
        try {
          const content = await readFile(draftPath, "utf8");
          const validation = validateDraftContent(content);
          return {
            id: String(task._id),
            assignee: task.assigned_to,
            status: validation.ok ? ("ok" as const) : ("missing" as const),
            reason: validation.ok ? null : validation.reason,
            draftPath,
          };
        } catch {
          return {
            id: String(task._id),
            assignee: task.assigned_to,
            status: "missing" as const,
            reason: "missing_file",
            draftPath,
          };
        }
      })
    );

    return NextResponse.json(
      { ok: true, generatedAt: new Date().toISOString(), items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
