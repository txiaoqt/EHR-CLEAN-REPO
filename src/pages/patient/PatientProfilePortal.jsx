// src/pages/patient/PatientProfilePortal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useAuth } from '../../AuthContext.jsx';
import avatarPlaceholder from '../../assets/images/avatar-placeholder.jpg';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PatientProfilePortal = () => {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState({
    id: '',
    name: '',
    year: '',
    contact_number: '',
    address: '',
    emergency_contact: '',
    emergency_contact_number: '',
    blood_type: '',
    medications: '',
    allergies: '',
    notes: '',
    avatar_url: '',
  });

  const [editing, setEditing] = useState(false);
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

      // 2. Query users record for avatar
      let uAvatar = user?.avatar || '';
      try {
        const { data: uData } = await supabase
          .from('users')
          .select('avatar')
          .eq('patient_id', user.patient_id)
          .maybeSingle();
        if (uData?.avatar) uAvatar = uData.avatar;
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

      setProfile({
        id: user.patient_id,
        name: pData?.name || extData?.full_name || user.name || '',
        year: pData?.year || extData?.year || '',
        contact_number: extData?.contact_number || '',
        address: extData?.address || '',
        emergency_contact: extData?.emergency_contact || '',
        emergency_contact_number: extData?.emergency_contact_number || '',
        blood_type: extData?.blood_type || '',
        medications: pData?.medications || extData?.medications || '',
        allergies: pData?.allergies || extData?.allergies || '',
        notes: pData?.notes || extData?.notes || '',
        avatar_url: resolvedAvatar,
      });

      if (resolvedAvatar && resolvedAvatar !== user?.avatar) {
        updateUser?.({ avatar: resolvedAvatar });
      }
    };

    loadProfile();
    return () => { mounted = false; };
  }, [user?.patient_id, user?.name]);

  useEffect(() => {
    if (msg) setMsgOpen(true);
  }, [msg]);

  // Handle Photo Selection & Upload
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again
    e.target.value = '';

    // Validation 1: MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setMsg('Invalid image format. Please upload a JPEG, PNG, or WEBP photo.');
      return;
    }

    // Validation 2: File size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMsg('Image size exceeds 5MB limit. Please choose a smaller photo.');
      return;
    }

    setUploadingPhoto(true);
    setMsg('');

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || user?.id || 'anonymous';
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${authUid}/${fileName}`;

      let photoUrl = '';

      // Try uploading to Supabase Storage bucket 'avatars'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        photoUrl = urlData?.publicUrl || '';
      }

      // Fallback: If Supabase storage is not configured or in local test environment, convert to Base64
      if (!photoUrl) {
        photoUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // 1. Update state
      setProfile((prev) => ({ ...prev, avatar_url: photoUrl }));

      // 2. Persist to public.patient_profiles
      if (user?.patient_id) {
        await supabase
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

        // 3. Persist to public.users
        await supabase
          .from('users')
          .update({ avatar: photoUrl })
          .eq('patient_id', user.patient_id);
      }

      // 4. Update live AuthContext & localStorage
      updateUser?.({ avatar: photoUrl });
      setMsg('Profile photo updated successfully.');
    } catch (err) {
      console.warn('Profile photo upload error:', err);
      setMsg(`Failed to update profile photo: ${err.message || 'Unknown error'}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Remove Photo & revert to default
  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      setProfile((prev) => ({ ...prev, avatar_url: '' }));

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

      updateUser?.({ avatar: null });
      setMsg('Profile photo removed.');
    } catch (err) {
      console.warn('Remove photo error:', err);
      setMsg('Failed to remove profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Save profile fields
  const save = async () => {
    if (!user?.patient_id || !profile.name.trim()) return;
    setSaving(true);
    setMsg('');

    const payload = {
      name: profile.name.trim(),
      year: Number(profile.year || 1),
      allergies: profile.allergies || null,
      medications: profile.medications || null,
      notes: profile.notes || null,
    };

    // 1. Update patients master
    const { error: pErr } = await supabase
      .from('patients')
      .update(payload)
      .eq('id', user.patient_id);

    if (pErr) {
      setMsg(`Unable to save profile: ${pErr.message}`);
      setSaving(false);
      return;
    }

    // 2. Update patient_profiles extended record
    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || null;
      await supabase
        .from('patient_profiles')
        .upsert([
          {
            patient_id: user.patient_id,
            user_id: authUid,
            student_id: user.patient_id,
            full_name: payload.name,
            year: payload.year,
            contact_number: profile.contact_number || null,
            address: profile.address || null,
            emergency_contact: profile.emergency_contact || null,
            emergency_contact_number: profile.emergency_contact_number || null,
            blood_type: profile.blood_type || null,
            allergies: payload.allergies,
            medications: payload.medications,
            notes: payload.notes,
            avatar_url: profile.avatar_url || null,
            updated_at: new Date().toISOString(),
          }
        ], { onConflict: 'patient_id' });
    } catch (_) {}

    updateUser?.({ name: payload.name });
    setMsg('Profile details saved successfully.');
    setEditing(false);
    setSaving(false);
  };

  const renderField = (label, value, placeholder = 'None provided') => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4, minHeight: 20 }}>
        {value || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{placeholder}</span>}
      </div>
    </div>
  );

  return (
    <main className="main">
      <section className="page patient-profile-page" style={{ width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Page Header */}
        <div className="page-header patient-profile-header" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>Profile</h2>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>
            Manage your student details, emergency contacts, and personal health information.
          </div>
        </div>

        {/* Profile Identity Card (Cohesive, left-aligned identity block with integrated Edit Action) */}
        <div className="card patient-identity-card" style={{ padding: 20, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 12, width: '100%', boxSizing: 'border-box' }}>
          <div className="patient-identity-card-inner" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            
            {/* Identity & Avatar Section */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: '1 1 280px', minWidth: 0 }}>
              {/* Avatar */}
              <div className="patient-identity-avatar-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <img
                  src={profile.avatar_url || user?.avatar || avatarPlaceholder}
                  alt={profile.name || 'Patient Avatar'}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #ffffff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                    background: 'var(--bg, #f1f5f9)',
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />
                {/* Photo Controls (Visible ONLY in Edit Mode) */}
                {editing && (
                  <div className="patient-photo-controls" style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ fontSize: 11, padding: '3px 8px', width: '100%', whiteSpace: 'nowrap' }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </button>
                    {profile.avatar_url ? (
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ fontSize: 11, padding: '2px 8px', width: '100%', color: 'var(--danger)', whiteSpace: 'nowrap' }}
                        onClick={handleRemovePhoto}
                        disabled={uploadingPhoto}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Identity Info (Left-aligned, scannable, compact) */}
              <div className="patient-identity-info-section" style={{ flex: 1, minWidth: 0 }}>
                {!editing ? (
                  <div>
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                      {profile.name || user?.name || 'Student Patient'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className="badge badge-primary" style={{ fontWeight: 700, fontSize: 11, padding: '2px 8px' }}>
                        Student / Patient
                      </span>
                      <span className="badge badge-success" style={{ fontWeight: 600, fontSize: 11, padding: '2px 8px' }}>
                        Active
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, fontWeight: 500 }}>
                      <strong style={{ color: 'var(--text)' }}>{profile.id || user?.patient_id || 'TUPM-XX-XXXX'}</strong>
                      <span style={{ margin: '0 6px' }}>·</span>
                      <span>{profile.year ? `Year ${profile.year}` : 'Year not specified'}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--text)' }}>
                        Full Name *
                      </label>
                      <input
                        className="input"
                        style={{ width: '100%', height: 36, fontSize: 13 }}
                        value={profile.name}
                        onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--text)' }}>
                        Academic Year Level
                      </label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="6"
                        style={{ width: '100%', height: 36, fontSize: 13 }}
                        value={profile.year}
                        onChange={(e) => setProfile((p) => ({ ...p, year: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons Integrated into Identity Card */}
            <div className="patient-identity-actions" style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
              {!editing ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: 13 }}
                  onClick={() => setEditing(true)}
                >
                  Edit Profile
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: '8px 14px', fontSize: 13 }}
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ padding: '8px 16px', fontSize: 13 }}
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Structured Profile Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Section 1: Contact Information */}
          <div className="card" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              Contact Information
            </h3>
            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {renderField('Contact Phone Number', profile.contact_number, 'None provided')}
                {renderField('Residential / Campus Address', profile.address, 'None provided')}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Contact Phone Number
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. 0917-123-4567"
                    value={profile.contact_number}
                    onChange={(e) => setProfile((p) => ({ ...p, contact_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Residential / Campus Address
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Ayala Blvd, Ermita, Manila"
                    value={profile.address}
                    onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Emergency Contact */}
          <div className="card" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              Emergency Contact
            </h3>
            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {renderField('Emergency Contact Person', profile.emergency_contact, 'None specified')}
                {renderField('Emergency Phone Number', profile.emergency_contact_number, 'None specified')}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Emergency Contact Person
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Maria Carbon (Parent/Guardian)"
                    value={profile.emergency_contact}
                    onChange={(e) => setProfile((p) => ({ ...p, emergency_contact: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Emergency Phone Number
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. 0918-987-6543"
                    value={profile.emergency_contact_number}
                    onChange={(e) => setProfile((p) => ({ ...p, emergency_contact_number: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Health Information */}
          <div className="card" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              Health Information
            </h3>
            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {renderField('Blood Type', profile.blood_type, 'Not specified')}
                {renderField('Known Allergies', profile.allergies, 'None reported')}
                {renderField('Current Active Medications', profile.medications, 'None reported')}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Blood Type
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. O+, A+, B+"
                    value={profile.blood_type}
                    onChange={(e) => setProfile((p) => ({ ...p, blood_type: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Known Allergies
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Penicillin, Pollen, Peanuts"
                    value={profile.allergies}
                    onChange={(e) => setProfile((p) => ({ ...p, allergies: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                    Current Active Medications
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Salbutamol inhaler as needed"
                    value={profile.medications}
                    onChange={(e) => setProfile((p) => ({ ...p, medications: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Medical History & Clinical Notes */}
          <div className="card" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              Medical History & Clinical Notes
            </h3>
            {!editing ? (
              <div>
                {renderField('Patient Medical Notes & Special Conditions', profile.notes, 'No special conditions noted')}
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text)' }}>
                  Patient Medical Notes & Special Conditions
                </label>
                <textarea
                  className="input"
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                  placeholder="Enter any medical history, chronic conditions, or clinic notes..."
                  value={profile.notes}
                  onChange={(e) => setProfile((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

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
            <span style={{ fontSize: 14, fontWeight: 600 }}>{msg}</span>
            <button
              type="button"
              className="btn small secondary"
              style={{ padding: '2px 8px', fontSize: 12 }}
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
