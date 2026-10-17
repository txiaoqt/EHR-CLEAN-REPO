// src/pages/patient/PatientHelp.jsx
import React, { useState } from 'react';
import { PhoneIcon, MailIcon, ClockIcon, ChevronDownIcon } from '../../components/icons/Icons.jsx';

/**
 * Help for patients.
 *
 * Split out of the staff Help page, which was serving two audiences at once: its
 * four Standard Operating Guides are staff procedures ("How to manage
 * pharmaceutical inventory"), while its contact details, privacy note and some
 * FAQs are things a patient needs. Moving the whole page would have left staff
 * without their procedures and given students instructions they cannot act on.
 *
 * So the contact block and the privacy note appear in BOTH places — both
 * audiences need the phone number and the hours — while the guides and FAQs here
 * are written for students.
 */
const PatientHelp = () => {
  const [expandedGuide, setExpandedGuide] = useState(null);
  const [expandedFaq, setExpandedFaq] = useState(null);

  const contact = [
    {
      Icon: PhoneIcon,
      label: 'Clinic Hotline',
      value: '(02) 301-3001 loc. 605',
      note: 'Call during clinic hours for urgent concerns',
    },
    {
      Icon: MailIcon,
      label: 'Email',
      value: 'clinic@tup.edu.ph',
      note: 'For questions about your records or booking',
    },
    {
      Icon: ClockIcon,
      label: 'Clinic Hours',
      value: 'Monday – Friday, 7:00 AM – 7:00 PM',
      note: 'Ayala Blvd., Ermita, Manila',
    },
  ];

  const guides = [
    {
      title: 'How to book an appointment',
      content:
        "Open Schedule and choose a date and time that suits you. You can hold one active booking at a time — once it is completed or cancelled, you can book again. Your reference code is kept for future appointments.",
    },
    {
      title: 'How to cancel or change a booking',
      content:
        "Open Schedule, find your booking and cancel it. The slot is released immediately so you can book a different time. If you cannot attend, please cancel rather than simply not showing up — a booking that is not completed by 5:00 PM on the day is cancelled automatically.",
    },
    {
      title: 'How to view your visit records',
      content:
        "Open Records. Every visit you have had appears there with the clinician who saw you, the reason for the visit, the assessment and any medicines you were given.",
    },
    {
      title: 'How to acknowledge a visit',
      content:
        "On a completed visit in Records, choose Sign to confirm the treatment and medicines you received. You draw your signature and submit it; it then appears on the clinic's Medical Log next to your visit. If you notice something that does not match what you were given, please speak to the clinic before signing.",
    },
    {
      title: 'How to message the clinic',
      content:
        "Open Messages to send a question to clinic staff. You can attach a photo if it helps them assess something — a rash, for example. A staff member replies in the same thread. Once an inquiry is resolved it becomes read-only, and any photo you sent is deleted from storage.",
    },
  ];

  const faqs = [
    {
      question: 'How do I reset my password?',
      answer:
        "Open Settings and choose Change password, or use the 'Forgot password' link on the sign-in screen. A reset link is sent to your registered TUP email address.",
    },
    {
      question: 'Who can see my health records?',
      answer:
        "Only clinic staff, and only the parts their role requires — a nurse sees less than a physician. Access is role-based, and every view of patient data is recorded in an audit log. Photos you send in Messages are stored privately and are deleted when the inquiry is resolved.",
    },
    {
      question: 'How are appointments seen in order?',
      answer:
        "Same-day appointments are seen in queue order. Your queue number is assigned when you book, and a cancelled booking releases its number so the queue stays compact. Future bookings keep a reference code rather than a queue number until the day.",
    },
    {
      question: 'What if I cannot attend my appointment?',
      answer:
        "Cancel it from Schedule. Bookings that are not completed by 5:00 PM on the day are cancelled automatically so the slot is not held unnecessarily.",
    },
    {
      question: 'Do I need to sign anything after my visit?',
      answer:
        "Yes — once the clinic has completed your visit, you can sign in Records to confirm the treatment and medicines you received. It is optional but recommended: it is your own record of what you were given.",
    },
  ];

  const accordionRow = (isOpen, onToggle, title, body, key) => (
    <div
      key={key}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          padding: '14px 18px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          color: 'var(--text)',
          fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--font-size-base)',
        }}
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          style={{
            color: 'var(--muted)',
            display: 'inline-flex',
            transition: 'transform 160ms ease-out',
            transform: isOpen ? 'rotate(180deg)' : 'none',
          }}
        >
          <ChevronDownIcon size={16} />
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: '0 18px 14px 18px',
            color: 'var(--muted)',
            fontSize: 'var(--font-size-base)',
            lineHeight: 1.5,
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 12,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );

  return (
    <main className="main">
      <section className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1
            className="patient-page-title"
            style={{ margin: 0, fontSize: 'var(--font-size-page-title)', fontWeight: 'var(--font-weight-extrabold)', color: 'var(--text)' }}
          >
            Help &amp; Clinic Support
          </h1>
          <div className="patient-page-subtitle" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 'var(--font-size-base)' }}>
            How to book, what your records mean, and how to reach the clinic.
          </div>
        </div>

        {/* Contact */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
          {contact.map(({ Icon, label, value, note }) => (
            <div key={label} className="card" style={{ padding: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  color: 'var(--color-primary)',
                }}
              >
                <Icon size={17} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
                  {label}
                </div>
                <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text)', marginTop: 2 }}>{value}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 2 }}>{note}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Privacy */}
        <div className="card" style={{ padding: 18, marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)' }}>
            Your records and privacy
          </h2>
          <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--muted)', lineHeight: 1.55 }}>
            Your medical records are held in the TUP Clinic EHR, which uses PostgreSQL row-level security, Supabase
            authentication and role-based access control. Staff see only what their role requires, and every access to
            patient data is recorded in an audit log. Photos you send to the clinic are stored privately and are removed
            when the inquiry is resolved.
          </p>
        </div>

        {/* Guides */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginBottom: 12 }}>
            Using the portal
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {guides.map((g, idx) =>
              accordionRow(expandedGuide === idx, () => setExpandedGuide(expandedGuide === idx ? null : idx), g.title, g.content, g.title)
            )}
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text)', marginBottom: 12 }}>
            Frequently asked questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map((f, idx) =>
              accordionRow(expandedFaq === idx, () => setExpandedFaq(expandedFaq === idx ? null : idx), f.question, f.answer, f.question)
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default PatientHelp;
