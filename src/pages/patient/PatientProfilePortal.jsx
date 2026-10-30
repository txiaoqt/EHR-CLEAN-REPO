// src/pages/patient/PatientProfilePortal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import PatientRecordForm from '../../components/PatientRecordForm.jsx';
import { CheckIcon } from '../../components/icons/Icons.jsx';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';
import { isValidPhMobile, limitPhone, normalizePhMobile } from '../../utils/courses.js';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HEALTH_DISCLOSURE_OPTIONS = [
  { id: 'physical', label: 'Physical health condition' },
  { id: 'mental', label: 'Mental or psychological health condition' },
  { id: 'pwd', label: 'Person with disability (PWD)' },
  { id: 'none', label: 'No conditions to report' },
  { id: 'prefer_not_to_disclose', label: 'Prefer not to disclose' },
];
const HEALTH_DISCLOSURE_LABELS = Object.fromEntries(
  HEALTH_DISCLOSURE_OPTIONS.filter(({ id }) => !['none', 'prefer_not_to_disclose'].includes(id)).map(({ id, label }) => [id, label])
);

const formatProfileDate = (value) => {
  if (!value) return 'Not on file';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const PatientProfilePortal = () => {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);
  const originalProfileRef = useRef(null);

  const [profile, setProfile] = useState({
    id: '',
    name: '',
    year: '',
    course: '',
    sex: '',
    date_of_birth: '',
    last_visit_date: '',
    contact_number: '',
    address: '',
    emergency_contact: '',
    emergency_contact_number: '',
    blood_type: '',
    medications: '',
    allergies: '',
    notes: '',
    avatar_url: '',
    profile_data: {},
    health_condition_categories: [],
    health_condition_notes: '',
  });

  const [editing, setEditing] = useState(false);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // The clinic record form is a separate row from the patient profile, so it is
  // loaded separately rather than folded into `profile`.
  const [record, setRecord] = useState(null);
  const [recordLoading, setRecordLoading] = useState(true);
  const [recordEditing, setRecordEditing] = useState(false);

  const loadRecord = React.useCallback(async () => {
    try {
      const patientId = user?.patient_id;
      if (!patientId) {
        setRecordLoading(false);
        return;
      }
      const { data } = await supabase
        .from('patient_record_forms')
        .select('*')
        .eq('subject_type', 'patient')
        .eq('subject_id', String(patientId))
        .maybeSingle();
      setRecord(data || null);
    } catch (err) {
      console.warn('Could not load the clinic record form:', err);
    } finally {
      setRecordLoading(false);
    }
  }, [user?.patient_id]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOpen, setMsgOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      if (!user?.patient_id) return;

      // 1. Query patients master record
      const { data: pData } = await supabase
        .from('patients')
        .select('*')
        .eq('id', user.patient_id)
        .maybeSingle();

      // 2. Query users record for avatar & name fallback
      let uAvatar = user?.avatar || '';
      let uName = user?.name || '';
      try {
        const { data: uData } = await supabase
          .from('users')
          .select('avatar, name')
          .eq('patient_id', user.patient_id)
          .maybeSingle();
        if (uData?.avatar) uAvatar = uData.avatar;
        if (uData?.name) uName = uData.name;
      } catch (_) {}

      // 3. Query extended patient_profiles record
      let extData = null;
      try {
        const { data: ppData } = await supabase
          .from('patient_profiles')
          .select('*')
          .eq('patient_id', user.patient_id)
          .maybeSingle();
        extData = ppData;
      } catch (_) {}

      if (!mounted) return;

      const resolvedAvatar = extData?.avatar_url || uAvatar || user?.avatar || '';

      const loadedProfile = {
        id: user.patient_id,
        name: extData?.full_name || pData?.name || uName || '',
        year: extData?.year || pData?.year || '',
        course: extData?.course || '',
        sex: extData?.sex || '',
        date_of_birth: pData?.date_of_birth || '',
        last_visit_date: pData?.last_visit_date || '',
        contact_number: normalizePhMobile(extData?.contact_number),
        address: extData?.address || '',
        emergency_contact: extData?.emergency_contact || '',
        emergency_contact_number: normalizePhMobile(extData?.emergency_contact_number),
        blood_type: extData?.blood_type || '',
        medications: extData?.medications || pData?.medications || '',
        allergies: extData?.allergies || pData?.allergies || '',
        notes: extData?.notes || extData?.medical_history || pData?.notes || '',
        avatar_url: resolvedAvatar,
        profile_data: extData?.profile_data && typeof extData.profile_data === 'object' && !Array.isArray(extData.profile_data)
          ? extData.profile_data
          : {},
        health_condition_categories: Array.isArray(extData?.profile_data?.health_disclosure?.categories)
          ? extData.profile_data.health_disclosure.categories
          : [],
        health_condition_notes: extData?.profile_data?.health_disclosure?.notes || '',
      };

      setProfile(loadedProfile);
      originalProfileRef.current = { ...loadedProfile };

      if (resolvedAvatar && resolvedAvatar !== user?.avatar) {
        updateUser?.({ avatar: resolvedAvatar });
      }
    };

    loadProfile()
      .catch((err) => console.warn('Could not load the patient profile:', err))
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => { mounted = false; };
  }, [user?.patient_id, user?.name]);

  useEffect(() => {
    if (msg) setMsgOpen(true);
  }, [msg]);

  // Handle Photo Selection & Upload to Supabase Storage
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again
    e.target.value = '';

    // Validation 1: MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setMsg('Please choose a JPG, PNG, or WebP image up to 5 MB.');
      return;
    }

    // Validation 2: File size (5MB maximum)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMsg('Please choose a JPG, PNG, or WebP image up to 5 MB.');
      return;
    }

    setUploadingPhoto(true);
    setMsg('');

    const uploadedBucket = 'profile-images';
    let uploadedPath = '';

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || user?.id;
      if (!authUid) {
        setMsg('Unable to update your profile photo. Please log in again.');
        return;
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${authUid}/${fileName}`;
      uploadedPath = filePath;

      // 1. Upload directly to Supabase Storage bucket 'profile-images'. The old
      // 'avatars' fallback bucket does not exist, so a retry there always failed.
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(uploadedBucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError || !uploadData) {
        console.error('Storage upload failed:', uploadError);
        setMsg('Unable to update your profile photo. Please try again.');
        return;
      }

      // 2. Obtain persistent public Storage URL with cache-busting timestamp
      const { data: urlData } = supabase.storage
        .from(uploadedBucket)
        .getPublicUrl(filePath);

      const rawUrl = urlData?.publicUrl || '';
      if (!rawUrl) {
        setMsg('Unable to update your profile photo. Please try again.');
        return;
      }

      const photoUrl = `${rawUrl}?v=${Date.now()}`;

      // 3. Persist to authoritative database tables (patient_profiles and users)
      if (user?.patient_id) {
        const { error: ppErr } = await supabase
          .from('patient_profiles')
          .upsert([
            {
              patient_id: user.patient_id,
              user_id: authUid,
              student_id: user.patient_id,
              full_name: profile.name || user.name,
              avatar_url: photoUrl,
              updated_at: new Date().toISOString(),
            },
          ], { onConflict: 'patient_id' });

        const { error: uErr } = await supabase
          .from('users')
          .update({ avatar: photoUrl })
          .eq('patient_id', user.patient_id);

        if (ppErr && uErr) {
          console.error('Database avatar persistence failed:', { ppErr, uErr });
          // Rollback: cleanup uploaded storage object to avoid orphaned files
          await supabase.storage.from(uploadedBucket).remove([filePath]).catch(() => {});
          setMsg('Unable to update your profile photo. Please try again.');
          return;
        }
      }

      // 4. Update live state and propagate across entire app (Header, Sidebar, Profile)
      setProfile((prev) => ({ ...prev, avatar_url: photoUrl }));
      updateUser?.({ avatar: photoUrl });
      setMsg('Photo updated successfully.');
    } catch (err) {
      console.warn('Profile photo upload error:', err);
      if (uploadedPath) {
        await supabase.storage.from(uploadedBucket).remove([uploadedPath]).catch(() => {});
      }
      setMsg('Unable to update your profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Remove Photo & revert to default placeholder
  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      // 1. Remove database references
      if (user?.patient_id) {
        await supabase
          .from('patient_profiles')
          .update({ avatar_url: null, updated_at: new Date().toISOString() })
          .eq('patient_id', user.patient_id);

        await supabase
          .from('users')
          .update({ avatar: null })
          .eq('patient_id', user.patient_id);
      }

      // 2. Clean up storage object if present
      const currentUrl = profile.avatar_url;
      if (currentUrl && currentUrl.includes('/storage/v1/object/public/')) {
        const parts = currentUrl.split('/storage/v1/object/public/');
        if (parts[1]) {
          const [bucket, ...pathParts] = parts[1].split('?')[0].split('/');
          const oldPath = pathParts.join('/');
          if (bucket && oldPath) {
            await supabase.storage.from(bucket).remove([oldPath]).catch(() => {});
          }
        }
      }

      // 3. Update state and broadcast to AuthContext
      setProfile((prev) => ({ ...prev, avatar_url: '' }));
      updateUser?.({ avatar: null });
      setMsg('Profile photo removed.');
    } catch (err) {
      console.warn('Remove photo error:', err);
      setMsg('Unable to remove profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Discard unsaved changes and revert to loaded profile
  const handleCancel = () => {
    if (originalProfileRef.current) {
      setProfile({ ...originalProfileRef.current });
    }
    setEditing(false);
    setProfileDetailsOpen(false);
    setMsg('');
  };

  const startEditing = () => {
    setProfileDetailsOpen(true);
    setEditing(true);
  };

  const toggleHealthDisclosure = (category, checked) => {
    const exclusiveCategories = ['none', 'prefer_not_to_disclose'];
    setProfile((previous) => {
      const next = new Set(previous.health_condition_categories || []);
      if (exclusiveCategories.includes(category)) {
        next.clear();
        if (checked) next.add(category);
      } else {
        exclusiveCategories.forEach((exclusive) => next.delete(exclusive));
        if (checked) next.add(category);
        else next.delete(category);
      }
      return { ...previous, health_condition_categories: [...next] };
    });
  };

  // Save profile fields
  const save = async () => {
    if (!user?.patient_id) return;
    setMsg('');

    const authoritativeName = originalProfileRef.current?.name || user?.name || profile.name;
    const parsedYear = Number(profile.year) || 1;
    const trimmedContact = normalizePhMobile(profile.contact_number) || null;
    const trimmedAddress = profile.address?.trim() || null;
    const trimmedEmergencyContact = profile.emergency_contact?.trim() || null;
    const trimmedEmergencyPhone = normalizePhMobile(profile.emergency_contact_number) || null;

    if (
      (trimmedContact && !isValidPhMobile(trimmedContact)) ||
      (trimmedEmergencyPhone && !isValidPhMobile(trimmedEmergencyPhone))
    ) {
      setMsg('Phone numbers must contain 11 digits and start with 09.');
      return;
    }

    setSaving(true);
    const trimmedBloodType = profile.blood_type?.trim() || null;
    const trimmedAllergies = profile.allergies?.trim() || null;
    const trimmedMedications = profile.medications?.trim() || null;
    const trimmedNotes = profile.notes?.trim() || null;
    const trimmedHealthConditionNotes = profile.health_condition_notes?.trim() || '';
    const existingProfileData = profile.profile_data && typeof profile.profile_data === 'object' && !Array.isArray(profile.profile_data)
      ? profile.profile_data
      : {};
    const nextProfileData = {
      ...existingProfileData,
      health_disclosure: {
        categories: [...new Set(profile.health_condition_categories || [])],
        notes: trimmedHealthConditionNotes,
      },
    };

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || user?.id || null;

      // 1. Update patients master table (preserving immutable registered name, strictly using existing columns)
      const { error: pErr } = await supabase
        .from('patients')
        .update({
          year: parsedYear,
          allergies: trimmedAllergies,
          medications: trimmedMedications,
          notes: trimmedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.patient_id);

      if (pErr) {
        console.error('Patients master record update failed:', pErr.message || pErr);
        setMsg('Unable to save your profile changes. Please try again.');
        setSaving(false);
        return;
      }

      // 2. Upsert patient_profiles extended record (where contact_number, address, emergency contact reside)
      const { error: ppErr } = await supabase
        .from('patient_profiles')
        .upsert([
          {
            patient_id: user.patient_id,
            user_id: authUid,
            student_id: user.patient_id,
            full_name: authoritativeName,
            year: parsedYear,
            contact_number: trimmedContact,
            address: trimmedAddress,
            emergency_contact: trimmedEmergencyContact,
            emergency_contact_number: trimmedEmergencyPhone,
            blood_type: trimmedBloodType,
            allergies: trimmedAllergies,
            medications: trimmedMedications,
            medical_history: trimmedNotes,
            notes: trimmedNotes,
            avatar_url: profile.avatar_url || null,
            profile_data: nextProfileData,
            updated_at: new Date().toISOString(),
          },
        ], { onConflict: 'patient_id' });

      if (ppErr) {
        console.error('Patient profiles extended record update failed:', ppErr.message || ppErr);
        setMsg('Unable to save your profile changes. Please try again.');
        setSaving(false);
        return;
      }

      // 3. Update local state & live session
      const updatedProfile = {
        ...profile,
        name: authoritativeName,
        year: parsedYear,
        contact_number: trimmedContact || '',
        address: trimmedAddress || '',
        emergency_contact: trimmedEmergencyContact || '',
        emergency_contact_number: trimmedEmergencyPhone || '',
        blood_type: trimmedBloodType || '',
        allergies: trimmedAllergies || '',
        medications: trimmedMedications || '',
        notes: trimmedNotes || '',
        profile_data: nextProfileData,
        health_condition_categories: [...new Set(profile.health_condition_categories || [])],
        health_condition_notes: trimmedHealthConditionNotes,
      };

      setProfile(updatedProfile);
      originalProfileRef.current = { ...updatedProfile };

      setMsg('Profile details saved successfully.');
      setEditing(false);
      setProfileDetailsOpen(false);
    } catch (err) {
      console.error('Save profile exception:', err.message || err);
      setMsg('Unable to save your profile changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderProfileField = ({ key, label, placeholder = 'Not provided', type = 'text' }) => {
    const value = profile[key] || '';
    const isPhoneField = type === 'tel';
    if (!editing) {
      return (
        <div className="patient-profile-detail-field" key={key}>
          <span className="patient-profile-detail-label">{label}</span>
          <strong className={value ? '' : 'is-empty'}>{value || placeholder}</strong>
        </div>
      );
    }

    const handleChange = (event) => {
      const nextValue = isPhoneField ? limitPhone(event.target.value) : event.target.value;
      setProfile((previous) => ({ ...previous, [key]: nextValue }));
    };
    return (
      <label className="patient-profile-edit-field" key={key}>
        <span className="patient-profile-detail-label">{label}</span>
        {type === 'textarea' ? (
          <textarea className="input" rows={4} value={value} onChange={handleChange} placeholder={placeholder} />
        ) : (
          <input
            className="input"
            type={type}
            inputMode={isPhoneField ? 'numeric' : undefined}
            autoComplete={isPhoneField ? 'tel-national' : undefined}
            maxLength={isPhoneField ? 11 : undefined}
            pattern={isPhoneField ? '09[0-9]{9}' : undefined}
            title={isPhoneField ? 'Enter 11 digits beginning with 09.' : undefined}
            value={value}
            onChange={handleChange}
            placeholder={isPhoneField ? '09XXXXXXXXX' : placeholder}
          />
        )}
        {isPhoneField && <span className="patient-profile-phone-hint">Enter 11 digits, starting with 09.</span>}
      </label>
    );
  };

  const healthCategories = (profile.health_condition_categories || []).filter((category) => HEALTH_DISCLOSURE_LABELS[category]);
  const healthDisclosureSummary = profile.health_condition_categories?.includes('none')
    ? 'No conditions to report'
    : profile.health_condition_categories?.includes('prefer_not_to_disclose')
      ? 'Not disclosed'
      : healthCategories.length
        ? healthCategories.map((category) => HEALTH_DISCLOSURE_LABELS[category]).join(', ')
        : 'Not provided';

  return (
    <main className="main">
      <section className="page patient-profile-page patient-profile-shell" aria-busy={profileLoading}>
        <header className="patient-profile-page-header">
          <div>
            <h1>Profile</h1>
            <p>Manage your contact details and the health information you choose to share with the clinic.</p>
          </div>
        </header>

        <section className="card patient-profile-hero" aria-label="Student profile summary">
          <div className="patient-profile-hero-top">
            <div className="patient-profile-identity">
              <div className="patient-profile-avatar-column">
                <img
                  src={profile.avatar_url || user?.avatar || avatarPlaceholder}
                  alt={profile.name || 'Patient profile photo'}
                  className="patient-profile-avatar"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="patient-profile-file-input"
                  onChange={handlePhotoSelect}
                />
                {editing && (
                  <div className="patient-profile-photo-actions">
                    <button type="button" className="btn secondary small" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                      {uploadingPhoto ? 'Uploading…' : 'Change photo'}
                    </button>
                    {profile.avatar_url && (
                      <button type="button" className="btn secondary small" onClick={handleRemovePhoto} disabled={uploadingPhoto}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="patient-profile-identity-copy">
                <div className="patient-profile-name-row">
                  <h2>{profile.name || user?.name || 'Student Patient'}</h2>
                  <span className="badge badge-neutral">Student / Patient</span>
                  <span className="badge badge-success">Active</span>
                </div>
                <p className="patient-profile-student-id">{profile.id || user?.patient_id || 'TUPM ID not on file'}</p>
                <div className="patient-profile-health-summary">
                  {healthCategories.length ? healthCategories.map((category) => (
                    <span className="patient-health-tag" key={category}>{HEALTH_DISCLOSURE_LABELS[category]}</span>
                  )) : (
                    <span className="patient-health-summary-empty">
                      {healthDisclosureSummary === 'Not provided' ? 'Health information not provided' : healthDisclosureSummary}
                    </span>
                  )}
                  {healthDisclosureSummary === 'Not provided'
                    ? <span className="patient-health-source">Not yet shared</span>
                    : <span className="patient-health-source">Patient reported</span>}
                </div>
              </div>
            </div>

            <div className="patient-profile-actions">
              {!editing ? (
                <button type="button" className="btn primary" onClick={startEditing}>Edit profile</button>
              ) : (
                <>
                  <button type="button" className="btn secondary" onClick={handleCancel} disabled={saving}>Cancel</button>
                  <button type="button" className="btn primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="patient-profile-facts">
            <div><span>Birthday</span><strong>{formatProfileDate(profile.date_of_birth)}</strong></div>
            <div><span>Degree / Course</span><strong>{profile.course || 'Not on file'}</strong></div>
            <div><span>Last visit</span><strong>{formatProfileDate(profile.last_visit_date)}</strong></div>
          </div>
        </section>

        <section className="card patient-profile-details" aria-label="Profile details">
          <div className="patient-profile-details-heading">
            <div>
              <h2>Profile details</h2>
              <p>Contact info, emergency contact, health information, and medical history.</p>
            </div>
            <button
              type="button"
              className="btn secondary patient-profile-details-toggle"
              aria-expanded={profileDetailsOpen}
              onClick={() => setProfileDetailsOpen((open) => !open)}
            >
              {profileDetailsOpen ? 'Hide details' : 'Show details'}
              <span className={`patient-profile-chevron${profileDetailsOpen ? ' is-open' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {profileDetailsOpen && (
            <div className="patient-profile-detail-groups">
              <section className="patient-profile-detail-group">
                <h3>Contact info</h3>
                <div className="patient-profile-detail-grid">
                  {renderProfileField({ key: 'contact_number', label: 'Contact phone number', placeholder: 'Not provided', type: 'tel' })}
                  {renderProfileField({ key: 'address', label: 'Current address', placeholder: 'Not provided' })}
                </div>
              </section>

              <section className="patient-profile-detail-group">
                <h3>Emergency contact</h3>
                <div className="patient-profile-detail-grid">
                  {renderProfileField({ key: 'emergency_contact', label: 'Emergency contact person', placeholder: 'Not specified' })}
                  {renderProfileField({ key: 'emergency_contact_number', label: 'Emergency phone number', placeholder: 'Not specified', type: 'tel' })}
                </div>
              </section>

              <section className="patient-profile-detail-group">
                <h3>Health information</h3>
                <div className="patient-profile-detail-grid">
                  {renderProfileField({ key: 'blood_type', label: 'Blood type', placeholder: 'Not specified' })}
                  {renderProfileField({ key: 'allergies', label: 'Known allergies', placeholder: 'None reported' })}
                  {renderProfileField({ key: 'medications', label: 'Current medications', placeholder: 'None reported' })}
                </div>
                <div className="patient-profile-health-disclosure">
                  <div>
                    <span className="patient-profile-detail-label">Health conditions or disability</span>
                    <p className="patient-profile-health-help">Optional and self-reported. This information helps clinic staff prepare; it is not a clinical diagnosis.</p>
                  </div>
                  {editing ? (
                    <>
                      <div className="patient-profile-health-options" role="group" aria-label="Health information to share with the clinic">
                        {HEALTH_DISCLOSURE_OPTIONS.map(({ id: category, label }) => (
                          <label className="patient-profile-health-option" key={category}>
                            <input
                              type="checkbox"
                              checked={(profile.health_condition_categories || []).includes(category)}
                              onChange={(event) => toggleHealthDisclosure(category, event.target.checked)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      {healthCategories.length > 0 && (
                        <label className="patient-profile-edit-field patient-profile-health-notes">
                          <span className="patient-profile-detail-label">Optional details for clinic staff</span>
                          <textarea
                            className="input"
                            rows={3}
                            maxLength={1000}
                            value={profile.health_condition_notes || ''}
                            onChange={(event) => setProfile((previous) => ({ ...previous, health_condition_notes: event.target.value }))}
                            placeholder="Share a diagnosis, accommodation, or care consideration if you choose."
                          />
                        </label>
                      )}
                    </>
                  ) : (
                    <div className="patient-profile-health-view">
                      <strong>{healthDisclosureSummary}</strong>
                      {profile.health_condition_notes && <p>{profile.health_condition_notes}</p>}
                      <span>Shared by the student; not verified as a diagnosis.</span>
                    </div>
                  )}
                </div>
              </section>

              <section className="patient-profile-detail-group">
                <h3>Medical history</h3>
                <div className="patient-profile-detail-grid">
                  {renderProfileField({ key: 'notes', label: 'Medical history and special conditions', placeholder: 'No medical history provided', type: 'textarea' })}
                </div>
              </section>
            </div>
          )}
        </section>

        <section className="card clinic-record-card" aria-label="Clinic record form">
          <div className="clinic-record-heading">
            <div>
              <h2>Clinic record form</h2>
              <p>Optional for enrolled students. Your student details are already on file; add or update your health details whenever you choose.</p>
            </div>
          </div>

          {recordLoading || profileLoading ? (
            <div className="clinic-record-loading" role="status">Loading your record…</div>
          ) : recordEditing ? (
            <PatientRecordForm
              key={`${record?.id || 'new'}-${profile.course}-${profile.date_of_birth}-${profile.sex}`}
              initial={{
                ...(record || {}),
                college_course: profile.course || '',
                date_of_birth: profile.date_of_birth || '',
                sex: profile.sex || '',
              }}
              identity={{
                college_course: profile.course,
                date_of_birth: profile.date_of_birth,
                sex: profile.sex,
              }}
              lockIdentity
              onCancel={() => setRecordEditing(false)}
              onSaved={() => {
                setRecordEditing(false);
                loadRecord();
              }}
            />
          ) : (
            <div className="clinic-record-summary">
              <div>
                {record?.submitted_at ? (
                  <span className="clinic-record-submitted"><CheckIcon size={15} /> Submitted {formatProfileDate(record.submitted_at)}</span>
                ) : (
                  <strong className="clinic-record-not-submitted">No record form submitted yet</strong>
                )}
                <p>{record?.submitted_at ? 'Your answers are on file and visible to the clinic. You can update them if anything changes.' : 'You can add your health details here if you would like. The form will not limit portal access.'}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setRecordEditing(true)}>
                Update Record Form
              </button>
            </div>
          )}
        </section>

        {/* Status Message Notification Toast */}
        {msgOpen && msg && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 2000,
              background: 'var(--card-bg, #ffffff)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '12px 18px',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)' }}>{msg}</span>
            <button
              type="button"
              className="btn small secondary"
              style={{ padding: '2px 8px', fontSize: 'var(--font-size-xs)' }}
              onClick={() => setMsgOpen(false)}
            >
              Dismiss
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

export default PatientProfilePortal;
