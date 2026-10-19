import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext.jsx';
import { supabase } from '../../supabaseClient.js';
import PatientRecordForm from '../../components/PatientRecordForm.jsx';
import { CheckIcon, AlertIcon } from '../../components/icons/Icons.jsx';

const registrationPrefill = (user) => {
  const nameParts = (user?.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: user?.first_name || nameParts[0] || '',
    middleName: user?.middle_name || nameParts.slice(1, -1).join(' '),
    surname: user?.surname || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''),
    suffix: user?.suffix || '',
    dateOfBirth: user?.date_of_birth || '',
    applicantId: user?.applicant_id || '',
  };
};

/**
 * The enrollee's clinic record.
 *
 * The form is the reason this page exists: the clinic needs these details before
 * it can accept a medical certificate, and the answers appear in the staff
 * portal's enrollee summary and on the downloadable form.
 *
 * Collapsed to a summary once submitted, so it does not occupy the page for
 * someone who has already done it.
 */
const EnrolleeProfile = () => {
  const { user, updateUser, fetchUserProfile } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [registration, setRegistration] = useState(() => registrationPrefill(user));
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationMessageType, setRegistrationMessageType] = useState('error');
  const [registrationSavedButNeedsRefresh, setRegistrationSavedButNeedsRefresh] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('patient_record_forms')
        .select('*')
        .eq('subject_type', 'enrollee')
        .eq('subject_id', String(user.id))
        .maybeSingle();
      setRecord(data || null);
    } catch (err) {
      console.warn('Could not load the record form:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submitted = Boolean(record?.submitted_at);
  const registrationIncomplete = user?.role === 'enrollee' && user?.enrollee_status === 'incomplete';

  useEffect(() => {
    if (!registrationIncomplete) return;
    const prefill = registrationPrefill(user);
    setRegistration((current) => ({
      firstName: current.firstName || prefill.firstName,
      middleName: current.middleName || prefill.middleName,
      surname: current.surname || prefill.surname,
      suffix: current.suffix || prefill.suffix,
      dateOfBirth: current.dateOfBirth || prefill.dateOfBirth,
      applicantId: current.applicantId || prefill.applicantId,
    }));
  }, [
    registrationIncomplete,
    user?.applicant_id,
    user?.date_of_birth,
    user?.first_name,
    user?.middle_name,
    user?.name,
    user?.suffix,
    user?.surname,
  ]);

  const updateRegistration = (field) => (event) => {
    setRegistration((current) => ({ ...current, [field]: event.target.value }));
    setRegistrationMessage('');
  };

  const completeRegistration = async (event) => {
    event.preventDefault();
    const firstName = registration.firstName.trim();
    const surname = registration.surname.trim();
    const applicantId = registration.applicantId.trim().toUpperCase();

    if (!firstName || !surname || !applicantId || !registration.dateOfBirth) {
      setRegistrationMessage('Complete your first name, surname, date of birth, and Applicant ID.');
      setRegistrationMessageType('error');
      return;
    }

    setRegistrationSaving(true);
    setRegistrationMessage('');
    try {
      const { data, error } = await supabase.rpc('complete_enrollee_registration', {
        p_first_name: firstName,
        p_middle_name: registration.middleName.trim() || null,
        p_surname: surname,
        p_suffix: registration.suffix.trim() || null,
        p_date_of_birth: registration.dateOfBirth,
        p_applicant_id: applicantId,
      });

      if (error) throw error;
      if (!data?.success) {
        setRegistrationMessage(data?.error || 'Your enrollee registration could not be completed.');
        setRegistrationMessageType('error');
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const profile = !authError && authData?.user
        ? await fetchUserProfile(authData.user)
        : null;

      if (!profile || profile.role !== 'enrollee' || profile.enrollee_status === 'incomplete') {
        setRegistrationMessage('Registration saved. Refresh this page to continue.');
        setRegistrationMessageType('success');
        setRegistrationSavedButNeedsRefresh(true);
        return;
      }

      updateUser(profile);
    } catch (error) {
      console.error('Could not complete enrollee registration:', error);
      setRegistrationMessage(error?.message || 'Your enrollee registration could not be completed. Please try again.');
      setRegistrationMessageType('error');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const rows = [
    ['Name', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Applicant ID', user?.applicant_id || 'Not provided'],
  ];

  return (
    <main className="main">
      <div className="page">
        <div className="page-header">
          <div className="page-header-title-block">
            <h1 className="page-header-title">Profile</h1>
            <div className="page-header-subtitle">
              Your clinic record. The clinic uses these details when reviewing your submission.
            </div>
          </div>
        </div>

        {registrationIncomplete ? (
          <section className="card settings-card">
            <header className="settings-card-head">
              <h2>Finish your enrollee registration</h2>
              <p>
                This account is verified, but its enrollee record is missing. Review the details carried
                over from signup, fill in anything missing, and correct any field before continuing.
              </p>
            </header>

            {registrationMessage && (
              <div
                className="record-form-message"
                role={registrationMessageType === 'error' ? 'alert' : 'status'}
                style={registrationMessageType === 'success'
                  ? { background: 'var(--color-emerald-bg)', color: 'var(--color-emerald-text)' }
                  : { background: 'var(--color-rose-bg)', color: 'var(--color-rose-text)' }}
              >
                {registrationMessageType === 'success' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
                <span>{registrationMessage}</span>
              </div>
            )}

            <form onSubmit={completeRegistration}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '0 16px',
                }}
              >
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-first-name">First name</label>
                  <input
                    id="enrollee-recovery-first-name"
                    className="input"
                    autoComplete="given-name"
                    value={registration.firstName}
                    onChange={updateRegistration('firstName')}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                    required
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-middle-name">Middle name <span>(optional)</span></label>
                  <input
                    id="enrollee-recovery-middle-name"
                    className="input"
                    autoComplete="additional-name"
                    value={registration.middleName}
                    onChange={updateRegistration('middleName')}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-surname">Surname</label>
                  <input
                    id="enrollee-recovery-surname"
                    className="input"
                    autoComplete="family-name"
                    value={registration.surname}
                    onChange={updateRegistration('surname')}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                    required
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-suffix">Suffix <span>(optional)</span></label>
                  <input
                    id="enrollee-recovery-suffix"
                    className="input"
                    placeholder="Jr., III"
                    value={registration.suffix}
                    onChange={updateRegistration('suffix')}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-date-of-birth">Date of birth</label>
                  <input
                    id="enrollee-recovery-date-of-birth"
                    className="input"
                    type="date"
                    autoComplete="bday"
                    value={registration.dateOfBirth}
                    onChange={updateRegistration('dateOfBirth')}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                    required
                  />
                </div>
                <div className="settings-field">
                  <label htmlFor="enrollee-recovery-applicant-id">Applicant ID</label>
                  <input
                    id="enrollee-recovery-applicant-id"
                    className="input"
                    autoComplete="off"
                    value={registration.applicantId}
                    onChange={(event) => {
                      setRegistration((current) => ({ ...current, applicantId: event.target.value.toUpperCase() }));
                      setRegistrationMessage('');
                    }}
                    disabled={registrationSaving || registrationSavedButNeedsRefresh}
                    required
                  />
                </div>
              </div>

              {registrationSavedButNeedsRefresh ? (
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  Refresh page
                </button>
              ) : (
                <button type="submit" className="btn" disabled={registrationSaving}>
                  {registrationSaving ? 'Saving…' : 'Confirm details and continue'}
                </button>
              )}
            </form>
          </section>
        ) : (
          <>
            <div className="card settings-card" style={{ marginBottom: 20 }}>
              <header className="settings-card-head">
                <h2>Your details</h2>
                <p>As provided when you registered.</p>
              </header>
              {rows.map(([label, value], i) => (
                <div
                  className="settings-row"
                  key={label}
                  style={i === rows.length - 1 ? { borderBottom: 'none', paddingBottom: 0 } : undefined}
                >
                  <div>
                    <div className="settings-row-label">{label}</div>
                    <div className="settings-row-note">{value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card settings-card">
              <header className="settings-card-head">
                <h2>Clinic record form</h2>
                <p>
                  The clinic's patient record form — your medical history, vaccinations, family history,
                  and your guardian's details. This must be completed before a medical certificate can be
                  accepted.
                </p>
              </header>

              {loading ? (
                <div className="settings-row-note">Loading your record…</div>
              ) : (
                <>
                  {submitted && (
                    <div
                      className="record-form-message"
                      style={{ background: 'var(--color-emerald-bg)', color: 'var(--color-emerald-text)' }}
                    >
                      <CheckIcon size={15} />
                      <span>
                        Submitted{' '}
                        {new Date(record.submitted_at).toLocaleDateString(undefined, {
                          dateStyle: 'medium',
                        })}
                        .
                      </span>
                    </div>
                  )}

                  {submitted && !editing ? (
                    <div className="settings-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                      <div>
                        <div className="settings-row-label">Your answers are on file</div>
                        <div className="settings-row-note">
                          The clinic can see them. You can change them if something was entered wrongly.
                        </div>
                      </div>
                      <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
                        Edit answers
                      </button>
                    </div>
                  ) : (
                    <PatientRecordForm
                      initial={record}
                      onSaved={() => {
                        setEditing(false);
                        load();
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!loading && !submitted && (
          <div className="settings-callout" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertIcon size={15} />
            <span>
              Until this form is submitted, the rest of the portal stays locked — including the
              medical certificate upload.
            </span>
          </div>
        )}
      </div>
    </main>
  );
};

export default EnrolleeProfile;
