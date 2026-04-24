"use client";

import { usePathname } from "next/navigation";
import Navigation from "./Navigation";
import ProgressSidebar from "./ProgressSidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Navigation />
      <div className="flex">
        <ProgressSidebar />
        <main className="flex-1 max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
          {children}
        </main>
      </div>
    </>
  );
}
