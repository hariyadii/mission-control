import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const workspaceDir = "/home/ubuntu/.openclaw/workspace";
  const memoryDir = path.join(workspaceDir, "memory");

  let longTerm = { name: "MEMORY.md", content: "" };
  try {
    longTerm.content = fs.readFileSync(path.join(workspaceDir, "MEMORY.md"), "utf-8");
  } catch {}

  let daily: { name: string; content: string; date: string }[] = [];
  try {
    const files = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith(".md"))
      .sort()
      .reverse();
    daily = files.map(f => ({
      name: f,
      date: f.replace(".md", ""),
      content: fs.readFileSync(path.join(memoryDir, f), "utf-8"),
    }));
  } catch {}

  if (q) {
    const lq = q.toLowerCase();
    daily = daily.filter(d => d.content.toLowerCase().includes(lq) || d.name.toLowerCase().includes(lq));
    if (!longTerm.content.toLowerCase().includes(lq)) longTerm = { name: "MEMORY.md", content: "" };
  }

  return NextResponse.json({ longTerm, daily });
}
