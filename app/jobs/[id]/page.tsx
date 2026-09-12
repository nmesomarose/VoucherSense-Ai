import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { SiteHeader } from "../../_components/SiteHeader";
import { JobDetailScreen } from "../../_components/JobDetailScreen";

export const runtime = "nodejs";

export default async function JobDetailPage(): Promise<React.JSX.Element> {
  if (!(await getCurrentUserId())) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader />
      <main className="vs-shell vs-shell-wide">
        <JobDetailScreen />
      </main>
    </>
  );
}