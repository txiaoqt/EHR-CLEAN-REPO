import { supabase } from '../supabaseClient.js';

export async function adminAction(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('system-admin', { body: { action, payload } });
  if (error) {
    let message = 'The administration service is unavailable. Try again.';
    try { message = (await error.context.json()).error || message; } catch (_) { /* Network error. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function adminData(section, { search = '', status = 'all', page = 0, signal } = {}) {
  const { data, error } = await supabase.rpc('admin_portal_data', {
    p_section: section, p_search: search.trim(), p_status: status, p_page: page + 1,
  }).abortSignal(signal);
  if (error) throw new Error(error.code === '42501'
    ? 'Administrator access is unavailable. Sign in again.' : 'Could not load this information. Try again.');
  return data;
}

export async function adminAccountHistory({ accountId = null, search = '', action = 'all', dateFrom = '', dateTo = '', page = 0, exportAll = false, signal } = {}) {
  const { data, error } = await supabase.rpc('admin_account_history', {
    p_account: accountId, p_search: search.trim(), p_action: action,
    p_date_from: dateFrom || null, p_date_to: dateTo || null, p_page: page + 1, p_export: exportAll,
  }).abortSignal(signal);
  if (error) throw new Error(error.code === '42501'
    ? 'Administrator access is unavailable. Sign in again.' : 'Could not load account history. Try again.');
  return data;
}

export const formatAdminDate = (value) => value ? new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : '—';
