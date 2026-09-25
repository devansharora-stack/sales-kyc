import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// This route is intentionally outside the auth gate, so the slug must never be
// allowed to escape the fixtures dir. Restrict to a safe slug charset AND verify
// the resolved path stays inside test-output/ (defence in depth against path
// traversal such as "..%2f..%2ftmp%2fgcp-key" reading the SA key off /tmp).
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const baseDir = resolve(process.cwd(), "test-output");
  const filePath = resolve(baseDir, `${slug}.json`);
  if (filePath !== join(baseDir, `${slug}.json`) || !filePath.startsWith(baseDir + "/")) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `No profile found for "${slug}". Run: npx tsx test-full-pipeline.ts "Company Name"` },
      { status: 404 }
    );
  }

  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
