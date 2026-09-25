"use client";

import { useState } from "react";
import EmptyState from "../EmptyState";
import Modal from "../Modal";
import { CheckIcon, ClockIcon, DocIcon, PlusIcon } from "../icons";
import { useMutation, useResource } from "@/hooks/useResource";
import {
  CONTRIBUTOR_ROLES,
  DELIVERABLE_ACCEPT,
  DELIVERABLE_ENDPOINTS,
  REVIEWER_ROLES,
  canSubmitDeliverable,
  deliverableStatusMeta,
  formatDateTime,
  formatFileSize,
  toApiPath,
} from "@/lib/workspaceApi";

function StatusPill({ status }) {
  const meta = deliverableStatusMeta(status);
  return (
    <span
      className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}14`,
        borderColor: `${meta.color}33`,
      }}
    >
      {meta.label}
    </span>
  );
}

function DecisionCard({ review }) {
  const approved = review.decision === "APPROVED";
  const color = approved ? "#22c55e" : "#f97316";
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}0f` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color }}>
          {approved ? "Approved" : "Changes requested"}
        </span>
        <span className="text-[11.5px] text-zinc-500">
          by {review.reviewer?.name || "a reviewer"} · {formatDateTime(review.reviewedAt)}
        </span>
      </div>
      {review.feedback && (
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-300">
          {review.feedback}
        </p>
      )}
    </div>
  );
}

