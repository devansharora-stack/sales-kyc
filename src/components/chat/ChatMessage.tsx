"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export default function ChatMessage({ role, content, timestamp, isStreaming }: ChatMessageProps) {
  const [showTime, setShowTime] = useState(false);
  const isUser = role === "user";

  const formattedTime = (() => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  })();

  return (
    <div
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"} animate-fade-in`}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser
          ? "bg-slate-600"
          : "bg-[#3289FF]"
      }`}>
        {isUser ? (
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
        ) : (
          <span className="text-white text-[10px] font-bold">KG</span>
        )}
      </div>

      {/* Message content */}
      <div className={isUser ? "max-w-[80%]" : "max-w-full flex-1 min-w-0"}>
        <div
          className={
            isUser
              ? "bg-[#3289FF] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed"
              : "bg-[#F0F4FA] text-slate-700 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed"
          }
        >
          {isUser ? (
            <span className="whitespace-pre-wrap break-words">{content}</span>
          ) : (
            <div className="chat-markdown break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-[#3289FF] ml-0.5 align-middle animate-pulse-dot rounded-sm" />
              )}
            </div>
          )}
        </div>
        {showTime && formattedTime && (
          <p className={`text-[10px] text-slate-400 font-mono mt-1 ${isUser ? "text-right mr-1" : "ml-1"}`}>
            {formattedTime}
          </p>
        )}
      </div>
    </div>
  );
}
