export type Role = "admin" | "creative" | "ads";
export type Format = "image" | "video" | "carousel";
export type Status =
  | "requested"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "sent_to_ads"
  | "live"
  | "paused"
  | "rejected";
export type LiveState = "not_live" | "live" | "paused" | "rejected";

export const STATUSES: Status[] = [
  "requested",
  "submitted",
  "changes_requested",
  "approved",
  "sent_to_ads",
  "live",
  "paused",
  "rejected",
];

export const STATUS_LABEL: Record<Status, string> = {
  requested: "Requested",
  submitted: "Submitted",
  changes_requested: "Changes requested",
  approved: "Approved",
  sent_to_ads: "Sent to ads",
  live: "Live",
  paused: "Paused",
  rejected: "Rejected",
};

export const LIVE_LABEL: Record<LiveState, string> = {
  not_live: "Not live",
  live: "Live",
  paused: "Paused",
  rejected: "Rejected by Meta",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  creative: "Creative team",
  ads: "Ads team",
};

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: string | null;
  avatar_url: string | null;
  active: boolean;
}

export interface CreativeVersion {
  id: string;
  creative_id: string;
  version_no: number;
  file_path: string;
  thumb_path: string | null;
  mime: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface Creative {
  id: string;
  title: string;
  campaign: string | null;
  format: Format;
  brief: string | null;
  reference_links: string[];
  due_date: string | null;
  submitted_at: string | null;
  drive_link: string | null;
  copy_notes: string | null;
  status: Status;
  live_state: LiveState;
  is_live: boolean;
  went_live_at: string | null;
  meta_preview_link: string | null;
  ads_notes: string | null;
  current_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CommentRow {
  id: string;
  creative_id: string;
  version_id: string | null;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

export interface CommentAttachment {
  id: string;
  comment_id: string;
  path: string;
  mime: string;
  size_bytes: number;
  name: string;
}

export interface ActivityRow {
  id: number;
  creative_id: string;
  actor_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}
