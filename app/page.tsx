import { redirect } from "next/navigation";
import { config } from "@/config";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { AuthForm } from "./_components/AuthForm";

export const runtime = "nodejs";

export default async function LandingPage(): Promise<React.JSX.Element> {
  const userId = await getCurrentUserId();
  if (userId) {
    redirect("/upload");
  }

  return (
    <main className="vs-signin-wrap">
      <div className="vs-card vs-stack vs-signin-card">
        <div className="vs-signin-brand">
          <span className="vs-brand-mark vs-brand-mark-lg">
            <ReceiptGlyph />
          </span>
          <h1 className="vs-signin-title">VoucherSense Ai</h1>
        </div>
        <p className="vs-signin-hint">
          Sign in or create an account to upload and process your receipts.
        </p>
        <hr className="vs-divider" />
        <AuthForm minPasswordLength={config.auth.minPasswordLength} />
        <p className="vs-footnote">
          Accounts keep your receipts and extracted results private to you.
        </p>
      </div>
    </main>
  );
}

function ReceiptGlyph(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3L21 21V3l-2 1.3L17 3l-2 1.3L13 3l-2 1.3L9 3 7 4.3 5 3Z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}