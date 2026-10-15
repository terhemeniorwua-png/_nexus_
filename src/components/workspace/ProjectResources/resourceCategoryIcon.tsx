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
const RESOURCE_CATEGORY_ICONS: Record<string, typeof FileIcon> = {
  RESEARCH: SearchIcon,
  AI: SparkIcon,
  DEVELOPMENT: GithubIcon,
  DESIGN: GridIcon,
  DOCUMENTATION: FileTextIcon,
  REFERENCE: BookIcon,
  OTHER: FileIcon,
};

export interface ResourceCategoryIconProps {
  category?: string;
  size?: number;
  className?: string;
}

export default function ResourceCategoryIcon({
  category,
  size = 16,
  className = "",
}: ResourceCategoryIconProps) {
  const Glyph = RESOURCE_CATEGORY_ICONS[category as string] || FileIcon;
  return <Glyph size={size} className={className} />;
}
