"use client";

import { useState, useRef, useCallback } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  placeholder: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFF]">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="input-field flex-1 resize-none text-sm py-2.5 px-3"
          style={{ minHeight: "60px", maxHeight: "150px" }}
          rows={3}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="w-9 h-9 flex items-center justify-center shrink-0 rounded-lg bg-[#3289FF] hover:bg-[#1a6fe0] disabled:opacity-40 cursor-pointer transition-all mb-0.5"
          title="Send message"
        >
          <span className="text-white text-lg font-bold leading-none">&uarr;</span>
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 text-center">
        Shift + Enter for new line
      </p>
    </div>
  );
}
