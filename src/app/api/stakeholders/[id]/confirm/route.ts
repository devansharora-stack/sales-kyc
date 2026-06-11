import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";

const LINKEDIN_IN_RE = /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;

// Accept a user-pasted LinkedIn URL for a `needs_confirmation` stakeholder,
// mark it confirmed, and re-trigger the pipeline.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const url = typeof body.linkedinUrl === "string" ? body.linkedinUrl.trim() : "";

  const match = url.match(LINKEDIN_IN_RE);
  if (!match) {
    return NextResponse.json({ error: "Please provide a valid linkedin.com/in/ profile URL." }, { status: 400 });
  }
  const cleanUrl = match[0].replace(/\/$/, "");

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [row] = await db
    .update(stakeholderProfiles)
    .set({
      linkedinUrl: cleanUrl,
      urlConfidence: "confirmed",
      status: "queued",
      progress: 0,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)))
    .returning();

  if (!row) return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });

  await inngest.send({ name: "research/stakeholder.start", data: { stakeholderId: row.id } });

  return NextResponse.json({ success: true });
}
