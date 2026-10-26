-- Keep the existing elevation guard. A deleted Auth identity may be detached
-- only when every other protected enrolment field remains unchanged.
create or replace function public.guard_enrollee_sensitive_updates()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor text:=public.current_app_role();
begin
  if current_setting('app.allow_enrollee_status_change',true)='on' then return new; end if;
  if actor in ('admin','physician','nurse') then return new; end if;
  if new.auth_user_id is null and old.auth_user_id is not null
    and not exists(select 1 from auth.users u where u.id=old.auth_user_id and u.deleted_at is null)
    and new.status is not distinct from old.status
    and new.tup_email is not distinct from old.tup_email
    and new.elevated_at is not distinct from old.elevated_at
    and new.elevated_student_id is not distinct from old.elevated_student_id
    and new.personal_email is not distinct from old.personal_email then
    return new;
  end if;
  if new.status is distinct from old.status or new.tup_email is distinct from old.tup_email
    or new.elevated_at is distinct from old.elevated_at or new.elevated_student_id is distinct from old.elevated_student_id
    or new.auth_user_id is distinct from old.auth_user_id or new.personal_email is distinct from old.personal_email then
    raise exception 'Only clinic staff or the elevation workflow can change the enrolment status of an account';
  end if;
  return new;
end;
$$;
notify pgrst,'reload schema';
