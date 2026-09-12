"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  DocumentIcon,
  ReceiptIcon,
  SpinnerIcon,
  UploadIcon,
  XCircleIcon,
} from "./icons";

interface UploadLimits {
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
  maxFilesPerBatch: number;
}

interface RejectedFile {
  id: number;
  name: string;
  reason: string;
}

interface UploadOutcome {
  filename: string;
  status: "queued" | "rejected";
  errorCode?: string;
  message?: string;
}

interface BatchResponse {
  batchId: string;
  accepted: number;
  rejected: number;
  uploads: UploadOutcome[];
  jobs: Array<{ id: string; receiptId: string; status: string }>;
}

const MIME_LABEL: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/pdf": "PDF",
};

let rejectedCounter = 0;

export function UploadScreen({ allowedMimeTypes, maxSizeBytes, maxFilesPerBatch }: UploadLimits): React.JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResponse | null>(null);

  function addFiles(incoming: FileList | null): void {
    if (!incoming) return;
    setResult(null);
    setError(null);
    setRejected([]);

    const next: File[] = [...files];
    const rejects: RejectedFile[] = [];

    for (const file of Array.from(incoming)) {
      const duplicate = next.some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
      );
      if (duplicate) continue;

      if (next.length >= maxFilesPerBatch) {
        rejects.push({
          id: rejectedCounter++,
          name: file.name,
          reason: `A batch accepts up to ${maxFilesPerBatch} files.`,
        });
        continue;
      }

      const type = file.type.toLowerCase();
      if (type !== "" && !allowedMimeTypes.includes(type)) {
        rejects.push({
          id: rejectedCounter++,
          name: file.name,
          reason: "Unsupported format — only JPG, PNG and PDF are accepted.",
        });
        continue;
      }

      if (file.size > maxSizeBytes) {
        rejects.push({
          id: rejectedCounter++,
          name: file.name,
          reason: `Larger than the ${formatMegabytes(maxSizeBytes)} MB limit.`,
        });
        continue;
      }

      if (file.size === 0) {
        rejects.push({ id: rejectedCounter++, name: file.name, reason: "The file is empty." });
        continue;
      }

      next.push(file);
    }

    setFiles(next);
    if (rejects.length > 0) setRejected(rejects);
  }

  function removeFile(index: number): void {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function upload(): Promise<void> {
    if (files.length === 0) {
      setError("Select at least one receipt first.");
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    for (const file of files) form.append("files", file);

    try {
      const res = await fetch("/api/receipts/batch", { method: "POST", body: form });
      const body = (await res.json()) as BatchResponse | { error?: { message?: string } };
      if (!res.ok) {
        const message =
          "error" in body && body.error?.message
            ? body.error.message
            : "Upload failed. Please try again.";
        throw new Error(message);
      }
      setResult(body as BatchResponse);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="vs-stack" aria-label="Upload receipts">
      <div className="vs-card vs-stack">
        <div className="vs-card-head vs-card-head-top">
          <div>
            <h2 className="vs-card-title">Upload receipts</h2>
            <p className="vs-card-sub">
              Add the files you want processed. They are checked here before anything is uploaded.
            </p>
          </div>
        </div>
        <hr className="vs-divider" />
        <div className="vs-notice-banner" role="note">
          <ReceiptIcon size={18} className="vs-notice-icon" />
          <div>
            <strong>Receipts & Invoices Only:</strong> VoucherSense AI is specialized for paper receipts, digital tax invoices, and bills with line items. General photos, portraits, or non-receipt documents will be rejected during AI extraction.
          </div>
        </div>
        <div className="vs-dropzone">
          <span className="vs-dropzone-title">Upload files from your storage</span>
          <button
            type="button"
            className="vs-link-btn"
            style={{ color: "#2563eb", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: "13px", padding: 0 }}
            onClick={() => inputRef.current?.click()}
          >
            Click to browse receipts
          </button>
          <button
            type="button"
            className="vs-btn vs-btn-primary vs-dropzone-action"
            onClick={() => inputRef.current?.click()}
          >
            Click here
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={allowedMimeTypes.join(",")}
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <ul className="vs-accepts" aria-label="Accepted formats and limits">
          {allowedMimeTypes.map((mime) => (
            <li key={mime} className="vs-accept-item">
              <span className="vs-accept-icon" aria-hidden="true">
                <CheckCircleIcon size={14} />
              </span>
              <strong>{MIME_LABEL[mime] ?? mime}</strong>
            </li>
          ))}
          <li className="vs-accept-item">
            <span className="vs-accept-icon" aria-hidden="true">
              <DocumentIcon size={14} />
            </span>
            Up to <strong>{formatMegabytes(maxSizeBytes)} MB</strong> per file
          </li>
          <li className="vs-accept-item">
            <span className="vs-accept-icon" aria-hidden="true">
              <ReceiptIcon size={14} />
            </span>
            Up to <strong>{maxFilesPerBatch}</strong> files per batch
          </li>
        </ul>

        {rejected.length > 0 ? (
          <div className="vs-block">
            <div className="vs-row vs-between vs-wrap">
              <h2 className="vs-section-title">Files skipped</h2>
              <span className="vs-muted">{rejected.length} skipped</span>
            </div>
            <ul className="vs-filelist" aria-label="Rejected files">
              {rejected.map((item) => (
                <li key={item.id} className="vs-filerow vs-filerow-error" style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
                  <span aria-hidden="true" style={{ display: "inline-flex", flex: "none", color: "#dc2626" }}>
                    <XCircleIcon size={16} />
                  </span>
                  <span className="vs-filename" style={{ color: "#991b1b", fontWeight: 600 }}>{item.name}</span>
                  <span className="vs-error-text" style={{ color: "#dc2626" }}>{item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="vs-block">
            <div className="vs-row vs-between vs-wrap">
              <h2 className="vs-section-title">Ready to process</h2>
              <span className="vs-muted">
                {files.length} of {maxFilesPerBatch} files
                {files.length > 0 ? ` · ${formatBytes(files.reduce((sum, f) => sum + f.size, 0))} total` : ""}
              </span>
            </div>
            <ul className="vs-filelist" aria-label="Selected files">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="vs-filerow">
                  <span className="vs-fileicon" aria-hidden="true">
                    {file.type.toLowerCase() === "application/pdf" ? (
                      <DocumentIcon size={15} />
                    ) : (
                      <ReceiptIcon size={15} />
                    )}
                  </span>
                  <span className="vs-filename" title={file.name}>
                    {file.name}
                  </span>
                  <span className="vs-filerow-type">{MIME_LABEL[file.type] ?? dimension(file.name)}</span>
                  <span className="vs-muted vs-filesize">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    className="vs-btn vs-btn-ghost vs-btn-small"
                    onClick={() => removeFile(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="vs-row vs-wrap">
            <button
              type="button"
              className="vs-btn vs-btn-primary"
              disabled={uploading || files.length === 0}
              onClick={() => void upload()}
            >
              {uploading ? (
                <>
                  <SpinnerIcon size={16} className="vs-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  Process receipts
                  <ArrowRightIcon size={16} />
                </>
              )}
            </button>
            <button
              type="button"
              className="vs-btn vs-btn-ghost"
              disabled={uploading}
              onClick={() => setFiles([])}
            >
              Clear
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="vs-alert vs-alert-error" role="alert">
            <AlertIconInline />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="vs-card vs-stack">
          <div className="vs-card-head">
            <h2 className="vs-card-title">
              {result.accepted > 0 ? "Receipts queued for processing" : "Nothing was uploaded"}
            </h2>
            <span className="vs-muted" style={{ fontSize: 14 }}>
              {result.accepted} queued · {result.rejected} rejected
            </span>
          </div>
          <hr className="vs-divider" />
          <p className="vs-footnote" style={{ margin: 0 }}>
            VoucherSense AI processes each file in the background. Track the status of every
            receipt on the Jobs screen.
          </p>
          <ul className="vs-filelist">
            {result.uploads.map((outcome, index) => (
              <li key={`${outcome.filename}-${index}`} className="vs-filerow">
                <span
                  aria-hidden="true"
                  style={{
                    color: outcome.status === "queued" ? "var(--vs-primary)" : "#dc2626",
                    display: "inline-flex",
                    flex: "none",
                  }}
                >
                  {outcome.status === "queued" ? (
                    <CheckCircleIcon size={16} />
                  ) : (
                    <XCircleIcon size={16} />
                  )}
                </span>
                <span className="vs-filename" style={outcome.status === "rejected" ? { color: "#991b1b", fontWeight: 600 } : undefined}>{outcome.filename}</span>
                <span
                  className={
                    outcome.status === "queued" ? "vs-badge vs-badge-pending" : "vs-badge vs-badge-failed"
                  }
                  style={outcome.status === "rejected" ? { background: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" } : undefined}
                >
                  {outcome.status === "queued" ? "Queued" : "Rejected"}
                </span>
                {outcome.message ? <span className="vs-muted">{outcome.message}</span> : null}
              </li>
            ))}
          </ul>
          {result.accepted > 0 ? (
            <div className="vs-row">
              <button
                type="button"
                className="vs-btn vs-btn-secondary"
                onClick={() => router.push("/jobs")}
              >
                View processing status
                <ArrowRightIcon size={16} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AlertIconInline(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="vs-alert-icon"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function dimension(filename: string): string {
  const ext = filename.split(".").pop();
  return ext ? ext.toUpperCase() : "File";
}

function formatMegabytes(bytes: number): string {
  return Math.round(bytes / (1024 * 1024)).toString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}