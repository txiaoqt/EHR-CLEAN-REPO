-- The register edits an existing dispense as well as creating one. Match its
-- UPDATE permission to the existing physician/admin correction (DELETE) rule.
create policy medicine_log_staff_correct_quantity
on public.inventory_transactions for update to authenticated
using (public.is_within_clinic_hours() and public.is_physician_or_admin()
  and exists (select 1 from public.staff_directory s where s.auth_user_id = (select auth.uid()) and s.active))
with check (public.is_within_clinic_hours() and public.is_physician_or_admin()
  and exists (select 1 from public.staff_directory s where s.auth_user_id = (select auth.uid()) and s.active));

-- One RPC is one transaction: a dispense, its stock delta and the audit entry
-- either all commit or all roll back. Invoker security retains table RLS.
create or replace function public.save_medical_log_quantity(
  p_visit_id uuid,
  p_item_name text,
  p_quantity integer,
  p_expected_quantity integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_visit record;
  v_item record;
  v_actor text;
  v_ids uuid[];
  v_previous bigint;
  v_stock bigint;
  v_count integer;
begin
  if auth.uid() is null or not coalesce(public.is_within_clinic_hours(), false) then
    raise exception using errcode = '42501', message = 'CLINIC_ACCESS_REQUIRED';
  end if;
  select s.name into v_actor from public.staff_directory s
  where s.auth_user_id = auth.uid() and s.active
    and s.role in ('physician', 'nurse', 'admin') limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'ACTIVE_STAFF_REQUIRED';
  end if;
  if p_quantity is null or p_quantity < 0 or p_expected_quantity is null or p_expected_quantity < 0 then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;

  select v.visit_id, v.appointment_id, v.encounter_id, v.patient_id, v.patient_name
  into v_visit from public.medical_log_visits v
  where v.visit_id = p_visit_id
    and (v.visit_source = 'encounter' or v.appointment_status = 'Completed');
  if not found then
    raise exception using errcode = '22023', message = 'VISIT_UNAVAILABLE';
  end if;

  -- Serialize medicine-log writers for this item and use current stock, never
  -- the stock value captured by a browser when the page first loaded.
  select i.id, i.stock_quantity into v_item from public.inventory i
  where i.item_name = p_item_name for update;
  if not found then
    raise exception using errcode = '22023', message = 'MEDICINE_UNAVAILABLE';
  end if;

  select array_agg(t.id order by (t.appointment_id is null), t.id), coalesce(sum(t.quantity), 0)
  into v_ids, v_previous from public.inventory_transactions t
  where t.item_name = p_item_name and t.transaction_type = 'out'
    and ((v_visit.appointment_id is not null and t.appointment_id = v_visit.appointment_id)
      or (v_visit.encounter_id is not null and t.encounter_id = v_visit.encounter_id));

  -- An uncertain network response can safely be retried with the same target.
  if v_previous = p_quantity then
    return jsonb_build_object('quantity', p_quantity, 'stock_quantity', v_item.stock_quantity,
      'saved_at', clock_timestamp());
  end if;
  if v_previous <> p_expected_quantity then
    raise exception using errcode = '40001', message = 'QUANTITY_CHANGED',
      detail = jsonb_build_object('quantity', v_previous, 'stock_quantity', v_item.stock_quantity)::text;
  end if;
  v_stock := v_item.stock_quantity::bigint - (p_quantity::bigint - v_previous);
  if v_stock < 0 or v_stock > 2147483647 then
    raise exception using errcode = '22023', message = 'INSUFFICIENT_STOCK';
  end if;

  if p_quantity = 0 then
    delete from public.inventory_transactions where id = any(v_ids);
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '42501', message = 'QUANTITY_CORRECTION_NOT_ALLOWED';
    end if;
  elsif v_ids is null then
    insert into public.inventory_transactions
      (item_name, transaction_type, quantity, reason, performed_by, patient_id, appointment_id, encounter_id)
    values (p_item_name, 'out', p_quantity, 'Dispensed during consultation', v_actor,
      v_visit.patient_id, v_visit.appointment_id, v_visit.encounter_id);
  else
    -- Older records can contain separate appointment/encounter entries. Keep
    -- one identity and consolidate their total when that cell is edited.
    if cardinality(v_ids) > 1 then
      delete from public.inventory_transactions where id = any(v_ids[2:]);
      get diagnostics v_count = row_count;
      if v_count <> cardinality(v_ids) - 1 then
        raise exception using errcode = '42501', message = 'QUANTITY_CORRECTION_NOT_ALLOWED';
      end if;
    end if;
    update public.inventory_transactions set quantity = p_quantity, performed_by = v_actor,
      appointment_id = v_visit.appointment_id, encounter_id = v_visit.encounter_id
    where id = v_ids[1];
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '42501', message = 'QUANTITY_CORRECTION_NOT_ALLOWED';
    end if;
  end if;

  update public.inventory set stock_quantity = v_stock::integer, updated_at = now() where id = v_item.id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '42501', message = 'STOCK_UPDATE_NOT_ALLOWED';
  end if;
  insert into public.audit_logs (user_name, performed_by, action, description, type, encounter_id, appointment_id)
  values (v_actor, v_actor, 'Medicine Dispensed',
    format('%s ×%s for %s (was ×%s)', p_item_name, p_quantity,
      coalesce(v_visit.patient_name, v_visit.patient_id), v_previous),
    'dispense', v_visit.encounter_id::text, v_visit.appointment_id::text);
  return jsonb_build_object('quantity', p_quantity, 'stock_quantity', v_stock,
    'saved_at', clock_timestamp());
end;
$$;

revoke all on function public.save_medical_log_quantity(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.save_medical_log_quantity(uuid, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
