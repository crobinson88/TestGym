-- The email review pass can now act on the mailbox itself — archive a thread
-- and apply labels — not just read it. Record what was done per ruling: this is
-- the first write path into real mail, so the ledger has to say what the app
-- changed, not only what the user decided.
alter table public.email_reviews
  add column archived boolean not null default false,
  add column applied_labels jsonb not null default '[]';

comment on column public.email_reviews.archived is
  'The thread was archived in Gmail (INBOX label removed) as part of this ruling.';
comment on column public.email_reviews.applied_labels is
  'Label names applied to the thread in Gmail as part of this ruling.';
