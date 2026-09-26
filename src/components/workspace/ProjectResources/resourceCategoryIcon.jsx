"use client";

import {
  BookIcon,
  FileIcon,
  FileTextIcon,
  GithubIcon,
  GridIcon,
  SearchIcon,
  SparkIcon,
} from "../icons";

// Presentation only, for the same reason as KnowledgeBase/categoryIcon.jsx:
// the data-level vocabulary stays in @/lib/projectResources, so this file can
// never disagree with the enum the API validates against.
const RESOURCE_CATEGORY_ICONS = {
  RESEARCH: SearchIcon,
  AI: SparkIcon,
  DEVELOPMENT: GithubIcon,
  DESIGN: GridIcon,
  DOCUMENTATION: FileTextIcon,
  REFERENCE: BookIcon,
  OTHER: FileIcon,
};

export default function ResourceCategoryIcon({ category, size = 16, className = "" }) {
  const Glyph = RESOURCE_CATEGORY_ICONS[category] || FileIcon;
  return <Glyph size={size} className={className} />;
}
