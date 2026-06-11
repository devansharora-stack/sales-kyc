import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { buildChatSystemPrompt } from "@/lib/chat-context";

async function streamClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<Response> {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT is not set");

  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("AZURE_AI_FOUNDRY_API_KEY is not set");

  const model = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";

  const response = await fetch(endpoint + "/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  return response;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message, sessionId, context } = body;

  if (!message || !context?.projectId || !context?.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (context.type === "company" && !context.companySlug) {
    return NextResponse.json(
      { error: "companySlug required for company context" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", context.projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let currentSessionId = sessionId;
  let messages: { role: string; content: string; timestamp: string }[] = [];

  if (currentSessionId) {
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("messages")
      .eq("id", currentSessionId)
      .eq("user_id", user.id)
      .single();
    if (existing) {
      messages = existing.messages || [];
    }
  } else {
    const { data: newSession } = await supabase
      .from("chat_sessions")
      .insert({
        project_id: context.projectId,
        user_id: user.id,
        company_slug: context.companySlug || null,
        context_type: context.type,
        title: message.slice(0, 100),
      })
      .select("id")
      .single();
    if (!newSession) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }
    currentSessionId = newSession.id;
  }

  messages.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  const systemPrompt = await buildChatSystemPrompt(context);
  const conversationMessages = messages.map(({ role, content }) => ({ role, content }));

  let claudeResponse: Response;
  try {
    claudeResponse = await streamClaude(systemPrompt, conversationMessages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Streaming failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let fullResponse = "";
  let lineBuffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: session\ndata: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`
        )
      );

      const reader = claudeResponse.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          controller.enqueue(value);

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                fullResponse += parsed.delta.text;
              }
            } catch {}
          }
        }
      } finally {
        reader.releaseLock();
      }

      messages.push({
        role: "assistant",
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });

      await supabase
        .from("chat_sessions")
        .update({
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentSessionId);

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  let query = supabase
    .from("chat_sessions")
    .select("id, title, context_type, company_slug, updated_at, messages")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const companySlug = searchParams.get("companySlug");
  if (companySlug) {
    query = query.eq("company_slug", companySlug);
  }

  const { data: sessions } = await query;

  return NextResponse.json({
    sessions: (sessions || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      context_type: s.context_type,
      company_slug: s.company_slug,
      updated_at: s.updated_at,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
    })),
  });
}
