# src/scripts/test_case_generator/sections_part4.py
from generator_core import TestCase, TestSection

def get_sections_part4():
    sections = []

    # -------------------------------------------------------------------------
    # SECTION 46: STAFF REPORTS — PDF/CSV EXPORT & PASSWORD AUTHORIZATION
    # -------------------------------------------------------------------------
    sec46_cases = [
        TestCase(
            id="",
            description="Export analytics report as PDF with password authorization",
            preconditions="Staff is on /reports with generated report.",
            steps=[
                "Click 'Export' menu dropdown -> select 'Export PDF Report'.",
                "In Password Authorization modal, enter valid authorization password 'TUPCensus@2026'.",
                "Click 'Confirm & Export'."
            ],
            test_data="Password: TUPCensus@2026",
            expected_result="PDF document generates containing clinic header, charts, and summary census table, and downloads to local machine.",
            pass_criteria="PDF downloads cleanly and opens with complete report data.",
            fail_criteria="Export fails or bypasses password prompt."
        ),
        TestCase(
            id="",
            description="Export raw analytics data as CSV file",
            preconditions="Staff is on /reports.",
            steps=[
                "Click 'Export' -> select 'Export CSV Data'.",
                "Enter authorization password and confirm."
            ],
            test_data="Type: CSV Export",
            expected_result="CSV file containing structured encounter rows downloads successfully.",
            pass_criteria="CSV downloads and is readable in spreadsheet editors.",
            fail_criteria="CSV download fails."
        ),
        TestCase(
            id="",
            description="Export blocked when incorrect authorization password is provided",
            preconditions="Password authorization prompt is open on /reports.",
            steps=[
                "Enter incorrect password 'WrongReportPass'.",
                "Click 'Confirm & Export'."
            ],
            test_data="Password: WrongReportPass",
            expected_result="System rejects export and displays 'Incorrect authorization password.'",
            pass_criteria="Export is prevented and error message appears in modal.",
            fail_criteria="File downloads despite invalid password."
        )
    ]
    sections.append(TestSection(46, "Staff Reports — PDF/CSV Export & Password Authorization", "Password-protected PDF/CSV report exports, authorization modals, and data protection.", sec46_cases))

    # -------------------------------------------------------------------------
    # SECTION 47: STAFF EVENTS MANAGEMENT — CRUD & STATUSES
    # -------------------------------------------------------------------------
    sec47_cases = [
        TestCase(
            id="",
            description="Create and publish new health announcement/event on /events",
            preconditions="Staff is on /events.",
            steps=[
                "Click '+ Create Event' button.",
                "Enter Title: 'Annual Campus Flu Vaccination Drive 2026'.",
                "Select Category: 'Vaccination'.",
                "Enter Date, Start Time: '08:30', End Time: '16:30'.",
                "Enter Location: 'University Gymnasium'.",
                "Enter Description: 'Free quadrivalent influenza vaccination for all registered TUP students.'",
                "Set Status: 'Published' (is_published checked).",
                "Click 'Save Event'."
            ],
            test_data="Title: 'Annual Campus Flu Vaccination Drive 2026', Category: Vaccination, Status: Published",
            expected_result="Event is saved and published. It appears immediately in the staff events list and becomes visible on the Patient Portal events feed.",
            pass_criteria="Event card appears under Published events.",
            fail_criteria="Event fails to save or does not publish."
        ),
        TestCase(
            id="",
            description="Edit existing event details and update status from Draft to Published",
            preconditions="An event exists with status 'Draft'.",
            steps=[
                "Click 'Edit' (pencil icon) on the draft event card.",
                "Update Location to 'University Clinic Room 102'.",
                "Change status to 'Published'.",
                "Click 'Save Changes'."
            ],
            test_data="Status: Published",
            expected_result="Event updates to Published status with new location.",
            pass_criteria="Event card status badge updates to Published.",
            fail_criteria="Status fails to update."
        ),
        TestCase(
            id="",
            description="Delete event from events registry",
            preconditions="Staff is on /events.",
            steps=[
                "Click 'Delete' (trash icon) on an event card.",
                "Confirm deletion in confirmation dialog."
            ],
            test_data="Action: Delete event",
            expected_result="Event is permanently removed from the events list.",
            pass_criteria="Event card disappears from list.",
            fail_criteria="Event remains visible."
        )
    ]
    sections.append(TestSection(47, "Staff Events Management — CRUD & Statuses", "Event creation, status lifecycles (Published, Draft, Cancelled, Archived), editing, and deletion.", sec47_cases))

    # -------------------------------------------------------------------------
    # SECTION 48: STAFF EVENT EMAIL BLAST — AUDIENCE FILTERS
    # -------------------------------------------------------------------------
    sec48_cases = [
        TestCase(
            id="",
            description="Open Email Blast modal and verify audience filter menus (Year Levels & Blood Types)",
            preconditions="Staff is on /events with at least one published event.",
            steps=[
                "Click 'Email Blast' button on a published event card.",
                "Observe Email Announcement modal.",
                "Inspect Year Level dropdown options (All Years, Year 1, Year 2, Year 3, Year 4, Year 5, Year 6).",
                "Inspect Blood Type dropdown options (All Blood Types, A+, A-, B+, B-, AB+, AB-, O+, O-, Not Specified)."
            ],
            test_data="N/A",
            expected_result="Email Blast modal opens displaying total eligible recipient count and full year/blood type filter controls.",
            pass_criteria="All 7 year options and all 10 blood type options are present in filter dropdowns.",
            fail_criteria="Modal fails to open or filter options are missing."
        ),
        TestCase(
            id="",
            description="Filter email blast recipients by specific Year Level (e.g. Year 1 students only)",
            preconditions="Email Blast modal is open.",
            steps=[
                "Select Year Level dropdown -> choose 'Year 1'.",
                "Observe eligible recipient list."
            ],
            test_data="Filter: Year 1",
            expected_result="Recipient list filters in realtime to display only Year 1 students; recipient count badge updates.",
            pass_criteria="Only Year 1 students are listed in the recipient table.",
            fail_criteria="Students from other years remain visible."
        ),
        TestCase(
            id="",
            description="Filter email blast recipients by Blood Type (e.g. AB- or O+ donors for blood drive)",
            preconditions="Email Blast modal is open for a Blood Donation Drive event.",
            steps=[
                "Select Blood Type dropdown -> choose 'O+'.",
                "Observe filtered recipient table."
            ],
            test_data="Filter: Blood Type O+",
            expected_result="Recipient list displays only students whose health profile indicates blood type 'O+'.",
            pass_criteria="Filtered list contains exclusively O+ students.",
            fail_criteria="Students with different blood types appear."
        ),
        TestCase(
            id="",
            description="Combined multi-criteria filtering (Year 2 + Blood Type AB+ + Keyword Search)",
            preconditions="Email Blast modal is open.",
            steps=[
                "Select Year Level: 'Year 2'.",
                "Select Blood Type: 'AB+'.",
                "Type 'Dela Cruz' in recipient search input."
            ],
            test_data="Filters: Year 2, Blood Type AB+, Search: 'Dela Cruz'",
            expected_result="List filters down to students satisfying all three criteria simultaneously.",
            pass_criteria="Recipient list accurately reflects combined multi-filter intersection.",
            fail_criteria="Filter intersection produces incorrect results or errors."
        )
    ]
    sections.append(TestSection(48, "Staff Event Email Blast — Audience Filters", "Audience segmentation by Year Levels (1–6), Blood Types (All, A+, A-, B+, B-, AB+, AB-, O+, O-, Not Specified), and combined search.", sec48_cases))

    # -------------------------------------------------------------------------
    # SECTION 49: STAFF EVENT EMAIL BLAST — SELECTION & DISPATCH
    # -------------------------------------------------------------------------
    sec49_cases = [
        TestCase(
            id="",
            description="Toggle 'Select All Visible' recipients checkbox in Email Blast modal",
            preconditions="Email Blast modal is open with filtered recipient list.",
            steps=[
                "Click 'Select All Visible' checkbox.",
                "Observe all visible student rows check on.",
                "Click 'Select All Visible' again.",
                "Observe all rows uncheck."
            ],
            test_data="Action: Toggle select all",
            expected_result="All visible rows toggle between selected and deselected; 'Selected Recipients: X' counter updates accurately in realtime.",
            pass_criteria="Checkbox toggles all rows and updates selection counter.",
            fail_criteria="Counter does not match checked boxes."
        ),
        TestCase(
            id="",
            description="Dispatch email blast announcement to selected student recipients",
            preconditions="Recipients are selected in Email Blast modal.",
            steps=[
                "Verify selected recipient count (e.g. 5 students).",
                "Click 'Send Email Announcement' button.",
                "Observe dispatch progress and result."
            ],
            test_data="Selected recipients: 5 students",
            expected_result="System dispatches announcement and displays a green delivery result banner: 'Successfully dispatched event announcement to 5 recipient(s).'",
            pass_criteria="Success banner confirms delivery count.",
            fail_criteria="Dispatch fails or reports error."
        ),
        TestCase(
            id="",
            description="Attempt to dispatch email blast with 0 recipients selected",
            preconditions="All recipient checkboxes are unchecked (0 selected).",
            steps=[
                "Observe 'Send Email Announcement' button state.",
                "Attempt to click the button."
            ],
            test_data="Selected count: 0",
            expected_result="Send button is disabled or clicking alerts: 'Please select at least one recipient.'",
            pass_criteria="Dispatch is blocked when zero recipients are selected.",
            fail_criteria="System attempts dispatch with empty recipient list."
        )
    ]
    sections.append(TestSection(49, "Staff Event Email Blast — Selection & Dispatch", "Batch recipient selection, manual checkboxes, dispatch progress, and delivery confirmation banners.", sec49_cases))

    # -------------------------------------------------------------------------
    # SECTION 50: STAFF MESSAGING — INBOX, SEARCH & STUDENT AVATAR
    # -------------------------------------------------------------------------
    sec50_cases = [
        TestCase(
            id="",
            description="View Staff Messaging inbox with student avatars, names, and concern badges",
            preconditions="Staff is on /patient-messages (or /messages).",
            steps=[
                "Observe left-hand conversation inbox list.",
                "Inspect conversation items:",
                "- Student Avatar Photo (with fallback placeholder)",
                "- Student Full Name & Student ID (e.g. TUPM-25-0001)",
                "- Concern Category badge (e.g. 'Medical inquiry', 'Appointment concern')",
                "- Timestamp and latest message snippet"
            ],
            test_data="N/A",
            expected_result="Staff inbox renders active student inquiries with student avatars, badges, and snippet previews.",
            pass_criteria="All inquiry metadata elements are rendered cleanly.",
            fail_criteria="Inbox fails to load or avatars are broken."
        ),
        TestCase(
            id="",
            description="Search staff inbox by Student Name or Student ID",
            preconditions="Staff is on /patient-messages.",
            steps=[
                "Type 'TUPM-25-0001' in the conversation search bar."
            ],
            test_data="Search query: 'TUPM-25-0001'",
            expected_result="Inbox list filters to display only conversations from student TUPM-25-0001.",
            pass_criteria="Matching student conversation appears in list.",
            fail_criteria="Non-matching conversations remain visible."
        )
    ]
    sections.append(TestSection(50, "Staff Messaging — Inbox, Search & Student Avatar", "Staff inbox layout, student profile avatars, concern category badges, and inbox search.", sec50_cases))

    # -------------------------------------------------------------------------
    # SECTION 51: STAFF MESSAGING — THREAD REPLY & REALTIME DELIVERY
    # -------------------------------------------------------------------------
    sec51_cases = [
        TestCase(
            id="",
            description="Staff sends reply to student in active conversation thread",
            preconditions="Staff has selected an active student conversation on /patient-messages.",
            steps=[
                "Inspect selected chat header showing student name and concern type.",
                "Type clinical reply in the bottom composer: 'Please proceed to the clinic at 10:00 AM for vital signs check.'",
                "Click Send button (paper plane icon) or press Enter."
            ],
            test_data="Reply text: 'Please proceed to the clinic at 10:00 AM...'",
            expected_result="Message appears on the right side with clinician name and timestamp. Student receives reply in realtime on their portal.",
            pass_criteria="Message is sent and appended to thread immediately.",
            fail_criteria="Message fails to send or composer does not clear."
        ),
        TestCase(
            id="",
            description="Realtime receipt of incoming student reply on staff messaging screen",
            preconditions="Staff is viewing active thread. Student sends reply from Patient Portal.",
            steps=[
                "Observe staff chat window as student sends reply from separate browser window.",
                "Do NOT refresh page."
            ],
            test_data="Student message: 'Noted doctor, see you at 10:00 AM.'",
            expected_result="Student's message bubble appears on the left side in realtime with student avatar and timestamp.",
            pass_criteria="Incoming message appears dynamically without page refresh.",
            fail_criteria="Message does not arrive until manual refresh."
        )
    ]
    sections.append(TestSection(51, "Staff Messaging — Thread Reply & Realtime Delivery", "Staff reply composition, chat bubble alignment, and bidirectional realtime message synchronization.", sec51_cases))

    # -------------------------------------------------------------------------
    # SECTION 52: STAFF MESSAGING — INQUIRY RESOLUTION & HISTORY
    # -------------------------------------------------------------------------
    sec52_cases = [
        TestCase(
            id="",
            description="Staff resolves student inquiry via 'Resolve Inquiry' action modal",
            preconditions="An active conversation is open on /patient-messages.",
            steps=[
                "Click 'Resolve Inquiry' / 'Mark as Resolved' button in the chat header.",
                "In Resolve Confirmation modal, click 'Confirm & Resolve'."
            ],
            test_data="Action: Resolve conversation",
            expected_result="Conversation status updates to 'Resolved'. The thread is removed from the 'Active' inbox and moved to 'History' tab on both staff and patient portals.",
            pass_criteria="Conversation transitions cleanly to History tab.",
            fail_criteria="Resolution fails or thread stays in Active list."
        ),
        TestCase(
            id="",
            description="View resolved conversations under Staff Messaging 'History' tab",
            preconditions="Staff is on /patient-messages.",
            steps=[
                "Click 'History' tab at top of inbox list.",
                "Select a resolved conversation."
            ],
            test_data="Tab: History",
            expected_result="Resolved conversation thread opens in read-only mode with a banner: 'This inquiry was marked as resolved.'",
            pass_criteria="Resolved history is accessible and clearly marked.",
            fail_criteria="History tab is empty or throws error."
        )
    ]
    sections.append(TestSection(52, "Staff Messaging — Inquiry Resolution & History", "Inquiry resolution confirmation modal, transition to History tab, and read-only thread state.", sec52_cases))

    # -------------------------------------------------------------------------
    # SECTION 53: STAFF MESSAGING — SECURITY & ROLE ISOLATION
    # -------------------------------------------------------------------------
    sec53_cases = [
        TestCase(
            id="",
            description="Administrator role has global visibility across all staff-student inquiries",
            preconditions="Logged in as Admin on /patient-messages.",
            steps=[
                "Inspect inbox list."
            ],
            test_data="Role: Admin",
            expected_result="Admin can view inquiries addressed to all clinicians across the university clinic for clinical oversight.",
            pass_criteria="Full inquiry oversight is accessible to Administrator.",
            fail_criteria="Admin is restricted from viewing general inquiries."
        ),
        TestCase(
            id="",
            description="Clinician sees only inquiries assigned to them or general clinic inquiries",
            preconditions="Logged in as Physician (Dr. Santos). Another physician (Dr. Reyes) has private direct inquiries.",
            steps=[
                "Inspect inbox list for Dr. Santos."
            ],
            test_data="Clinician: Dr. Santos",
            expected_result="Dr. Santos sees only general clinic inquiries and inquiries specifically addressed to Dr. Santos.",
            pass_criteria="Inquiry segregation is preserved between clinicians.",
            fail_criteria="Dr. Santos can improperly view private inquiries addressed exclusively to other doctors."
        ),
        TestCase(
            id="",
            description="Student A cannot access Student B's private messages",
            preconditions="Student A is logged in. Student B has private conversations with clinic staff.",
            steps=[
                "Student A inspects /patient/messages."
            ],
            test_data="Student A: TUPM-25-0001, Student B: TUPM-25-0002",
            expected_result="Student A sees only their own conversations. Student B's conversations are completely inaccessible.",
            pass_criteria="Complete patient conversation isolation is enforced.",
            fail_criteria="Student A can view or access Student B's messages."
        )
    ]
    sections.append(TestSection(53, "Staff Messaging — Security & Role Isolation", "Role-based inquiry visibility, clinician privacy segregation, and complete patient-to-patient isolation.", sec53_cases))

    # -------------------------------------------------------------------------
    # SECTION 54: STAFF HELP CENTER — FAQS, EMERGENCY HOTLINES & SOPS
    # -------------------------------------------------------------------------
    sec54_cases = [
        TestCase(
            id="",
            description="View Help Center FAQ accordion items and clinical operating procedures",
            preconditions="Staff is on /help.",
            steps=[
                "Observe FAQ section.",
                "Click on FAQ item 'How to record clinical vitals & encounters'.",
                "Observe accordion expansion.",
                "Click on another FAQ item 'How to manage inventory reorders'."
            ],
            test_data="N/A",
            expected_result="FAQ items expand smoothly to reveal step-by-step clinical guidance and SOP instructions.",
            pass_criteria="Accordion expands/collapses and displays complete help text.",
            fail_criteria="Accordions fail to expand or text is clipped."
        ),
        TestCase(
            id="",
            description="Verify Emergency Clinic Hotlines and Support Contact Information on /help",
            preconditions="Staff is on /help.",
            steps=[
                "Inspect 'Support Channels & Hotlines' card.",
                "Verify Clinic Emergency Hotline number, University Support Email, and Operating Hours (07:00–19:00 Asia/Manila)."
            ],
            test_data="N/A",
            expected_result="Contact card displays official clinic hotline, support email, and operating hours.",
            pass_criteria="All contact details and hours are clearly visible.",
            fail_criteria="Contact information is missing."
        )
    ]
    sections.append(TestSection(54, "Staff Help Center — FAQs, Emergency Hotlines & SOPs", "Help center FAQ accordions, clinical standard operating procedures, and emergency hotline channels.", sec54_cases))

    # -------------------------------------------------------------------------
    # SECTION 55: STAFF SETTINGS — ACCOUNT SECURITY & CHANGE PASSWORD
    # -------------------------------------------------------------------------
    sec55_cases = [
        TestCase(
            id="",
            description="View Staff Settings Account & Security overview",
            preconditions="Staff is on /settings.",
            steps=[
                "Observe 'Account & Security' section.",
                "Verify displayed account name, email address, and role."
            ],
            test_data="N/A",
            expected_result="Settings displays logged-in staff identity and role badge.",
            pass_criteria="Staff account details match active session.",
            fail_criteria="Settings displays wrong user details."
        ),
        TestCase(
            id="",
            description="Change staff account password from Settings with matching confirmation",
            preconditions="Staff is on /settings.",
            steps=[
                "Enter New Password: 'UpdatedStaffPass@2026' (>= 6 characters).",
                "Enter Confirm Password: 'UpdatedStaffPass@2026'.",
                "Click 'Change Password'."
            ],
            test_data="New Password: UpdatedStaffPass@2026",
            expected_result="System updates password and displays green success banner: 'Password changed successfully!'",
            pass_criteria="Password updates and subsequent login requires new password.",
            fail_criteria="Password update fails."
        ),
        TestCase(
            id="",
            description="Change password validation — block mismatched passwords in Settings",
            preconditions="Staff is on /settings.",
            steps=[
                "Enter 'PassOne@2026' in New Password.",
                "Enter 'PassTwo@2026' in Confirm Password.",
                "Click 'Change Password'."
            ],
            test_data="PassOne vs PassTwo",
            expected_result="System blocks update and displays: 'Passwords do not match.'",
            pass_criteria="Validation alert prevents update.",
            fail_criteria="Mismatched passwords submitted."
        )
    ]
    sections.append(TestSection(55, "Staff Settings — Account Security & Change Password", "Staff security overview, password update workflows, and confirmation validation.", sec55_cases))

    # -------------------------------------------------------------------------
    # SECTION 56: STAFF SETTINGS — PREFERENCES & OFFLINE JSON BACKUP
    # -------------------------------------------------------------------------
    sec56_cases = [
        TestCase(
            id="",
            description="Toggle preferences (Auto-save Drafts, Email Notifications) and click 'Save Changes'",
            preconditions="Staff is on /settings.",
            steps=[
                "Toggle 'Auto-save drafts' switch to ON.",
                "Toggle 'Email notifications' switch to ON.",
                "Click 'Save Changes'."
            ],
            test_data="Settings toggles",
            expected_result="Success alert confirms settings saved. Preferences persist across page reloads.",
            pass_criteria="Settings are saved and remain active after reload.",
            fail_criteria="Preferences revert on reload."
        ),
        TestCase(
            id="",
            description="Generate offline JSON system backup with password authorization",
            preconditions="Staff is on /settings. Scroll to 'Data Backup & Export' card.",
            steps=[
                "Click 'Generate System Backup' button.",
                "In Password Verification modal, enter staff password.",
                "Click 'Confirm & Generate Backup'."
            ],
            test_data="Password: Physician@123",
            expected_result="System exports an offline JSON backup containing all clinical tables, patient profiles, encounters, inventory, and audit logs. File downloads to disk.",
            pass_criteria="JSON backup file downloads and Last Backup timestamp updates.",
            fail_criteria="Backup generation fails."
        )
    ]
    sections.append(TestSection(56, "Staff Settings — Preferences & Offline JSON Backup", "Draft auto-save toggles, notification preferences, and password-protected JSON database backups.", sec56_cases))

    # -------------------------------------------------------------------------
    # SECTION 57: STAFF MY PROFILE — DETAILS & ENGAGEMENT STATS
    # -------------------------------------------------------------------------
    sec57_cases = [
        TestCase(
            id="",
            description="View Staff My Profile overview card and clinical engagement metrics",
            preconditions="Staff is on /my-profile.",
            steps=[
                "Observe Profile Overview Card:",
                "- Staff Avatar Photo",
                "- Display Name (with Dr./Nr./Admin prefix)",
                "- Role (Physician / Nurse / Administrator)",
                "- Email Address",
                "- Clinical Stats: Encounters Created, Appointments Scheduled"
            ],
            test_data="N/A",
            expected_result="Profile card displays complete staff identity, professional prefix, and real clinical engagement statistics.",
            pass_criteria="All staff details and metric counts load accurately.",
            fail_criteria="Profile shows incorrect stats or blank fields."
        ),
        TestCase(
            id="",
            description="Edit staff display name on My Profile",
            preconditions="Staff is on /my-profile.",
            steps=[
                "Click 'Edit Profile' button.",
                "Update Name to 'Dr. John Doe'.",
                "Click 'Save Changes'."
            ],
            test_data="Name: Dr. John Doe",
            expected_result="Display name updates in profile card, sidebar, and top header with success alert.",
            pass_criteria="Name updates across application UI.",
            fail_criteria="Update fails."
        )
    ]
    sections.append(TestSection(57, "Staff My Profile — Details & Engagement Stats", "Staff profile overview, clinical engagement stats (encounters created, appointments scheduled), and display name editing.", sec57_cases))

    # -------------------------------------------------------------------------
    # SECTION 58: STAFF MY PROFILE — ACTIVITY HISTORY & AUDIT LOGS
    # -------------------------------------------------------------------------
    sec58_cases = [
        TestCase(
            id="",
            description="View Recent Activity feed on My Profile",
            preconditions="Staff is on /my-profile. Staff has performed clinical actions.",
            steps=[
                "Scroll to 'Recent Activity' panel.",
                "Observe activity feed entries (login events, encounters created, appointments scheduled)."
            ],
            test_data="N/A",
            expected_result="Activity feed lists recent chronological actions with formatted timestamps and descriptions.",
            pass_criteria="Activity entries are displayed chronologically.",
            fail_criteria="Feed is empty despite recent actions."
        ),
        TestCase(
            id="",
            description="Open 'View All Activity' modal and inspect tabs (Audit Logs, Encounters, Appointments)",
            preconditions="Staff is on /my-profile.",
            steps=[
                "Click 'View All Activity' button.",
                "Inspect 'Audit Logs' tab.",
                "Click 'Encounters' tab.",
                "Click 'Appointments' tab."
            ],
            test_data="N/A",
            expected_result="Modal opens with full historical tables for Audit Logs, Encounters, and Appointments.",
            pass_criteria="All 3 modal tabs load their respective historical records.",
            fail_criteria="Modal fails to open or tabs show no data."
        )
    ]
    sections.append(TestSection(58, "Staff My Profile — Activity History & Audit Logs", "Staff recent activity feed, full activity modal, and audit log history.", sec58_cases))

    # -------------------------------------------------------------------------
    # SECTION 59: ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
    # -------------------------------------------------------------------------
    sec59_cases = [
        TestCase(
            id="",
            description="Administrator role has full access to all administrative modules",
            preconditions="Logged in as Admin on Staff Portal.",
            steps=[
                "Verify sidebar navigation links: Dashboard, Appointments, Patients, Encounters, Reports, Inventory, Events, Messages, Settings, My Profile."
            ],
            test_data="Role: Admin",
            expected_result="All modules and administrative settings are visible and accessible.",
            pass_criteria="Admin has unrestricted access to all portal routes.",
            fail_criteria="Any standard module is blocked for Admin."
        ),
        TestCase(
            id="",
            description="Physician role has full clinical authority (Encounter Assessment & Plan, Delete permissions)",
            preconditions="Logged in as Physician.",
            steps=[
                "Navigate to /encounter -> verify Assessment & Plan is editable.",
                "Navigate to /appointments -> verify Delete button is accessible with password.",
                "Navigate to /inventory -> verify Delete item button is accessible."
            ],
            test_data="Role: Physician",
            expected_result="Physician has full access to diagnostic fields and clinical deletion actions.",
            pass_criteria="Clinical authority is fully granted.",
            fail_criteria="Clinical actions are blocked for Physician."
        ),
        TestCase(
            id="",
            description="Nurse role restrictions — deletion actions blocked across all modules",
            preconditions="Logged in as Nurse on Staff Portal.",
            steps=[
                "Navigate to /appointments -> verify Delete appointment is hidden/disabled.",
                "Navigate to /patients -> view patient profile -> verify Delete patient is hidden/disabled.",
                "Navigate to /encounters -> verify Delete encounter is hidden/disabled.",
                "Navigate to /inventory -> verify Delete item is hidden/disabled."
            ],
            test_data="Role: Nurse",
            expected_result="Destructive deletion actions are hidden or disabled across all modules for Nurse accounts.",
            pass_criteria="Nurse is blocked from deleting clinical records.",
            fail_criteria="Nurse is allowed to delete records."
        )
    ]
    sections.append(TestSection(59, "Role-Based Access Control (RBAC) Matrix", "Permission matrix enforcement for Administrator, Physician, Nurse, and Patient roles.", sec59_cases))

    # -------------------------------------------------------------------------
    # SECTION 60: ATTRIBUTE-BASED ACCESS CONTROL (ABAC) MATRIX
    # -------------------------------------------------------------------------
    sec60_cases = [
        TestCase(
            id="",
            description="High-sensitivity clinical record access control",
            preconditions="An encounter has sensitivity_level marked as 'high' or 'restricted'.",
            steps=[
                "Nurse views the high-sensitivity encounter on /encounters.",
                "Physician views the same encounter."
            ],
            test_data="Sensitivity: High",
            expected_result="Nurse is restricted from viewing confidential assessment/plan details; Physician has full authorized access.",
            pass_criteria="Sensitivity-based field masking is enforced for Nurse.",
            fail_criteria="Confidential records leak to unauthorized staff."
        ),
        TestCase(
            id="",
            description="Record ownership awareness for clinician edits",
            preconditions="An encounter was authored by Dr. Santos. Another clinician opens the encounter.",
            steps=[
                "Verify attending clinician identity displayed on record."
            ],
            test_data="Author: Dr. Santos",
            expected_result="System displays authoring clinician name and enforces appropriate editing permissions.",
            pass_criteria="Author identity is preserved and protected.",
            fail_criteria="Author identity is lost."
        )
    ]
    sections.append(TestSection(60, "Attribute-Based Access Control (ABAC) Matrix", "High-sensitivity record protection, confidential field masking, and clinician ownership rules.", sec60_cases))

    return sections
