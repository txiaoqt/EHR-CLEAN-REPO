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
  const originalProfileRef = useRef(null);

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
        contact_number: extData?.contact_number || pData?.contact || '',
        address: extData?.address || '',
        emergency_contact: extData?.emergency_contact || '',
        emergency_contact_number: extData?.emergency_contact_number || '',
        blood_type: extData?.blood_type || '',
        medications: extData?.medications || pData?.medications || '',
        allergies: extData?.allergies || pData?.allergies || '',
        notes: extData?.notes || extData?.medical_history || pData?.notes || '',
        avatar_url: resolvedAvatar,
      };

      setProfile(loadedProfile);
      originalProfileRef.current = { ...loadedProfile };

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

    let uploadedBucket = 'profile-images';
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

      // 1. Upload directly to Supabase Storage bucket 'profile-images' (with avatars fallback)
      let { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        // Fallback check for avatars bucket
        const fallbackRes = await supabase.storage
          .from('avatars')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (!fallbackRes.error && fallbackRes.data) {
          uploadedBucket = 'avatars';
          uploadData = fallbackRes.data;
          uploadError = null;
        }
      }

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
    setMsg('');
  };

  // Save profile fields
  const save = async () => {
    if (!user?.patient_id) return;
    setSaving(true);
    setMsg('');

    const authoritativeName = originalProfileRef.current?.name || user?.name || profile.name;
    const parsedYear = Number(profile.year) || 1;
    const trimmedContact = profile.contact_number?.trim() || null;
    const trimmedAddress = profile.address?.trim() || null;
    const trimmedEmergencyContact = profile.emergency_contact?.trim() || null;
    const trimmedEmergencyPhone = profile.emergency_contact_number?.trim() || null;
    const trimmedBloodType = profile.blood_type?.trim() || null;
    const trimmedAllergies = profile.allergies?.trim() || null;
    const trimmedMedications = profile.medications?.trim() || null;
    const trimmedNotes = profile.notes?.trim() || null;

    try {
      const authUid = user?.auth_user_id || (await supabase.auth.getUser())?.data?.user?.id || user?.id || null;

      // 1. Update patients master table (preserving immutable registered name)
      const { error: pErr } = await supabase
        .from('patients')
        .update({
          year: parsedYear,
          contact: trimmedContact,
          allergies: trimmedAllergies,
          medications: trimmedMedications,
          notes: trimmedNotes,
        })
        .eq('id', user.patient_id);

      if (pErr) {
        console.error('Patients update error:', pErr);
        setMsg('Unable to save your profile changes. Please try again.');
        setSaving(false);
        return;
      }

      // 2. Upsert patient_profiles extended record
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
            updated_at: new Date().toISOString(),
          },
        ], { onConflict: 'patient_id' });

      if (ppErr) {
        console.error('Patient profiles update error:', ppErr);
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
      };

      setProfile(updatedProfile);
      originalProfileRef.current = { ...updatedProfile };

      setMsg('Profile details saved successfully.');
      setEditing(false);
    } catch (err) {
      console.error('Save profile exception:', err);
      setMsg('Unable to save your profile changes. Please try again.');
    } finally {
      setSaving(false);
    }
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    {/* Read-Only Full Name in Edit Mode */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 4 }}>
                        Full Name
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word', paddingTop: 2 }}>
                        {profile.name || user?.name || 'Student Patient'}
                      </div>
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
                    onClick={handleCancel}
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
                {renderField('Current Address', profile.address, 'None provided')}
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
                    Current Address
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
