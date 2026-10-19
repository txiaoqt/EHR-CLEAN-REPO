import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';

/**
 * Whether the signed-in person has completed the clinic record form.
 *
 * Asks the database rather than re-deriving the rule in the browser: the same
 * function backs the staff page, so the clinic and the applicant cannot disagree
 * about who has finished.
 *
 * Returns `unknown` while loading. Callers must treat that as "do not block yet"
 * — locking someone out for a moment during a fetch is worse than letting them
 * click a button a second early.
 */
export const useRecordComplete = () => {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, complete: false, record: null });

  const role = (user?.role || '').toLowerCase();
  const subjectType = role === 'enrollee' ? 'enrollee' : role === 'patient' ? 'patient' : null;
  const subjectId = subjectType === 'enrollee' ? user?.id : user?.patient_id;

  const load = useCallback(async () => {
    if (!subjectType || !subjectId) {
      // Staff, or an enrollee mid-registration with no record yet. Neither is
      // gated by this, so report complete rather than blocking them.
      setState({ loading: false, complete: true, record: null });
      return;
    }
    try {
      const { data: complete } = await supabase.rpc('record_form_complete', {
        p_subject_type: subjectType,
        p_subject_id: String(subjectId),
      });
      const { data: record } = await supabase
        .from('patient_record_forms')
        .select('submitted_at')
        .eq('subject_type', subjectType)
        .eq('subject_id', String(subjectId))
        .maybeSingle();
      setState({ loading: false, complete: complete === true, record: record || null });
    } catch (err) {
      // A failed check must not lock anyone out of a medical system.
      console.warn('Could not check record completeness:', err);
      setState({ loading: false, complete: true, record: null });
    }
  }, [subjectType, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load, subjectType, subjectId };
};
