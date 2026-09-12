import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { SiteHeader } from "../_components/SiteHeader";
import { JobsScreen } from "../_components/JobsScreen";

export const runtime = "nodejs";

export default async function JobsPage(): Promise<React.JSX.Element> {
  if (!(await getCurrentUserId())) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader />
      <main className="vs-shell">
        <JobsScreen />
      </main>
    </>
  );
}