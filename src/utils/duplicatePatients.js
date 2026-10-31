import { supabase } from '../supabaseClient.js';

// ilike without wildcards is a case-insensitive equals; escape the wildcards a name could contain.
const exact = (value) => String(value || '').trim().replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Patients already registered with this first name and surname, ignoring case,
 * middle name and suffix. A match is a warning, not a block: two students can
 * share a name, but most matches are the same person typed in twice.
 */
export const findSameNamePatients = async ({ firstName, surname, excludeId }) => {
  if (!String(firstName || '').trim() || !String(surname || '').trim()) return [];
  let query = supabase.from('students')
    .select('id, name, year, first_name, middle_name, surname, suffix')
    .ilike('first_name', exact(firstName)).ilike('surname', exact(surname)).order('id').limit(5);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  return error ? [] : data || [];
};
