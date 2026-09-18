"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useResource, useMutation } from "@/hooks/useResource";
import DocumentList from "@/components/workspace/Documents/DocumentList";
import DocumentEditor from "@/components/workspace/Documents/DocumentEditor";

export default function DocumentsPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);

  const { run } = useMutation();
  const { data: listData, refetch: refetchList } = useResource(
    `/workspaces/${workspaceId}/documents`
  );

  const [selectedId, setSelectedId] = useState(null);

  const documents = useMemo(() => listData?.documents || [], [listData]);

  const { data: fullData } = useResource(
    selectedId ? `/workspaces/${workspaceId}/documents/${selectedId}` : null,
    { deps: [selectedId] }
  );

  // Auto-select the first document once the list arrives.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedId === null && documents.length > 0) {
      setSelectedId(documents[0].id);
    }
  }, [documents, selectedId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleNew() {
    const { data: created, error } = await run(`/workspaces/${workspaceId}/documents`, {
      method: "POST",
      body: { title: "Untitled", content: "" },
    });
    if (error) return;
    await refetchList();
    setSelectedId(created.document.id);
  }

  async function handleSaved() {
    refetchList();
  }

  async function handleDeleted(deletedId) {
    await refetchList();
    setSelectedId(null);
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col md:flex-row md:min-h-0">
      <DocumentList
        documents={documents}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={handleNew}
        loading={!listData}
      />
      <DocumentEditor
        workspaceId={workspaceId}
        document={fullData?.document}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}