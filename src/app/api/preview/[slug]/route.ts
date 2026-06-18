import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const filePath = join(process.cwd(), "test-output", `${slug}.json`);

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: `No profile found for "${slug}". Run: npx tsx test-full-pipeline.ts "Company Name"` },
      { status: 404 }
    );
  }

  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
