-- Creative Hub schema. All timestamps UTC (timestamptz); display in IST in the app.
create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'creative', 'ads');
create type creative_format as enum ('image', 'video', 'carousel');
create type creative_status as enum (
  'requested', 'submitted', 'changes_requested', 'approved',
  'sent_to_ads', 'live', 'paused', 'rejected'
);
create type live_state as enum ('not_live', 'live', 'paused', 'rejected');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role user_role not null default 'creative',
  team text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table creatives (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  campaign text,
  format creative_format not null default 'image',
  brief text,
  reference_links jsonb not null default '[]'::jsonb,
  due_date date,
  submitted_at timestamptz,
  drive_link text,
  copy_notes text,
  status creative_status not null default 'requested',
  live_state live_state not null default 'not_live',
  is_live boolean generated always as (live_state = 'live') stored,
  went_live_at timestamptz,
  meta_preview_link text,
  ads_notes text,
  current_version_id uuid,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);
create index creatives_status_idx on creatives(status) where deleted_at is null;
create index creatives_due_idx on creatives(due_date) where deleted_at is null;
create index creatives_deleted_idx on creatives(deleted_at);

create table creative_versions (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id),
  version_no int not null,
  file_path text not null,
  thumb_path text,
  mime text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (creative_id, version_no)
);
alter table creatives
  add constraint creatives_current_version_fk
  foreign key (current_version_id) references creative_versions(id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id),
  version_id uuid references creative_versions(id),
  author_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_creative_idx on comments(creative_id, created_at);

create table comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  path text not null,
  mime text not null,
  size_bytes bigint not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  user_id uuid not null references profiles(id),
  unique (comment_id, user_id)
);

-- Phase 2 tables are created now so RLS/realtime setup lives in one place.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null,
  creative_id uuid references creatives(id),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);

create table channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into channels(name) values ('General');

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  author_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table activity_log (
  id bigint generated always as identity primary key,
  creative_id uuid not null references creatives(id),
  actor_id uuid references profiles(id),
  action text not null,
  from_value text,
  to_value text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_creative_idx on activity_log(creative_id, created_at);
