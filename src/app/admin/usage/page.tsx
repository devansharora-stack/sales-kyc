import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import UsageDashboard from "./UsageDashboard";

export default async function AdminUsagePage() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) redirect("/");
  return <UsageDashboard />;
}
