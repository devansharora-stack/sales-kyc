"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ChatPanel from "./chat/ChatPanel";

const MIN_WIDTH = 300;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 350;
const STORAGE_KEY = "chat-sidebar-width";

export default function ChatSidebar({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) setWidth(parsed);
    }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      localStorage.setItem(STORAGE_KEY, String(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))));
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [width]);

  return (
    <div className="flex" style={{ height: "calc(100vh - 56px)" }}>
      {/* Chat panel */}
      <div
        className="bg-[#F8FAFF] border-r border-[#E2E8F0] flex flex-col shrink-0"
        style={{ width }}
      >
        <ChatPanel />
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1.5 shrink-0 cursor-col-resize hover:bg-[#3289FF]/20 active:bg-[#3289FF]/30 transition-colors"
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {children}
      </div>
    </div>
  );
}
