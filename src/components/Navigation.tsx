"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export default function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav className="bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[rgba(50,137,255,0.08)] rounded-lg flex items-center justify-center">
              <span className="text-[#3289FF] font-bold text-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>KG</span>
            </div>
            <span className="hidden sm:inline">
              <span className="font-semibold text-[#3289FF]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>KYC</span>
              <span className="font-medium text-slate-600 ml-1.5">Genie</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {[
              { href: "/", label: "Dashboard" },
              { href: "/projects", label: "Projects" },
              { href: "/stakeholders", label: "Stakeholders" },
            ].map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[rgba(50,137,255,0.08)] text-[#3289FF] border border-[rgba(50,137,255,0.2)]"
                      : "text-slate-400 hover:text-[#3289FF] border border-transparent"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {session?.user && (
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-200">
                <span className="text-[10px] text-slate-400 hidden lg:inline">{session.user.email}</span>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
