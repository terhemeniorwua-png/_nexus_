// Shared domain types for the Nexus frontend.
//
// These mirror the serialized shapes returned by the backend API (see
// backend/src/services/*.service.js). They are intentionally permissive:
// almost every field is optional and string unions accept arbitrary strings,
// because the API evolves and the UI must not break on an unexpected value.

export type ID = string;

export type UserRole =
  | "WORKSPACE_OWNER"
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "MEMBER"
  | "COLLABORATOR"
  | (string & {});

export type TaskStatus =
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | (string & {});

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | (string & {});

export type SubtaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | (string & {});

export interface User {
  id: ID;
  name: string;
  email: string;
  role?: UserRole;
  avatar?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Capabilities {
  canManageProjects?: boolean;
  [key: string]: boolean | undefined;
}

export interface Member {
  id?: ID;
  userId?: ID;
  role?: UserRole;
  joinedAt?: string;
  user?: User | null;
  name?: string;
  email?: string;
  avatar?: string | null;
}

export interface Team {
  id: ID;
  name: string;
  description?: string;
  workspaceId?: ID;
  members?: Member[];
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Channel {
  id: ID;
  name: string;
  description?: string;
  workspaceId?: ID;
  projectId?: ID | null;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  id: ID;
  name: string;
  slug?: string;
  description?: string;
  ownerId?: ID;
  role?: UserRole;
  members?: Member[];
  memberCount?: number;
  projectCount?: number;
  projects?: Project[];
  teams?: Team[];
  channels?: Channel[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: ID;
  name: string;
  description?: string;
  status?: string;
  priority?: TaskPriority;
  workspaceId?: ID;
  managerId?: ID | null;
  manager?: User | null;
  createdBy?: ID | null;
  startDate?: string | null;
  dueDate?: string | null;
  role?: UserRole;
  workspace?: Workspace | null;
  members?: Member[];
  memberCount?: number;
  taskCount?: number;
  teamId?: ID | null;
  teams?: Team[];
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subtask {
  id: ID;
  title: string;
  description?: string;
  completed?: boolean;
  status?: SubtaskStatus;
  assigneeId?: ID | null;
  assignee?: User | null;
  dueDate?: string | null;
  weight?: number;
}

export interface TaskWeights {
  total: number;
  remaining: number;
  completedWeight: number;
  isComplete: boolean;
}

export interface Task {
  id: ID;
  projectId: ID;
  workspaceId?: ID;
  columnId?: ID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  position?: number;
  dueDate?: string | null;
  tags?: string[];
  assignedTo?: ID | null;
  assignee?: User | null;
  subtasks?: Subtask[];
  progress?: number;
  weights?: TaskWeights;
  createdBy?: ID | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Comment {
  id: ID;
  content: string;
  userId?: ID;
  taskId?: ID | null;
  projectId?: ID | null;
  author?: User | null;
  user?: User | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Notification {
  id: ID;
  title?: string;
  body?: string;
  type?: string;
  read?: boolean;
  link?: string;
  actorId?: ID;
  entityId?: ID;
  entityType?: string;
  workspaceId?: ID;
  createdAt?: string;
  actor?: User | null;
}

export interface NotificationToast {
  id: string;
  notification: Notification;
}

export interface Message {
  id: ID;
  content: string;
  userId?: ID;
  channelId?: ID | null;
  projectId?: ID | null;
  conversationId?: ID | null;
  kind?: string;
  recipientId?: ID;
  readAt?: string | null;
  author?: User | null;
  user?: User | null;
  sender?: User | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeliverableVersion {
  id: ID;
  deliverableId?: ID;
  versionNumber: number;
  status?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
  checksum?: string;
  storageKey?: string;
  submittedBy?: ID | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
}

export interface DeliverableReview {
  id: ID;
  deliverableId?: ID;
  deliverableVersionId?: ID;
  versionNumber?: number;
  reviewerId?: ID;
  decision?: string;
  feedback?: string;
  reviewedAt?: string | null;
  reviewer?: User | null;
}

export interface Deliverable {
  id: ID;
  title?: string;
  taskId?: ID;
  projectId?: ID;
  workspaceId?: ID;
  status?: string;
  currentVersion?: number;
  approvedVersion?: number | null;
  createdBy?: ID | null;
  createdAt?: string;
  updatedAt?: string;
  versions?: DeliverableVersion[];
  reviews?: DeliverableReview[];
}

export interface KnowledgeResource {
  id: ID;
  title: string;
  description?: string;
  content?: string;
  url?: string;
  category?: string;
  resourceType?: string;
  status?: string;
  sourceType?: string;
  workspaceId?: ID;
  projectId?: ID;
  createdBy?: ID | null;
  approvedBy?: ID | null;
  approvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sourceFile?: unknown;
}

export interface ProjectResource {
  id: ID;
  name: string;
  description?: string;
  url?: string;
  category?: string;
  projectId?: ID;
  createdBy?: ID | null;
  createdAt?: string;
  updatedAt?: string;
  creator?: User | null;
}

export interface Activity {
  id: ID;
  action: string;
  actor?: User | null;
  user?: User | null;
  userId?: ID;
  workspaceId?: ID;
  projectId?: ID | null;
  targetType?: string;
  targetId?: ID | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface Document {
  id: ID;
  title: string;
  content?: string;
  workspaceId?: ID;
  projectId?: ID | null;
  createdBy?: ID | null;
  createdAt?: string;
  updatedAt?: string;
  author?: User | null;
}

export interface BoardColumn {
  id: ID;
  name: string;
  position?: number;
  projectId?: ID;
  tasks?: Task[];
}

export interface PresenceSnapshot {
  workspaceId: ID;
  userIds: ID[];
}

// ---- API payloads -----------------------------------------------------------

export interface LoginResponse {
  user: User;
  token?: string;
  capabilities?: Capabilities | null;
}

export interface MeResponse {
  user: User;
  capabilities?: Capabilities | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
}

export interface ApiError extends Error {
  status?: number;
}

// ---- Shared UI helpers ------------------------------------------------------

export interface IconProps {
  size?: number;
  className?: string;
}

export interface WithChildren {
  children?: React.ReactNode;
}

export interface ClassNameProps {
  className?: string;
}

export interface Option {
  value: string;
  label: string;
}
