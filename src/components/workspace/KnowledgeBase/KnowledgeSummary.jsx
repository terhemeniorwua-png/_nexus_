"use client";

import {
  KNOWLEDGE_CATEGORY_META,
  KNOWLEDGE_SUMMARY_CARDS,
} from "@/lib/knowledge";
import { CategoryIcon } from "./categoryIcon";

function valueFor(card, summary) {
  if (!summary) return 0;
  if (card.metric === "category") return summary.byCategory?.[card.category] ?? 0;
  return summary[card.metric] ?? 0;
}

export default function KnowledgeSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KNOWLEDGE_SUMMARY_CARDS.map((card) => {
        const value = valueFor(card, summary);
        const color =
          card.metric === "category"
            ? (KNOWLEDGE_CATEGORY_META[card.category]?.color ?? "#6b7280")
            : card.metric === "archived"
              ? "#8b8b91"
              : card.metric === "active"
                ? "#22c55e"
                : "#3b82f6";

        return (
          <div
            key={card.label}
            className="rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3.5"
          >
            <div className="flex items-center gap-2 text-[11.5px] text-zinc-500">
              {card.metric === "category" ? (
                <CategoryIcon category={card.category} size={13} />
              ) : null}
              <span className="truncate">{card.label}</span>
            </div>
            <p
              className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight"
              style={{ color }}
            >
              {value}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">{card.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
