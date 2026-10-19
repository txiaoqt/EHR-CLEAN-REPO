import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { logAudit } from '../utils.js';
import { buildRecordFormPdf, recordFormReference } from '../utils/recordFormPdf.js';
import { CheckIcon } from './icons/Icons.jsx';

/**
 * Collapsible clinic record summary + Download Form (PDF) button.
 *
 * Used in both:
 *  - Staff Enrollees review panel (`subjectType="enrollee"`)
 *  - Staff Patient Profile page (`subjectType="patient"`)
 *
 * The PDF reproduces the exact format of `Applicant Patient Record Form (1).docx`
 * (ISO header table F-MDC-8.1c-PRF, body with underlined values, and footer
 * Transaction ID / Signature table), leaving the clinic-only section at the
 * bottom blank so staff can fill it in after printing/downloading.
 */
const downloadPdfBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to begin consuming the blob URL before revoking it.
  window.setTimeout(() => URL.revokeObjectURL(url), 40000);
};

const RecordSummaryCard = ({ subjectType, subjectId, person, collapsible = true, displayMode = 'list' }) => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(() => !collapsible);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('patient_record_forms')
          .select('*')
          .eq('subject_type', subjectType)
          .eq('subject_id', String(subjectId))
          .maybeSingle();
        if (mounted) setRecord(data || null);
      } catch (err) {
        console.warn('Could not load the record form:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [subjectType, subjectId]);

  const handleDownloadPdf = async () => {
    if (!record || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const ref = recordFormReference(record);
      const doc = await buildRecordFormPdf({
        record,
        person,
        enrolmentRef: person?.applicant_id || person?.id || subjectId,
      });
      const safeId = String(person?.applicant_id || person?.id || subjectId || 'record')
        .replace(/[^\w.-]+/g, '_');
      downloadPdfBlob(doc.output('blob'), `patient-record-form-${safeId}.pdf`);

      await logAudit(
        'Record Form Downloaded',
        `Downloaded Patient Record Form (${ref || safeId})`,
        undefined,
        { type: 'export' }
      ).catch(() => {});
    } catch (err) {
      console.error('Could not generate Patient Record Form PDF:', err);
      setDownloadError('The Patient Record Form could not be downloaded. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="settings-row-note">Loading…</div>;
  if (!record) {
    return (
      <div className="settings-row-note" style={{ margin: 0 }}>
        The {subjectType === 'enrollee' ? 'applicant' : 'student'} has not completed the clinic record form yet.
      </div>
    );
  }

  const fields = [
    ['College / Course', record.college_course, false],
    ['Sex', record.sex, false],
    ['Date of Birth', record.date_of_birth, false],
    ['Cell Phone', record.cell_phone, false],
    ['Permanent Address', record.permanent_address, true],
    ['Permanent Tel.', record.permanent_tel, false],
    ['Current Address', record.current_address, true],
    ['Current Tel.', record.current_tel, false],
    ['Guardian', record.guardian_name, false],
    ['Guardian Tel.', record.guardian_tel, false],
    ['Guardian Cell Phone', record.guardian_cp, false],
    ['Guardian Address', record.guardian_address, true],
    ['Past Medical History', record.past_medical_history, true],
    ['Vaccinations', record.vaccinations, true],
    ['Family History', record.family_history, true],
  ];

  return (
    <div className={`record-form${displayMode === 'grid' ? ' record-form-summary-grid' : ''}`}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div
          className="record-form-message"
          style={{
            background: 'var(--color-emerald-bg)',
            color: 'var(--color-emerald-text)',
            marginBottom: 0,
          }}
        >
          <CheckIcon size={15} />
          <span>
            Submitted{' '}
            {record.submitted_at
              ? new Date(record.submitted_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
              : '—'}
          </span>
        </div>

        <button
          type="button"
          className="btn secondary"
          onClick={handleDownloadPdf}
          disabled={downloading}
        >
          {downloading ? 'Preparing PDF…' : 'Download Form (PDF)'}
        </button>
      </div>

      {downloadError && (
        <p className="record-form-field-error" role="alert" style={{ margin: '-4px 0 12px' }}>
          {downloadError}
        </p>
      )}

      {collapsible ? (
        <button
          type="button"
          className="record-form-head"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ borderRadius: 10, border: '1px solid var(--border-subtle)' }}
        >
          <span className="record-form-head-text">
            <span className="record-form-title">{open ? 'Hide answers' : 'Show answers'}</span>
            <span className="record-form-blurb">
              What was answered on the Patient Record Form (F-MDC-8.1c-PRF).
            </span>
          </span>
          <span className="record-form-chevron" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      ) : (
        <div className="record-form-blurb" style={{ marginBottom: 10 }}>
          What was answered on the Patient Record Form (F-MDC-8.1c-PRF).
        </div>
      )}

      {(open || !collapsible) && (
        <div className="record-form-summary-fields" style={{ marginTop: 12 }}>
          {fields.map(([label, value, wide]) => (
            <div
              key={label}
              className={`record-form-summary-field${displayMode === 'grid' && wide ? ' is-wide' : ''}`}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div
                style={{
                  fontSize: 'var(--font-size-2xs)',
                  fontWeight: 'var(--font-weight-bold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted)',
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text)',
                  marginTop: 2,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {value || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecordSummaryCard;
