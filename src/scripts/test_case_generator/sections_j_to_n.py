# src/scripts/test_case_generator/sections_j_to_n.py
from generator_core import TestCase, TestSection

def get_sections_j_to_n():
    sections = []

    # =========================================================================
    # SECTION J — STAFF DASHBOARD
    # =========================================================================
    sec_j_cases = [
        TestCase(
            id="",
            description="Staff Dashboard KPI metric summary cards",
            preconditions="Clinician is logged into Staff Portal (https://tup-icare-staff.me/dashboard) on desktop.",
            steps=[
                "Navigate to https://tup-icare-staff.me/dashboard.",
                "Inspect top summary KPI cards (Checked-in Today, Encounters Today, Upcoming Scheduled Visits, Total Registered Patients)."
            ],
            test_data="N/A",
            expected_result="All 4 KPI cards render with dynamic numerical counts matching clinical records.",
            pass_criteria="All 4 metric cards are displayed with accurate figures.",
            fail_criteria="KPI cards show NaN, blank values, or fail to load."
        ),
        TestCase(
            id="",
            description="Diagnosis Distribution donut chart with center count badge",
            preconditions="Staff is on /dashboard. Encounter records exist.",
            steps=[
                "Inspect 'Diagnosis Distribution' card.",
                "Verify donut chart visualization and center total count badge.",
                "Inspect legend items list below chart."
            ],
            test_data="N/A",
            expected_result="Donut chart renders clinical assessment breakdown with center total count and color-coded legend labels.",
            pass_criteria="Donut chart and center count render cleanly.",
            fail_criteria="Chart is broken or legend overflows."
        ),
        TestCase(
            id="",
            description="Visit Over Time trend line chart",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Inspect 'Visit Over Time' card.",
                "Verify monthly/weekly consult volume line graph with smooth curve and date labels."
            ],
            test_data="N/A",
            expected_result="Line chart displays chronological visit volume trends with hoverable tooltips.",
            pass_criteria="Line chart is rendered with smooth curve and accurate dates.",
            fail_criteria="Line chart fails to draw or displays error."
        ),
        TestCase(
            id="",
            description="Top 10 Chief Complaints horizontal bar chart",
            preconditions="Staff is on /dashboard.",
            steps=[
                "Inspect 'Top 10 Chief Complaints' card.",
                "Verify horizontal bar representation of most frequent patient cases."
            ],
            test_data="N/A",
            expected_result="Horizontal bar chart renders up to 10 top complaints ordered by frequency.",
            pass_criteria="Top complaints are listed with proportional bar lengths.",
            fail_criteria="Bar chart fails to render."
        ),
        TestCase(
            id="",
            description="Dashboard Quick Action buttons routing",
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
            preconditions="At least one inventory item is below its reorder level.",
            steps=[
                "Click the Alerts card showing 'X Low Stock Alert(s)'."
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
                "In Password Authorization modal, enter password 'TUPCensus@2026'.",
                "Click 'Confirm & Export'."
            ],
            test_data="Password: TUPCensus@2026",
            expected_result="System authorizes export and triggers CSV download of university clinical census.",
            pass_criteria="CSV file downloads successfully and modal closes.",
            fail_criteria="Export fails or password prompt is bypassed."
        ),
        TestCase(
            id="",
            description="Recent Encounters preview card displays a maximum of 4 records",
            preconditions="Database contains more than 4 clinical encounters (e.g. 10 encounters).",
            steps=[
                "Navigate to /dashboard.",
                "Inspect 'Recent Encounters' card on right-hand column.",
                "Count the number of visible encounter rows."
            ],
            test_data="Total encounters: 10 in database",
            expected_result="Recent Encounters card renders exactly 4 rows representing the 4 most recent encounters.",
            pass_criteria="Exactly 4 encounter rows are visible; card maintains clean height without excess vertical gap.",
            fail_criteria="More than 4 rows are rendered or card layout is broken."
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
            expected_result="System navigates directly to Admin Staff Portal Encounters page (/encounters) in the same tab.",
            pass_criteria="Browser routes to /encounters showing full encounter history.",
            fail_criteria="Button does not navigate or opens unnecessary new tab."
        ),
        TestCase(
            id="",
            description="Search patient by Student ID or Name in Dashboard header search bar",
            preconditions="Staff is on /dashboard. Patients exist in student directory.",
            steps=[
                "Click dashboard header search input (placeholder: 'Search patients by name or ID...').",
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
            pass_criteria="Patient Profile page opens for selected student.",
            fail_criteria="Navigation fails or opens wrong patient."
        )
    ]
    sections.append(TestSection(10, "Staff Portal — Dashboard & Clinical Overview", "KPI metrics, Diagnosis donut chart, Visit trends line chart, Top 10 complaints bar chart, Recent Encounters 4-item limit, View All navigation, and search bar.", sec_j_cases))

    # =========================================================================
    # SECTION K — STAFF APPOINTMENTS
    # =========================================================================
    sec_k_cases = [
        TestCase(
            id="",
            description="View Appointments Schedule table and summary KPI cards on /appointments",
            preconditions="Staff is on https://tup-icare-staff.me/appointments.",
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
            description="Select individual day tabs on the Weekly Schedule Bar",
            preconditions="Staff is on /appointments.",
            steps=[
                "Observe the 7-day Weekly Schedule Bar.",
                "Verify today's date tab is highlighted.",
                "Click tomorrow's date tab.",
                "Observe table update."
            ],
            test_data="Weekly schedule dates",
            expected_result="Table updates to show appointments scheduled for the selected day; active tab styling updates.",
            pass_criteria="Appointments for selected date are displayed; date button shows active border.",
            fail_criteria="Clicking date tab does not filter appointments."
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
            expected_result="Table filters dynamically to show only appointments matching selected status.",
            pass_criteria="Rows match selected status filter accurately.",
            fail_criteria="Filter does not update table rows."
        ),
        TestCase(
            id="",
            description="Update appointment status from 'Scheduled' to 'Checked-in'",
            preconditions="Appointment row on /appointments has status 'Scheduled'.",
            steps=[
                "Locate Status dropdown in appointment row.",
                "Select 'Checked-in'.",
                "Observe visual status badge and background change."
            ],
            test_data="Transition: Scheduled -> Checked-in",
            expected_result="Status updates immediately to 'Checked-in' with emerald badge styling. 'Checked-in Today' counter increments.",
            pass_criteria="Status dropdown and badge reflect 'Checked-in' without errors.",
            fail_criteria="Update fails or reverts upon refresh."
        ),
        TestCase(
            id="",
            description="Click 'Open' button on active appointment for registered patient with existing profile",
            preconditions="Appointment belongs to student TUPM-25-0001 who already has a registered clinical record in patients registry.",
            steps=[
                "Locate appointment row on /appointments.",
                "Click '[ Open ]' button."
            ],
            test_data="Patient ID: TUPM-25-0001 (Existing patient)",
            expected_result="System resolves patient using canonical patient_id (TUPM-25-0001) and routes to /patient-profile?id=TUPM-25-0001. Clinical encounters and vitals load.",
            pass_criteria="Directly opens existing patient profile without creating duplicate records.",
            fail_criteria="Opens wrong profile, fails to resolve ID, or crashes."
        ),
        TestCase(
            id="",
            description="Click 'Open' button on active appointment for student who does NOT yet have a clinical patient record",
            preconditions="Appointment belongs to student TUPM-25-0200 who is in student directory but has never been registered in clinical patients registry.",
            steps=[
                "Click '[ Open ]' button on appointment row."
            ],
            test_data="Student ID: TUPM-25-0200 (Unregistered patient)",
            expected_result="System detects missing clinical record, routes to /patients, and automatically opens 'Register New Patient' modal with student ID, name, and year pre-filled in preview card.",
            pass_criteria="Navigates to /patients with pre-filled student registration modal open.",
            fail_criteria="Navigates to a blank 404 page or errors out."
        ),
        TestCase(
            id="",
            description="'Open' button is disabled on Cancelled appointments",
            preconditions="Appointment row has status 'Cancelled'.",
            steps=[
                "Inspect '[ Open ]' button on Cancelled row.",
                "Attempt to click the button."
            ],
            test_data="Status: Cancelled",
            expected_result="Button has disabled attribute, muted opacity, cursor: not-allowed, and title 'Cannot open cancelled appointment profile'. Clicking does nothing.",
            pass_criteria="Open button is disabled and unclickable for cancelled appointments.",
            fail_criteria="Open button is clickable on cancelled appointments."
        ),
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
            expected_result="Appointment is created with status 'Scheduled' and appears immediately in schedule table.",
            pass_criteria="New appointment row appears in list.",
            fail_criteria="Creation fails or error modal appears."
        ),
        TestCase(
            id="",
            description="Delete appointment with valid password verification (Physician / Admin)",
            preconditions="Staff is logged in as Physician on /appointments.",
            steps=[
                "Click 'Delete' button on an appointment row.",
                "In Delete Appointment modal, enter staff password 'Physician@123'.",
                "Click 'Delete Appointment'."
            ],
            test_data="Password: Physician@123",
            expected_result="Appointment is deleted from schedule table and success confirmation is shown.",
            pass_criteria="Appointment row is removed from table.",
            fail_criteria="Deletion fails or occurs without password verification."
        )
    ]
    sections.append(TestSection(11, "Staff Portal — Appointments Schedule & Management", "Schedule table, weekly date bar tabs, status transitions, canonical Open routing, pre-filled registration modal, and password-protected deletion.", sec_k_cases))

    # =========================================================================
    # SECTION L — STAFF PATIENT DIRECTORY
    # =========================================================================
    sec_l_cases = [
        TestCase(
            id="",
            description="View Registered Patients directory table and total count badge",
            preconditions="Staff is on https://tup-icare-staff.me/patients.",
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
                "Type 'Dela Cruz' into patient search input."
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
            expected_result="Table rows re-sort dynamically according to chosen field and direction.",
            pass_criteria="Ordering updates accurately on the table.",
            fail_criteria="Sorting does not affect table order."
        ),
        TestCase(
            id="",
            description="Register patient using 'Search Student Directory' tab with preview card",
            preconditions="Staff is on /patients. Student exists in student directory but not in patient registry.",
            steps=[
                "Click '+ Register Patient' button in page header.",
                "Ensure 'Search Student Directory' tab is selected.",
                "Type student name or ID (e.g. 'TUPM-25-0105').",
                "Click matching student from suggestions dropdown.",
                "Observe Patient Preview Card showing Name, ID, and Year Level.",
                "Click 'Register Patient'."
            ],
            test_data="Student: TUPM-25-0105 (Juan Santos)",
            expected_result="Preview card verifies student details. Clicking Register adds patient to registry table and displays 'Patient registered successfully.'",
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
                "Observe preview card and click 'Register Patient'."
            ],
            test_data="Name: Ana Reyes, ID: TUPM-25-0199, Year: 2",
            expected_result="Student is registered as a patient and table refreshes showing Ana Reyes.",
            pass_criteria="Manual patient entry succeeds.",
            fail_criteria="Manual registration fails."
        )
    ]
    sections.append(TestSection(12, "Staff Portal — Patient Directory & Registration", "Patient directory table, search, multi-field sorting, search directory auto-fill tab, manual entry tab, and duplicate prevention.", sec_l_cases))

    # =========================================================================
    # SECTION M — STAFF PATIENT PROFILE
    # =========================================================================
    sec_m_cases = [
        TestCase(
            id="",
            description="Patient Profile hero card, student avatar, and 2-column clinical grid",
            preconditions="Staff navigates to https://tup-icare-staff.me/patient-profile?id=TUPM-25-0001.",
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
            fail_criteria="Profile shows blank screen or missing patient info."
        ),
        TestCase(
            id="",
            description="Click 'New Encounter' action button from Patient Profile hero card",
            preconditions="Staff is viewing patient profile on /patient-profile.",
            steps=[
                "Click 'New Encounter' button in hero card."
            ],
            test_data="N/A",
            expected_result="System navigates to /encounter with patient ID and name automatically pre-filled in encounter form.",
            pass_criteria="Encounter creation form opens with pre-selected patient.",
            fail_criteria="Navigation fails or patient is not pre-filled."
        ),
        TestCase(
            id="",
            description="Open and update Medications & Allergies modal on Patient Profile",
            preconditions="Staff is on /patient-profile.",
            steps=[
                "Click 'Edit Medications & Allergies' button.",
                "Enter Current Medications: 'Cetirizine 10mg once daily as needed'.",
                "Enter Known Allergies: 'Penicillin, Shellfish'.",
                "Click 'Save'."
            ],
            test_data="Meds: Cetirizine 10mg, Allergies: Penicillin, Shellfish",
            expected_result="Modal closes, profile card updates immediately showing new medications and allergies with success alert.",
            pass_criteria="Updated medications and allergies appear on profile card and persist after reload.",
            fail_criteria="Data fails to save or modal does not close."
        ),
        TestCase(
            id="",
            description="Open and update Clinical Notes modal on Patient Profile",
            preconditions="Staff is on /patient-profile.",
            steps=[
                "Click 'Edit Clinical Notes' button.",
                "Enter Notes: 'Patient has a history of mild asthma triggered by dust and cold weather.'",
                "Click 'Save Notes'."
            ],
            test_data="Notes: 'Patient has a history of mild asthma...'",
            expected_result="Clinical notes are saved and displayed in Medical Notes section.",
            pass_criteria="Medical notes update successfully.",
            fail_criteria="Notes are not saved."
        ),
        TestCase(
            id="",
            description="Delete patient record with valid password verification (Physician / Admin)",
            preconditions="Staff is logged in as Physician on /patient-profile.",
            steps=[
                "Click 'Delete Patient' button on hero card.",
                "Observe Delete Confirmation modal.",
                "Enter staff password 'Physician@123'.",
                "Click 'Delete Patient'."
            ],
            test_data="Password: Physician@123",
            expected_result="Patient record is removed and browser redirects to Patients registry (/patients) with confirmation message.",
            pass_criteria="Patient is deleted and system navigates back to directory.",
            fail_criteria="Deletion fails or occurs without password prompt."
        ),
        TestCase(
            id="",
            description="Nurse role is blocked from deleting patient records",
            preconditions="Staff is logged in with Nurse role on /patient-profile.",
            steps=[
                "Inspect Patient Profile hero card.",
                "Verify whether 'Delete Patient' button is visible."
            ],
            test_data="Role: Nurse",
            expected_result="The destructive 'Delete Patient' button is hidden or disabled for Nurse accounts.",
            pass_criteria="Nurse cannot access patient deletion.",
            fail_criteria="Nurse is allowed to delete patient records."
        )
    ]
    sections.append(TestSection(13, "Staff Portal — Clinical Patient Profile", "Hero card, student avatar, 2-column clinical grid, vitals chart, medications/allergies modal, clinical notes modal, and role-based deletion.", sec_m_cases))

    # =========================================================================
    # SECTION N — STAFF ENCOUNTERS
    # =========================================================================
    sec_n_cases = [
        TestCase(
            id="",
            description="View Clinical Encounters Active Queue and Encounter History on /encounters",
            preconditions="Staff is on https://tup-icare-staff.me/encounters.",
            steps=[
                "Observe 'Active Queue (Today)' section showing consults recorded today in Asia/Manila.",
                "Observe 'Encounter History' table showing past clinical records.",
                "Inspect table columns: Date/Time, Patient ID, Patient Name, Chief Complaint, Clinician, Actions."
            ],
            test_data="N/A",
            expected_result="Encounters page renders Active Queue and Encounter History table with complete clinical columns.",
            pass_criteria="Active queue and history tables display correctly.",
            fail_criteria="Page fails to load."
        ),
        TestCase(
            id="",
            description="Create clinical encounter with valid patient selection, chief complaint, and vitals",
            preconditions="Staff is on /encounter.",
            steps=[
                "Search and select student 'Juan Dela Cruz (TUPM-25-0001)'.",
                "Enter Chief Complaint: 'Acute viral pharyngitis with mild fever'.",
                "Enter HPI: 'Patient reports 2-day history of sore throat and dysphagia.'",
                "Enter Physical Exam: 'Erythematous posterior pharynx, no tonsillar exudates.'",
                "Enter Temperature: '37.8', Pulse Rate: '88', Blood Pressure: '118/76', Weight: '62'.",
                "Select Visit Type: 'Walk-in'.",
                "Click 'Save Encounter' / 'Finalize Encounter'."
            ],
            test_data="Patient: TUPM-25-0001, Complaint: 'Acute viral pharyngitis', Temp: 37.8, BP: 118/76",
            expected_result="Encounter saves successfully and redirects to Encounters list (/encounters) showing new record in Active Queue.",
            pass_criteria="Encounter is saved and appears in encounters table.",
            fail_criteria="Saving fails or validation blocks valid inputs."
        ),
        TestCase(
            id="",
            description="Attempt to save encounter without required Chief Complaint",
            preconditions="Staff is on /encounter with patient selected.",
            steps=[
                "Leave Chief Complaint field empty.",
                "Click 'Save Encounter'."
            ],
            test_data="Chief Complaint: (empty)",
            expected_result="System blocks submission and displays validation error: 'Please enter a chief complaint.'",
            pass_criteria="Validation alert prevents saving without chief complaint.",
            fail_criteria="Empty complaint is saved."
        ),
        TestCase(
            id="",
            description="Vitals range validation — Temperature boundary check (30.0°C – 45.0°C)",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter Temperature '55.0' (above physiological boundary).",
                "Click 'Save Encounter'."
            ],
            test_data="Temperature: 55.0°C",
            expected_result="System displays validation message: 'Temperature must be between 30.0°C and 45.0°C.'",
            pass_criteria="Invalid temperature value is rejected.",
            fail_criteria="Extreme invalid temperature is accepted."
        ),
        TestCase(
            id="",
            description="Vitals range validation — Pulse Rate boundary check (30 – 250 bpm)",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter Pulse Rate '10' (below physiological boundary).",
                "Click 'Save Encounter'."
            ],
            test_data="Pulse: 10 bpm",
            expected_result="System rejects value and displays: 'Pulse rate must be between 30 and 250 bpm.'",
            pass_criteria="Out-of-bound pulse rate is rejected.",
            fail_criteria="Invalid pulse rate is saved."
        ),
        TestCase(
            id="",
            description="Export Clinical Encounter Summary as PDF document with Doctor Signature line",
            preconditions="Staff is on /encounters viewing encounter history.",
            steps=[
                "Click 'Export Summary' (PDF icon) on an encounter row.",
                "Observe PDF generation and download."
            ],
            test_data="Encounter ID: Specific completed encounter",
            expected_result="System generates formal PDF document containing TUP Clinic Logo, Patient Info, Vital Signs, Chief Complaint, Assessment & Plan, and Attending Physician signature line.",
            pass_criteria="PDF downloads and opens cleanly with complete clinical summary layout.",
            fail_criteria="PDF generation fails or produces blank document."
        ),
        TestCase(
            id="",
            description="Delete clinical encounter with valid password (Physician / Admin)",
            preconditions="Logged in as Physician on /encounters.",
            steps=[
                "Click 'Delete' button on an encounter row.",
                "In Delete Encounter modal, enter staff password 'Physician@123'.",
                "Click 'Delete Encounter'."
            ],
            test_data="Password: Physician@123",
            expected_result="Encounter is removed from list and database with success toast confirmation.",
            pass_criteria="Encounter row disappears from table.",
            fail_criteria="Deletion fails or prompts no password."
        ),
        TestCase(
            id="",
            description="Create encounter with 'Follow-up' visit type",
            preconditions="Staff is on /encounter with patient selected.",
            steps=[
                "Select Visit Type: 'Follow-up'.",
                "Enter Chief Complaint: 'Post-medication follow-up for acute bronchitis'.",
                "Enter Temperature: '36.7', BP: '120/80'.",
                "Click 'Save Encounter'."
            ],
            test_data="Type: Follow-up",
            expected_result="Encounter is saved as Follow-up and appears in Encounter History table.",
            pass_criteria="Visit type Follow-up is recorded.",
            fail_criteria="Saving fails."
        ),
        TestCase(
            id="",
            description="Vitals range validation — Blood pressure non-numeric format rejection",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter '120/xx' in Blood Pressure field.",
                "Click 'Save Encounter'."
            ],
            test_data="BP: '120/xx'",
            expected_result="System rejects malformed blood pressure and displays format validation prompt.",
            pass_criteria="Non-numeric BP is rejected.",
            fail_criteria="Malformed BP is saved."
        ),
        TestCase(
            id="",
            description="Vitals range validation — Weight with decimal values",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter Weight '65.75' (kg).",
                "Save encounter."
            ],
            test_data="Weight: 65.75 kg",
            expected_result="Encounter saves with precise decimal weight (65.75 kg) visible in encounter summary.",
            pass_criteria="Decimal weight is preserved.",
            fail_criteria="Weight is rounded improperly or rejected."
        ),
        TestCase(
            id="",
            description="Vitals range validation — Respiratory Rate boundary check (10–60 breaths/min)",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter Respiratory Rate '85' (above boundary).",
                "Click 'Save Encounter'."
            ],
            test_data="RR: 85 breaths/min",
            expected_result="System displays validation error: 'Respiratory rate must be between 10 and 60 breaths/min.'",
            pass_criteria="Out-of-bound RR is rejected.",
            fail_criteria="Extreme RR is accepted."
        ),
        TestCase(
            id="",
            description="Vitals range validation — SpO2 Oxygen Saturation boundary check (70–100%)",
            preconditions="Staff is on /encounter.",
            steps=[
                "Enter SpO2 '110' (above physiological maximum).",
                "Click 'Save Encounter'."
            ],
            test_data="SpO2: 110%",
            expected_result="System rejects value: 'SpO2 must be between 70% and 100%.'",
            pass_criteria="Invalid SpO2 is rejected.",
            fail_criteria="Invalid SpO2 is saved."
        )
    ]
    sections.append(TestSection(14, "Staff Portal — Clinical Encounters & Vitals", "Active Queue, historical encounters, vital sign validations (Temp 30-45°C, Pulse 30-250 bpm, BP format, RR 10-60, SpO2 70-100%), PDF summary export, and deletion.", sec_n_cases))

    return sections
