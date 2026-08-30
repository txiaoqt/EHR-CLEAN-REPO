# TUP Clinic EHR — Comprehensive Black-Box Test Case Index

## Executive Specification & Quality Assurance Overview

- **Application Name:** TUP Clinic Electronic Health Records (EHR) System
- **Student / Patient Portal URL:** `https://tup-icare.tech`
- **Staff / Administrative Portal URL:** `https://tup-icare-staff.me`
- **Clinician Credentials:** `physician@tupclinic.local` / `Physician@123`
- **Student Credentials:** `qa.student01@tup.edu.ph` / `StudentTest@123`
- **Census Authorization Password:** `TUPCensus@2026`
- **Testing Methodology:** Strict Black-Box Functional & End-to-End QA Testing
- **Total Test Cases:** **244 Test Cases** (`TC001` to `TC244`)
- **Total Modules & Sections:** **30 Functional Sections (Section A – Section AD)**
- **Master DOCX Document:** [`TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx`](file:///c:/Users/Christopher%20x%20Angel/Documents/EHR-PROJECT1/TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx)

---

## Module & Test Case Range Directory

| Section # | Module / Section Title | Test Case ID Range | Case Count |
| :---: | :--- | :---: | :---: |
| **1** | Authentication, Login & Account Security | `TC001` – `TC033` | **33** |
| **2** | Patient Registration & Student ID Validation | `TC034` – `TC046` | **13** |
| **3** | Email & OTP Verification Lifecycle | `TC047` – `TC057` | **11** |
| **4** | Patient Portal — Home & Dashboard Navigation | `TC058` – `TC065` | **8** |
| **5** | Patient Portal — Events & Announcements | `TC066` – `TC070` | **5** |
| **6** | Patient Portal — Appointment Scheduling & Business Rules | `TC071` – `TC098` | **28** |
| **7** | Patient Portal — Health Records | `TC099` – `TC102` | **4** |
| **8** | Patient Portal — Profile & Avatar Photo | `TC103` – `TC109` | **7** |
| **9** | Patient Portal — Realtime Messaging & Inquiries | `TC110` – `TC124` | **15** |
| **10** | Staff Portal — Dashboard & Clinical Overview | `TC125` – `TC135` | **11** |
| **11** | Staff Portal — Appointments Schedule & Management | `TC136` – `TC144` | **9** |
| **12** | Staff Portal — Patient Directory & Registration | `TC145` – `TC150` | **6** |
| **13** | Staff Portal — Clinical Patient Profile | `TC151` – `TC156` | **6** |
| **14** | Staff Portal — Clinical Encounters & Vitals | `TC157` – `TC168` | **12** |
| **15** | Staff Portal — Pharmacy & Medical Inventory | `TC169` – `TC178` | **10** |
| **16** | Staff Portal — Reports, Census & Analytics | `TC179` – `TC183` | **5** |
| **17** | Staff Portal — Events & Email Blast Announcements | `TC184` – `TC190` | **7** |
| **18** | Staff Portal — Patient Messaging & Inquiries | `TC191` – `TC195` | **5** |
| **19** | Staff Portal — Help Center & Standard Operating Procedures | `TC196` – `TC201` | **6** |
| **20** | Staff Portal — System Settings & Offline Data Backup | `TC202` – `TC206` | **5** |
| **21** | Staff Portal — My Profile & Clinical Activity Logs | `TC207` – `TC210` | **4** |
| **22** | Role-Based Access Control (RBAC) Matrix | `TC211` – `TC213` | **3** |
| **23** | Attribute-Based Access Control (ABAC) Matrix | `TC214` – `TC215` | **2** |
| **24** | Global Theme System — Light & Dark Palette | `TC216` – `TC221` | **6** |
| **25** | Responsive Layouts & PC Access Safeguard | `TC222` – `TC226` | **5** |
| **26** | Cross-Module System Integration Workflows | `TC227` – `TC232` | **6** |
| **27** | Negative, Boundary & Security Input Testing | `TC233` – `TC235` | **3** |
| **28** | Concurrency & Multi-User Synchronized Testing | `TC236` – `TC237` | **2** |
| **29** | Data Isolation & Cross-User Privacy Safeguards | `TC238` – `TC239` | **2** |
| **30** | File Exports & Download Integrity Safeguards | `TC240` – `TC244` | **5** |

---

## Detailed Test Coverage Breakdown

### 1. User Roles & Permission Coverage
- **Patient (Student):** Self-service registration, OTP verification, password recovery, same-day and future appointment scheduling (Medical & Dental), active appointment lifecycle, medical records review, profile contact updating, photo avatar management, realtime messaging with clinicians, Light/Dark theme switching.
- **Clinic Nurse:** Clinical dashboard metrics review, appointment queue viewing and check-in status transitions, patient registry searching, vitals recording on encounters, medical inventory restock and dispense adjustments, inquiry resolution.
- **Attending Physician:** Complete clinical authority, comprehensive encounter documentation (HPI, Physical Exam, Assessment & Plan, Vitals), patient profile diagnosis management, medical summary PDF generation with doctor signature, destructive record deletion with password verification.
- **Clinic Administrator:** Global staff oversight, full inquiry oversight across all clinicians, system appearance settings, clinical census exports, offline JSON database backups.

### 2. Platform & Viewport Coverage
- **Desktop Screens (`1440px`, `1280px`, `1024px`):** Full grid layouts, collapsible sidebar rails, table responsive containers, KPI metric boards, multi-column clinical profiles.
- **Tablet Devices (`820px`, `768px`):** Adaptive 2-column to 1-column layouts, touch-friendly dropdowns, card-based clinical records.
- **Mobile Smartphones (`414px`, `390px`, `360px`):** Fixed header with brand identity, sliding navigation drawer with backdrop, full-screen conversation threads with back navigation, mobile scheduling cards.
- **PC Access Safeguard (`PCAccessRequired`):** Strict device guard requiring >= 1024px width for clinical staff portal operations while maintaining 100% mobile accessibility for students.

### 3. Core Business Rules & Validations Tested
1. **One Active Appointment Rule:** Strict restriction limiting students to at most 1 active booking (`Scheduled` or `Checked-in`). Cancelled and Completed visits release the student.
2. **Slot Capacity & Collision:** 1 booking per department/date/time slot with immediate occupied badge display and multi-user collision prevention.
3. **Same-Day vs Future Date Separation:** Same-day mode restricted to today's date in Asia/Manila; Future mode restricted to tomorrow onwards.
4. **Same-Day Slot Expiration:** Automated disabling of same-day time slots whose scheduled hours have elapsed (09:00–12:00 after 12:00, 13:00–16:00 after 16:00, 16:00–19:00 after 19:00).
5. **Clinic Operating Hours:** 07:00 to 19:00 Asia/Manila staff portal boundary enforcement.
6. **Attribute-Based Masking (ABAC):** High-sensitivity clinical assessment hiding for unauthorized staff.
7. **Email Blast Audience Filters:** Precision targeting by Year Levels (1–6) and Blood Types (A+, A-, B+, B-, AB+, AB-, O+, O-, Not Specified).
8. **Global Theme System:** 180ms smooth transitions, high contrast slate palette (`#0f172a`, `#1e293b`), and `tup-clinic-theme` storage persistence.

### 4. QA Manual Execution Instructions
1. Open the master test document [`TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx`](file:///c:/Users/Christopher%20x%20Angel/Documents/EHR-PROJECT1/TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx).
2. Execute each test case step-by-step using the web browser UI on `https://tup-icare.tech` (Patient Portal) or `https://tup-icare-staff.me` (Staff Portal).
3. Record observed findings into the blank **Actual Result** field.
4. Mark **Pass** if all observable conditions in Pass Criteria are met; mark **Fail** if any deviation occurs.
