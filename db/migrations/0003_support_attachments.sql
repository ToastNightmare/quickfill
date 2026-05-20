alter table support_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
