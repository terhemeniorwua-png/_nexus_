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
const CATEGORY_ICONS = {
  DOCUMENTATION: FileTextIcon,
  REPORTS: DocIcon,
  ARCHITECTURE: NetworkIcon,
  RESEARCH: SearchIcon,
  TESTING: FlaskIcon,
  REPOSITORIES: GithubIcon,
  OTHER: FileIcon,
};

const TYPE_ICONS = {
  DOCUMENT: FileIcon,
  LINK: LinkIcon,
  REPOSITORY: GithubIcon,
  REPORT: DocIcon,
  OTHER: BookIcon,
};

export function CategoryIcon({ category, size = 16, className = "" }) {
  const Glyph = CATEGORY_ICONS[category] || FileIcon;
  return <Glyph size={size} className={className} />;
}

export function TypeIcon({ resourceType, size = 16, className = "" }) {
  const Glyph = TYPE_ICONS[resourceType] || FileIcon;
  return <Glyph size={size} className={className} />;
}
