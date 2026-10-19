import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';

export const isCompletePolicy = (policy) => Boolean(
  policy?.version && Array.isArray(policy.terms) && policy.terms.length &&
  Array.isArray(policy.privacy) && policy.privacy.length
);

// The account key prevents a previous account's accepted state from rendering
// another account's portal for even one frame. Acceptance is never cached in
// localStorage or inferred from user-editable auth metadata.
export default function useAppPolicy({ enabled, accountId = null }) {
  const key = accountId || 'signup';
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);
  const accepting = useRef(false);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const current = ++request.current;
    if (!enabled) {
      setState(null);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setState({ key, phase: 'loading' });
    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          accountId ? 'get_my_app_policy_status' : 'get_active_app_policy'
        ).abortSignal(controller.signal);
        if (error) throw error;
        const result = accountId ? data : { policy: data, required: true, accepted: false };
        if (!isCompletePolicy(result?.policy)) throw new Error('Policy content is unavailable.');
        if (current === request.current) setState({ ...result, key, phase: 'ready', error: null });
      } catch {
        if (current === request.current) setState({
          key, phase: 'error',
          error: 'We could not load the policies. Please retry, or leave this screen and try again later.',
        });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { request.current += 1; clearTimeout(timeout); controller.abort(); };
  }, [enabled, accountId, key, revision]);

  const accept = useCallback(async ({ acceptedTerms, acceptedPrivacy }) => {
    if (!enabled || !accountId || state?.key !== key || state?.phase !== 'ready' ||
      !acceptedTerms || !acceptedPrivacy || accepting.current) return false;
    accepting.current = true;
    setSaving(true);
    const current = request.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await supabase.rpc('accept_app_policy', {
        p_policy_version: state.policy.version,
        p_accepted_terms: acceptedTerms,
        p_accepted_privacy: acceptedPrivacy,
      }).abortSignal(controller.signal);
      if (error) throw error;
      if (!isCompletePolicy(data?.policy) || data.accepted !== true) throw new Error('Agreement was not saved.');
      if (current === request.current) setState({ ...data, key, phase: 'ready', error: null });
      return current === request.current;
    } catch (error) {
      if (current === request.current) {
        if (String(error?.message).includes('POLICY_VERSION_CHANGED')) {
          refresh();
        } else {
          setState((previous) => ({ ...previous,
            error: 'Your agreement could not be saved. Please try again. You can also sign out.',
          }));
        }
      }
      return false;
    } finally {
      clearTimeout(timeout);
      accepting.current = false;
      setSaving(false);
    }
  }, [enabled, accountId, state, key, refresh]);

  const currentState = state?.key === key ? state : null;
  return {
    policy: currentState?.policy || null,
    checking: enabled && (!currentState || currentState.phase === 'loading'),
    error: currentState?.error || null,
    required: enabled && currentState?.required === true,
    accepted: currentState?.accepted === true,
    ready: enabled && currentState?.phase === 'ready',
    saving, accept, refresh,
  };
}
