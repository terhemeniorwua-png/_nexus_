"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import TaskCard from "./TaskCard";
import { PlusIcon } from "../icons";

export default function Column({ column, canManage = false, onAddTask, onOpenTask }) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: "Column", column },
  });

  const canDrop = column.name !== "DONE"; // informational only

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${canDrop ? "bg-white/40" : "bg-emerald-400"}`} />
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            {column.name}
          </h3>
          <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
            {column.tasks.length}
          </span>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => onAddTask && onAddTask(column.id)}
            aria-label={`Add task to ${column.name}`}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <PlusIcon size={15} />
          </button>
        ) : (
          <span className="inline-block w-[26px]" aria-hidden="true" />
        )}
      </div>

      <div
        ref={setNodeRef}
        className="flex max-h-full min-h-[80px] flex-1 flex-col gap-2 rounded-xl border border-white/6 bg-black/20 p-2 transition-colors"
      >
        <SortableContext
          items={column.tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpenTask} columnName={column.name} />
          ))}
        </SortableContext>
        {column.tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/8 px-3 py-8 text-[12px] text-zinc-600">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}