"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatSessionMeta {
  id: string;
  title: string;
  context_type: string;
  company_slug: string | null;
  updated_at: string;
  messageCount: number;
}

interface ChatContext {
  type: "company" | "project" | "global";
  projectId?: string;
  companySlug?: string;
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function detectContext(pathname: string | null): ChatContext {
  if (!pathname) return { type: "global" };
  const companyMatch = pathname.match(/\/projects\/([^/]+)\/company\/([^/]+)/);
  if (companyMatch) {
    return { type: "company", projectId: companyMatch[1], companySlug: companyMatch[2] };
  }
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  if (projectMatch) {
    return { type: "project", projectId: projectMatch[1] };
  }
  return { type: "global" };
}

export default function ChatPanel() {
  const pathname = usePathname();
  const context = detectContext(pathname);

  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextKeyRef = useRef<string>("");

  const contextKey = context.projectId
    ? `${context.projectId}:${context.companySlug || ""}`
    : "global";

  useEffect(() => {
    if (contextKey === contextKeyRef.current) return;
    contextKeyRef.current = contextKey;

    abortRef.current?.abort();
    setMessages([]);
    setActiveSessionId(null);
    setSessions([]);
    setIsStreaming(false);
    setStreamingText("");
    setError(null);
    setShowHistory(false);
  }, [contextKey]);

  const fetchSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (context.projectId) params.set("projectId", context.projectId);
      if (context.companySlug) params.set("companySlug", context.companySlug);
      const res = await fetch(`/api/chat?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // non-critical
    }
  }, [context.projectId, context.companySlug]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function loadSession(sessionId: string) {
    try {
      const res = await fetch(`/api/chat?sessionId=${sessionId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      if (Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((m: { role: string; content: string; timestamp: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          }))
        );
      }
      setActiveSessionId(sessionId);
      setShowHistory(false);
      setError(null);
    } catch {
      setError("Failed to load conversation.");
    }
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setMessages([]);
    setActiveSessionId(null);
    setIsStreaming(false);
    setStreamingText("");
    setError(null);
    setShowHistory(false);
  }

  async function sendMessage(text: string) {
    if (isStreaming) return;
    setError(null);
    setShowHistory(false);

    const userMsg: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId,
          context,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let lineBuffer = "";

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
            if (parsed.sessionId) {
              setActiveSessionId(parsed.sessionId);
              continue;
            }
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullResponse += parsed.delta.text;
              setStreamingText(fullResponse);
            }
          } catch {
            // Ignore unparseable SSE lines
          }
        }
      }

      if (fullResponse) {
        const assistantMsg: Message = {
          role: "assistant",
          content: fullResponse,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      setStreamingText("");
      fetchSessions();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsStreaming(false);
    }
  }

  const placeholder = context.companySlug
    ? `Ask about ${slugToName(context.companySlug)}...`
    : context.type === "project"
      ? "Ask about your companies..."
      : "Ask about solutions, companies, or research...";

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#3289FF] flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">KYC Genie</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="px-2 py-1 rounded text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-[#3289FF] hover:bg-[rgba(50,137,255,0.08)] transition-colors cursor-pointer"
              title="New conversation"
            >
              + New
            </button>
          )}
          <button
            onClick={() => { setShowHistory(!showHistory); fetchSessions(); }}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
              showHistory ? "bg-[rgba(50,137,255,0.1)] text-[#3289FF]" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title="Conversation history"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 max-h-[40%] overflow-y-auto">
          <div className="p-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono mb-2">
              Past conversations
            </p>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No past conversations yet.</p>
            ) : (
              <div className="space-y-0.5">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer group ${
                      activeSessionId === s.id
                        ? "bg-[rgba(50,137,255,0.08)] border border-[#3289FF]/20"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <p className={`text-xs truncate ${
                      activeSessionId === s.id ? "text-[#3289FF] font-medium" : "text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100"
                    }`}>
                      {s.title || "Untitled"}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {s.messageCount} messages
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {messages.length === 0 && !streamingText ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">
              {context.companySlug
                ? `Ask about ${slugToName(context.companySlug)}`
                : context.type === "project"
                  ? "Ask about your companies"
                  : "How can I help you?"}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              AI assistant with access to your research data
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage
                key={`${i}-${msg.timestamp}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ))}
            {isStreaming && streamingText && (
              <ChatMessage
                role="assistant"
                content={streamingText}
                timestamp={new Date().toISOString()}
                isStreaming
              />
            )}
            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-500 dark:text-red-300">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-[10px] text-red-400 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 mt-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input — pinned to bottom */}
      <div className="shrink-0">
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
