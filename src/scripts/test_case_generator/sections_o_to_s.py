# src/scripts/test_case_generator/sections_o_to_s.py
from generator_core import TestCase, TestSection

def get_sections_o_to_s():
    sections = []

    # =========================================================================
    # SECTION O — INVENTORY
    # =========================================================================
    sec_o_cases = [
        TestCase(
            id="",
            description="View Inventory overview cards (Total Items, Low Stock, Out of Stock)",
            preconditions="Staff is on https://tup-icare-staff.me/inventory.",
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
            expected_result="Table filters dynamically to show only items belonging to active category tab.",
            pass_criteria="Category tabs filter inventory accurately.",
            fail_criteria="Items from wrong categories appear."
        ),
        TestCase(
            id="",
            description="Add new inventory item with valid packaging unit, stock, and reorder level",
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
            expected_result="Item is added to inventory and appears in table with 'In Stock' status badge.",
            pass_criteria="New item is saved and visible in list.",
            fail_criteria="Creation fails or unit is invalid."
        ),
        TestCase(
            id="",
            description="Restock inventory item ('add' adjustment) with reason remarks",
            preconditions="Staff is on /inventory. Item 'Paracetamol 500mg' has stock 20.",
            steps=[
                "Click 'Adjust Stock' / 'Restock' button on item row.",
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
            description="Dispense/Use inventory item ('remove' adjustment) with required remarks",
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
        ),
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
        ),
        TestCase(
            id="",
            description="Delete inventory item with password verification (Physician / Admin)",
            preconditions="Logged in as Physician on /inventory.",
            steps=[
                "Click 'Delete' button on an inventory item row.",
                "In Delete Modal, enter item confirmation name and staff password 'Physician@123'.",
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
    sections.append(TestSection(15, "Staff Portal — Pharmacy & Medical Inventory", "Overview KPIs, category tabs, item creation, packaging units, restock/dispense adjustments, over-dispensing protection, audit history modal, and role-based deletion.", sec_o_cases))

    # =========================================================================
    # SECTION P — REPORTS & ANALYTICS
    # =========================================================================
    sec_p_cases = [
        TestCase(
            id="",
            description="Date range validation — block invalid date range where From date is after To date",
            preconditions="Staff is on https://tup-icare-staff.me/reports.",
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
            description="Export analytics report as PDF with password authorization",
            preconditions="Staff is on /reports with generated report.",
            steps=[
                "Click 'Export' menu dropdown -> select 'Export PDF Report'.",
                "In Password Authorization modal, enter valid password 'TUPCensus@2026'.",
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
        )
    ]
    sections.append(TestSection(16, "Staff Portal — Reports, Census & Analytics", "Date range validations (From <= To), Monthly Census, Top Diagnoses pie charts, Daily Visit trends, and password-protected PDF/CSV exports.", sec_p_cases))

    # =========================================================================
    # SECTION Q — EVENTS MANAGEMENT & EMAIL BLAST
    # =========================================================================
    sec_q_cases = [
        TestCase(
            id="",
            description="Create and publish new health announcement/event on /events",
            preconditions="Staff is on https://tup-icare-staff.me/events.",
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
            expected_result="Event is saved and published. It appears immediately in staff events list and becomes visible on Patient Portal events feed.",
            pass_criteria="Event card appears under Published events.",
            fail_criteria="Event fails to save or does not publish."
        ),
        TestCase(
            id="",
            description="Edit existing event details and update status from Draft to Published",
            preconditions="An event exists with status 'Draft'.",
            steps=[
                "Click 'Edit' (pencil icon) on draft event card.",
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
            pass_criteria="Only Year 1 students are listed in recipient table.",
            fail_criteria="Students from other years remain visible."
        ),
        TestCase(
            id="",
            description="Filter email blast recipients by Blood Type (e.g. O+ donors for blood drive)",
            preconditions="Email Blast modal is open for Blood Donation Drive event.",
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
            expected_result="System dispatches announcement and displays green delivery result banner: 'Successfully dispatched event announcement to 5 recipient(s).'",
            pass_criteria="Success banner confirms delivery count.",
            fail_criteria="Dispatch fails or reports error."
        )
    ]
    sections.append(TestSection(17, "Staff Portal — Events & Email Blast Announcements", "Event management CRUD, audience segmentation by Year Levels (1-6) and Blood Types (All, A+, A-, B+, B-, AB+, AB-, O+, O-, Not Specified), batch selection, and dispatch.", sec_q_cases))

    # =========================================================================
    # SECTION R — STAFF MESSAGING & INQUIRIES
    # =========================================================================
    sec_r_cases = [
        TestCase(
            id="",
            description="Staff Messaging inbox with student avatars, names, and concern badges",
            preconditions="Staff is on https://tup-icare-staff.me/patient-messages.",
            steps=[
                "Observe left-hand conversation inbox list.",
                "Inspect conversation items (Student Avatar, Full Name, Student ID, Concern Category badge, timestamp, snippet)."
            ],
            test_data="N/A",
            expected_result="Staff inbox renders active student inquiries with student avatars, badges, and snippet previews.",
            pass_criteria="All inquiry metadata elements are rendered cleanly.",
            fail_criteria="Inbox fails to load or avatars are broken."
        ),
        TestCase(
            id="",
            description="Staff sends reply to student in active conversation thread",
            preconditions="Staff has selected an active student conversation on /patient-messages.",
            steps=[
                "Inspect selected chat header showing student name and concern type.",
                "Type clinical reply in composer: 'Please proceed to the clinic at 10:00 AM for vital signs check.'",
                "Click Send button or press Enter."
            ],
            test_data="Reply text: 'Please proceed to the clinic at 10:00 AM...'",
            expected_result="Message appears on right side with clinician name and timestamp. Student receives reply in realtime on their portal.",
            pass_criteria="Message is sent and appended to thread immediately.",
            fail_criteria="Message fails to send or composer does not clear."
        ),
        TestCase(
            id="",
            description="Staff resolves student inquiry via 'Resolve Inquiry' action modal",
            preconditions="An active conversation is open on /patient-messages.",
            steps=[
                "Click 'Resolve Inquiry' / 'Mark as Resolved' button in chat header.",
                "In Resolve Confirmation modal, click 'Confirm & Resolve'."
            ],
            test_data="Action: Resolve conversation",
            expected_result="Conversation status updates to 'Resolved'. The thread is removed from 'Active' inbox and moved to 'History' tab on both staff and patient portals.",
            pass_criteria="Conversation transitions cleanly to History tab.",
            fail_criteria="Resolution fails or thread stays in Active list."
        ),
        TestCase(
            id="",
            description="Administrator role global visibility across all staff-student inquiries",
            preconditions="Logged in as Admin on /patient-messages.",
            steps=[
                "Inspect inbox list."
            ],
            test_data="Role: Admin",
            expected_result="Admin can view inquiries addressed to all clinicians across university clinic for clinical oversight.",
            pass_criteria="Full inquiry oversight is accessible to Administrator.",
            fail_criteria="Admin is restricted from viewing general inquiries."
        ),
        TestCase(
            id="",
            description="Clinician sees only assigned inquiries or general clinic inquiries",
            preconditions="Logged in as Physician (Dr. Santos). Another physician (Dr. Reyes) has private direct inquiries.",
            steps=[
                "Inspect inbox list for Dr. Santos."
            ],
            test_data="Clinician: Dr. Santos",
            expected_result="Dr. Santos sees only general clinic inquiries and inquiries specifically addressed to Dr. Santos.",
            pass_criteria="Inquiry segregation is preserved between clinicians.",
            fail_criteria="Dr. Santos can improperly view private inquiries addressed exclusively to other doctors."
        )
    ]
    sections.append(TestSection(18, "Staff Portal — Patient Messaging & Inquiries", "Staff inbox layout, student avatars, concern badges, message alignment, realtime delivery, inquiry resolution modal, and clinician role isolation.", sec_r_cases))

    # =========================================================================
    # SECTION S — HELP / SUPPORT & SOPS
    # =========================================================================
    sec_s_cases = [
        TestCase(
            id="",
            description="Help Center FAQ accordion items expansion and clinical SOPs",
            preconditions="Staff is on https://tup-icare-staff.me/help.",
            steps=[
                "Observe FAQ section.",
                "Click FAQ item 'How to record clinical vitals & encounters'.",
                "Observe accordion expansion.",
                "Click FAQ item 'How to manage inventory reorders'."
            ],
            test_data="N/A",
            expected_result="FAQ items expand smoothly to reveal step-by-step clinical guidance and SOP instructions.",
            pass_criteria="Accordion expands/collapses and displays complete help text.",
            fail_criteria="Accordions fail to expand or text is clipped."
        ),
        TestCase(
            id="",
            description="Emergency Clinic Hotlines and Support Contact Information on /help",
            preconditions="Staff is on /help.",
            steps=[
                "Inspect 'Support Channels & Hotlines' card.",
                "Verify Clinic Emergency Hotline number, University Support Email, and Operating Hours (07:00–19:00 Asia/Manila)."
            ],
            test_data="N/A",
            expected_result="Contact card displays official clinic hotline, support email, and operating hours.",
            pass_criteria="All contact details and hours are clearly visible.",
            fail_criteria="Contact information is missing."
        ),
        TestCase(
            id="",
            description="Add inventory item with 'vials' unit of measurement",
            preconditions="Staff is on /inventory.",
            steps=[
                "Click '+ Add Item'.",
                "Enter Name: 'Tetanus Toxoid Vaccine'.",
                "Select Category: 'Medications'.",
                "Select Unit: 'vials'.",
                "Enter Stock: '25', Reorder: '5'.",
                "Click 'Save Item'."
            ],
            test_data="Unit: vials",
            expected_result="Item is saved with unit 'vials' and appears in the inventory list.",
            pass_criteria="Item is saved with vials unit.",
            fail_criteria="Saving fails."
        ),
        TestCase(
            id="",
            description="Inventory item displays red 'Out of Stock' badge when quantity reaches 0",
            preconditions="Item has quantity 2. Staff dispenses 2 units.",
            steps=[
                "Dispense 2 units.",
                "Observe item row status badge."
            ],
            test_data="Stock: 0",
            expected_result="Status badge transitions to red 'Out of Stock' and Out of Stock KPI counter increments.",
            pass_criteria="Red Out of Stock badge is displayed.",
            fail_criteria="Badge remains Low Stock or In Stock."
        ),
        TestCase(
            id="",
            description="Event creation validation — Start time must be before End time",
            preconditions="Staff is on /events creating an event.",
            steps=[
                "Set Start Time to '16:00'.",
                "Set End Time to '10:00' (Start > End).",
                "Click 'Save Event'."
            ],
            test_data="Start: 16:00, End: 10:00",
            expected_result="System flags invalid schedule: 'Start time must be before end time.'",
            pass_criteria="Invalid time schedule is rejected.",
            fail_criteria="Event with backwards times is saved."
        ),
        TestCase(
            id="",
            description="Filter events feed by category ('Vaccination', 'Checkup', 'General')",
            preconditions="Events of multiple categories exist on /events.",
            steps=[
                "Select Category filter -> choose 'Vaccination'.",
                "Observe filtered event cards."
            ],
            test_data="Category: Vaccination",
            expected_result="Only Vaccination events are displayed in the list.",
            pass_criteria="Event cards match selected category.",
            fail_criteria="Non-vaccination events remain visible."
        )
    ]
    sections.append(TestSection(19, "Staff Portal — Help Center & Standard Operating Procedures", "Interactive FAQ accordions, clinical SOP guidelines, emergency hotline directory, and operating hours.", sec_s_cases))

    return sections
