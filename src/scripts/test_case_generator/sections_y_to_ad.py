# src/scripts/test_case_generator/sections_y_to_ad.py
from generator_core import TestCase, TestSection

def get_sections_y_to_ad():
    sections = []

    # =========================================================================
    # SECTION Y — RESPONSIVE DESIGN & PC ACCESS SAFEGUARD
    # =========================================================================
    sec_y_cases = [
        TestCase(
            id="",
            description="Patient Portal navigation on mobile smartphone viewport (390px width)",
            preconditions="Patient Portal opened on mobile viewport (390x844px).",
            steps=[
                "Observe top fixed header with TUP clinic brand logo and hamburger menu button.",
                "Tap hamburger menu button.",
                "Observe mobile navigation drawer sliding in with backdrop.",
                "Tap 'Appointments / Schedule' link in drawer.",
                "Observe drawer closing and page navigating."
            ],
            test_data="Viewport: 390x844px (Mobile)",
            expected_result="Mobile drawer opens cleanly over backdrop; tapping link navigates to schedule and closes drawer without horizontal page overflow.",
            pass_criteria="Mobile drawer navigates smoothly without layout clipping.",
            fail_criteria="Horizontal scrollbar appears or menu is inaccessible."
        ),
        TestCase(
            id="",
            description="Patient Messaging full-screen conversation view on mobile device",
            preconditions="Student is on /patient/messages on a mobile device.",
            steps=[
                "Observe inbox list occupying full mobile width.",
                "Tap on a conversation.",
                "Observe transition to active chat thread with top '← Back to Inquiries' navigation button.",
                "Tap '← Back to Inquiries'."
            ],
            test_data="Viewport: 390x844px (Mobile)",
            expected_result="Mobile view toggles smoothly between conversation list and active chat view with back button.",
            pass_criteria="Clean mobile chat navigation without overlapping elements.",
            fail_criteria="Chat and list overlap or cannot navigate back."
        ),
        TestCase(
            id="",
            description="Staff Portal accessed on a desktop screen viewport (>= 1024px width)",
            preconditions="Browser window width is 1280px or higher on Staff Portal.",
            steps=[
                "Open Staff Portal on standard desktop monitor.",
                "Navigate to https://tup-icare-staff.me/dashboard."
            ],
            test_data="Viewport: 1366x768px (Desktop)",
            expected_result="Staff Portal renders normally without device blocking banner.",
            pass_criteria="Login form and clinical navigation are fully accessible.",
            fail_criteria="PCAccessRequired blocking screen appears on desktop."
        ),
        TestCase(
            id="",
            description="Staff Portal PC Access Safeguard on mobile viewports (< 1024px width)",
            preconditions="Browser viewport is resized to mobile width (390px) on Staff Portal.",
            steps=[
                "Resize browser window or use mobile device emulation to 390px width.",
                "Navigate to https://tup-icare-staff.me/dashboard."
            ],
            test_data="Viewport: 390x844px (Mobile)",
            expected_result="System activates PC Access Safeguard and displays PCAccessRequired modal: 'PC / Desktop Access Required' with an option to log out.",
            pass_criteria="Blocking overlay appears with clinic logo and instruction to use PC/laptop.",
            fail_criteria="Staff administrative tables render in cramped/broken state on mobile without safeguard."
        ),
        TestCase(
            id="",
            description="Staff Portal collapsible sidebar rail on desktop (1440px)",
            preconditions="Staff is logged in on desktop monitor.",
            steps=[
                "Click sidebar toggle button (chevron/menu icon).",
                "Observe sidebar collapsing to icon-only rail width.",
                "Verify main content grid expands smoothly.",
                "Click toggle button again to expand."
            ],
            test_data="Viewport: 1440x900px",
            expected_result="Sidebar collapses and expands smoothly; main content grid adjusts layout without table clipping.",
            pass_criteria="Sidebar toggles cleanly and content area expands.",
            fail_criteria="Sidebar breaks layout or overlaps content."
        )
    ]
    sections.append(TestSection(25, "Responsive Layouts & PC Access Safeguard", "Mobile headers, sliding navigation drawers, touch targets, collapsible sidebar rails, and PC access guard (< 1024px blocking on staff).", sec_y_cases))

    # =========================================================================
    # SECTION Z — CROSS-MODULE INTEGRATION
    # =========================================================================
    sec_z_cases = [
        TestCase(
            id="",
            description="Student appointment booking immediately reflects in Staff Appointments Schedule",
            preconditions="Student logs in on User Portal. Clinician logs in on Staff Portal.",
            steps=[
                "Student books Medical Clinic, Tomorrow, Slot 1 (09:00-12:00) with reason 'Mild flu symptoms'.",
                "Student receives Reference Code APT-YYYYMMDD-XXXX.",
                "Clinician navigates to /appointments on Staff Portal and selects Tomorrow's date tab."
            ],
            test_data="Student: TUPM-25-0001, Slot: Tomorrow 09:00-12:00",
            expected_result="The student's newly booked appointment appears in Staff Schedule table with status 'Scheduled', correct student ID, department, service, and time.",
            pass_criteria="Appointment is visible on Staff schedule with matching reference details.",
            fail_criteria="Booking fails to reflect on staff portal."
        ),
        TestCase(
            id="",
            description="Complete messaging lifecycle: Student Inquiry -> Staff Inbox -> Staff Reply -> Resolution -> History",
            preconditions="Student is on Patient Portal. Clinician is on Staff Portal.",
            steps=[
                "1. Student creates New Inquiry: 'Can I request a medical certificate for PE class?' (Medical inquiry).",
                "2. Clinician sees new inquiry in Staff Inbox under Active tab and clicks it.",
                "3. Clinician replies: 'Yes, please bring your ID to the clinic tomorrow morning.'",
                "4. Student sees clinician reply in realtime on Patient Portal.",
                "5. Clinician clicks 'Resolve Inquiry' and confirms.",
                "6. Verify conversation moves to History on both Staff and Student portals."
            ],
            test_data="Complete 6-step cross-portal messaging lifecycle",
            expected_result="All lifecycle phases execute seamlessly with bidirectional message delivery, realtime arrival, and synchronized resolution.",
            pass_criteria="Full inquiry lifecycle completes with matching state across both surfaces.",
            fail_criteria="Any step fails or state is out of sync."
        ),
        TestCase(
            id="",
            description="Finalized clinical encounter updates Patient Records, Dashboard KPIs, and Census Reports",
            preconditions="Clinician is on Staff Portal. Student is on Patient Portal.",
            steps=[
                "1. Clinician records new encounter for student TUPM-25-0001 (Diagnosis: 'Allergic Rhinitis', BP: 120/80, Temp: 36.8).",
                "2. Finalize encounter.",
                "3. Student opens /patient/records -> verify new visit appears under Completed Visits.",
                "4. Clinician opens /dashboard -> verify 'Encounters Today' count increments.",
                "5. Clinician opens /reports -> verify 'Allergic Rhinitis' appears in Top Diagnoses report."
            ],
            test_data="Diagnosis: Allergic Rhinitis, Patient: TUPM-25-0001",
            expected_result="Encounter propagates accurately across Student Medical Records, Staff Dashboard KPI metrics, and Clinical Census reports.",
            pass_criteria="All 3 modules update consistently with new clinical encounter.",
            fail_criteria="Encounter fails to reflect in records or analytics."
        ),
        TestCase(
            id="",
            description="Dispensing inventory item updates Inventory quantity, Transaction History, and Dashboard Alerts",
            preconditions="Item 'Cetirizine 10mg' has stock 12 and reorder level 10.",
            steps=[
                "1. On /inventory, dispense 4 boxes (new stock: 8, below reorder level 10).",
                "2. Verify stock shows 8 with amber 'Low Stock' badge.",
                "3. Open Transaction History modal -> verify dispense record.",
                "4. Navigate to /dashboard -> verify Alerts card increments Low Stock count and includes 'Cetirizine 10mg'."
            ],
            test_data="Item: Cetirizine 10mg, Dispense: 4 boxes",
            expected_result="Stock quantity updates, transaction audit is logged, and Dashboard low stock alert triggers dynamically.",
            pass_criteria="Inventory decrement synchronizes with audit logs and Dashboard alerts.",
            fail_criteria="Dashboard alert is not triggered."
        ),
        TestCase(
            id="",
            description="Student self-registration creates profile verifiable in Staff Patient Directory",
            preconditions="A new student registers on Patient Portal with Student ID 'TUPM-25-0999'.",
            steps=[
                "1. Student completes registration and OTP verification.",
                "2. Clinician navigates to /patients on Staff Portal.",
                "3. Click 'Register Patient' -> search 'TUPM-25-0999'."
            ],
            test_data="Student ID: TUPM-25-0999",
            expected_result="Student appears in searchable student directory with verified name and year level ready for clinical patient registration.",
            pass_criteria="Student account is discoverable in staff directory lookup.",
            fail_criteria="Student cannot be found in directory."
        ),
        TestCase(
            id="",
            description="Patient profile photo update propagates to header avatar and messaging sender photo",
            preconditions="Student uploads a new custom avatar photo on /patient/profile.",
            steps=[
                "Upload and save new photo.",
                "Check top navbar avatar.",
                "Navigate to /patient/messages and inspect message bubble avatar."
            ],
            test_data="Action: Update avatar photo",
            expected_result="New photo updates immediately across navbar, profile view, and chat message bubbles.",
            pass_criteria="Avatar photo propagates to all user-facing surfaces.",
            fail_criteria="Old avatar photo lingers."
        )
    ]
    sections.append(TestSection(26, "Cross-Module System Integration Workflows", "End-to-end multi-module data synchronization (Booking to Staff Schedule, Messaging lifecycle, Encounters to Records, Inventory to Alerts, and Avatar propagation).", sec_z_cases))

    # =========================================================================
    # SECTION AA — NEGATIVE / EDGE / BOUNDARY TESTING
    # =========================================================================
    sec_aa_cases = [
        TestCase(
            id="",
            description="Rapid repeated button clicks on appointment booking submission (Debounce test)",
            preconditions="Student is on /patient/schedule with valid slot selected.",
            steps=[
                "Rapidly click 'Confirm & Book Appointment' button 5 times in quick succession."
            ],
            test_data="5 rapid clicks",
            expected_result="Button enters saving state ('Booking…') on first click and disables, creating exactly 1 appointment without duplicate records.",
            pass_criteria="Exactly 1 appointment is created; no duplicates or server errors.",
            fail_criteria="Multiple duplicate bookings are created."
        ),
        TestCase(
            id="",
            description="Simulated script injection string in text fields (Chief Complaint, Notes, Messages)",
            preconditions="Staff is creating an encounter on /encounter.",
            steps=[
                "Enter Chief Complaint: '<script>alert(\"XSS\")</script> Routine Checkup'.",
                "Save encounter.",
                "View encounter in list and Patient Profile."
            ],
            test_data="Input: '<script>alert(\"XSS\")</script> Routine Checkup'",
            expected_result="Text is safely sanitized and rendered as plain string text. No alert popup or script execution occurs.",
            pass_criteria="Script payload is treated as inert text string without execution.",
            fail_criteria="Script executes in browser."
        ),
        TestCase(
            id="",
            description="Excessively long text string input in reason and remarks fields (Boundary test)",
            preconditions="Staff is on /inventory adjusting stock.",
            steps=[
                "Enter Reason text containing 500 characters.",
                "Confirm adjustment."
            ],
            test_data="Text: 500 characters string",
            expected_result="System safely handles or truncates string according to maximum field limits without crashing or breaking table layout.",
            pass_criteria="Long text is safely accommodated or capped.",
            fail_criteria="Database error or UI layout distortion occurs."
        )
    ]
    sections.append(TestSection(27, "Negative, Boundary & Security Input Testing", "Double-click debouncing, XSS sanitization, boundary string lengths, and input resilience.", sec_aa_cases))

    # =========================================================================
    # SECTION AB — CONCURRENCY & MULTI-USER
    # =========================================================================
    sec_ab_cases = [
        TestCase(
            id="",
            description="Multi-tab conflicting appointment booking attempt by same student",
            preconditions="Student has scheduling open in Tab 1 and Tab 2.",
            steps=[
                "In Tab 1, book Slot 1 for Tomorrow -> booking succeeds.",
                "Without refreshing, switch to Tab 2 and attempt to book Slot 2 for Tomorrow."
            ],
            test_data="Same student booking in 2 tabs",
            expected_result="Tab 2 submission is rejected because student already holds an active appointment.",
            pass_criteria="Second booking is blocked; student holds exactly 1 active appointment.",
            fail_criteria="Student successfully books 2 active appointments."
        ),
        TestCase(
            id="",
            description="Realtime message race condition between student and clinician",
            preconditions="Student and clinician type and click send at the exact same second in an active conversation.",
            steps=[
                "Student clicks Send in Tab 1.",
                "Simultaneously, clinician clicks Send in Tab 2."
            ],
            test_data="Concurrent send actions",
            expected_result="Both messages are saved cleanly and rendered in proper chronological order in chat threads without dropping messages.",
            pass_criteria="Both messages appear in correct order on both screens.",
            fail_criteria="One message is dropped or thread corrupts."
        )
    ]
    sections.append(TestSection(28, "Concurrency & Multi-User Synchronized Testing", "Multi-tab booking collision prevention, simultaneous messaging race handling, and session state concurrency.", sec_ab_cases))

    # =========================================================================
    # SECTION AC — DATA ISOLATION & PRIVACY
    # =========================================================================
    sec_ac_cases = [
        TestCase(
            id="",
            description="Direct URL manipulation to access another student's clinical records",
            preconditions="Student A is logged into Patient Portal. Student B's patient_id is known.",
            steps=[
                "Student A manually types URL: https://tup-icare.tech/patient/records?patient_id=OTHER_STUDENT_ID.",
                "Press Enter."
            ],
            test_data="URL with foreign patient_id parameter",
            expected_result="System enforces session-based ownership and renders only Student A's own medical records; foreign records are completely inaccessible.",
            pass_criteria="Student A cannot view Student B's health records.",
            fail_criteria="Foreign clinical records are rendered."
        ),
        TestCase(
            id="",
            description="Clinician-to-clinician private inquiry isolation",
            preconditions="Clinician A (Dr. Santos) is logged in. A private inquiry exists directed exclusively to Clinician B (Dr. Reyes).",
            steps=[
                "Clinician A inspects /patient-messages inbox."
            ],
            test_data="Clinician A account",
            expected_result="Private inquiry belonging to Clinician B is hidden from Clinician A's inbox.",
            pass_criteria="Clinician message privacy is preserved.",
            fail_criteria="Clinician A views private inquiries belonging exclusively to Clinician B."
        )
    ]
    sections.append(TestSection(29, "Data Isolation & Cross-User Privacy Safeguards", "URL parameter tampering guards, patient-to-patient data isolation, and clinician-to-clinician private messaging boundaries.", sec_ac_cases))

    # =========================================================================
    # SECTION AD — FILE EXPORT & DOWNLOAD SAFEGUARDS
    # =========================================================================
    sec_ad_cases = [
        TestCase(
            id="",
            description="PDF medical encounter summary generation contains clinic branding and formatted vitals",
            preconditions="Staff is on /encounters with completed visits.",
            steps=[
                "Click PDF export icon on an encounter row.",
                "Open downloaded PDF file."
            ],
            test_data="Encounter Summary PDF",
            expected_result="PDF contains TUP Clinic logo header, student demographics, formatted vital signs, assessment notes, and physician signature line.",
            pass_criteria="PDF opens with complete structured layout and no missing text.",
            fail_criteria="PDF is blank or corrupted."
        ),
        TestCase(
            id="",
            description="Census CSV export formatting and special characters preservation",
            preconditions="Staff performs Census CSV export with authorization password 'TUPCensus@2026'.",
            steps=[
                "Confirm export with password.",
                "Open downloaded CSV in spreadsheet software.",
                "Inspect column headers and patient rows."
            ],
            test_data="File: clinical_census.csv",
            expected_result="CSV file contains headers (Date, Patient ID, Age, Gender, Complaint, Diagnosis, Clinician) with properly escaped commas and quotes.",
            pass_criteria="CSV opens with properly aligned columns.",
            fail_criteria="CSV data is malformed or unreadable."
        ),
        TestCase(
            id="",
            description="Tablet viewport (820px) responsive layout on Patient Portal",
            preconditions="Patient Portal opened on tablet screen (820x1180px).",
            steps=[
                "Navigate to /patient/dashboard and /patient/schedule on tablet.",
                "Observe card arrangements and calendar grids."
            ],
            test_data="Viewport: 820x1180px (Tablet)",
            expected_result="Cards stack cleanly into 2-column or single-column format with accessible touch targets and no horizontal overflow.",
            pass_criteria="Tablet layout renders cleanly.",
            fail_criteria="Horizontal scrollbar or clipped text appears."
        ),
        TestCase(
            id="",
            description="Mobile viewport (360px) small screen display on Patient Schedule",
            preconditions="Opened on 360px mobile viewport.",
            steps=[
                "Navigate to /patient/schedule.",
                "Inspect slot buttons and summary sidebar."
            ],
            test_data="Viewport: 360x740px",
            expected_result="Time slot buttons and booking summary stack vertically without text overlapping.",
            pass_criteria="All text and buttons are fully visible.",
            fail_criteria="Buttons overflow screen boundaries."
        ),
        TestCase(
            id="",
            description="Student contact update reflects immediately on Staff Patient Profile view",
            preconditions="Student updates phone number on /patient/profile. Clinician is viewing patient profile.",
            steps=[
                "Student saves new phone: '09198887766'.",
                "Clinician refreshes or views /patient-profile?id=TUPM-25-0001."
            ],
            test_data="Phone: '09198887766'",
            expected_result="Updated phone number is immediately visible in the Staff Patient Profile hero card.",
            pass_criteria="Contact updates propagate across portals.",
            fail_criteria="Old phone number continues to show on staff portal."
        )
    ]
    sections.append(TestSection(30, "File Exports & Download Integrity Safeguards", "Encounter summary PDF formatting, census CSV data integrity, and password authorization guards.", sec_ad_cases))

    return sections
