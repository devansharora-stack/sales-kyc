import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, chatSessions } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { buildChatSystemPrompt, fetchCompanySalesBundle, fetchStakeholderBundle } from "@/lib/chat-context";

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

const LOOKUP_STAKEHOLDER_TOOL = {
  name: "lookup_stakeholder",
  description:
    "Retrieve the full deep-analysis profile for one or more people the user has deep-analyzed. Use this whenever the user asks about a specific person, wants to draft outreach to them, or needs to understand their priorities, pain points, or how to engage them. Pass the id identifiers listed in the deep-analyzed stakeholders section of your context.",
  input_schema: {
    type: "object",
    properties: {
      stakeholder_ids: {
        type: "array",
        items: { type: "string" },
        description: "id identifiers of the people to look up (from the deep-analyzed stakeholders list)",
      },
    },
    required: ["stakeholder_ids"],
  },
};

async function streamClaude(
  systemPrompt: string,
  messages: Array<{ role: string; content: string | unknown[] }>,
  tools?: object[],
  signal?: AbortSignal
): Promise<Response> {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT is not set");

  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("AZURE_AI_FOUNDRY_API_KEY is not set");

  const model = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
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
    signal,
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

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Resolve the project, but never error if it's missing/malformed — the chat
  // should still respond, just without project-specific context. (e.g. the
  // /projects/new page sends projectId "new", which isn't a valid UUID.)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let effectiveContext: typeof context = context;
  if (context.projectId) {
    let project: { id: string } | undefined;
    if (UUID_RE.test(context.projectId)) {
      [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, context.projectId), eq(projects.userId, user.id)))
        .limit(1);
    }
    if (!project) {
      effectiveContext = { type: "global" };
    }
  }

  let currentSessionId = sessionId;
  let messages: { role: string; content: string; timestamp: string }[] = [];

  if (currentSessionId) {
    const [existing] = await db
      .select({ messages: chatSessions.messages })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, currentSessionId), eq(chatSessions.userId, user.id)))
      .limit(1);
    if (existing) {
      messages = (existing.messages as typeof messages) || [];
    }
  } else {
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        projectId: effectiveContext.projectId || null,
        userId: user.id,
        companySlug: effectiveContext.companySlug || null,
        contextType: effectiveContext.type,
        title: message.slice(0, 100),
      })
      .returning({ id: chatSessions.id });
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

  const { prompt: systemPrompt, hasCompanyIndex, hasStakeholderIndex } = await buildChatSystemPrompt({
    ...effectiveContext,
    userId: user.id,
  });

  const toolList = [
    ...(hasCompanyIndex ? [LOOKUP_COMPANY_TOOL] : []),
    ...(hasStakeholderIndex ? [LOOKUP_STAKEHOLDER_TOOL] : []),
  ];
  const tools = toolList.length ? toolList : undefined;
  const apiMessages: Array<{ role: string; content: string | unknown[] }> =
    messages.map(({ role, content }) => ({ role, content }));

  let firstResponse: Response;
  try {
    firstResponse = await streamClaude(systemPrompt, apiMessages, tools, request.signal);
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
      let rounds = 5;
      let lastStopReason = "end_turn";

      try {
      while (rounds-- > 0) {
        if (request.signal.aborted) break;
        const result = await processClaudeStream(currentResponse, controller, encoder);
        fullResponse += result.text;
        lastStopReason = result.stopReason;

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
          } else if (tc.name === "lookup_stakeholder") {
            try {
              const input = JSON.parse(tc.input);
              const bundle = await fetchStakeholderBundle(
                user.id,
                input.stakeholder_ids || []
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: tc.id,
                content: bundle || "No deep-analysis data found for the requested people.",
              });
            } catch {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tc.id,
                content: "Error retrieving stakeholder data.",
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

        if (request.signal.aborted) break;
        // Final permitted round: skip the next fetch here — the post-loop call
        // below makes it without tools so the model must produce a real answer.
        if (rounds <= 0) break;
        try {
          currentResponse = await streamClaude(systemPrompt, apiMessages, tools, request.signal);
        } catch {
          lastStopReason = "end_turn";
          break;
        }
      }

      // Rounds exhausted while the model still wanted a tool → force one final
      // answer with tools disabled so it synthesizes text instead of ending blank.
      if (lastStopReason === "tool_use" && !request.signal.aborted) {
        try {
          const finalResp = await streamClaude(systemPrompt, apiMessages, undefined, request.signal);
          const finalResult = await processClaudeStream(finalResp, controller, encoder);
          fullResponse += finalResult.text;
        } catch {
          // keep whatever we have
        }
      }
      } catch {
        // client disconnect / stream error — persist what we have in finally
      } finally {
        if (fullResponse) {
          messages.push({
            role: "assistant",
            content: fullResponse,
            timestamp: new Date().toISOString(),
          });
        }
        // Persist on both normal completion and abort, so reload + "continue"
        // resume from exactly what the user saw.
        try {
          await db
            .update(chatSessions)
            .set({ messages, updatedAt: new Date() })
            .where(eq(chatSessions.id, currentSessionId));
        } catch {
          // best-effort
        }
        try {
          controller.close();
        } catch {
          // already closed (client disconnected)
        }
      }
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

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionId = searchParams.get("sessionId");
  if (sessionId) {
    const [data] = await db
      .select({ id: chatSessions.id, messages: chatSessions.messages })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)))
      .limit(1);
    if (!data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ messages: data.messages || [] });
  }

  const projectId = searchParams.get("projectId");
  const companySlug = searchParams.get("companySlug");

  const filters = [eq(chatSessions.userId, user.id)];
  filters.push(projectId ? eq(chatSessions.projectId, projectId) : isNull(chatSessions.projectId));
  if (companySlug) {
    filters.push(eq(chatSessions.companySlug, companySlug));
  }

  const sessions = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      context_type: chatSessions.contextType,
      company_slug: chatSessions.companySlug,
      updated_at: chatSessions.updatedAt,
      messages: chatSessions.messages,
    })
    .from(chatSessions)
    .where(and(...filters))
    .orderBy(desc(chatSessions.updatedAt));

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      context_type: s.context_type,
      company_slug: s.company_slug,
      updated_at: s.updated_at,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
    })),
  });
}
