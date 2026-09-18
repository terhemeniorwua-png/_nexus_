"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Avatar from "../Avatar";
import { useResource, useMutation } from "@/hooks/useResource";
import { getSocket } from "@/lib/socket";
import { SendIcon, TrashIcon } from "../icons";
import { formatRelative } from "@/lib/workspaceApi";

export default function TaskComments({
  workspaceId,
  projectId,
  taskId,
  isAdmin = false,
  canComment = true,
}) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const { data, loading, setData, refetch } = useResource(
    taskId ? `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments` : null,
    { deps: [taskId] }
  );
  const { run, loading: sending } = useMutation();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const comments = data?.comments || [];

  useEffect(() => {
    if (!taskId) return;
    const socket = getSocket();
    if (!socket) return;

    const onAdded = ({ comment }) => {
      if (!comment || String(comment.taskId) !== String(taskId)) return;
      setData((prev) => {
        const existing = prev?.comments || [];
        if (existing.some((c) => String(c.id) === String(comment.id))) return prev;
        return { comments: [...existing, comment] };
      });
    };

    const onDeleted = ({ commentId }) => {
      setData((prev) => ({
        comments: (prev?.comments || []).filter((c) => String(c.id) !== String(commentId)),
      }));
    };

    socket.on("comment:added", onAdded);
    socket.on("comment:deleted", onDeleted);
    return () => {
      socket.off("comment:added", onAdded);
      socket.off("comment:deleted", onDeleted);
    };
  }, [taskId, setData]);

  async function handleSend(event) {
    event.preventDefault();
    setError("");
    const value = content.trim();
    if (!value || !taskId) return;

    const { error: apiError } = await run(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`,
      { method: "POST", body: { content: value } }
    );
    if (apiError) {
      setError(apiError.message || "Could not add comment");
      return;
    }
    setContent("");
    refetch();
  }

  async function handleDelete(commentId) {
    await run(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      { method: "DELETE" }
    );
    refetch();
  }

  return (
    <div className="border-t border-white/8 pt-4">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
        Comments
        <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10.5px] font-bold text-zinc-300">
          {comments.length}
        </span>
      </h3>

      <div className="mt-3 space-y-3">
        {loading && comments.length === 0 && (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
            ))}
          </div>
        )}

        {!loading && comments.length === 0 && (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12.5px] text-zinc-600">
            No comments yet. Start the discussion.
          </p>
        )}

        {comments.map((comment) => {
          const mine = String(comment.userId?.id) === String(currentUserId);
          const deletable = mine || isAdmin;
          return (
            <div key={comment.id} className="group flex items-start gap-2.5">
              <Avatar name={comment.userId?.name} avatar={comment.userId?.avatar} size={26} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-zinc-100">
                    {mine ? "You" : comment.userId?.name || "Someone"}
                  </span>
                  <span className="text-[10.5px] text-zinc-600">{formatRelative(comment.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-300">
                  {comment.content}
                </p>
              </div>
              {deletable && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  aria-label="Delete comment"
                  title="Delete comment"
                  className="mt-1 shrink-0 rounded-md p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
          );
        })}

        {canComment && (
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a comment…"
              className="ws-input h-10 flex-1 rounded-lg px-3 text-[13px]"
            />
            <button
              type="submit"
              disabled={sending || !content.trim()}
              aria-label="Send comment"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-40"
            >
              <SendIcon size={15} />
            </button>
          </form>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}