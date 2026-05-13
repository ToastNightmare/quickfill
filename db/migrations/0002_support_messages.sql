create extension if not exists pgcrypto;

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  user_id text,
  source text,
  status text not null default 'new',
  priority text not null default 'normal',
  category text not null default 'general'
);

create index if not exists support_messages_status_created_at_idx
  on support_messages(status, created_at desc);

create index if not exists support_messages_email_created_at_idx
  on support_messages(email, created_at desc);

create index if not exists support_messages_user_created_at_idx
  on support_messages(user_id, created_at desc);
