import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { config } from "@/config";
import { SiteHeader } from "../_components/SiteHeader";
import { UploadScreen } from "../_components/UploadScreen";

export const runtime = "nodejs";

export default async function UploadPage(): Promise<React.JSX.Element> {
  if (!(await getCurrentUserId())) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader />
      <main className="vs-shell">

        <UploadScreen
          allowedMimeTypes={config.uploads.allowedMimeTypes}
          maxSizeBytes={config.uploads.maxSizeBytes}
          maxFilesPerBatch={config.uploads.maxFilesPerBatch}
        />
      </main>
    </>
  );
}
