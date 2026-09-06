-- The audit trail should outlive the account that produced it — deleting a
-- user (e.g. GDPR-style erasure, or cleaning up a throwaway test account)
-- must not be blocked by their historical audit_logs rows, nor should those
-- rows disappear. Keep the log, null out the reference.
alter table public.audit_logs
  drop constraint audit_logs_user_id_fkey,
  add constraint audit_logs_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;
