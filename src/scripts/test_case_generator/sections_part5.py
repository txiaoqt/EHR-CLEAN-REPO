# src/scripts/test_case_generator/sections_part5.py
from generator_core import TestCase, TestSection

def get_sections_part5():
    sections = []

    # -------------------------------------------------------------------------
    # SECTION 61: GLOBAL THEME SYSTEM — LIGHT/DARK MODE & PERSISTENCE
    # -------------------------------------------------------------------------
    sec61_cases = [
        TestCase(
            id="",
            description="Toggle theme mode using navbar theme button on Patient Portal",
            preconditions="Student is logged in on Patient Portal. Theme is currently Light Mode.",
            steps=[
                "Click the theme toggle button (Sun/Moon icon) in the top navigation bar.",
                "Observe the transition to Dark Mode.",
                "Inspect background (slate-900 #0f172a), card panels (slate-800 #1e293b), text contrast, and crimson buttons.",
                "Click the theme toggle button again to return to Light Mode."
            ],
            test_data="Action: Toggle theme",
            expected_result="Application transitions smoothly between Light and Dark themes within 180ms without page reload; high text contrast is maintained.",
            pass_criteria="Theme toggles smoothly with proper dark palette tokens.",
            fail_criteria="Theme toggle fails or causes visual flashing/contrast bugs."
        ),
        TestCase(
            id="",
            description="Global theme preference persistence across browser reload and re-login",
            preconditions="User sets theme to Dark Mode.",
            steps=[
                "Switch theme to Dark Mode.",
                "Reload the page (F5).",
                "Observe initial page paint.",
                "Log out and log back in."
            ],
            test_data="Theme: Dark Mode",
            expected_result="Dark Mode is preserved immediately on page reload without light flash; stays dark after re-login.",
            pass_criteria="Theme persists across reloads without flashing.",
            fail_criteria="Theme resets to light mode on reload."
        ),
        TestCase(
            id="",
            description="Change global theme from Staff Settings Interface Appearance section",
            preconditions="Staff is on /settings.",
            steps=[
                "Scroll to 'Interface Appearance' section.",
                "Click 'Dark Mode' button -> verify portal switches to dark palette.",
                "Click 'Light Mode' button -> verify portal switches to light palette.",
                "Click 'Save Changes'."
            ],
            test_data="Settings Theme controls",
            expected_result="Theme updates immediately upon button click and saves to user settings.",
            pass_criteria="Settings theme buttons control global application theme.",
            fail_criteria="Buttons are non-responsive."
        )
    ]
    sections.append(TestSection(61, "Global Theme System — Light/Dark Mode & Persistence", "Navbar theme toggle, Settings theme control, smooth 180ms transitions, and reload persistence.", sec61_cases))

    # -------------------------------------------------------------------------
    # SECTION 62: RESPONSIVE LAYOUT & MOBILE/TABLET (PATIENT PORTAL)
    # -------------------------------------------------------------------------
    sec62_cases = [
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
        )
    ]
    sections.append(TestSection(62, "Responsive Layout & Mobile/Tablet (Patient Portal)", "Mobile header, sliding navigation drawer, touch targets, and mobile messaging UX.", sec62_cases))

    # -------------------------------------------------------------------------
    # SECTION 63: RESPONSIVE LAYOUT & DESKTOP USABILITY (STAFF PORTAL)
    # -------------------------------------------------------------------------
    sec63_cases = [
        TestCase(
            id="",
            description="Staff Portal sidebar collapse and expansion toggle",
            preconditions="Staff is logged into Staff Portal on desktop (1440px width).",
            steps=[
                "Observe expanded sidebar showing navigation icons and full text labels.",
                "Click the sidebar toggle button (chevron/menu icon).",
                "Observe sidebar collapsing to icon-only rail width.",
                "Verify main content area expands smoothly to occupy available width.",
                "Click toggle button again to expand sidebar."
            ],
            test_data="Viewport: 1440x900px (Desktop)",
            expected_result="Sidebar collapses and expands smoothly; main content grid adjusts layout without table clipping.",
            pass_criteria="Sidebar toggles cleanly and content area expands.",
            fail_criteria="Sidebar breaks layout or overlaps content."
        ),
        TestCase(
            id="",
            description="Staff administrative data tables horizontal scrollbar container on compact desktop (1024px)",
            preconditions="Staff views /encounters or /patients on 1024px width monitor.",
            steps=[
                "Inspect table with many columns.",
                "Observe table container."
            ],
            test_data="Viewport: 1024x768px",
            expected_result="Table container allows smooth internal horizontal scrolling if needed without breaking outer page layout.",
            pass_criteria="Page maintains fixed margins; table scrolls internally.",
            fail_criteria="Entire webpage overflows horizontally."
        )
    ]
    sections.append(TestSection(63, "Responsive Layout & Desktop Usability (Staff Portal)", "Collapsible sidebar rail, desktop grid alignment, and table responsive containers.", sec63_cases))

    # -------------------------------------------------------------------------
    # SECTION 64: CROSS-MODULE INTEGRATION — BOOKING TO STAFF SCHEDULE
    # -------------------------------------------------------------------------
    sec64_cases = [
        TestCase(
            id="",
            description="Student appointment booking immediately reflects in Staff Appointments Schedule",
            preconditions="Student logs in on User Portal. Clinician logs in on Staff Portal in another window.",
            steps=[
                "Student books Medical Clinic, Tomorrow, Slot 1 (09:00-12:00) with reason 'Mild flu symptoms'.",
                "Student receives Reference Code APT-YYYYMMDD-XXXX.",
                "Clinician navigates to /appointments on Staff Portal and selects Tomorrow's date tab."
            ],
            test_data="Student: TUPM-25-0001, Slot: Tomorrow 09:00-12:00",
            expected_result="The student's newly booked appointment appears in the Staff Schedule table with status 'Scheduled', correct student ID, department, service, and time.",
            pass_criteria="Appointment is visible on Staff schedule with matching reference details.",
            fail_criteria="Booking fails to reflect on staff portal."
        )
    ]
    sections.append(TestSection(64, "Cross-Module Integration — Booking to Staff Schedule", "End-to-end sync from patient booking flow to clinical staff appointment queue.", sec64_cases))

    # -------------------------------------------------------------------------
    # SECTION 65: CROSS-MODULE INTEGRATION — MESSAGING LIFECYCLE
    # -------------------------------------------------------------------------
    sec65_cases = [
        TestCase(
            id="",
            description="Complete messaging lifecycle: Student Inquiry -> Staff Inbox -> Staff Reply -> Resolution -> History",
            preconditions="Student is logged in on User Portal. Clinician is logged in on Staff Portal.",
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
        )
    ]
    sections.append(TestSection(65, "Cross-Module Integration — Messaging Lifecycle", "End-to-end messaging workflow across Student and Staff portals from inquiry creation to resolution.", sec65_cases))

    # -------------------------------------------------------------------------
    # SECTION 66: CROSS-MODULE INTEGRATION — ENCOUNTERS TO RECORDS & REPORTS
    # -------------------------------------------------------------------------
    sec66_cases = [
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
            pass_criteria="All 3 modules update consistently with the new clinical encounter.",
            fail_criteria="Encounter fails to reflect in records or analytics."
        )
    ]
    sections.append(TestSection(66, "Cross-Module Integration — Encounters to Records & Reports", "Clinical encounter propagation to student health records, staff dashboard counters, and census analytics.", sec66_cases))

    # -------------------------------------------------------------------------
    # SECTION 67: CROSS-MODULE INTEGRATION — INVENTORY USAGE TO STOCK KPIS
    # -------------------------------------------------------------------------
    sec67_cases = [
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
        )
    ]
    sections.append(TestSection(67, "Cross-Module Integration — Inventory Usage to Stock KPIs", "Stock deduction reflection in transaction history audit logs and dashboard replenishment alerts.", sec67_cases))

    # -------------------------------------------------------------------------
    # SECTION 68: CROSS-MODULE INTEGRATION — REGISTRATION TO DIRECTORY
    # -------------------------------------------------------------------------
    sec68_cases = [
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
            expected_result="Student appears in the searchable student directory with verified name and year level ready for clinical patient registration.",
            pass_criteria="Student account is discoverable in staff directory lookup.",
            fail_criteria="Student cannot be found in directory."
        )
    ]
    sections.append(TestSection(68, "Cross-Module Integration — Registration to Directory", "Student portal registration linkage to staff patient directory and clinical profiling.", sec68_cases))

    # -------------------------------------------------------------------------
    # SECTION 69: NEGATIVE, BOUNDARY & SECURITY SIMULATION TESTING
    # -------------------------------------------------------------------------
    sec69_cases = [
        TestCase(
            id="",
            description="Rapid repeated button clicks on appointment booking submission",
            preconditions="Student is on /patient/schedule with valid slot selected.",
            steps=[
                "Rapidly click the 'Confirm & Book Appointment' button 5 times in quick succession."
            ],
            test_data="5 rapid clicks",
            expected_result="Button enters saving state ('Booking…') on first click and disables, creating exactly 1 appointment without duplicate records.",
            pass_criteria="Exactly 1 appointment is created; no duplicates or server errors.",
            fail_criteria="Multiple duplicate bookings are created."
        ),
        TestCase(
            id="",
            description="Simulated XSS / script injection string in text fields (Chief Complaint, Notes, Messages)",
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
    sections.append(TestSection(69, "Negative, Boundary & Security Simulation", "Double-click debouncing, XSS sanitization, boundary string lengths, and input resilience.", sec69_cases))

    # -------------------------------------------------------------------------
    # SECTION 70: MULTI-TAB, MULTI-USER CONCURRENCY & SESSION WORKFLOWS
    # -------------------------------------------------------------------------
    sec70_cases = [
        TestCase(
            id="",
            description="Cross-tab session logout synchronization",
            preconditions="User has Patient Portal open in Tab 1 and Tab 2 simultaneously.",
            steps=[
                "In Tab 1, click 'Log Out'.",
                "Switch to Tab 2 and attempt to click 'Book Appointment' or refresh."
            ],
            test_data="Multi-tab browser session",
            expected_result="Tab 2 detects terminated session and redirects immediately to /login.",
            pass_criteria="Session logout is synchronized across tabs.",
            fail_criteria="Tab 2 remains authenticated after Tab 1 logs out."
        ),
        TestCase(
            id="",
            description="Multi-tab conflicting appointment booking attempt by same student",
            preconditions="Student has scheduling open in Tab 1 and Tab 2.",
            steps=[
                "In Tab 1, book Slot 1 for Tomorrow -> booking succeeds.",
                "Without refreshing, switch to Tab 2 and attempt to book Slot 2 for Tomorrow."
            ],
            test_data="Same student booking in 2 tabs",
            expected_result="Tab 2 submission is rejected because the student already holds an active appointment.",
            pass_criteria="Second booking is blocked; student holds exactly 1 active appointment.",
            fail_criteria="Student successfully books 2 active appointments."
        )
    ]
    sections.append(TestSection(70, "Multi-Tab, Multi-User Concurrency & Session Workflows", "Cross-tab session termination sync, multi-tab booking collision prevention, and multi-user concurrency.", sec70_cases))

    return sections
