"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Avatar from "../Avatar";
import { ClockIcon, FlagIcon, PlusIcon, CheckIcon } from "../icons";
import { PRIORITY_COLORS, formatDate, isOverdue } from "@/lib/workspaceApi";

export default function TaskCard({ task, onOpen, columnName }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task?.id,
    data: { type: "Task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityColor = PRIORITY_COLORS[task?.priority];
  const overdue = isOverdue(task);
  const doneSubtasks = (task?.subtasks || []).filter((s) => s.completed).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen && onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onOpen) onOpen(task);
      }}
      className={`ws-card group cursor-grab rounded-xl p-3 outline-none ${
        isDragging
          ? "z-50 cursor-grabbing border-white/20 shadow-[0_16px_44px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
          : "hover:border-white/15 hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      }`}
    >
      {task?.tags?.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="text-[13.5px] font-medium leading-snug text-zinc-100">{task?.title}</p>

      {task?.description && (
        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-500">
          {task.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        {priorityColor && (
          <span
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
            style={{ color: priorityColor, backgroundColor: `${priorityColor}1a`, border: `1px solid ${priorityColor}30` }}
            title={`${task?.priority} priority`}
          >
            <FlagIcon size={10} />
            {task?.priority === "Low" ? "" : task?.priority}
          </span>
        )}

        {task?.dueDate && (
          <span
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
              overdue ? "bg-red-400/10 text-red-300" : "bg-white/5 text-zinc-400"
            }`}
            title={overdue ? "Overdue" : "Due date"}
          >
            <ClockIcon size={10} />
            {formatDate(task.dueDate)}
          </span>
        )}

        {task?.subtasks?.length > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-400">
            <CheckIcon size={10} />
            {doneSubtasks}/{task.subtasks.length}
          </span>
        )}

        <span className="flex-1" />

        {task?.assignedTo && <Avatar name={task.assignedTo.name} size={22} />}
      </div>
    </div>
  );
}