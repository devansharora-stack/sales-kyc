"use client";

import { usePathname } from "next/navigation";
import Navigation from "./Navigation";
import ChatSidebar from "./ChatSidebar";
import ActivityProvider from "./ActivityProvider";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <ActivityProvider>
      <Navigation />
      <ChatSidebar>
        <main className="flex-1 max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
          {children}
        </main>
      </ChatSidebar>
    </ActivityProvider>
  );
}
