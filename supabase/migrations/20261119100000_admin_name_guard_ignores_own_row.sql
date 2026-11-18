-- Resending an admin invitation upserts public.admins on email. BEFORE INSERT
-- triggers run before ON CONFLICT turns the insert into an update, so new.id is a
-- fresh id and the invitee's own existing row looked like "another administrator".
-- That made every resend send the email but fail to record it. The row with the
-- same email is the row being updated (email is unique), so it is not a duplicate.
create or replace function private.guard_administrator_name()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_key text;
begin
  if new.role<>'admin' then return new; end if;
  new.name:=btrim(regexp_replace(coalesce(new.name,''),'[[:space:]]+',' ','g'));
  if length(new.name) not between 2 and 120 then raise exception 'Use a full name with 2-120 characters.'; end if;
  v_key:=lower(new.name);
  perform pg_advisory_xact_lock(hashtextextended('administrator-name:'||v_key,0));
  if exists(select 1 from public.admins a where a.role='admin' and a.id is distinct from new.id
      and a.email is distinct from new.email
      and lower(btrim(regexp_replace(a.name,'[[:space:]]+',' ','g')))=v_key)
    or exists(select 1 from private.staff_invitations i where i.role='admin' and i.status in ('sending','pending')
      and (new.auth_user_id is null or i.auth_user_id is distinct from new.auth_user_id)
      and lower(btrim(regexp_replace(i.name,'[[:space:]]+',' ','g')))=v_key) then
    raise exception 'Another administrator already uses this name. Choose a different name.' using errcode='23505';
  end if;
  return new;
end;
$function$;
