"use client";

import {
  BookIcon,
  DocIcon,
  FileIcon,
  FileTextIcon,
  FlaskIcon,
  GithubIcon,
  LinkIcon,
  NetworkIcon,
  SearchIcon,
} from "../icons";

// Presentation only: the data-level vocabulary lives in @/lib/knowledge. Keeping
// the glyph choice here means the lib stays data-only, like workspaceApi.js.
const CATEGORY_ICONS: Record<string, typeof FileIcon> = {
  DOCUMENTATION: FileTextIcon,
  REPORTS: DocIcon,
  ARCHITECTURE: NetworkIcon,
  RESEARCH: SearchIcon,
  TESTING: FlaskIcon,
  REPOSITORIES: GithubIcon,
  OTHER: FileIcon,
};

const TYPE_ICONS: Record<string, typeof FileIcon> = {
  DOCUMENT: FileIcon,
  LINK: LinkIcon,
  REPOSITORY: GithubIcon,
  REPORT: DocIcon,
  OTHER: BookIcon,
};

export interface CategoryIconProps {
  category?: string;
  size?: number;
  className?: string;
}

export interface TypeIconProps {
  resourceType?: string;
  size?: number;
  className?: string;
}

export function CategoryIcon({ category, size = 16, className = "" }: CategoryIconProps) {
  const Glyph = CATEGORY_ICONS[category as string] || FileIcon;
  return <Glyph size={size} className={className} />;
}

export function TypeIcon({ resourceType, size = 16, className = "" }: TypeIconProps) {
  const Glyph = TYPE_ICONS[resourceType as string] || FileIcon;
  return <Glyph size={size} className={className} />;
}
