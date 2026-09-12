"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  ReceiptIcon,
  SparklesIcon,
  SpinnerIcon,
  XCircleIcon,
} from "./icons";

const POLL_MS = 2_000;

interface JobDetail {
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
    uploadedAt: string;
  };
}

interface ExtractionItem {
  name: string;
  quantity?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
}

interface ExtractionResult {
  id: string;
  merchant: string | null;
  purchase_date: string | null;
  currency: string | null;
  total: number | null;
  payment_method: string | null;
  category: string | null;
  items: ExtractionItem[] | null;
  confidence_note: string | null;
}

interface SummaryRow {
  id: string;
  status: "processing" | "done" | "failed";
  attemptCount: number;
  summaryText: string | null;
  totalSpent: number | null;
  currency: string | null;
  category: string | null;
  largestItem: string | null;
  itemCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

async function fetchJob(jobId: string): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("Could not load this job.");
  const body = (await res.json()) as { job: JobDetail };
  return body.job;
}

async function fetchExtraction(jobId: string): Promise<ExtractionResult | null> {
  const res = await fetch(`/api/jobs/${jobId}/result`);
  if (res.status === 409 || !res.ok) return null;
  const body = (await res.json()) as { result: ExtractionResult };
  return body.result;
}

async function fetchSummary(resultId: string): Promise<SummaryRow | null> {
  const res = await fetch(`/api/results/${resultId}/summary`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { summary: SummaryRow };
  return body.summary;
}

export function JobDetailScreen(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function poll(): Promise<void> {
      try {
        const current = await fetchJob(jobId);
        if (disposed) return;
        setJob(current);
        setError(null);

        if (current.status === "done") {
          const er = await fetchExtraction(jobId);
          if (er === null) return;
          if (disposed) return;
          setExtraction(er);
          const sum = await fetchSummary(er.id);
          if (disposed) return;
          setSummary(sum);
        }
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : "Could not load this job.");
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
  }, [jobId]);

  async function retryJob(): Promise<void> {
    if (!job) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Retry failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  async function generateSummary(): Promise<void> {
    if (!extraction) return;
    setSummarizing(true);
    setError(null);
    try {
      const res = await fetch(`/api/results/${extraction.id}/summarize`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not start summarisation.");
      }
      const body = (await res.json()) as { summary: SummaryRow };
      setSummary(body.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start summarisation.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="vs-stack">
      <div className="vs-pageheader" style={{ marginBottom: 0 }}>
        <Link
          href="/jobs"
          className="vs-btn vs-btn-ghost vs-btn-small"
          style={{ marginLeft: "-6px", alignSelf: "flex-start" }}
        >
          <ArrowLeftIcon size={15} />
          Back to jobs
        </Link>
      </div>

      {error ? (
        <div className="vs-alert vs-alert-error" role="alert">
          <AlertIcon size={16} className="vs-alert-icon" />
          <span style={{ flex: 1 }}>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="vs-stack" aria-busy="true" aria-label="Loading job">
          <div className="vs-skeleton vs-skeleton-card" />
          <div className="vs-skeleton vs-skeleton-card" />
        </div>
      ) : !job ? (
        <div className="vs-card vs-empty">
          <span className="vs-empty-icon" aria-hidden="true">
            <AlertIcon size={24} />
          </span>
          <h3 className="vs-empty-title">Job not found</h3>
          <p className="vs-empty-text">
            This job may have been removed. Head back to the list to see your current uploads.
          </p>
          <Link className="vs-btn vs-btn-secondary" href="/jobs">
            Back to jobs
          </Link>
        </div>
      ) : job.status === "pending" || job.status === "processing" ? (
        <div className="vs-card vs-stack">
          <div className="vs-card-head">
            <span className="vs-job-head">
              <span className="vs-fileicon" aria-hidden="true">
                <ReceiptIcon size={15} />
              </span>
              <span className="vs-job-title" title={job.receipt.originalFilename}>
                {job.receipt.originalFilename}
              </span>
            </span>
            <StatusBadge status={job.status} />
          </div>
          <div className="vs-processing-panel" role="status">
            <span className="vs-spin vs-processing-icon" aria-hidden="true">
              <SpinnerIcon size={18} />
            </span>
            <div>
              <p className="vs-processing-title">
                {job.status === "pending" ? "Waiting in the queue" : "Processing this receipt"}
              </p>
              <p className="vs-processing-hint">
                {job.status === "pending"
                  ? "This receipt is next in line. Extraction starts automatically and this page refreshes until the result is ready."
                  : "VoucherSense Ai is reading the receipt and extracting structured expense data in the background. This page refreshes automatically."}
              </p>
            </div>
          </div>
          <div className="vs-progress" aria-hidden="true" />
          <dl className="vs-job-meta">
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Status</dt>
              <dd className="vs-job-meta-value">{STATUS_LABEL[job.status]}</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Created</dt>
              <dd className="vs-job-meta-value">{formatDateTime(job.createdAt)}</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Last updated</dt>
              <dd className="vs-job-meta-value">{formatDateTime(job.updatedAt)}</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Attempts</dt>
              <dd className="vs-job-meta-value">{job.attemptCount}</dd>
            </div>
          </dl>
        </div>
      ) : job.status === "failed" ? (
        <div className="vs-card vs-stack">
          <div className="vs-card-head">
            <span className="vs-job-head">
              <span className="vs-fileicon" aria-hidden="true">
                <ReceiptIcon size={15} />
              </span>
              <span className="vs-job-title" title={job.receipt.originalFilename}>
                {job.receipt.originalFilename}
              </span>
            </span>
            <StatusBadge status="failed" />
          </div>
          <div className="vs-failed-panel" role="alert">
            <span className="vs-failed-icon" aria-hidden="true">
              <AlertIcon size={18} />
            </span>
            <div>
              <p className="vs-failed-title">Processing failed</p>
              <p className="vs-failed-hint">{(job.errorMessage ?? "The model could not extract this receipt.").replace(/\.$/, "")}.</p>
              <p className="vs-failed-hint" style={{ marginTop: 8 }}>
                The uploaded file is still stored, so this job can be retried.
              </p>
            </div>
          </div>
          <dl className="vs-job-meta">
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Status</dt>
              <dd className="vs-job-meta-value">Failed</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Attempts</dt>
              <dd className="vs-job-meta-value">{job.attemptCount}</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Created</dt>
              <dd className="vs-job-meta-value">{formatDateTime(job.createdAt)}</dd>
            </div>
            <div className="vs-job-meta-item">
              <dt className="vs-job-meta-label">Last updated</dt>
              <dd className="vs-job-meta-value">{formatDateTime(job.updatedAt)}</dd>
            </div>
          </dl>
          <div className="vs-job-actions">
            <button
              type="button"
              className="vs-btn vs-btn-secondary"
              disabled={retrying}
              onClick={() => void retryJob()}
            >
              {retrying ? "Retrying…" : "Retry processing"}
            </button>
            <Link className="vs-btn vs-btn-ghost" href="/jobs">
              Back to jobs
            </Link>
          </div>
        </div>
      ) : job.status === "done" && !extraction ? (
        <div className="vs-card vs-empty">
          <span className="vs-empty-icon" aria-hidden="true">
            <SpinnerIcon size={24} className="vs-spin" />
          </span>
          <h3 className="vs-empty-title">Preparing your result</h3>
          <p className="vs-empty-text">
            Extraction finished and the structured result is being prepared. This page refreshes
            automatically.
          </p>
        </div>
      ) : extraction ? (
        <div className="vs-result-layout">
          {/* Left Column: Extraction Details */}
          <div className="vs-result-main">
            <ExtractionView result={extraction} filename={job.receipt.originalFilename} />
          </div>

          {/* Central Demarcation Rail */}
          <div className="vs-demarcation-divider" role="separator" aria-label="Summary demarcation">
            <span className="vs-demarcation-pill">
              <SparklesIcon size={11} />
              AI Summary
            </span>
          </div>

          {/* Right Column: Spending Summary */}
          <aside className="vs-result-side">
            <div className="vs-card vs-summary-card">
              <div className="vs-summary-kicker-bar">
                <span className="vs-summary-kicker">
                  <SparklesIcon size={12} />
                  AI Intelligence
                </span>
                {summary?.status === "processing" ? (
                  <span className="vs-badge vs-badge-processing">
                    <span className="vs-spin" style={{ display: "inline-flex" }}>
                      <SpinnerIcon size={12} />
                    </span>
                    Generating
                  </span>
                ) : summary?.status === "done" ? (
                  <span className="vs-badge vs-badge-done">
                    <span style={{ display: "inline-flex" }} aria-hidden="true">
                      <CheckCircleIcon size={12} />
                    </span>
                    Done
                  </span>
                ) : null}
              </div>

              <div className="vs-card-head vs-summary-head">
                <div className="vs-summary-title-wrap">
                  <span className="vs-summary-badge-icon" aria-hidden="true">
                    <SparklesIcon size={16} />
                  </span>
                  <div>
                    <h2 className="vs-card-title">Spending summary</h2>
                    <p className="vs-card-sub">AI overview of this expense</p>
                  </div>
                </div>
              </div>

              <hr className="vs-divider" />

              {!summary ? (
                <div className="vs-summary-empty">
                  <span className="vs-summary-empty-icon" aria-hidden="true">
                    <SparklesIcon size={20} />
                  </span>
                  <h3 className="vs-summary-empty-title">Generate AI overview</h3>
                  <p className="vs-summary-empty-desc">
                    Get an instant AI breakdown of this receipt, including key spending insights, largest items, and category analysis.
                  </p>
                  <button
                    type="button"
                    className="vs-btn vs-btn-primary vs-btn-summarize"
                    disabled={summarizing}
                    onClick={() => void generateSummary()}
                  >
                    <SparklesIcon size={15} />
                    {summarizing ? "Analysing receipt…" : "Summarise expense"}
                  </button>
                </div>
              ) : summary.status === "processing" ? (
                <div className="vs-summary-loading" aria-busy="true">
                  <div className="vs-row" style={{ gap: 8, alignItems: "center" }}>
                    <span className="vs-spin" style={{ display: "inline-flex", color: "var(--colour-roles-primary)" }}>
                      <SpinnerIcon size={15} />
                    </span>
                    <p className="vs-muted" style={{ margin: 0, fontSize: 13 }}>
                      Analysing expense & generating summary…
                    </p>
                  </div>
                  <div className="vs-skeleton-group">
                    <div className="vs-skeleton vs-skeleton-line" style={{ height: 12 }} />
                    <div className="vs-skeleton vs-skeleton-line" style={{ width: "90%", height: 12 }} />
                    <div className="vs-skeleton vs-skeleton-line" style={{ width: "75%", height: 12 }} />
                  </div>
                </div>
              ) : summary.status === "failed" ? (
                <div className="vs-summary-failed vs-stack" style={{ gap: 10 }}>
                  <div className="vs-alert vs-alert-error" role="alert">
                    <AlertIcon size={15} className="vs-alert-icon" />
                    <span style={{ flex: 1, fontSize: 13 }}>{summary.errorMessage ?? "Summarisation failed."}</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="vs-btn vs-btn-secondary vs-btn-small"
                      disabled={summarizing}
                      onClick={() => void generateSummary()}
                    >
                      <SparklesIcon size={14} />
                      {summarizing ? "Retrying…" : "Try again"}
                    </button>
                  </div>
                </div>
              ) : summary.status === "done" && summary.summaryText ? (
                <SummaryView summary={summary} onRegenerate={() => void generateSummary()} summarizing={summarizing} />
              ) : (
                <p className="vs-muted" style={{ margin: 0, fontSize: 13 }}>
                  No summary has been generated yet.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ExtractionView({
  result,
  filename,
}: {
  result: ExtractionResult;
  filename: string;
}): React.JSX.Element {
  const date = result.purchase_date ?? null;
  const total = formatMoney(result.total, result.currency ?? "GBP");
  const itemCount = result.items?.length ?? 0;

  return (
    <div className="vs-card vs-result-card">
      <header className="vs-result-head">
        <div className="vs-result-head-info">
          <div className="vs-result-tagrow">
            <span className="vs-kicker">Receipt result</span>
            <span className="vs-badge vs-badge-done">
              <CheckCircleIcon size={11} />
              Extracted
            </span>
            {result.currency ? (
              <span className="vs-chip-currency">
                {result.currency}
              </span>
            ) : null}
          </div>
          <h2 className="vs-result-merchant">
            {result.merchant ? result.merchant : "Merchant not detected"}
          </h2>
          <p className="vs-result-filename" title={filename}>
            {filename}
          </p>
        </div>

        <div className="vs-result-total-pill">
          <span className="vs-result-total-label">Total</span>
          <span className="vs-result-total-value">
            {result.total === null || result.total === undefined ? "—" : total}
          </span>
        </div>
      </header>

      <hr className="vs-divider" />

      {result.confidence_note ? (
        <div className="vs-note vs-note-warn" role="note">
          <AlertIcon size={13} className="vs-alert-icon" />
          <span style={{ flex: 1, fontSize: 12.5 }}>{result.confidence_note}</span>
        </div>
      ) : null}

      <dl className="vs-stat-grid">
        <div className="vs-stat">
          <dt className="vs-stat-label">Purchase date</dt>
          <dd className="vs-stat-value">{date ?? "—"}</dd>
        </div>
        <div className="vs-stat">
          <dt className="vs-stat-label">Payment method</dt>
          <dd className="vs-stat-value">{prettify(result.payment_method) ?? "—"}</dd>
        </div>
        <div className="vs-stat">
          <dt className="vs-stat-label">Category</dt>
          <dd className="vs-stat-value">{result.category ? prettify(result.category) : "—"}</dd>
        </div>
        <div className="vs-stat">
          <dt className="vs-stat-label">Currency</dt>
          <dd className="vs-stat-value">{result.currency ?? "—"}</dd>
        </div>
      </dl>

      {result.items && result.items.length > 0 ? (
        <>
          <hr className="vs-divider" />
          <section className="vs-result-items" aria-label="Receipt items">
          <div className="vs-result-items-header">
            <h3 className="vs-section-title">Line Items</h3>
            <span className="vs-items-count-pill">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="vs-table-wrap vs-table-panel">
            <table className="vs-table vs-table-compact">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="vs-num">Qty</th>
                  <th className="vs-num">Unit</th>
                  <th className="vs-num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td className="vs-item-name">{item.name}</td>
                    <td className="vs-num">{item.quantity ?? "—"}</td>
                    <td className="vs-num">
                      {item.unit_price != null
                        ? formatMoney(item.unit_price, result.currency ?? "GBP")
                        : "—"}
                    </td>
                    <td className="vs-num vs-line-total">
                      {item.line_total != null
                        ? formatMoney(item.line_total, result.currency ?? "GBP")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
      ) : null}

      <hr className="vs-divider" />

      <footer className="vs-result-footnote">
        <InfoIcon size={13} />
        <span>Structured data extracted automatically by VoucherSense AI.</span>
      </footer>
    </div>
  );
}

function SummaryView({
  summary,
  onRegenerate,
  summarizing,
}: {
  summary: SummaryRow;
  onRegenerate?: () => void;
  summarizing?: boolean;
}): React.JSX.Element {
  return (
    <div className="vs-summary-content">
      <div className="vs-summary-narrative">
        <span className="vs-ai-label" style={{ marginBottom: 6 }}>
          <SparklesIcon size={13} />
          Key insights
        </span>
        <p className="vs-summary-text">{summary.summaryText}</p>
      </div>

      <hr className="vs-divider" />

      <dl className="vs-summary-stats">
        <div className="vs-summary-stat">
          <dt className="vs-stat-label">Total spent</dt>
          <dd className="vs-summary-stat-value vs-highlight-num">
            {summary.totalSpent != null ? formatMoney(summary.totalSpent, summary.currency ?? "GBP") : "—"}
          </dd>
        </div>
        <div className="vs-summary-stat">
          <dt className="vs-stat-label">Category</dt>
          <dd className="vs-summary-stat-value">
            {summary.category ? prettify(summary.category) : "—"}
          </dd>
        </div>
        <div className="vs-summary-stat">
          <dt className="vs-stat-label">Largest item</dt>
          <dd className="vs-summary-stat-value" title={summary.largestItem ?? ""}>
            {summary.largestItem ?? "—"}
          </dd>
        </div>
        <div className="vs-summary-stat">
          <dt className="vs-stat-label">Item count</dt>
          <dd className="vs-summary-stat-value">{summary.itemCount ?? "—"}</dd>
        </div>
      </dl>

      {onRegenerate ? (
        <>
          <hr className="vs-divider" />
          <div className="vs-summary-footer">
            <button
              type="button"
              className="vs-btn vs-btn-ghost vs-btn-small vs-btn-regenerate"
              disabled={summarizing}
              onClick={onRegenerate}
            >
              <SparklesIcon size={13} />
              {summarizing ? "Updating…" : "Refresh summary"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  return (
    <span className={`vs-badge vs-badge-${status}`}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function StatusIcon({ status }: { status: string }): React.JSX.Element {
  const icon =
    status === "processing" ? (
      <SpinnerIcon size={12} />
    ) : status === "done" ? (
      <CheckCircleIcon size={12} />
    ) : status === "failed" ? (
      <XCircleIcon size={12} />
    ) : (
      <ClockIcon size={12} />
    );
  return (
    <span
      className={status === "processing" ? "vs-spin" : undefined}
      style={{ display: "inline-flex" }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function prettify(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ");
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

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}