function VersionRow({ version, isLatest, onDownload }) {
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-white">v{version.versionNumber}</span>
        <StatusPill status={version.status} />
        {isLatest && (
          <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Latest
          </span>
        )}
        {version.isApproved && (
          <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            Approved build
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 text-zinc-300 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white hover:decoration-white/50"
        >
          <DocIcon size={13} /> {version.fileName}
        </button>
        <span>{formatFileSize(version.fileSize)}</span>
        {version.submittedBy?.name && (
          <span>
            submitted by {version.submittedBy.name}
            {version.submittedAt ? ` · ${formatDateTime(version.submittedAt)}` : ""}
          </span>
        )}
      </div>

      {version.description && (
        <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-400">
          {version.description}
        </p>
      )}

      {(version.reviews || []).length > 0 && (
        <div className="mt-3 space-y-2">
          {version.reviews.map((review) => (
            <DecisionCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </li>
  );
}

function UploadForm({ path, showTitle, submitImmediately, submitLabel, onDone, onCancel }) {
  const { run, loading } = useMutation();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    if (showTitle && title.trim()) form.append("title", title.trim());
    if (description.trim()) form.append("description", description.trim());
    if (submitImmediately) form.append("submit", "true");

    const { error: err } = await run(path, { method: "POST", body: form });
    if (err) {
      setError(err.message || "Could not upload the file");
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="deliverable-file" className="mb-1.5 block text-[12px] font-medium text-zinc-300">
          File
        </label>
        <input
          id="deliverable-file"
          type="file"
          accept={DELIVERABLE_ACCEPT}
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-2.5 file:py-1 file:text-[12px] file:font-semibold file:text-zinc-950"
        />
        {file && (
          <p className="mt-1.5 text-[11.5px] text-zinc-500">
            {file.name} · {formatFileSize(file.size)}
          </p>
        )}
      </div>

      {showTitle && (
        <div>
          <label htmlFor="deliverable-title" className="mb-1.5 block text-[12px] font-medium text-zinc-300">
            Title <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            id="deliverable-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder="Defaults to the file name"
            className="ws-input h-9 w-full rounded-lg px-3 text-[13px]"
          />
        </div>
      )}

      <div>
        <label htmlFor="deliverable-description" className="mb-1.5 block text-[12px] font-medium text-zinc-300">
          What changed
        </label>
        <textarea
          id="deliverable-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Summarise this version for the reviewer"
          className="ws-input w-full rounded-lg px-3 py-2 text-[13px]"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !file}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Uploading…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function DeliverablePanel({ taskId, taskStatus, role, isAssignee, onChanged }) {
  const { data, loading, refetch } = useResource(DELIVERABLE_ENDPOINTS.task(taskId), {
    enabled: Boolean(taskId),
  });
  const { run, loading: acting } = useMutation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [decision, setDecision] = useState(null);
  const [feedback, setFeedback] = useState("");

  const deliverable = data?.deliverable || null;
  const versions = data?.versions || [];
  const current = versions.find((v) => v.isCurrent) || versions[versions.length - 1] || null;
  const isReviewer = REVIEWER_ROLES.includes(role);
  const canContribute = CONTRIBUTOR_ROLES.includes(role) && (isReviewer || isAssignee);
  // The server only lets a SUBMITTED deliverable exist while the task is being
  // worked on, so elsewhere the upload lands as a draft the user submits later.
  const autoSubmit = canSubmitDeliverable(taskStatus);

  const act = async (path, { method = "PATCH", body, success }) => {
    setError("");
    setNotice("");
    const { error: err } = await run(path, { method, body });
    if (err) {
      setError(err.message || "The deliverable could not be updated");
      return false;
    }
    setNotice(success);
    await refetch();
    onChanged?.();
    return true;
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!current) return;
    await act(DELIVERABLE_ENDPOINTS.submit(deliverable.id, current.versionNumber), {
      success: `v${current.versionNumber} submitted for review.`,
    });
  };

  const submitDecision = async (event) => {
    event.preventDefault();
    if (!decision || !current) return;
    const path =
      decision === "APPROVED"
        ? DELIVERABLE_ENDPOINTS.approve(deliverable.id, current.versionNumber)
        : DELIVERABLE_ENDPOINTS.requestChanges(deliverable.id, current.versionNumber);
    const ok = await act(path, {
      body: { feedback: feedback.trim() },
      success: decision === "APPROVED" ? "Deliverable approved." : "Changes requested.",
    });
    if (ok) {
      setDecision(null);
      setFeedback("");
    }
  };

  const afterUpload = async (message) => {
    setUploading(false);
    setError("");
    setNotice(message);
    await refetch();
    onChanged?.();
  };

  const busy = acting || loading;
  const status = deliverable?.status;
  const approvedVersion = deliverable?.approvedVersion || null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
          Deliverable
          {deliverable && <StatusPill status={status} />}
          {deliverable && deliverable.versionCount > 1 && (
            <span className="text-[12px] font-medium text-zinc-500">
              v{deliverable.currentVersion} of {deliverable.versionCount}
            </span>
          )}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {deliverable && canContribute && current && current.status === "DRAFT" && (
            <button
              type="button"
              disabled={busy || !autoSubmit}
              onClick={submitForm}
              title={
                autoSubmit
                  ? "Send this version to the reviewers"
                  : "The task must be in progress before work can be submitted"
              }
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              <CheckIcon size={14} /> Submit v{current.versionNumber}
            </button>
          )}

          {deliverable && isReviewer && current && current.status === "SUBMITTED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(DELIVERABLE_ENDPOINTS.startReview(deliverable.id, current.versionNumber), {
                  success: "Review started.",
                })
              }
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-[12.5px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-60"
            >
              <ClockIcon size={14} /> Begin review
            </button>
          )}

          {deliverable && isReviewer && current && current.status === "UNDER_REVIEW" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDecision("CHANGES_REQUESTED");
                  setFeedback("");
                  setError("");
                }}
                className="flex items-center gap-1.5 rounded-xl border border-orange-400/25 bg-orange-400/10 px-3.5 py-2 text-[12.5px] font-semibold text-orange-300 transition-colors hover:bg-orange-400/20 disabled:opacity-60"
              >
                Request changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDecision("APPROVED");
                  setFeedback("");
                  setError("");
                }}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500/90 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckIcon size={14} /> Approve
              </button>
            </>
          )}

          {deliverable && canContribute && status === "CHANGES_REQUESTED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setUploading(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              <PlusIcon size={14} /> New version
            </button>
          )}

          {!deliverable && canContribute && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setUploading(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              <PlusIcon size={14} /> Add deliverable
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="mb-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[12.5px] text-emerald-300">
          {notice}
        </p>
      )}

      <div className="ws-card rounded-2xl p-4">
        {loading && !deliverable && (
          <p className="py-6 text-center text-[13.5px] text-zinc-500">Loading deliverable…</p>
        )}

        {!loading && !deliverable && !uploading && (
          <EmptyState
            icon={<DocIcon size={20} />}
            title="No deliverable yet"
            description={
              canContribute
                ? "Upload the work for this task and send it for review."
                : "Nothing has been delivered for this task yet."
            }
          />
        )}

        {deliverable && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold text-white">{deliverable.title}</p>
              {approvedVersion && (
                <p className="text-[11.5px] text-zinc-500">Approved version: v{approvedVersion}</p>
              )}
            </div>

            {versions.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-zinc-500">No versions uploaded.</p>
            ) : (
              <ol className="mt-3 space-y-2.5">
                {[...versions]
                  .sort((a, b) => b.versionNumber - a.versionNumber)
                  .map((version) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      isLatest={version.isCurrent}
                      onDownload={() => {
                        window.open(
                          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}${toApiPath(
                            DELIVERABLE_ENDPOINTS.download(deliverable.id, version.versionNumber)
                          )}`,
                          "_blank",
                          "noopener"
                        );
                      }}
                    />
                  ))}
              </ol>
            )}
          </>
        )}
      </div>

      {uploading && (
        <Modal
          open
          onClose={() => setUploading(false)}
          title={deliverable ? `New version v${deliverable.currentVersion + 1}` : "Add deliverable"}
          maxWidth="max-w-lg"
        >
          {deliverable ? (
            <UploadForm
              path={DELIVERABLE_ENDPOINTS.versions(deliverable.id)}
              showTitle={false}
              submitImmediately={false}
              submitLabel={`Upload v${deliverable.currentVersion + 1}`}
              onDone={() => afterUpload(`v${deliverable.currentVersion + 1} uploaded as a draft — submit it when ready.`)}
              onCancel={() => setUploading(false)}
            />
          ) : (
            <UploadForm
              path={DELIVERABLE_ENDPOINTS.create(taskId)}
              showTitle
              submitImmediately={autoSubmit}
              submitLabel={autoSubmit ? "Upload and submit" : "Upload draft"}
              onDone={() =>
                afterUpload(
                  autoSubmit
                    ? "Deliverable uploaded and submitted for review."
                    : "Deliverable uploaded as a draft — submit it when the task is in progress."
                )
              }
              onCancel={() => setUploading(false)}
            />
          )}
        </Modal>
      )}

      {decision && current && (
        <Modal
          open
          onClose={() => setDecision(null)}
          title={decision === "APPROVED" ? "Approve this version" : "Request changes"}
          maxWidth="max-w-md"
        >
          <form onSubmit={submitDecision} className="space-y-3">
            <p className="text-[13.5px] leading-relaxed text-zinc-300">
              {decision === "APPROVED"
                ? `Approve v${current.versionNumber} of “${deliverable.title}”? The task moves to Approved.`
                : `Send v${current.versionNumber} of “${deliverable.title}” back with feedback. The submitter can then upload a new version.`}
            </p>
            <div>
              <label htmlFor="review-feedback" className="mb-1.5 block text-[12px] font-medium text-zinc-300">
                Feedback {decision === "CHANGES_REQUESTED" ? "" : <span className="text-zinc-600">(optional)</span>}
              </label>
              <textarea
                id="review-feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={4}
                maxLength={2000}
                required={decision === "CHANGES_REQUESTED"}
                placeholder="What should change, and why?"
                className="ws-input w-full rounded-lg px-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDecision(null)}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={acting || (decision === "CHANGES_REQUESTED" && !feedback.trim())}
                className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-60 ${
                  decision === "APPROVED" ? "bg-emerald-500/90 hover:bg-emerald-500" : "bg-orange-500/90 hover:bg-orange-500"
                }`}
              >
                {acting ? "Saving…" : decision === "APPROVED" ? "Approve" : "Request changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
