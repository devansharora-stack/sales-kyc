"use client";

import ChatPanel from "./chat/ChatPanel";

export default function ProgressSidebar() {
  return (
    <aside
      className="border-r border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFF] dark:bg-slate-800/60 flex-shrink-0 flex flex-col w-[300px] sticky top-[56px] self-start"
      style={{ height: "calc(100vh - 56px)" }}
    >
      <ChatPanel />
    </aside>
  );
}
