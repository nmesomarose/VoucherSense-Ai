"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AlertIcon, CheckCircleIcon, LogOutIcon, ReceiptIcon, UploadIcon } from "./icons";

export function SiteHeader(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      router.replace("/");
    } finally {
      setSigningOut(false);
      setShowConfirm(false);
    }
  }

  const nav = [
    { href: "/upload", label: "Upload" },
    { href: "/jobs", label: "Jobs" },
  ];

  // Eagerly prefetch routes so clicking navigation is instant without lazy loading delays
  useEffect(() => {
    router.prefetch("/upload");
    router.prefetch("/jobs");
  }, [router]);

  return (
    <>
      <header className="vs-header">
        <div className="vs-header-inner">
          <Link href="/upload" prefetch={true} className="vs-brand" aria-label="VoucherSense Ai home">
            <BrandLogoIcon />
            <span className="vs-brand-text">VoucherSense Ai</span>
          </Link>

          <nav className="vs-nav vs-hide-sm" aria-label="Main navigation">
            {nav.map(({ href, label }) => {
              const active = href === "/upload" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={true}
                  className={active ? "vs-nav-link vs-nav-active" : "vs-nav-link"}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="vs-header-actions" style={{ position: "relative" }}>
            <button
              type="button"
              className="vs-avatar-btn"
              aria-label="User account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
              style={{ position: "relative" }}
            >
              <span className="vs-avatar-circle" style={{ position: "relative" }}>
                RO
                {/* Tiny green signal indicator showing user is online/logged in */}
                <span
                  style={{
                    position: "absolute",
                    bottom: -1,
                    right: -1,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22c55e",
                    border: "2px solid #ffffff",
                    boxShadow: "0 0 4px rgba(34, 197, 94, 0.7)",
                  }}
                  title="Online / Active"
                  aria-label="Online / Active"
                />
              </span>
              <span className="vs-hamburger-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </span>
            </button>

            {menuOpen ? (
              <div
                className="vs-menu-dropdown"
                role="menu"
                onClick={() => setMenuOpen(false)}
              >
                <div className="vs-menu-header">
                  <span className="vs-avatar-circle" style={{ width: 32, height: 32, fontSize: 13, position: "relative" }}>
                    RO
                  </span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--vs-foreground)" }}>User</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#16a34a", fontWeight: 600 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#22c55e",
                          boxShadow: "0 0 0 2px rgba(34,197,94,0.3)",
                          display: "inline-block",
                        }}
                      />
                      Active
                    </div>
                  </div>
                </div>
                <hr className="vs-divider" style={{ margin: "6px 0" }} />
                <Link
                  href="/jobs"
                  prefetch={true}
                  className="vs-menu-item"
                  role="menuitem"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}
                >
                  <CheckCircleIcon size={14} className="vs-icon-success" />
                  <span>Processed Receipts</span>
                </Link>
                <Link
                  href="/upload"
                  prefetch={true}
                  className="vs-menu-item"
                  role="menuitem"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <UploadIcon size={14} />
                  <span>Upload Receipts</span>
                </Link>
                <Link
                  href="/jobs"
                  prefetch={true}
                  className="vs-menu-item"
                  role="menuitem"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <ReceiptIcon size={14} />
                  <span>All Jobs & Queue</span>
                </Link>
                <hr className="vs-divider" style={{ margin: "6px 0" }} />
                <button
                  type="button"
                  className="vs-menu-item vs-menu-item-danger"
                  role="menuitem"
                  onClick={() => setShowConfirm(true)}
                >
                  <LogOutIcon size={14} />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {showConfirm ? (
        <div
          className="vs-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !signingOut) setShowConfirm(false);
          }}
        >
          <div className="vs-modal-card">
            <div className="vs-modal-icon-badge" aria-hidden="true">
              <AlertIcon size={24} />
            </div>
            <h3 id="signout-dialog-title" className="vs-modal-title">
              Sign out?
            </h3>
            <p className="vs-modal-desc">
              Are you sure you want to sign out? You will need to sign back in with your password to view your receipts and active jobs.
            </p>
            <div className="vs-modal-actions">
              <button
                type="button"
                className="vs-btn vs-btn-ghost"
                onClick={() => setShowConfirm(false)}
                disabled={signingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="vs-btn vs-btn-danger"
                onClick={() => void signOut()}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Yes, sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BrandLogoIcon(): React.JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ borderRadius: 6, flex: "none" }}>
      <rect width="64" height="64" rx="14" fill="#1e1b4b" />
      <path d="M10 14C10 12.9 10.9 12 12 12H28C29.1 12 30 12.9 30 14V48L26.6 46L23.3 48L20 46L16.6 48L13.3 46L10 48V14Z" fill="#ffffff" />
      <rect x="14" y="18" width="8" height="2.5" rx="1" fill="#94a3b8" />
      <rect x="14" y="24" width="12" height="2" rx="1" fill="#cbd5e1" />
      <rect x="14" y="30" width="10" height="2" rx="1" fill="#cbd5e1" />
      <rect x="14" y="38" width="6" height="2.5" rx="1" fill="#475569" />
      <rect x="22" y="38" width="4" height="2.5" rx="1" fill="#3b82f6" />
      <path d="M34 26L35.5 30.5L40 32L35.5 33.5L34 38L32.5 33.5L28 32L32.5 30.5Z" fill="#fbbf24" />
      <rect x="36" y="16" width="18" height="28" rx="3.5" fill="#0f172a" stroke="#818cf8" strokeWidth="1.5" />
      <circle cx="45" cy="23" r="3" fill="#10b981" />
      <rect x="39" y="32" width="3" height="8" rx="0.8" fill="#38bdf8" />
      <rect x="43.5" y="35" width="3" height="5" rx="0.8" fill="#818cf8" />
      <rect x="48" y="30" width="3" height="10" rx="0.8" fill="#10b981" />
    </svg>
  );
}