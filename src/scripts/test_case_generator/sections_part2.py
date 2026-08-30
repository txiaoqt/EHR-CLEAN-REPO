# src/scripts/test_case_generator/sections_part2.py
from generator_core import TestCase, TestSection

def get_sections_part2():
    sections = []

    # -------------------------------------------------------------------------
    # SECTION 16: PATIENT AVATAR PHOTO UPLOAD & STORAGE PERSISTENCE
    # -------------------------------------------------------------------------
    sec16_cases = [
        TestCase(
            id="",
            description="Upload valid JPEG/PNG profile photo on Patient Profile",
            preconditions="Student is on /patient/profile in edit mode.",
            steps=[
                "Click 'Change Photo' / 'Upload Photo' button.",
                "Select a valid JPEG image file (e.g. 1.5 MB, dimensions 400x400px).",
                "Observe photo upload and preview update.",
                "Click 'Save Changes'."
            ],
            test_data="File: student_photo.jpg (1.5 MB, image/jpeg)",
            expected_result="Photo uploads successfully to storage. Avatar updates on profile page and navbar header.",
            pass_criteria="New avatar is displayed with circular cropping and persists after page refresh.",
            fail_criteria="Upload fails, file is rejected, or default avatar remains."
        ),
        TestCase(
            id="",
            description="Attempt to upload image file exceeding 5MB maximum file size",
            preconditions="Student is on /patient/profile.",
            steps=[
                "Click 'Change Photo'.",
                "Select an oversized image file of 7.2 MB."
            ],
            test_data="File: large_photo.png (7.2 MB)",
            expected_result="System intercepts file and displays validation error: 'File size exceeds maximum limit of 5MB.'",
            pass_criteria="Upload is aborted and clear 5MB limit message is shown.",
            fail_criteria="System crashes or attempts unbounded upload."
        ),
        TestCase(
            id="",
            description="Attempt to upload unsupported file format (e.g. PDF or executable)",
            preconditions="Student is on /patient/profile.",
            steps=[
                "Click 'Change Photo'.",
                "Attempt to select a document file (.pdf or .docx)."
            ],
            test_data="File: document.pdf",
            expected_result="File picker filters for images or system displays: 'Please select a valid image file (JPEG, PNG, WebP).'",
            pass_criteria="Non-image file is blocked.",
            fail_criteria="Non-image file is accepted as profile photo."
        ),
        TestCase(
            id="",
            description="Remove custom profile photo and revert to default avatar placeholder",
            preconditions="Student has an existing custom profile photo.",
            steps=[
                "Click 'Remove Photo' button on /patient/profile.",
                "Confirm photo removal.",
                "Click 'Save Changes'."
            ],
            test_data="Action: Remove custom avatar",
            expected_result="Custom photo is removed and replaced by the standard clinic default avatar placeholder.",
            pass_criteria="Default avatar placeholder image is displayed.",
            fail_criteria="Broken image icon appears or removal fails."
        )
    ]
    sections.append(TestSection(16, "Patient Avatar Photo Upload & Storage Persistence", "Image upload constraints, 5MB limit, supported formats (JPEG, PNG, WebP), and default avatar fallback.", sec16_cases))

    # -------------------------------------------------------------------------
    # SECTION 17: PATIENT MESSAGING — ACTIVE INQUIRIES & NEW INQUIRY FLOW
    # -------------------------------------------------------------------------
    sec17_cases = [
        TestCase(
            id="",
            description="Open New Inquiry modal and inspect Concern Type options",
            preconditions="Student is on /patient/messages.",
            steps=[
                "Click '+ New Inquiry' button.",
                "Inspect the Concern Category dropdown options."
            ],
            test_data="N/A",
            expected_result="Modal opens with Concern Categories: 'General clinic inquiry', 'Appointment concern', 'Follow-up question', 'Medical inquiry', 'Dental inquiry'.",
            pass_criteria="All 5 concern categories are present in dropdown.",
            fail_criteria="Modal fails to open or categories are missing."
        ),
        TestCase(
            id="",
            description="Send a new medical inquiry to clinic staff",
            preconditions="Student is on /patient/messages with New Inquiry modal open.",
            steps=[
                "Select Recipient: 'Clinic Personnel (General)' or specific clinician.",
                "Select Concern Category: 'Medical inquiry'.",
                "Type initial message: 'Good day doctor, I have a question regarding my prescribed allergy medication.'",
                "Click 'Send Inquiry' / 'Submit'."
            ],
            test_data="Category: Medical inquiry, Message: 'Good day doctor...'",
            expected_result="Inquiry is created. Modal closes. The conversation opens in the Active list and the sent message appears on the right side of the chat window with timestamp.",
            pass_criteria="New conversation appears under Active tab and message bubble is rendered.",
            fail_criteria="Message fails to send or error banner appears."
        ),
        TestCase(
            id="",
            description="Attempt to submit New Inquiry with blank message text",
            preconditions="New Inquiry modal is open.",
            steps=[
                "Leave Message Text field empty.",
                "Click 'Send Inquiry'."
            ],
            test_data="Message: (empty)",
            expected_result="System prevents submission and displays 'Please enter your inquiry message.'",
            pass_criteria="Validation alert appears and empty inquiry is not created.",
            fail_criteria="Blank message is dispatched."
        ),
        TestCase(
            id="",
            description="Send ongoing follow-up reply in an active thread",
            preconditions="An active conversation is selected in the patient messaging window.",
            steps=[
                "Type 'Thank you, I will take it after meals as advised.' in the message composer (placeholder: 'Type your message...').",
                "Click the Send button (paper plane icon) or press Enter."
            ],
            test_data="Text: 'Thank you, I will take it after meals as advised.'",
            expected_result="Message is appended to thread immediately with current time, composer resets, and conversation list updates last message snippet.",
            pass_criteria="Sent message bubble appears on right and composer clears.",
            fail_criteria="Message is lost or composer does not clear."
        )
    ]
    sections.append(TestSection(17, "Patient Messaging — Active Inquiries & New Inquiry Flow", "New inquiry modal, concern categories, message composer, and outgoing message bubbles.", sec17_cases))

    # -------------------------------------------------------------------------
    # SECTION 18: PATIENT MESSAGING — REALTIME REPLIES & RESOLVED HISTORY
    # -------------------------------------------------------------------------
    sec18_cases = [
        TestCase(
            id="",
            description="Realtime receipt of staff reply in active conversation thread",
            preconditions="Student has /patient/messages open. Clinician sends a reply from Staff Portal.",
            steps=[
                "Observe the active chat window on student screen as staff sends a reply from another browser.",
                "Do NOT refresh the page."
            ],
            test_data="Clinician reply: 'Please take 1 tablet daily after breakfast.'",
            expected_result="Clinician's reply bubble appears on the left side in realtime with staff avatar, clinician name, and timestamp. Chat automatically scrolls to latest message.",
            pass_criteria="Reply arrives dynamically without manual page refresh.",
            fail_criteria="Message requires manual page reload to appear."
        ),
        TestCase(
            id="",
            description="Resolved conversation automatically moves from Active tab to Past Inquiries/History tab",
            preconditions="An open conversation exists. Clinician marks the conversation as 'Resolved' from Staff Portal.",
            steps=[
                "Student views messaging page.",
                "Observe Active tab and switch to 'Past Inquiries / History' tab."
            ],
            test_data="Conversation status: Resolved",
            expected_result="Resolved conversation disappears from 'Active' list and appears under 'Past Inquiries / History'.",
            pass_criteria="Thread transitions to History list.",
            fail_criteria="Resolved conversation stays stuck in Active list."
        ),
        TestCase(
            id="",
            description="Composer disabled with resolution banner when viewing resolved conversation",
            preconditions="Student opens a resolved conversation under 'Past Inquiries / History'.",
            steps=[
                "Select a resolved inquiry thread.",
                "Inspect the bottom composer area."
            ],
            test_data="N/A",
            expected_result="A resolution banner is displayed: 'This conversation has been resolved. You can start a new inquiry if you have further concerns.' The text composer is disabled or hidden.",
            pass_criteria="Resolution banner is shown and resolved thread is read-only.",
            fail_criteria="Student can send new messages into an already resolved thread."
        ),
        TestCase(
            id="",
            description="Search active conversations by clinician name or keyword",
            preconditions="Multiple conversations exist in student inbox.",
            steps=[
                "Type clinician name or keyword in the conversation search input.",
                "Observe filtered list."
            ],
            test_data="Query: 'Dr. Santos'",
            expected_result="Inbox list filters to display only conversations matching the search query.",
            pass_criteria="Matching conversations are displayed; non-matching are hidden.",
            fail_criteria="Search filter does not update the list."
        )
    ]
    sections.append(TestSection(18, "Patient Messaging — Realtime Replies & Resolved History", "Realtime message arrival, thread resolution, history tab segregation, resolution banners, and search.", sec18_cases))

    # -------------------------------------------------------------------------
    # SECTION 19: STAFF DASHBOARD — KPIS, CHARTS & ANALYTICS OVERVIEW
    # -------------------------------------------------------------------------
    sec19_cases = [
        TestCase(
            id="",
            description="Verify Staff Dashboard KPI metric summary cards",
            preconditions="Clinician is logged into Staff Portal on desktop.",
            steps=[
                "Navigate to /dashboard.",
                "Inspect the top summary KPI cards:",
                "- Checked-in Today",
                "- Encounters Today",
                "- Upcoming Scheduled Visits",
                "- Total Registered Patients"
            ],
            test_data="N/A",
            expected_result="All 4 KPI cards render with dynamic numerical counts matching clinical records.",
            pass_criteria="All 4 metric cards are displayed with accurate figures and proper typography.",
            fail_criteria="KPI cards show NaN, blank values, or fail to load."
        ),
        TestCase(
            id="",
            description="Verify Diagnosis Distribution donut chart with center count badge",
            preconditions="Staff is on /dashboard. Encounter records exist in database.",
            steps=[
                "Inspect the 'Diagnosis Distribution' card.",
                "Verify donut chart visualization.",
                "Check center circle displaying Total Encounters count.",
                "Inspect legend items list below chart."
            ],
            test_data="N/A",
            expected_result="Donut chart renders clinical assessment breakdown with center total count and color-coded legend labels.",
            pass_criteria="Donut chart and center count render cleanly.",
            fail_criteria="Chart is broken or legend overflows."
        ),
        TestCase(
            id="",
            description="Verify Visit Over Time trend line chart",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Inspect the 'Visit Over Time' card.",
                "Verify monthly/weekly consult volume line graph with smooth curve and date axis labels."
            ],
            test_data="N/A",
            expected_result="Line chart displays chronological visit volume trends with hoverable tooltips.",
            pass_criteria="Line chart is rendered with smooth curve and accurate dates.",
            fail_criteria="Line chart fails to draw or displays error."
        ),
        TestCase(
            id="",
            description="Verify Top 10 Chief Complaints horizontal bar chart",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Inspect 'Top 10 Chief Complaints' card.",
                "Verify horizontal bar representation of most frequent patient cases."
            ],
            test_data="N/A",
            expected_result="Horizontal bar chart renders up to 10 top complaints ordered by frequency.",
            pass_criteria="Top complaints are listed with proportional bar lengths.",
            fail_criteria="Bar chart fails to render."
        )
    ]
    sections.append(TestSection(19, "Staff Dashboard — KPIs, Charts & Analytics Overview", "KPI metrics, Diagnosis distribution donut chart, Visit trend line chart, and Top 10 chief complaints bar chart.", sec19_cases))

    # -------------------------------------------------------------------------
    # SECTION 20: STAFF DASHBOARD — QUICK ACTIONS, ALERTS & CENSUS EXPORT
    # -------------------------------------------------------------------------
    sec20_cases = [
        TestCase(
            id="",
            description="Verify Dashboard Quick Action navigation buttons",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Click 'Register Patient' button -> verify navigation to /patients.",
                "Click 'New Encounter' button -> verify navigation to /encounter.",
                "Click 'View Reports' button -> verify navigation to /reports."
            ],
            test_data="N/A",
            expected_result="Each quick action button routes immediately to its respective module without errors.",
            pass_criteria="All 3 quick action links navigate correctly.",
            fail_criteria="Any button is non-responsive or routes incorrectly."
        ),
        TestCase(
            id="",
            description="Open Low Stock Alerts modal from Dashboard Alerts card",
            preconditions="At least one inventory item is below its reorder level threshold.",
            steps=[
                "Inspect the Alerts card showing 'X Low Stock Alert(s)'.",
                "Click the Alerts card."
            ],
            test_data="N/A",
            expected_result="Low Stock Alerts modal opens listing all items requiring replenishment with current quantity and reorder level.",
            pass_criteria="Modal displays low inventory items with reorder alert badges.",
            fail_criteria="Modal fails to open or lists incorrect items."
        ),
        TestCase(
            id="",
            description="Export Clinical Census with valid authorization password from Dashboard",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Click 'Export Census' button in Quick Actions.",
                "Verify Password Authorization modal opens.",
                "Enter authorization password 'TUPCensus@2026'.",
                "Click 'Confirm & Export'."
            ],
            test_data="Password: TUPCensus@2026",
            expected_result="System authorizes export and triggers CSV download of university clinical census.",
            pass_criteria="CSV file downloads successfully and modal closes.",
            fail_criteria="Export fails or password prompt is bypassed."
        ),
        TestCase(
            id="",
            description="Attempt Census Export with invalid authorization password",
            preconditions="Password Authorization modal is open.",
            steps=[
                "Enter incorrect password 'WrongPass123'.",
                "Click 'Confirm & Export'."
            ],
            test_data="Password: WrongPass123",
            expected_result="System blocks export and displays error: 'Incorrect authorization password.'",
            pass_criteria="Export is denied and error message appears in modal.",
            fail_criteria="File downloads despite wrong password."
        )
    ]
    sections.append(TestSection(20, "Staff Dashboard — Quick Actions, Alerts & Census Export", "Quick actions routing, low stock alert popovers, and password-protected census data exports.", sec20_cases))

    # -------------------------------------------------------------------------
    # SECTION 21: STAFF DASHBOARD — RECENT ENCOUNTERS LIMIT & "VIEW ALL →"
    # -------------------------------------------------------------------------
    sec21_cases = [
        TestCase(
            id="",
            description="Verify Recent Encounters preview card displays a maximum of 4 records",
            preconditions="Database contains more than 4 clinical encounters (e.g. 10 encounters).",
            steps=[
                "Navigate to /dashboard.",
                "Inspect the 'Recent Encounters' card on the right-hand column.",
                "Count the number of visible encounter rows."
            ],
            test_data="Total encounters: 10 in database",
            expected_result="Recent Encounters card renders exactly 4 rows representing the 4 most recent encounters.",
            pass_criteria="Exactly 4 encounter rows are visible; card maintains clean height without excess vertical gap.",
            fail_criteria="More than 4 rows are rendered or card layout is broken."
        ),
        TestCase(
            id="",
            description="Verify Recent Encounters rows display TUP ID, Chief Complaint, and Time",
            preconditions="Recent Encounters contains records.",
            steps=[
                "Inspect individual rows in Recent Encounters preview card."
            ],
            test_data="N/A",
            expected_result="Each row displays student/patient TUP ID (bold), chief complaint (truncated with ellipsis if long), and localized visit time.",
            pass_criteria="All 3 metadata elements are visible on every row.",
            fail_criteria="Missing student ID or unformatted timestamps."
        ),
        TestCase(
            id="",
            description="Click 'View All →' action button in Recent Encounters header",
            preconditions="Staff is on /dashboard viewing Recent Encounters card.",
            steps=[
                "Locate 'View All →' link button on top-right of Recent Encounters card header.",
                "Click 'View All →'."
            ],
            test_data="N/A",
            expected_result="System navigates directly to the Admin Staff Portal Encounters page (/encounters) in the same tab.",
            pass_criteria="Browser routes to /encounters showing full encounter history.",
            fail_criteria="Button does not navigate or opens unnecessary new tab."
        ),
        TestCase(
            id="",
            description="Recent Encounters empty state when 0 encounters exist",
            preconditions="No encounters recorded in database.",
            steps=[
                "View Recent Encounters card on /dashboard."
            ],
            test_data="Encounters: 0",
            expected_result="Card displays: 'No recent encounters'.",
            pass_criteria="Clean empty state message is shown.",
            fail_criteria="Broken table structure is displayed."
        )
    ]
    sections.append(TestSection(21, "Staff Dashboard — Recent Encounters Limit & View All", "Enforcement of 4-item preview limit, row typography, View All navigation to /encounters, and empty state.", sec21_cases))

    # -------------------------------------------------------------------------
    # SECTION 22: STAFF DASHBOARD — SEARCH BAR UI & PATIENT LOOKUP
    # -------------------------------------------------------------------------
    sec22_cases = [
        TestCase(
            id="",
            description="Search patient by Student ID or Name in Dashboard header search bar",
            preconditions="Staff is on /dashboard. Patients exist in student directory.",
            steps=[
                "Click the dashboard header search input (placeholder: 'Search patients by name or ID...').",
                "Type 'TUPM-25'."
            ],
            test_data="Search query: 'TUPM-25'",
            expected_result="Live suggestion dropdown appears listing matching students with full name and formatted Student ID.",
            pass_criteria="Dropdown displays matching student suggestions in realtime.",
            fail_criteria="Dropdown does not appear or search causes page error."
        ),
        TestCase(
            id="",
            description="Select student from search suggestions to navigate to Patient Profile",
            preconditions="Search suggestion dropdown is visible on /dashboard.",
            steps=[
                "Click on a student result (e.g. 'Juan Dela Cruz (TUPM-25-0001)')."
            ],
            test_data="Selected Student: TUPM-25-0001",
            expected_result="System navigates to the student's clinical profile page (/patient-profile?id=TUPM-25-0001).",
            pass_criteria="Patient Profile page opens for the selected student.",
            fail_criteria="Navigation fails or opens wrong patient."
        ),
        TestCase(
            id="",
            description="Clear search input using clear button (X icon)",
            preconditions="Search input contains text 'Dela Cruz'.",
            steps=[
                "Click the 'X' (clear) button inside the search pill input."
            ],
            test_data="N/A",
            expected_result="Search text is cleared immediately and suggestion dropdown closes.",
            pass_criteria="Input becomes empty and suggestions dismiss.",
            fail_criteria="Text is not cleared or button is unresponsive."
        )
    ]
    sections.append(TestSection(22, "Staff Dashboard — Search Bar UI & Patient Lookup", "Global header search bar, live auto-suggestions, clear button, and one-click profile routing.", sec22_cases))

    # -------------------------------------------------------------------------
    # SECTION 23: STAFF APPOINTMENTS — LIST, SEARCH, STATUS & TYPE FILTERS
    # -------------------------------------------------------------------------
    sec23_cases = [
        TestCase(
            id="",
            description="View Appointments Schedule table and summary KPI cards",
            preconditions="Staff is on /appointments.",
            steps=[
                "Observe summary cards (Scheduled Today, Cancelled Today, Checked-in Today, Total Scheduled).",
                "Observe Schedule table columns (Queue #, Patient ID, Department, Service, Time, Type, Clinician, Status, Actions)."
            ],
            test_data="N/A",
            expected_result="Schedule table renders with full clinical appointment columns and per-status metrics.",
            pass_criteria="Table headers and appointment rows render with complete data.",
            fail_criteria="Table fails to load or columns are missing."
        ),
        TestCase(
            id="",
            description="Filter appointments by status (Scheduled, Checked-in, Cancelled, All)",
            preconditions="Appointments with various statuses exist on /appointments.",
            steps=[
                "Select Status filter dropdown -> choose 'Checked-in'.",
                "Observe table rows.",
                "Select Status filter dropdown -> choose 'Cancelled'.",
                "Select Status filter dropdown -> choose 'All'."
            ],
            test_data="Status filter options",
            expected_result="Table filters dynamically to show only appointments matching the selected status.",
            pass_criteria="Rows match selected status filter accurately.",
            fail_criteria="Filter does not update table rows."
        ),
        TestCase(
            id="",
            description="Filter appointments by type (Consult, Check-up, Procedure, All)",
            preconditions="Appointments of different visit types exist.",
            steps=[
                "Select Type filter dropdown -> choose 'Consult'.",
                "Observe table rows."
            ],
            test_data="Type filter: Consult",
            expected_result="Only Consult appointments are displayed in the list.",
            pass_criteria="Rows are filtered by visit type.",
            fail_criteria="Non-consult appointments remain visible."
        ),
        TestCase(
            id="",
            description="Search appointments table by Student ID or Patient Name",
            preconditions="Staff is on /appointments.",
            steps=[
                "Enter 'TUPM-25-0001' into the appointment table search input."
            ],
            test_data="Search query: 'TUPM-25-0001'",
            expected_result="Table displays only the appointment matching student ID TUPM-25-0001.",
            pass_criteria="Matching appointment row is displayed.",
            fail_criteria="Table shows unrelated appointments."
        )
    ]
    sections.append(TestSection(23, "Staff Appointments — List, Search, Status & Type Filters", "Schedule list verification, per-status filters, visit type filters, and real-time search.", sec23_cases))

    # -------------------------------------------------------------------------
    # SECTION 24: STAFF APPOINTMENTS — WEEKLY BAR, DATE FILTER & POPOVER
    # -------------------------------------------------------------------------
    sec24_cases = [
        TestCase(
            id="",
            description="Select individual day tabs on the Weekly Schedule Bar",
            preconditions="Staff is on /appointments.",
            steps=[
                "Observe the 7-day Weekly Schedule Bar (Sunday through Saturday).",
                "Verify today's date tab is highlighted with primary styling.",
                "Click tomorrow's date tab.",
                "Observe table update."
            ],
            test_data="Weekly schedule dates",
            expected_result="Table updates to show appointments scheduled specifically for the selected day; active tab styling updates.",
            pass_criteria="Appointments for selected date are displayed; date button shows active border.",
            fail_criteria="Clicking date tab does not filter appointments."
        ),
        TestCase(
            id="",
            description="Open compact calendar date picker popover to filter by specific calendar date",
            preconditions="Staff is on /appointments.",
            steps=[
                "Click the Date Picker icon/button.",
                "Verify popover calendar opens.",
                "Select a specific date in the future.",
                "Observe table filtering."
            ],
            test_data="Date: Specific future date",
            expected_result="Popover opens, allows month navigation, and clicking a date filters table to that exact day.",
            pass_criteria="Calendar popover functions cleanly and filters schedule.",
            fail_criteria="Popover fails to open or cannot select date."
        ),
        TestCase(
            id="",
            description="Click 'All Dates' / Reset Date Filter to view all upcoming appointments",
            preconditions="A specific date filter is currently applied on /appointments.",
            steps=[
                "Click 'Clear Date Filter' / 'All Dates' button."
            ],
            test_data="N/A",
            expected_result="Date filter is cleared and table displays all appointments across dates.",
            pass_criteria="Full appointment list is restored.",
            fail_criteria="Table remains stuck on single date."
        )
    ]
    sections.append(TestSection(24, "Staff Appointments — Weekly Bar, Date Filter & Popover", "Weekly date bar tabs, compact calendar popover picker, and date filter reset behavior.", sec24_cases))

    # -------------------------------------------------------------------------
    # SECTION 25: STAFF APPOINTMENTS — STATUS TRANSITIONS
    # -------------------------------------------------------------------------
    sec25_cases = [
        TestCase(
            id="",
            description="Update appointment status from 'Scheduled' to 'Checked-in'",
            preconditions="Appointment row on /appointments has status 'Scheduled'.",
            steps=[
                "Locate the Status dropdown in the appointment row.",
                "Select 'Checked-in'.",
                "Observe visual status badge and background color change."
            ],
            test_data="Transition: Scheduled -> Checked-in",
            expected_result="Status updates immediately to 'Checked-in' with emerald badge styling. 'Checked-in Today' KPI counter increments.",
            pass_criteria="Status dropdown and badge reflect 'Checked-in' without errors.",
            fail_criteria="Update fails or reverts upon refresh."
        ),
        TestCase(
            id="",
            description="Update appointment status to 'Cancelled'",
            preconditions="Appointment row has status 'Scheduled'.",
            steps=[
                "Select 'Cancelled' from the status dropdown.",
                "Observe row update."
            ],
            test_data="Transition: Scheduled -> Cancelled",
            expected_result="Status updates to 'Cancelled' with red/muted badge. 'Open' action button becomes disabled for the row.",
            pass_criteria="Status changes to Cancelled and Open button disables.",
            fail_criteria="Status update fails."
        ),
        TestCase(
            id="",
            description="Update appointment status to 'Completed'",
            preconditions="Appointment has status 'Checked-in'.",
            steps=[
                "Select 'Completed' from status dropdown."
            ],
            test_data="Transition: Checked-in -> Completed",
            expected_result="Status updates to 'Completed'. Student is released to make future bookings.",
            pass_criteria="Status updates to Completed.",
            fail_criteria="Update fails."
        )
    ]
    sections.append(TestSection(25, "Staff Appointments — Status Transitions", "Interactive status dropdown updates (Scheduled, Checked-in, Cancelled, Completed) and KPI synchronization.", sec25_cases))

    # -------------------------------------------------------------------------
    # SECTION 26: STAFF APPOINTMENTS — "OPEN" ACTION & CANONICAL ROUTING
    # -------------------------------------------------------------------------
    sec26_cases = [
        TestCase(
            id="",
            description="Click 'Open' button on active appointment for registered patient with existing clinical profile",
            preconditions="Appointment row belongs to student TUPM-25-0001 who already has a registered record in patients registry.",
            steps=[
                "Locate the appointment row on /appointments.",
                "Click the '[ Open ]' button."
            ],
            test_data="Patient ID: TUPM-25-0001 (Existing patient)",
            expected_result="System resolves patient using canonical patient_id (TUPM-25-0001) and routes to /patient-profile?id=TUPM-25-0001. Clinical encounters and vitals load.",
            pass_criteria="Directly opens the existing patient profile without creating duplicate records.",
            fail_criteria="Opens wrong profile, fails to resolve ID, or crashes."
        ),
        TestCase(
            id="",
            description="Click 'Open' button on active appointment for student who does NOT yet have a clinical patient record",
            preconditions="Appointment belongs to student TUPM-25-0200 who is in student directory but has never been registered in clinical patients registry.",
            steps=[
                "Click '[ Open ]' button on the appointment row."
            ],
            test_data="Student ID: TUPM-25-0200 (Unregistered patient)",
            expected_result="System detects missing clinical record, routes to /patients, and automatically opens the 'Register New Patient' modal with student ID, name, and year pre-filled in the preview card for staff confirmation.",
            pass_criteria="Navigates to /patients with pre-filled student registration modal open.",
            fail_criteria="Navigates to a blank 404 page or errors out."
        ),
        TestCase(
            id="",
            description="'Open' button is disabled on Cancelled appointments",
            preconditions="Appointment row has status 'Cancelled'.",
            steps=[
                "Inspect the '[ Open ]' button on the Cancelled row.",
                "Attempt to click the button."
            ],
            test_data="Status: Cancelled",
            expected_result="Button has disabled attribute, muted opacity, cursor: not-allowed, and title 'Cannot open cancelled appointment profile'. Clicking does nothing.",
            pass_criteria="Open button is disabled and unclickable for cancelled appointments.",
            fail_criteria="Open button is clickable on cancelled appointments."
        ),
        TestCase(
            id="",
            description="Double-click race condition protection on 'Open' action",
            preconditions="Staff is on /appointments.",
            steps=[
                "Rapidly double-click the '[ Open ]' button on an appointment row."
            ],
            test_data="Rapid repeated clicks",
            expected_result="Button displays 'Opening…' and is temporarily disabled during resolution, executing exactly one navigation transition.",
            pass_criteria="No duplicate navigation errors or race conditions occur.",
            fail_criteria="Multiple concurrent navigation requests fire."
        )
    ]
    sections.append(TestSection(26, "Staff Appointments — Open Action & Canonical Routing", "Canonical student ID resolution, existing profile routing, pre-filled registration modal flow, and disabled cancelled state.", sec26_cases))

    # -------------------------------------------------------------------------
    # SECTION 27: STAFF APPOINTMENTS — CREATION & DELETION WITH PASSWORD
    # -------------------------------------------------------------------------
    sec27_cases = [
        TestCase(
            id="",
            description="Staff creates manual appointment via 'New Appointment' modal",
            preconditions="Staff is on /appointments.",
            steps=[
                "Click '+ New Appointment' button in page header.",
                "Search and pick student 'Juan Dela Cruz (TUPM-25-0001)'.",
                "Select Date, Time, Type (Consult), and Clinician.",
                "Click 'Create Appointment'."
            ],
            test_data="Student: TUPM-25-0001, Type: Consult, Time: 10:00 AM",
            expected_result="Appointment is created with status 'Scheduled' and appears immediately in the schedule table.",
            pass_criteria="New appointment row appears in list.",
            fail_criteria="Creation fails or error modal appears."
        ),
        TestCase(
            id="",
            description="Delete appointment with valid password verification (Physician / Admin)",
            preconditions="Staff is logged in as Physician or Admin.",
            steps=[
                "Click 'Delete' button on an appointment row.",
                "In Delete Appointment modal, enter current staff password.",
                "Click 'Delete Appointment'."
            ],
            test_data="Staff Password: Physician@123",
            expected_result="Appointment is deleted from schedule table and success confirmation is shown.",
            pass_criteria="Appointment row is removed from table.",
            fail_criteria="Deletion fails or occurs without password verification."
        ),
        TestCase(
            id="",
            description="Delete appointment fails with incorrect password",
            preconditions="Delete Appointment modal is open.",
            steps=[
                "Enter wrong password 'BadPassword123'.",
                "Click 'Delete Appointment'."
            ],
            test_data="Password: BadPassword123",
            expected_result="System rejects deletion and displays 'Incorrect password. Deletion denied.'",
            pass_criteria="Appointment is NOT deleted and error message appears.",
            fail_criteria="Appointment is deleted with wrong password."
        )
    ]
    sections.append(TestSection(27, "Staff Appointments — Creation & Deletion with Password", "Admin appointment scheduling modal, destructive deletion safeguards, and password verification.", sec27_cases))

    # -------------------------------------------------------------------------
    # SECTION 28: STAFF PATIENT REGISTRY — SEARCH, SORTING & DIRECTORY
    # -------------------------------------------------------------------------
    sec28_cases = [
        TestCase(
            id="",
            description="View Registered Patients directory table and total count badge",
            preconditions="Staff is on /patients.",
            steps=[
                "Observe page header, Total Registered Patients badge, and directory table.",
                "Inspect table columns (Patient ID, Full Name, Year Level, Last Visit Date, Actions)."
            ],
            test_data="N/A",
            expected_result="Directory table renders all registered patient records with total count badge matching record count.",
            pass_criteria="Patients table loads with complete columns and formatted dates.",
            fail_criteria="Table fails to load."
        ),
        TestCase(
            id="",
            description="Search patients table by Name or Student ID",
            preconditions="Staff is on /patients.",
            steps=[
                "Type 'Dela Cruz' into the patient search input."
            ],
            test_data="Search query: 'Dela Cruz'",
            expected_result="Table filters in realtime to display only patients whose name or ID contains 'Dela Cruz'.",
            pass_criteria="Filtered patient records are displayed.",
            fail_criteria="Non-matching patients remain visible."
        ),
        TestCase(
            id="",
            description="Sort patients directory by Name, Year Level, or Last Visit Date",
            preconditions="Staff is on /patients.",
            steps=[
                "Select Sort Field dropdown -> choose 'Year Level'.",
                "Toggle Sort Direction button (Ascending / Descending).",
                "Select Sort Field -> choose 'Last Visit Date'."
            ],
            test_data="Sort options: Name, Year, Last Visit Date",
            expected_result="Table rows re-sort dynamically according to chosen field and ascending/descending direction.",
            pass_criteria="Ordering updates accurately on the table.",
            fail_criteria="Sorting does not affect table order."
        )
    ]
    sections.append(TestSection(28, "Staff Patient Registry — Search, Sorting & Directory", "Patient directory table, dynamic count badges, real-time search, and multi-field sorting.", sec28_cases))

    # -------------------------------------------------------------------------
    # SECTION 29: STAFF PATIENT REGISTRATION — SEARCH & MANUAL TABS
    # -------------------------------------------------------------------------
    sec29_cases = [
        TestCase(
            id="",
            description="Register patient using 'Search Student Directory' tab with preview card",
            preconditions="Staff is on /patients. Student exists in student directory but not in patient registry.",
            steps=[
                "Click '+ Register Patient' button in page header.",
                "Ensure 'Search Student Directory' tab is selected.",
                "Type student name or ID (e.g. 'TUPM-25-0105').",
                "Click the matching student from suggestions dropdown.",
                "Observe the Patient Preview Card showing Name, ID, and Year Level.",
                "Click 'Register Patient'."
            ],
            test_data="Student: TUPM-25-0105 (Juan Santos)",
            expected_result="Preview card verifies student details. Clicking Register adds the patient to the registry table and displays 'Patient registered successfully.'",
            pass_criteria="Patient is registered and appears in directory list.",
            fail_criteria="Registration fails or duplicate record is created."
        ),
        TestCase(
            id="",
            description="Attempt to register an already registered patient from directory tab",
            preconditions="Student TUPM-25-0001 is already registered as a patient.",
            steps=[
                "Search and select TUPM-25-0001 in Register Patient modal.",
                "Click 'Register Patient'."
            ],
            test_data="Student ID: TUPM-25-0001",
            expected_result="System blocks registration and displays 'This student is already registered as a patient.'",
            pass_criteria="Duplicate registration alert is shown.",
            fail_criteria="Duplicate patient row is inserted."
        ),
        TestCase(
            id="",
            description="Register patient using 'Manual Entry' tab",
            preconditions="Staff is on Register Patient modal.",
            steps=[
                "Click 'Manual Entry' tab.",
                "Enter Full Name: 'Ana Reyes'.",
                "Enter Student ID: 'TUPM-25-0199'.",
                "Select Year Level: '2'.",
                "Observe preview card.",
                "Click 'Register Patient'."
            ],
            test_data="Name: Ana Reyes, ID: TUPM-25-0199, Year: 2",
            expected_result="Student is registered as a patient and table refreshes showing Ana Reyes.",
            pass_criteria="Manual patient entry succeeds.",
            fail_criteria="Manual registration fails."
        )
    ]
    sections.append(TestSection(29, "Staff Patient Registration — Search & Manual Tabs", "Register patient modal, search directory auto-fill, preview card confirmation, and manual entry mode.", sec29_cases))

    # -------------------------------------------------------------------------
    # SECTION 30: STAFF PATIENT PROFILE — HERO CARD, AVATAR & CLINICAL GRID
    # -------------------------------------------------------------------------
    sec30_cases = [
        TestCase(
            id="",
            description="View Patient Profile hero card, student avatar, and compact clinical metadata",
            preconditions="Staff navigates to /patient-profile?id=TUPM-25-0001.",
            steps=[
                "Observe top Hero Card:",
                "- Student Avatar Photo (with fallback)",
                "- Full Name & Student ID",
                "- Year Level, Age/Gender, Contact Number",
                "- Quick Action buttons (New Encounter, Export Summary, Delete Patient)"
            ],
            test_data="Patient ID: TUPM-25-0001",
            expected_result="Hero card renders student identity and 2-column clinical grid below displays Encounters list and Vitals history.",
            pass_criteria="Hero card and clinical panels render with complete student details.",
            fail_criteria="Profile shows blank screen or missing patient information."
        ),
        TestCase(
            id="",
            description="Click 'New Encounter' action button from Patient Profile hero card",
            preconditions="Staff is viewing patient profile on /patient-profile.",
            steps=[
                "Click 'New Encounter' button in hero card."
            ],
            test_data="N/A",
            expected_result="System navigates to /encounter with the patient's ID and name automatically pre-filled in the encounter form.",
            pass_criteria="Encounter creation form opens with pre-selected patient.",
            fail_criteria="Navigation fails or patient is not pre-filled."
        ),
        TestCase(
            id="",
            description="Back navigation to Patients directory from Patient Profile",
            preconditions="Staff is on /patient-profile.",
            steps=[
                "Click '← Back to Patients' breadcrumb link."
            ],
            test_data="N/A",
            expected_result="System navigates back to the Patients registry table (/patients).",
            pass_criteria="Returns cleanly to Patients directory.",
            fail_criteria="Link fails to navigate."
        )
    ]
    sections.append(TestSection(30, "Staff Patient Profile — Hero Card, Avatar & Clinical Grid", "Profile hero layout, student avatar display, quick clinical actions, pre-filled encounter routing, and back navigation.", sec30_cases))

    return sections
