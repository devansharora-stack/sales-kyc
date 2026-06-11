import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { buildChatSystemPrompt, fetchCompanySalesBundle } from "@/lib/chat-context";

const LOOKUP_COMPANY_TOOL = {
  name: "lookup_company",
  description:
    "Retrieve the full sales intelligence bundle for one or more researched companies. Use this whenever the user asks about a specific company, wants comparisons, stakeholder info, pain points, solution mappings, GTM strategy, or any company-specific data. Pass the slug identifiers listed in the researched companies section of your context.",
  input_schema: {
    type: "object",
    properties: {
      company_slugs: {
        type: "array",
        items: { type: "string" },
        description:
          "Slug identifiers of companies to look up (e.g. ['nike', 'starbucks'])",
      },
    },
    required: ["company_slugs"],
  },
};

async function streamClaude(
  systemPrompt: string,
  messages: Array<{ role: string; content: string | unknown[] }>,
  tools?: object[]
): Promise<Response> {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT is not set");

  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("AZURE_AI_FOUNDRY_API_KEY is not set");

  const model = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    system: systemPrompt,
    messages,
  };

  if (tools?.length) {
    body.tools = tools;
  }

  const response = await fetch(endpoint + "/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  return response;
}

interface ToolCall {
  id: string;
  name: string;
  input: string;
}

interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
}

async function processClaudeStream(
  response: Response,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<StreamResult> {
  const decoder = new TextDecoder();
  let fullText = "";
  let lineBuffer = "";
  let stopReason = "end_turn";

  const toolCalls: ToolCall[] = [];
  let currentBlockType: string | null = null;
  let currentToolCall: ToolCall | null = null;

  const reader = response.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === "content_block_start") {
            if (parsed.content_block?.type === "tool_use") {
              currentBlockType = "tool_use";
              currentToolCall = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                input: "",
              };
            } else {
              currentBlockType = "text";
            }
          } else if (parsed.type === "content_block_delta") {
            if (currentBlockType === "text" && parsed.delta?.text) {
              fullText += parsed.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`)
              );
            } else if (
              currentBlockType === "tool_use" &&
              parsed.delta?.partial_json &&
              currentToolCall
            ) {
              currentToolCall.input += parsed.delta.partial_json;
            }
          } else if (parsed.type === "content_block_stop") {
            if (currentBlockType === "tool_use" && currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            currentBlockType = null;
          } else if (parsed.type === "message_delta") {
            if (parsed.delta?.stop_reason) {
              stopReason = parsed.delta.stop_reason;
            }
          }
        } catch {
          // skip unparseable SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, toolCalls, stopReason };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message, sessionId, context } = body;

  if (!message || !context?.type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (context.type === "company" && (!context.companySlug || !context.projectId)) {
    return NextResponse.json(
      { error: "companySlug and projectId required for company context" },
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

  if (context.projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", context.projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
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
        project_id: context.projectId || null,
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

  const { prompt: systemPrompt, hasCompanyIndex } = await buildChatSystemPrompt({
    ...context,
    userId: user.id,
  });

  const tools = hasCompanyIndex ? [LOOKUP_COMPANY_TOOL] : undefined;
  const apiMessages: Array<{ role: string; content: string | unknown[] }> =
    messages.map(({ role, content }) => ({ role, content }));

  let firstResponse: Response;
  try {
    firstResponse = await streamClaude(systemPrompt, apiMessages, tools);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Streaming failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: session\ndata: ${JSON.stringify({ sessionId: currentSessionId })}\n\n`
        )
      );

      let fullResponse = "";
      let currentResponse = firstResponse;
      let rounds = 3;

      while (rounds-- > 0) {
        const result = await processClaudeStream(currentResponse, controller, encoder);
        fullResponse += result.text;

        if (result.stopReason !== "tool_use" || result.toolCalls.length === 0) {
          break;
        }

        const assistantContent: unknown[] = [];
        if (result.text) {
          assistantContent.push({ type: "text", text: result.text });
        }
        for (const tc of result.toolCalls) {
          try {
            assistantContent.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: JSON.parse(tc.input),
            });
          } catch {
            assistantContent.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: {},
            });
          }
        }
        apiMessages.push({ role: "assistant", content: assistantContent });

        const toolResults: unknown[] = [];
        for (const tc of result.toolCalls) {
          if (tc.name === "lookup_company") {
            try {
              const input = JSON.parse(tc.input);
              const bundle = await fetchCompanySalesBundle(
                supabase,
                user.id,
                input.company_slugs || []
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: tc.id,
                content: bundle || "No data found for the requested companies.",
              });
            } catch {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tc.id,
                content: "Error retrieving company data.",
                is_error: true,
              });
            }
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tc.id,
              content: "Unknown tool.",
              is_error: true,
            });
          }
        }
        apiMessages.push({ role: "user", content: toolResults });

        try {
          currentResponse = await streamClaude(systemPrompt, apiMessages, tools);
        } catch {
          break;
        }
      }

      if (fullResponse) {
        messages.push({
          role: "assistant",
          content: fullResponse,
          timestamp: new Date().toISOString(),
        });
      }

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
  const supabase = createServerClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionId = searchParams.get("sessionId");
  if (sessionId) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, messages")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();
    if (!data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ messages: data.messages || [] });
  }

  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("chat_sessions")
    .select("id, title, context_type, company_slug, updated_at, messages")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  } else {
    query = query.is("project_id", null);
  }

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
