"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMessageThread } from "@/hooks/useMessageThread";
import { useProjectRoom } from "@/hooks/useSocket";
import MessageThread from "./MessageThread";
import MessageComposer from "./MessageComposer";

/**
 * Phase 19 — a project's discussion area.
 *
 * Reuses the same thread components as a channel, and for the same reason: the
 * *rendering* of a message list is identical in both places. What differs is
 * authorization, and that is decided entirely on the server:
 *
 *   • reading needs `view_project` — so being in the workspace is not enough;
 *   • posting needs `comment` — the same permission task comments use.
 *
 * `canPost` is passed in from the project page's resolved role purely to hide
 * the composer. It is a display concern, not a security control: the endpoint
 * refuses a post from an unauthorized user whether or not the UI offered the
 * box. That is why the component still renders a read-only notice rather than
 * assuming a missing composer means "no access".
 */
export default function ProjectDiscussion({ projectId, canPost, role }) {
  const { user } = useAuth();
  const [error, setError] = useState(null);

  const thread = useMessageThread({
    kind: "PROJECT",
    projectId,
    selfId: user?.id,
    enabled: Boolean(projectId),
  });

  // The project page already joins the project room for board updates; joining
  // again is idempotent, and this keeps the discussion correct if it is ever
  // rendered on its own.
  useProjectRoom(projectId, null, { enabled: Boolean(projectId) });

  return (
    <div className="ws-card flex max-h-[32rem] flex-col overflow-hidden rounded-2xl">
      <MessageThread
        messages={thread.messages}
        currentUserId={user?.id}
        loading={thread.loading}
        compact
      />

      {canPost ? (
        <>
          <MessageComposer
            // MessageComposer clears its input on anything other than a
            // literal `false`, so the result has to be flattened to a boolean
            // here — passing `thread.send` straight through would clear the
            // draft even when the server refused the message.
            onSend={async (content) => {
              const result = await thread.send(content);
              if (!result.ok) setError(result.error);
              else setError(null);
              return result.ok;
            }}
            disabled={thread.sending}
            placeholder="Post to the project discussion…  (@name to mention)"
          />
          {error && (
            <p
              className="border-t border-white/8 px-3.5 py-2 text-center text-[12px] text-red-300"
              role="alert"
            >
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="border-t border-white/8 p-3.5 text-center text-[12.5px] text-zinc-600">
          {role === "VIEWER" || role === "COLLABORATOR"
            ? "You can read this discussion, but not post to it."
            : "You do not have permission to post in this discussion."}
        </div>
      )}
    </div>
  );
}
