# src/scripts/test_case_generator/sections_part3.py
from generator_core import TestCase, TestSection

def get_sections_part3():
    sections = []

    # -------------------------------------------------------------------------
    # SECTION 31: STAFF PATIENT PROFILE — VITALS & MEASUREMENTS HISTORY
    # -------------------------------------------------------------------------
    sec31_cases = [
        TestCase(
            id="",
            description="View Vitals history and measurements chart on Patient Profile",
            preconditions="Staff is viewing patient profile for a patient with recorded encounters.",
            steps=[
                "Scroll to 'Vitals History' panel in right-hand column.",
                "Inspect historical vitals trend line chart (Blood Pressure, Heart Rate, Temperature, Weight).",
                "Inspect latest measurements card."
            ],
            test_data="N/A",
            expected_result="Vitals chart renders chronological data points and latest measurements card displays most recent vital signs with standard units.",
            pass_criteria="Vitals chart and metrics are rendered with correct values.",
            fail_criteria="Vitals chart is blank or displays error."
        ),
        TestCase(
            id="",
            description="Empty state when patient has no recorded vitals",
            preconditions="Patient has zero recorded encounters/vitals.",
            steps=[
                "View Vitals panel on /patient-profile."
            ],
            test_data="Vitals: 0 records",
            expected_result="Panel displays: 'No vitals history recorded for this patient.'",
            pass_criteria="Clean empty state notice is displayed.",
            fail_criteria="Broken chart canvas or NaN values appear."
        )
    ]
    sections.append(TestSection(31, "Staff Patient Profile — Vitals & Measurements History", "Clinical vitals chart, latest measurements summary, and empty state handling.", sec31_cases))

    # -------------------------------------------------------------------------
    # SECTION 32: STAFF PATIENT PROFILE — MEDICATIONS, ALLERGIES & NOTES MODALS
    # -------------------------------------------------------------------------
    sec32_cases = [
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
            expected_result="Modal closes, profile card updates immediately showing new medications and allergies with success notification.",
            pass_criteria="Updated medications and allergies appear on the profile card and persist after reload.",
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
            expected_result="Clinical notes are saved and displayed in the Medical Notes section.",
            pass_criteria="Medical notes update successfully.",
            fail_criteria="Notes are not saved."
        )
    ]
    sections.append(TestSection(32, "Staff Patient Profile — Medications, Allergies & Notes Modals", "Managing patient medications, allergy warnings, clinical notes, and modal save workflows.", sec32_cases))

    # -------------------------------------------------------------------------
    # SECTION 33: STAFF PATIENT PROFILE — PATIENT DELETION WITH PASSWORD
    # -------------------------------------------------------------------------
    sec33_cases = [
        TestCase(
            id="",
            description="Delete patient record with valid password verification (Physician / Admin)",
            preconditions="Staff is logged in as Physician or Admin on /patient-profile.",
            steps=[
                "Click 'Delete Patient' button on hero card.",
                "Observe Delete Confirmation modal warning about permanent deletion.",
                "Enter staff password.",
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
                "Inspect the Patient Profile hero card.",
                "Verify whether 'Delete Patient' button is visible."
            ],
            test_data="Role: Nurse",
            expected_result="The destructive 'Delete Patient' button is hidden or disabled for Nurse accounts.",
            pass_criteria="Nurse cannot access patient deletion.",
            fail_criteria="Nurse is allowed to delete patient records."
        )
    ]
    sections.append(TestSection(33, "Staff Patient Profile — Patient Deletion with Password", "Destructive patient deletion safeguards, password confirmation, and nurse deletion restrictions.", sec33_cases))

    # -------------------------------------------------------------------------
    # SECTION 34: STAFF CLINICAL ENCOUNTERS — ACTIVE QUEUE & HISTORY LIST
    # -------------------------------------------------------------------------
    sec34_cases = [
        TestCase(
            id="",
            description="View Clinical Encounters Active Queue and Encounter History on /encounters",
            preconditions="Staff is on /encounters. Encounters exist.",
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
            description="Filter encounters by Clinician (All Clinicians vs Specific Doctor/Nurse)",
            preconditions="Staff is on /encounters.",
            steps=[
                "Select Clinician filter dropdown.",
                "Choose a specific clinician name (e.g. 'Dr. Physician').",
                "Observe table rows."
            ],
            test_data="Clinician filter: Dr. Physician",
            expected_result="Table filters to display only encounters handled by the selected clinician.",
            pass_criteria="Only matching clinician encounters appear in list.",
            fail_criteria="Filter does not work."
        ),
        TestCase(
            id="",
            description="Search encounters by Patient Name, Student ID, or Chief Complaint",
            preconditions="Staff is on /encounters.",
            steps=[
                "Type 'Fever' into the encounters search input."
            ],
            test_data="Search query: 'Fever'",
            expected_result="Table displays only encounters where chief complaint contains 'Fever'.",
            pass_criteria="Matching encounter rows are displayed.",
            fail_criteria="Non-matching rows remain."
        )
    ]
    sections.append(TestSection(34, "Staff Clinical Encounters — Active Queue & History List", "Today's active queue segregation, historical consult table, clinician filtering, and search.", sec34_cases))

    # -------------------------------------------------------------------------
    # SECTION 35: STAFF CLINICAL ENCOUNTERS — FORM & VITALS VALIDATION
    # -------------------------------------------------------------------------
    sec35_cases = [
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
            expected_result="Encounter saves successfully and redirects to Encounters list (/encounters) showing the new record in Active Queue.",
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
                "Enter Temperature '55.0' (above upper physiological boundary).",
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
        )
    ]
    sections.append(TestSection(35, "Staff Clinical Encounters — Form & Vitals Validation", "Encounter creation form, required complaint validation, and physiological vitals boundary checks.", sec35_cases))

    # -------------------------------------------------------------------------
    # SECTION 36: STAFF CLINICAL ENCOUNTERS — SENSITIVITY & ROLE RESTRICTIONS
    # -------------------------------------------------------------------------
    sec36_cases = [
        TestCase(
            id="",
            description="Physician role has full access to edit Assessment & Plan and clinical diagnosis",
            preconditions="Logged in as Physician on /encounter.",
            steps=[
                "Inspect Assessment & Plan input field.",
                "Type clinical diagnosis and treatment plan.",
                "Save encounter."
            ],
            test_data="Role: Physician, Plan: 'Amoxicillin 500mg TID for 7 days'",
            expected_result="Assessment & Plan field is enabled and saves successfully.",
            pass_criteria="Physician can edit and save clinical assessment/plan.",
            fail_criteria="Field is disabled for physician."
        ),
        TestCase(
            id="",
            description="Nurse role is restricted from editing Assessment & Plan field on high-sensitivity encounters",
            preconditions="Logged in as Nurse on /encounter.",
            steps=[
                "Inspect the Assessment & Plan field.",
                "Attempt to edit assessment notes."
            ],
            test_data="Role: Nurse",
            expected_result="Assessment & Plan field is disabled/read-only for nurse or sanitized before saving.",
            pass_criteria="Nurse cannot input physician-only clinical assessment.",
            fail_criteria="Nurse can override physician assessment fields."
        )
    ]
    sections.append(TestSection(36, "Staff Clinical Encounters — Sensitivity & Role Restrictions", "Physician assessment plan editing vs Nurse role field restrictions and clinical sensitivity.", sec36_cases))

    # -------------------------------------------------------------------------
    # SECTION 37: STAFF CLINICAL ENCOUNTERS — PDF EXPORT & DOCTOR SIGNATURE
    # -------------------------------------------------------------------------
    sec37_cases = [
        TestCase(
            id="",
            description="Export Clinical Encounter Summary as PDF document with Doctor Signature line",
            preconditions="Staff is on /encounters viewing encounter history.",
            steps=[
                "Click 'Export Summary' (PDF icon) on an encounter row.",
                "Observe PDF generation and download."
            ],
            test_data="Encounter ID: Specific completed encounter",
            expected_result="System generates a formal PDF document containing TUP Clinic Logo, Patient Information, Vital Signs, Chief Complaint, Assessment & Plan, and Attending Physician signature line.",
            pass_criteria="PDF downloads and opens cleanly with complete clinical summary layout.",
            fail_criteria="PDF generation fails or produces blank document."
        )
    ]
    sections.append(TestSection(37, "Staff Clinical Encounters — PDF Export & Doctor Signature", "Formatted PDF medical summary generation with clinic branding and physician signature line.", sec37_cases))

    # -------------------------------------------------------------------------
    # SECTION 38: STAFF CLINICAL ENCOUNTERS — DELETION WITH PASSWORD
    # -------------------------------------------------------------------------
    sec38_cases = [
        TestCase(
            id="",
            description="Delete clinical encounter with valid password (Physician / Admin)",
            preconditions="Logged in as Physician on /encounters.",
            steps=[
                "Click 'Delete' button on an encounter row.",
                "In Delete Encounter modal, enter staff password.",
                "Click 'Delete Encounter'."
            ],
            test_data="Password: Physician@123",
            expected_result="Encounter is removed from list and database with success toast confirmation.",
            pass_criteria="Encounter row disappears from table.",
            fail_criteria="Deletion fails or prompts no password."
        ),
        TestCase(
            id="",
            description="Nurse role is blocked from deleting clinical encounter records",
            preconditions="Logged in as Nurse on /encounters.",
            steps=[
                "Inspect encounter rows on /encounters."
            ],
            test_data="Role: Nurse",
            expected_result="Delete button is hidden or disabled for Nurse accounts.",
            pass_criteria="Nurse cannot delete encounters.",
            fail_criteria="Nurse is allowed to delete clinical records."
        )
    ]
    sections.append(TestSection(38, "Staff Clinical Encounters — Deletion with Password", "Destructive encounter deletion safeguards, password confirmation, and nurse restrictions.", sec38_cases))

    # -------------------------------------------------------------------------
    # SECTION 39: STAFF PHARMACY & INVENTORY — SUMMARY & CATEGORIZATION
    # -------------------------------------------------------------------------
    sec39_cases = [
        TestCase(
            id="",
            description="View Inventory overview cards (Total Items, Low Stock, Out of Stock)",
            preconditions="Staff is on /inventory.",
            steps=[
                "Observe top KPI cards on Inventory page:",
                "- Total Inventory Items",
                "- Low Stock Items (at or below reorder level)",
                "- Out of Stock Items (0 quantity)"
            ],
            test_data="N/A",
            expected_result="Inventory dashboard cards render accurate counts reflecting current warehouse stock.",
            pass_criteria="All 3 inventory KPI cards display correct counts.",
            fail_criteria="KPIs show incorrect counts or NaN."
        ),
        TestCase(
            id="",
            description="Filter inventory items by Category (Medications, Supplies, Equipment, All)",
            preconditions="Staff is on /inventory.",
            steps=[
                "Click 'Medications' category tab -> observe table.",
                "Click 'Supplies' category tab -> observe table.",
                "Click 'Equipment' category tab -> observe table.",
                "Click 'All' category tab."
            ],
            test_data="Categories: Medications, Supplies, Equipment, All",
            expected_result="Table filters dynamically to show only items belonging to the active category tab.",
            pass_criteria="Category tabs filter inventory accurately.",
            fail_criteria="Items from wrong categories appear."
        ),
        TestCase(
            id="",
            description="Search inventory by Item Name",
            preconditions="Staff is on /inventory.",
            steps=[
                "Type 'Paracetamol' in the inventory search input."
            ],
            test_data="Search query: 'Paracetamol'",
            expected_result="Table filters to display only items containing 'Paracetamol'.",
            pass_criteria="Matching inventory items are displayed.",
            fail_criteria="Search fails to filter items."
        )
    ]
    sections.append(TestSection(39, "Staff Pharmacy & Inventory — Summary & Categorization", "Stock metrics overview, category filtering (Medications, Supplies, Equipment), and search.", sec39_cases))

    # -------------------------------------------------------------------------
    # SECTION 40: STAFF INVENTORY — ITEM CREATION & BOUNDS
    # -------------------------------------------------------------------------
    sec40_cases = [
        TestCase(
            id="",
            description="Add new inventory item with valid unit, stock, and reorder level",
            preconditions="Staff is on /inventory.",
            steps=[
                "Click '+ Add Item' button in header.",
                "Enter Item Name: 'Amoxicillin 500mg Capsules'.",
                "Select Category: 'Medications'.",
                "Select Unit: 'boxes' (from pcs, boxes, bottles, packs, vials, strips, ampules).",
                "Enter Initial Stock: '50'.",
                "Enter Reorder Level: '10'.",
                "Click 'Save Item'."
            ],
            test_data="Name: Amoxicillin 500mg, Category: Medications, Unit: boxes, Stock: 50, Reorder: 10",
            expected_result="Item is added to inventory and appears in the table with 'In Stock' status badge.",
            pass_criteria="New item is saved and visible in list.",
            fail_criteria="Creation fails or unit is invalid."
        ),
        TestCase(
            id="",
            description="Add inventory item validation — required item name and non-negative stock",
            preconditions="Add Item modal is open.",
            steps=[
                "Leave Item Name blank.",
                "Click 'Save Item'."
            ],
            test_data="Name: (empty)",
            expected_result="System displays validation error: 'Please enter an item name.'",
            pass_criteria="Validation alert prevents saving without item name.",
            fail_criteria="Unnamed item is saved."
        )
    ]
    sections.append(TestSection(40, "Staff Inventory — Item Creation & Bounds", "Add item modal, packaging unit selection (pcs, boxes, bottles, etc.), and boundary validations.", sec40_cases))

    # -------------------------------------------------------------------------
    # SECTION 41: STAFF INVENTORY — RESTOCK & DISPENSE ADJUSTMENTS
    # -------------------------------------------------------------------------
    sec41_cases = [
        TestCase(
            id="",
            description="Restock inventory item ('add' adjustment) with reason remarks",
            preconditions="Staff is on /inventory. Item 'Paracetamol 500mg' has stock 20.",
            steps=[
                "Click 'Adjust Stock' / 'Restock' button on the item row.",
                "Select Adjustment Type: 'Add / Restock'.",
                "Enter Quantity: '30'.",
                "Enter Reason: 'Received regular monthly pharmacy delivery'.",
                "Click 'Confirm Adjustment'."
            ],
            test_data="Type: Add, Qty: 30, Reason: 'Monthly pharmacy delivery'",
            expected_result="Stock quantity updates from 20 to 50. Transaction is recorded in audit log.",
            pass_criteria="Quantity increments accurately to 50.",
            fail_criteria="Stock fails to update or computes wrong total."
        ),
        TestCase(
            id="",
            description="Dispense/Use inventory item ('remove' adjustment) for clinical consult",
            preconditions="Item 'Paracetamol 500mg' has stock 50.",
            steps=[
                "Click 'Adjust Stock'.",
                "Select Adjustment Type: 'Remove / Dispense'.",
                "Enter Quantity: '5'.",
                "Enter Reason: 'Dispensed for acute fever consultation'.",
                "Click 'Confirm Adjustment'."
            ],
            test_data="Type: Remove, Qty: 5, Reason: 'Dispensed for acute fever'",
            expected_result="Stock quantity decrements from 50 to 45 with success confirmation.",
            pass_criteria="Quantity decrements accurately to 45.",
            fail_criteria="Stock does not decrease."
        ),
        TestCase(
            id="",
            description="Attempt to dispense more stock than currently available in inventory",
            preconditions="Item has stock quantity 10.",
            steps=[
                "Click 'Adjust Stock'.",
                "Select 'Remove / Dispense'.",
                "Enter Quantity: '25' (greater than available 10).",
                "Click 'Confirm Adjustment'."
            ],
            test_data="Stock: 10, Attempted Dispense: 25",
            expected_result="System blocks adjustment and displays: 'Cannot dispense more than current stock quantity (10).'",
            pass_criteria="Negative stock is prevented.",
            fail_criteria="Stock becomes negative (-15)."
        )
    ]
    sections.append(TestSection(41, "Staff Inventory — Restock & Dispense Adjustments", "Stock restock (addition), clinical dispensing (deduction), required remarks, and negative stock prevention.", sec41_cases))

    # -------------------------------------------------------------------------
    # SECTION 42: STAFF INVENTORY — AUDIT HISTORY & STOCK WARNINGS
    # -------------------------------------------------------------------------
    sec42_cases = [
        TestCase(
            id="",
            description="Open Inventory Transaction History modal to inspect audit logs",
            preconditions="Stock adjustments have occurred. Staff is on /inventory.",
            steps=[
                "Click 'Transaction History' button in page header.",
                "Observe transaction audit table columns (Date/Time, Item Name, Type, Quantity Change, Reason, Staff)."
            ],
            test_data="N/A",
            expected_result="Modal displays chronological history of all restock and dispense transactions with timestamps and staff identities.",
            pass_criteria="Transaction logs are listed with complete audit details.",
            fail_criteria="Modal fails to open or logs are missing."
        ),
        TestCase(
            id="",
            description="Visual warning badge transitions when stock drops at or below reorder level",
            preconditions="Item has reorder level 10. Current stock is 12 ('In Stock' green badge).",
            steps=[
                "Dispense 5 units (new stock: 7, below reorder level 10).",
                "Observe item status badge."
            ],
            test_data="Stock drops from 12 to 7 (Reorder: 10)",
            expected_result="Status badge transitions from green 'In Stock' to amber 'Low Stock'. Low Stock KPI counter on dashboard increments.",
            pass_criteria="Amber 'Low Stock' badge is displayed.",
            fail_criteria="Item remains marked as normal In Stock."
        )
    ]
    sections.append(TestSection(42, "Staff Inventory — Audit History & Stock Warnings", "Transaction audit trail modal, stock reduction triggers, and dynamic low stock warning badges.", sec42_cases))

    # -------------------------------------------------------------------------
    # SECTION 43: STAFF INVENTORY — ITEM DELETION & ROLE PERMISSIONS
    # -------------------------------------------------------------------------
    sec43_cases = [
        TestCase(
            id="",
            description="Delete inventory item with password verification (Physician / Admin)",
            preconditions="Logged in as Physician or Admin on /inventory.",
            steps=[
                "Click 'Delete' button on an inventory item row.",
                "In Delete Modal, enter item confirmation name and staff password.",
                "Click 'Delete Item'."
            ],
            test_data="Password: Physician@123",
            expected_result="Item is deleted from inventory list with success toast.",
            pass_criteria="Item row is removed from table.",
            fail_criteria="Deletion fails or prompts no password."
        ),
        TestCase(
            id="",
            description="Nurse role is blocked from deleting inventory items",
            preconditions="Logged in as Nurse on /inventory.",
            steps=[
                "Inspect inventory item action buttons."
            ],
            test_data="Role: Nurse",
            expected_result="Delete button is hidden or disabled for Nurse accounts (Nurse can restock/dispense but cannot delete items).",
            pass_criteria="Nurse cannot delete inventory items.",
            fail_criteria="Nurse is allowed to delete items."
        )
    ]
    sections.append(TestSection(43, "Staff Inventory — Item Deletion & Role Permissions", "Inventory deletion safeguards, password verification, and nurse role restrictions.", sec43_cases))

    # -------------------------------------------------------------------------
    # SECTION 44: STAFF REPORTS & ANALYTICS — CENSUS, TOP DIAGNOSES & TRENDS
    # -------------------------------------------------------------------------
    sec44_cases = [
        TestCase(
            id="",
            description="Generate Monthly Census report on /reports",
            preconditions="Staff is on /reports.",
            steps=[
                "Select Report Type: 'Monthly Census'.",
                "Select Date Range (e.g. past 30 days).",
                "Click 'Generate Report' / Observe auto-update."
            ],
            test_data="Type: Monthly Census, Range: Past 30 Days",
            expected_result="Report displays total patient consult count, demographic summary, and visual census breakdown chart.",
            pass_criteria="Monthly Census summary and chart are rendered accurately.",
            fail_criteria="Report fails to generate."
        ),
        TestCase(
            id="",
            description="Generate Top Diagnoses analytics report with pie chart visualization",
            preconditions="Staff is on /reports.",
            steps=[
                "Select Report Type: 'Top Diagnoses'."
            ],
            test_data="Type: Top Diagnoses",
            expected_result="Report renders Top Diagnoses pie/doughnut chart with ranked disease distribution and percentage shares.",
            pass_criteria="Pie chart and diagnosis ranking table are displayed.",
            fail_criteria="Chart fails to render."
        ),
        TestCase(
            id="",
            description="Generate Daily Visit Trends report with bar chart visualization",
            preconditions="Staff is on /reports.",
            steps=[
                "Select Report Type: 'Daily Visit Trends'."
            ],
            test_data="Type: Daily Visit Trends",
            expected_result="Report displays daily consult volume trends across the selected date range.",
            pass_criteria="Daily visit trend chart renders with date labels.",
            fail_criteria="Chart fails to load."
        )
    ]
    sections.append(TestSection(44, "Staff Reports & Analytics — Census, Top Diagnoses & Trends", "Clinical census reports, top diagnoses pie charts, and daily visit volume analytics.", sec44_cases))

    # -------------------------------------------------------------------------
    # SECTION 45: STAFF REPORTS — DATE RANGE VALIDATION & DRILL-DOWN
    # -------------------------------------------------------------------------
    sec45_cases = [
        TestCase(
            id="",
            description="Date range validation — block invalid date range where From date is after To date",
            preconditions="Staff is on /reports.",
            steps=[
                "Set 'From' date to '2026-08-30'.",
                "Set 'To' date to '2026-08-01' (From > To).",
                "Observe validation feedback."
            ],
            test_data="From: 2026-08-30, To: 2026-08-01",
            expected_result="System flags invalid range and displays: 'Please provide a valid date range (From ≤ To).' Charts and tables clear safely.",
            pass_criteria="Validation error appears and invalid date query is prevented.",
            fail_criteria="System crashes or executes backwards query."
        ),
        TestCase(
            id="",
            description="Inspect Raw Encounters Drill-Down card in reports view",
            preconditions="Staff is on /reports with generated report.",
            steps=[
                "Scroll down to 'Raw Encounters Drill-Down' card.",
                "Inspect table rows showing underlying encounter records."
            ],
            test_data="N/A",
            expected_result="Drill-down table lists individual encounter records corresponding to the active date filter with patient ID, date, complaint, and clinician.",
            pass_criteria="Raw encounters data table matches summary metrics.",
            fail_criteria="Drill-down table is missing or empty."
        )
    ]
    sections.append(TestSection(45, "Staff Reports — Date Range Validation & Drill-Down", "Date range validation (From <= To), error handling, and raw encounters drill-down tables.", sec45_cases))

    return sections
