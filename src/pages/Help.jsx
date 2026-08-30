// src/pages/Help.jsx
import React, { useState } from 'react';
import { HelpIcon, PhoneIcon, MailIcon, ClockIcon } from '../components/icons/Icons.jsx';

const Help = () => {
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [expandedGuide, setExpandedGuide] = useState(null);

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const toggleGuide = (index) => {
    setExpandedGuide(expandedGuide === index ? null : index);
  };

  const faqs = [
    {
      question: "How to reset my password?",
      answer: "To reset your password, click on your profile in the bottom left corner, select 'My Profile' or 'Settings', then choose 'Change Password'. Follow the instructions to set a new password."
    },
    {
      question: "What if I encounter an error?",
      answer: "If you encounter an error, first try refreshing the page. If the problem persists, take a screenshot and submit it to clinic-support@tup.edu.ph with a description of the action being performed."
    },
    {
      question: "How to export patient data and reports?",
      answer: "Patient data can be exported through the Reports page. Navigate to 'Reports' in the sidebar, select your desired date range and criteria, then click 'Export CSV' or 'Export PDF' to download the report."
    },
    {
      question: "Who can access patient health records?",
      answer: "Patient health records are accessible only to authorized clinic medical staff (Physicians, Nurses) and designated clinic administrators. All patient data access is strictly logged in audit trails for compliance with Data Privacy Act (DPA) and health privacy regulations."
    },
    {
      question: "How are patient appointments triaged?",
      answer: "Students book appointments through the Patient Portal or on-site kiosk. Medical personnel review upcoming queues in the Appointments page, where status can be updated from Booked to Checked-In, In-Consultation, and Completed."
    }
  ];

  const guides = [
    {
      title: "How to register a new patient",
      content: "Navigate to Patients → click 'Register Patient' → complete the student identification, demographic data, and initial medical questionnaire → Save record."
    },
    {
      title: "How to record clinical vitals & encounters",
      content: "Go to Encounters → 'Create New Encounter' → select the patient → record vital signs (BP, PR, RR, Temp, BMI), physical findings, diagnoses, and medical prescriptions. Finalize the encounter to lock the clinical record."
    },
    {
      title: "How to manage pharmaceutical inventory",
      content: "Navigate to Inventory → click 'Add Stock' to record incoming supplies, or edit item dosage, expiration dates, and minimum threshold alerts. Dispensing is automatically logged upon encounter completion."
    },
    {
      title: "How to generate statistical clinic reports",
      content: "Go to Reports → select the report category (Consultations, Morbidity, Inventory Dispensation, or Census) → enter the date interval → click Run to view summaries and export certified PDF documents."
    }
  ];

  return (
    <main className="main">
      <section className="page help-page" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
            Help & Campus Clinic Support
          </h1>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13.5 }}>
            Frequently asked questions, clinical guides, technical specifications, and campus clinic helpdesk resources.
          </div>
        </div>

        {/* Campus Clinic Helpdesk & Hotline Contact Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--color-primary-tint)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PhoneIcon size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Clinic Hotline</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>(02) 8301-3001 loc. 605</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 2 }}>Direct line for urgent clinic inquiries</div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--color-blue-bg)',
                color: 'var(--color-blue-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MailIcon size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Support Email</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>clinic@tup.edu.ph</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 2 }}>Medical & portal technical support</div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ClockIcon size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Clinic Operating Hours</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Monday – Friday · 7:00 AM – 7:00 PM</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 2 }}>Ayala Blvd, Ermita, Manila</div>
            </div>
          </div>
        </div>

        {/* Technical Architecture Overview */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '18px 22px',
            marginBottom: 26,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--muted)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, fontSize: 14.5 }}>
            Electronic Health Records & Compliance Overview
          </div>
          <div>
            The Technological University of the Philippines Manila (TUP Manila) Clinic Management EHR system utilizes PostgreSQL Row-Level Security (RLS), Supabase Auth JWT identity verification, role-based access control (RBAC), and immutable audit logs. Patient inquiries and medical records adhere to strict institutional data privacy and health confidentiality guidelines.
          </div>
        </div>

        {/* User Guides Accordion */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Standard Operating Guides
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {guides.map((g, idx) => (
              <div
                key={idx}
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
                  onClick={() => toggleGuide(idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: 14
                  }}
                >
                  <span>{g.title}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 16 }}>
                    {expandedGuide === idx ? '−' : '+'}
                  </span>
                </button>
                {expandedGuide === idx && (
                  <div
                    style={{
                      padding: '0 18px 14px 18px',
                      color: 'var(--muted)',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      borderTop: '1px solid var(--border-subtle)'
                    }}
                  >
                    {g.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section Accordion */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map((f, idx) => (
              <div
                key={idx}
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
                  onClick={() => toggleFaq(idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: 14
                  }}
                >
                  <span>{f.question}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 16 }}>
                    {expandedFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {expandedFaq === idx && (
                  <div
                    style={{
                      padding: '0 18px 14px 18px',
                      color: 'var(--muted)',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      borderTop: '1px solid var(--border-subtle)'
                    }}
                  >
                    {f.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Help;
