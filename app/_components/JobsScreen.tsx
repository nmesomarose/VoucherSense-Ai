"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertIcon, ArrowRightIcon, CheckCircleIcon, ClockIcon, ReceiptIcon, RefreshIcon, SpinnerIcon, TrashIcon, XCircleIcon } from "./icons";

const POLL_MS = 2_000;

interface JobListItem {
  id: string;
  receiptId: string;
  status: "pending" | "processing" | "done" | "failed";
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  receipt: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    batchId: string;
    uploadedAt: string;
  };
  extractionResult: { id: string; confidenceNote: string | null } | null;
}

const STATUS_LABEL: Record<JobListItem["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

const STATUS_HINT: Record<JobListItem["status"], string> = {
  pending: "Waiting in the queue",
  processing: "Being processed",
  done: "Result available",
  failed: "Processing failed",
};

const FILE_LABEL: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/pdf": "PDF",
};

async function fetchJobs(): Promise<JobListItem[]> {
  const res = await fetch(`/api/jobs?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load jobs.");
  const body = (await res.json()) as { jobs: JobListItem[] };
  return body.jobs;
}

export function JobsScreen(): React.JSX.Element {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function poll(): Promise<void> {
      try {
        const list = await fetchJobs();
        if (disposed) return;
        setJobs(list);
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : "Could not load jobs.");
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, []);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      const updated = await fetchJobs();
      setJobs(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  }

  async function retry(jobId: string): Promise<void> {
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Retry failed.");
      }
      setJobs(await fetchJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying(null);
    }
  }

  async function deleteJob(jobId: string): Promise<void> {
    if (!window.confirm("Are you sure you want to delete this receipt? This action cannot be undone.")) {
      return;
    }
    setDeleting(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Delete failed.");
      }
      setJobs(await fetchJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  }


  const processingCount = jobs.filter((j) => j.status === "processing").length;
  const pendingCount = jobs.filter((j) => j.status === "pending").length;

  return (
    <div className="vs-stack">
      <section className="vs-pageheader" aria-labelledby="jobs-title" style={{ marginBottom: 0 }}>
        <span className="vs-eyebrow">
          <span className="vs-eyebrow-dot" />
          Processing queue
        </span>
        <div className="vs-pageheader-row">
          <h1 id="jobs-title" className="vs-title">
            Jobs
          </h1>
          <div className="vs-row" style={{ flexShrink: 0, gap: 8 }}>
            {processingCount > 0 ? (
              <span className="vs-badge vs-badge-processing">
                <span className="vs-spin" style={{ display: "inline-flex" }} aria-hidden="true">
                  <SpinnerIcon size={12} />
                </span>
                Processing ({processingCount})
              </span>
            ) : pendingCount > 0 ? (
              <span className="vs-badge vs-badge-pending" style={{ background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }}>
                <ClockIcon size={12} />
                Queued ({pendingCount})
              </span>
            ) : null}
            <button
              type="button"
              className="vs-btn vs-btn-ghost vs-btn-small"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <span className={refreshing ? "vs-spin" : undefined} style={{ display: "inline-flex" }}>
                <RefreshIcon size={14} />
              </span>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {pendingCount > 0 && processingCount === 0 ? (
          <div className="vs-notice-banner" style={{ marginTop: 12, marginBottom: 0, background: "#fefce8", borderColor: "#fef08a", color: "#854d0e" }}>
            <span style={{ display: "inline-flex", flex: "none", color: "#ca8a04", marginTop: 2 }}>
              <ClockIcon size={16} />
            </span>
            <div>
              <strong>{pendingCount === 1 ? "1 job is" : `${pendingCount} jobs are`} waiting in the queue.</strong> Make sure your background worker process is running in a second terminal: <code>npm run worker</code>
            </div>
          </div>
        ) : null}
        <p className="vs-lead">
          Every receipt you upload lands here with its AI processing status. This page updates
          automatically.
        </p>
      </section>

      {error ? (
        <div className="vs-alert vs-alert-error" role="alert">
          <AlertIcon size={16} className="vs-alert-icon" />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            className="vs-btn vs-btn-ghost vs-btn-small"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="vs-grid vs-grid-col-2" aria-busy="true" aria-label="Loading jobs">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="vs-skeleton vs-skeleton-card" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="vs-card vs-empty">
          <span className="vs-empty-icon" aria-hidden="true">
            <ReceiptIcon size={24} />
          </span>
          <h3 className="vs-empty-title">No receipts yet</h3>
          <p className="vs-empty-text">
            Upload your first receipt and VoucherSense Ai will extract the structured expense data
            here, then create a job you can track end to end.
          </p>
          <Link className="vs-btn vs-btn-primary" href="/upload">
            Upload a receipt
          </Link>
        </div>
      ) : (
        <div className="vs-grid vs-grid-col-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`vs-card vs-job-card vs-job-card-${job.status}`}
            >
              <div className="vs-row vs-between" style={{ gap: 10 }}>
                <span className="vs-job-head">
                  <span
                    className={`vs-fileicon ${job.status === "failed" ? "vs-fileicon-error" : ""}`}
                    aria-hidden="true"
                    style={
                      job.status === "failed"
                        ? { color: "#dc2626", background: "#fee2e2", borderColor: "#fca5a5" }
                        : undefined
                    }
                  >
                    {job.status === "failed" ? <XCircleIcon size={15} /> : <ReceiptIcon size={15} />}
                  </span>
                  <span
                    className="vs-job-title"
                    title={job.receipt.originalFilename}
                    style={job.status === "failed" ? { color: "#991b1b" } : undefined}
                  >
                    {job.receipt.originalFilename}
                  </span>
                </span>
                <StatusBadge status={job.status} />
              </div>

              <div className="vs-job-meta">
                <span className="vs-job-meta-item">
                  <span className="vs-job-meta-label">Job ID</span>
                  <span className="vs-job-meta-value">{shortId(job.id)}</span>
                </span>
                <span className="vs-job-meta-item">
                  <span className="vs-job-meta-label">File</span>
                  <span className="vs-job-meta-value">
                    {FILE_LABEL[job.receipt.mimeType] ?? job.receipt.mimeType} · {formatBytes(job.receipt.sizeBytes)}
                  </span>
                </span>
                <span className="vs-job-meta-item">
                  <span className="vs-job-meta-label">Created</span>
                  <span className="vs-job-meta-value">{formatDateTime(job.createdAt)}</span>
                </span>
                <span className="vs-job-meta-item">
                  <span className="vs-job-meta-label">Updated</span>
                  <span className="vs-job-meta-value">{formatDateTime(job.updatedAt)}</span>
                </span>
              </div>

              {job.status === "done" && job.extractionResult?.confidenceNote ? (
                <div className="vs-note vs-note-warn" role="note">
                  <AlertIcon size={14} className="vs-alert-icon" />
                  <span className="vs-badge vs-badge-confidence">Low confidence</span>
                  <span style={{ flex: 1 }}>{job.extractionResult.confidenceNote}</span>
                </div>
              ) : null}

              {job.status === "failed" ? (
                <>
                  {job.errorMessage ? (
                    <div className="vs-alert vs-alert-error" role="alert" style={{ fontSize: 13 }}>
                      <AlertIcon size={14} className="vs-alert-icon" />
                      <span style={{ flex: 1 }}>
                        {job.errorMessage}
                        {job.attemptCount > 0
                          ? ` (${job.attemptCount} ${job.attemptCount === 1 ? "attempt" : "attempts"})`
                          : null}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="vs-job-actions">
                {job.status === "failed" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      className="vs-btn vs-btn-secondary vs-btn-small"
                      disabled={retrying === job.id || deleting === job.id}
                      onClick={() => void retry(job.id)}
                    >
                      {retrying === job.id ? "Retrying…" : "Retry"}
                    </button>
                    <button
                      type="button"
                      className="vs-btn vs-btn-small"
                      style={{
                        background: "#fee2e2",
                        color: "#dc2626",
                        border: "1px solid #fca5a5",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                      disabled={deleting === job.id || retrying === job.id}
                      onClick={() => void deleteJob(job.id)}
                      title="Delete failed receipt"
                    >
                      <TrashIcon size={13} />
                      {deleting === job.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ) : null}
                {job.status === "done" && job.extractionResult ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Link className="vs-btn vs-btn-secondary vs-btn-small" href={`/jobs/${job.id}`}>
                      View result
                      <ArrowRightIcon size={14} />
                    </Link>
                    <button
                      type="button"
                      className="vs-btn vs-btn-ghost vs-btn-small"
                      style={{
                        color: "#ef4444",
                        padding: "5px 8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      disabled={deleting === job.id}
                      onClick={() => void deleteJob(job.id)}
                      title="Delete receipt"
                      aria-label="Delete receipt"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                ) : null}
                {job.status === "pending" || job.status === "processing" ? (
                  <span className="vs-footnote" style={{ margin: 0 }}>
                    {STATUS_HINT[job.status]}
                  </span>
                ) : null}
                {job.status === "done" && !job.extractionResult ? (
                  <span className="vs-footnote" style={{ margin: 0 }}>
                    No result yet
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: JobListItem["status"] }): React.JSX.Element {
  return (
    <span className={`vs-badge vs-badge-${status}`}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusIcon({ status }: { status: JobListItem["status"] }): React.JSX.Element {
  if (status === "processing") {
    return (
      <span className="vs-spin" style={{ display: "inline-flex" }} aria-hidden="true">
        <ClockIcon size={12} />
      </span>
    );
  }
  if (status === "done") {
    return (
      <span style={{ display: "inline-flex" }} aria-hidden="true">
        <CheckCircleIcon size={12} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span style={{ display: "inline-flex" }} aria-hidden="true">
        <XCircleIcon size={12} />
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex" }} aria-hidden="true">
      <ClockIcon size={12} />
    </span>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}