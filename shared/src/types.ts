export type DocumentRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export interface UserProfile extends UserSummary {
  createdAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
}

export interface DocumentPermissionItem {
  id: string;
  userId: string;
  user: UserSummary;
  role: DocumentRole;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  contentPreview: string | null;
  ownerId: string;
  owner?: UserSummary;
  userRole: DocumentRole;
  isPublic: boolean;
  defaultRole: DocumentRole;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentItem {
  permissions: DocumentPermissionItem[];
}

export interface SnapshotItem {
  id: string;
  documentId: string;
  title: string;
  comment?: string | null;
  createdById: string;
  createdBy?: UserSummary;
  createdAt: string;
}

export interface SnapshotDetail extends SnapshotItem {
  binaryStateBase64: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// User Presence in Yjs Awareness
export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  email: string;
}

export interface UserAwarenessState {
  user: PresenceUser;
  cursor?: {
    anchor: number;
    head: number;
  } | null;
}

// Socket Events
export enum SocketEvents {
  JOIN_DOC = 'doc:join',
  LEAVE_DOC = 'doc:leave',
  DOC_SYNC_STEP1 = 'doc:sync:step1',
  DOC_SYNC_STEP2 = 'doc:sync:step2',
  DOC_UPDATE = 'doc:update',
  AWARENESS_UPDATE = 'doc:awareness',
  PERMISSIONS_UPDATED = 'doc:permissions_updated',
  DOC_RESTORED = 'doc:restored',
  ERROR = 'doc:error'
}
