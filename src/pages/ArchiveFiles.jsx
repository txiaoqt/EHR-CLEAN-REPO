import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import EmptyState from '../components/EmptyState.jsx';
import RecordSummaryCard from '../components/RecordSummaryCard.jsx';
import ResultDialog from '../components/ResultDialog.jsx';
import { ArchiveIcon, FolderIcon, SearchIcon } from '../components/icons/Icons.jsx';

/**
 * Archive Files — folder-based repository of medical certificates submitted
 * during enrolment by applicants who have since elevated to enrolled students.
 *
 * Files remain in the private `enrollee-documents` bucket and are opened only
 * through short-lived signed URLs.
 */
const ArchiveFiles = () => {
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openFolderId, setOpenFolderId] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: elevatedEnrollees, error: enrolleeErr } = await supabase
        .from('enrollees')
        .select(
          'id, applicant_id, first_name, middle_name, surname, suffix, personal_email, tup_email, date_of_birth, status, elevated_at, elevated_student_id'
        )
        .eq('status', 'elevated')
        .order('elevated_at', { ascending: false });

      if (enrolleeErr) throw enrolleeErr;

      const { data: docs, error: docErr } = await supabase
        .from('enrollee_documents')
        .select(
          'id, enrollee_id, file_name, storage_path, mime_type, size_bytes, status, submitted_at, archived_at, archived_student_id, archived_student_name, archived_applicant_id, archived_tup_email'
        )
        .not('archived_at', 'is', null)
        .order('submitted_at', { ascending: false });

      if (docErr) throw docErr;

      const folderMap = new Map();

      for (const enrollee of elevatedEnrollees || []) {
        const fullName = [
          enrollee.first_name,
          enrollee.middle_name,
          enrollee.surname,
          enrollee.suffix,
        ]
          .filter(Boolean)
          .join(' ');
        folderMap.set(enrollee.id, {
          id: enrollee.id,
          studentId: enrollee.elevated_student_id || '—',
          applicantId: enrollee.applicant_id || '—',
          studentName: fullName || 'Student',
          tupEmail: enrollee.tup_email || '',
          personalEmail: enrollee.personal_email || '',
          dateOfBirth: enrollee.date_of_birth || null,
          first_name: enrollee.first_name,
          middle_name: enrollee.middle_name,
          surname: enrollee.surname,
          archivedAt: enrollee.elevated_at,
          files: [],
        });
      }

      for (const doc of docs || []) {
        if (!folderMap.has(doc.enrollee_id)) {
          folderMap.set(doc.enrollee_id, {
            id: doc.enrollee_id,
            studentId: doc.archived_student_id || '—',
            applicantId: doc.archived_applicant_id || '—',
            studentName: doc.archived_student_name || 'Student',
            tupEmail: doc.archived_tup_email || '',
            personalEmail: '',
            dateOfBirth: null,
            archivedAt: doc.archived_at,
            files: [],
          });
        }
        const folder = folderMap.get(doc.enrollee_id);
        folder.files.push(doc);
        if (!folder.archivedAt && doc.archived_at) {
          folder.archivedAt = doc.archived_at;
        }
      }

      setFolders(Array.from(folderMap.values()));
    } catch (err) {
      console.error('Could not load archived files:', err);
      setResult({
        tone: 'error',
        title: 'Could not load archive',
        message: 'Please refresh the page and try again.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const totalFolders = folders.length;
    const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);
    const latest = folders
      .map((f) => f.archivedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];
    return { totalFolders, totalFiles, latest };
  }, [folders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => {
      const hay = [
        f.studentName,
        f.studentId,
        f.applicantId,
        f.tupEmail,
        f.personalEmail,
        ...f.files.map((file) => file.file_name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [folders, search]);

  const openFile = async (file) => {
    try {
      const { data, error } = await supabase.storage
        .from('enrollee-documents')
        .createSignedUrl(file.storage_path, 300);
      if (error || !data?.signedUrl) throw new Error('Could not open the archived file.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setResult({ tone: 'error', title: 'Could not open file', message: err.message });
    }
  };

  return (
    <main className="main">
      <div className="page">
        <div
          className="page-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div className="page-header-title-block">
            <h1 className="page-header-title">Archive Files</h1>
            <div className="page-header-subtitle">
              Medical certificates and clinic records preserved when enrollees elevate to enrolled
              TUP students.
            </div>
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={() => navigate('/enrollees')}
          >
            Back to Enrollees Queue
          </button>
        </div>

        <section
          className="dashboard-kpis-grid"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 20 }}
        >
          {[
            {
              title: 'Student Folders',
              val: kpis.totalFolders,
              sub: 'Elevated enrollees',
            },
            {
              title: 'Archived Certificates',
              val: kpis.totalFiles,
              sub: 'Stored in private archive',
            },
            {
              title: 'Latest Archived',
              val: kpis.latest
                ? new Date(kpis.latest).toLocaleDateString(undefined, { dateStyle: 'medium' })
                : '—',
              sub: 'Most recent elevation',
            },
          ].map((kpi) => (
            <div className="kpi-card" key={kpi.title} style={{ padding: '16px 18px' }}>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {kpi.title}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-2xl)',
                  fontWeight: 'var(--font-weight-extrabold)',
                  color: 'var(--text)',
                  marginTop: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {kpi.val}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                {kpi.sub}
              </div>
            </div>
          ))}
        </section>

        <div className="card settings-card">
          {(loading || folders.length > 0) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                  }}
                >
                  <SearchIcon size={16} />
                </span>
                <input
                  className="input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Search folders by name, TUPM ID, Applicant ID, or file name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search archive folders"
                />
              </div>
            </div>
          )}

          {loading ? (
            <div className="settings-row-note">Loading archive folders…</div>
          ) : filtered.length === 0 ? (
            folders.length === 0 ? (
              <EmptyState
                icon={ArchiveIcon}
                title="No archived files yet"
                description="When an enrollee verifies their official @tup.edu.ph email and elevates to an enrolled student, their medical certificate submissions are automatically preserved here in folders."
              />
            ) : (
              <EmptyState
                icon={SearchIcon}
                title="No archive folders match"
                description={`Nothing matches “${search.trim()}”. Try another name or ID, or clear the search to see all ${folders.length} folders.`}
                action={
                  <button type="button" className="btn secondary" onClick={() => setSearch('')}>
                    Clear search
                  </button>
                }
              />
            )
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 14,
              }}
            >
              {filtered.map((folder) => {
                const isOpen = openFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    style={{
                      gridColumn: isOpen ? '1 / -1' : undefined,
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      background: isOpen ? 'var(--surface-raised)' : 'var(--panel)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 14,
                        padding: '16px 18px',
                        cursor: 'pointer',
                      }}
                      onClick={() => setOpenFolderId(isOpen ? null : folder.id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenFolderId(isOpen ? null : folder.id);
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: 'var(--color-primary-tint)',
                            border: '1px solid var(--color-primary-border)',
                            color: 'var(--color-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <FolderIcon size={20} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 'var(--font-size-base)',
                              fontWeight: 'var(--font-weight-bold)',
                              color: 'var(--text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {folder.studentName}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                              marginTop: 2,
                            }}
                          >
                            {folder.studentId} · Applicant {folder.applicantId}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 9999,
                            background: 'var(--surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: 'var(--text)',
                          }}
                        >
                          {folder.files.length} file{folder.files.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          padding: '16px 18px 18px',
                          borderTop: '1px solid var(--border-subtle)',
                          background: 'var(--panel)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                            marginBottom: 14,
                          }}
                        >
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                            {folder.tupEmail && <>TUP Email: {folder.tupEmail} · </>}
                            Archived{' '}
                            {folder.archivedAt
                              ? new Date(folder.archivedAt).toLocaleString()
                              : '—'}
                          </div>
                          {folder.studentId && folder.studentId !== '—' && (
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() =>
                                navigate(`/patient-profile?id=${encodeURIComponent(folder.studentId)}`)
                              }
                            >
                              Open Student Profile
                            </button>
                          )}
                        </div>

                        <div className="settings-main-grid">
                          <div className="card settings-card">
                            <header className="settings-card-head">
                              <h2>Archived medical certificates</h2>
                              <p>Files submitted during enrolment and preserved on elevation.</p>
                            </header>

                            {folder.files.length === 0 ? (
                              <div className="settings-row-note" style={{ margin: 0 }}>
                                No certificate files were attached to this folder.
                              </div>
                            ) : (
                              folder.files.map((file, idx) => (
                                <div
                                  className="settings-row has-control"
                                  key={file.id}
                                  style={
                                    idx === folder.files.length - 1
                                      ? { borderBottom: 'none', paddingBottom: 0 }
                                      : undefined
                                  }
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div className="settings-row-label">{file.file_name}</div>
                                    <div className="settings-row-note">
                                      {file.submitted_at
                                        ? `Submitted ${new Date(file.submitted_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                                        : 'Draft'}{' '}
                                      ·{' '}
                                      {file.size_bytes
                                        ? `${Math.round(file.size_bytes / 1024)} KB`
                                        : '—'}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    onClick={() => openFile(file)}
                                  >
                                    Open file
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="card settings-card">
                            <header className="settings-card-head">
                              <h2>Patient Record Form</h2>
                              <p>Answers carried over to the student record.</p>
                            </header>
                            <RecordSummaryCard
                              subjectType={
                                folder.studentId && folder.studentId !== '—' ? 'patient' : 'enrollee'
                              }
                              subjectId={
                                folder.studentId && folder.studentId !== '—'
                                  ? folder.studentId
                                  : folder.id
                              }
                              person={{
                                id: folder.studentId,
                                applicant_id: folder.applicantId,
                                name: folder.studentName,
                                first_name: folder.first_name,
                                middle_name: folder.middle_name,
                                surname: folder.surname,
                                date_of_birth: folder.dateOfBirth,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ResultDialog
        open={Boolean(result)}
        tone={result?.tone}
        title={result?.title}
        message={result?.message}
        actions={[{ label: 'Close', onClick: () => setResult(null) }]}
        onClose={() => setResult(null)}
      />
    </main>
  );
};

export default ArchiveFiles;
