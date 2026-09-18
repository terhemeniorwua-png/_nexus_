"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useResource, useMutation } from "@/hooks/useResource";
import { getSocket } from "@/lib/socket";
import Column from "./Column";
import TaskCard from "./TaskCard";
import TaskModal from "./TaskModal";

function makeColumns(board) {
  if (!board) return [];
  const columns = board.columns || [];
  const tasks = board.tasks || [];
  return columns.map((col) => ({
    id: String(col.id),
    name: col.name,
    position: col.position,
    tasks: tasks.filter((t) => String(t.columnId) === String(col.id)),
  }));
}

function findColumnFromId(columns, id) {
  return columns.find(
    (col) => col.id === id || col.tasks.some((t) => String(t.id) === String(id))
  );
}

function moveAcross(columns, activeId, overId, isOverTask) {
  const fromColumn = findColumnFromId(columns, activeId);
  const toColumn = isOverTask
    ? findColumnFromId(columns, overId)
    : columns.find((col) => col.id === overId);

  if (!fromColumn || !toColumn || fromColumn.id === toColumn.id) return columns;

  const activeTask = fromColumn.tasks.find((t) => String(t.id) === String(activeId));
  if (!activeTask) return columns;

  const sourceTasks = fromColumn.tasks.filter((t) => String(t.id) !== String(activeId));
  const targetTasks = toColumn.tasks.filter((t) => String(t.id) !== String(activeId));

  let insertAt = targetTasks.length;
  if (isOverTask) {
    const overIndex = targetTasks.findIndex((t) => String(t.id) === String(overId));
    insertAt = overIndex === -1 ? targetTasks.length : overIndex + 1;
  }
  targetTasks.splice(Math.min(insertAt, targetTasks.length), 0, activeTask);

  return columns.map((col) => {
    if (col.id === fromColumn.id) return { ...col, tasks: sourceTasks };
    if (col.id === toColumn.id) return { ...col, tasks: targetTasks };
    return col;
  });
}

export default function Board({ workspaceId, projectId, members, role = "" }) {
  const { data: boardData, loading, refetch } = useResource(
    `/workspaces/${workspaceId}/projects/${projectId}/board`
  );

  const [columns, setColumns] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [modal, setModal] = useState(null);
  const [membersData, setMembersData] = useState(members || []);

  const { run } = useMutation();
  const columnsRef = useRef(columns);

  // Keep the assignee list in sync when the members prop resolves asynchronously.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (Array.isArray(members) && members.length > 0) {
      setMembersData(members);
    }
  }, [members]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  // Sync columns state from the fetched board payload.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (boardData) setColumns(makeColumns(boardData));
  }, [boardData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit("board:join", { projectId, workspaceId });

    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetch(), 250);
    };

    const events = [
      "task:created",
      "task:moved",
      "task:updated",
      "task:deleted",
      "column:created",
      "column:updated",
      "column:deleted",
    ];

    events.forEach((event) => socket.on(event, schedule));

    return () => {
      clearTimeout(timer);
      events.forEach((event) => socket.off(event, schedule));
      socket.emit("board:leave", { projectId });
    };
  }, [projectId, workspaceId, refetch]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event) {
    const task = columnsRef.current
      .flatMap((col) => col.tasks)
      .find((t) => String(t.id) === String(event.active.id));
    if (task) setActiveTask(task);
  }

  function handleDragOver(event) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const overData = over.data?.current || {};
    const isOverTask = overData.type === "Task";
    const isOverColumn = overData.type === "Column";

    if (isOverTask) {
      setColumns((prev) => {
        const fromColumn = findColumnFromId(prev, activeId);
        const toColumn = findColumnFromId(prev, overId);
        if (!fromColumn || !toColumn) return prev;

        if (fromColumn.id === toColumn.id) {
          const activeIndex = fromColumn.tasks.findIndex((t) => String(t.id) === activeId);
          const overIndex = fromColumn.tasks.findIndex((t) => String(t.id) === overId);
          if (activeIndex === -1 || overIndex === -1) return prev;
          return prev.map((col) =>
            col.id === fromColumn.id
              ? { ...col, tasks: arrayMove(col.tasks, activeIndex, overIndex) }
              : col
          );
        }

        return moveAcross(prev, activeId, overId, true);
      });
    } else if (isOverColumn) {
      setColumns((prev) => moveAcross(prev, activeId, overId, false));
    }
  }

  async function handleDragEnd(event) {
    const activeId = String(event.active.id);

    const column = columnsRef.current.find((col) =>
      col.tasks.some((t) => String(t.id) === activeId)
    );

    setActiveTask(null);

    if (!column) return;

    const position = column.tasks.findIndex((t) => String(t.id) === activeId);
    if (position === -1) {
      refetch();
      return;
    }

    const { error } = await run(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${activeId}/move`,
      { method: "POST", body: { columnId: column.id, position } }
    );

    if (error) {
      refetch();
    }
  }

  if (loading && columns.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4 ws-scroll">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[320px] w-[280px] shrink-0 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div className="flex min-h-[60vh] gap-4 overflow-x-auto pb-4 ws-scroll">
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              onAddTask={(columnId) => {
                const col = columns.find((c) => c.id === columnId);
                setModal({ type: "create", columnId, status: col?.name });
              }}
              onOpenTask={(task) => setModal({ type: "edit", task })}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-[260px] rotate-1 cursor-grabbing">
              <TaskCard task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        workspaceId={workspaceId}
        projectId={projectId}
        members={membersData}
        role={role}
        columns={columns.map((col) => ({ id: col.id, name: col.name }))}
        task={modal?.type === "edit" ? modal.task : null}
        defaultColumnId={modal?.columnId}
        defaultStatus={modal?.status}
        onSaved={() => refetch()}
        onDeleted={() => refetch()}
      />
    </div>
  );
}