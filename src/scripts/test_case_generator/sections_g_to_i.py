# src/scripts/test_case_generator/sections_g_to_i.py
from generator_core import TestCase, TestSection

def get_sections_g_to_i():
    sections = []

    # =========================================================================
    # SECTION G — PATIENT RECORDS
    # =========================================================================
    sec_g_cases = [
        TestCase(
            id="",
            description="View completed clinical records on Patient Records page",
            preconditions="Student has completed clinical visits recorded by clinic staff.",
            steps=[
                "Navigate to https://tup-icare.tech/patient/records.",
                "Observe Encounter History table and cards."
            ],
            test_data="N/A",
            expected_result="Page displays list of completed encounters with Date, Clinician Name, Chief Complaint, Vitals Summary, and Assessment Notes.",
            pass_criteria="Completed visits appear with formatted date and vitals.",
            fail_criteria="Records page is empty or displays error."
        ),
        TestCase(
            id="",
            description="Empty state when student has no completed clinical records",
            preconditions="A newly registered student with 0 completed encounters logs in.",
            steps=[
                "Navigate to /patient/records."
            ],
            test_data="Student with 0 visits",
            expected_result="System displays a friendly empty state card: 'No completed visits yet. Your completed clinic consultations and visit summaries will appear here once finalized by your clinician.'",
            pass_criteria="Clean empty state banner is displayed without table errors.",
            fail_criteria="Page shows broken layout or raw error messages."
        ),
        TestCase(
            id="",
            description="Vitals summary string formatting in patient records view",
            preconditions="Encounter contains BP: 120/80, HR: 72, Temp: 36.6, RR: 18, SpO2: 99, Weight: 65.",
            steps=[
                "Inspect Vitals column for the completed visit on /patient/records."
            ],
            test_data="Vitals object with full metrics",
            expected_result="Vitals are formatted cleanly as: 'BP: 120/80 • HR: 72 bpm • Temp: 36.6°C • RR: 18/min • SpO2: 99% • Weight: 65 kg'.",
            pass_criteria="All metrics are separated by bullets with proper units.",
            fail_criteria="Vitals display raw unformatted JSON or missing units."
        ),
        TestCase(
            id="",
            description="Chronological ordering of patient encounters (most recent on top)",
            preconditions="Student has multiple visits recorded across different dates.",
            steps=[
                "Inspect encounter list on /patient/records.",
                "Verify date sequence of rows."
            ],
            test_data="Multiple visits (e.g. Aug 10, Aug 20, Aug 30)",
            expected_result="Visits are ordered in descending chronological order with the latest encounter at the top.",
            pass_criteria="Most recent visit appears first.",
            fail_criteria="Visits are unordered or in reverse order."
        )
    ]
    sections.append(TestSection(7, "Patient Portal — Health Records", "Display of finalized clinical visits, formatted vitals metrics, chronological ordering, and empty states.", sec_g_cases))

    # =========================================================================
    # SECTION H — PATIENT PROFILE & AVATAR
    # =========================================================================
    sec_h_cases = [
        TestCase(
            id="",
            description="View patient profile metadata and health information",
            preconditions="Student is logged into Patient Portal.",
            steps=[
                "Navigate to https://tup-icare.tech/patient/profile.",
                "Observe displayed fields."
            ],
            test_data="N/A",
            expected_result="Profile displays Student ID (read-only), Full Name, Year Level, Contact Number, Address, Emergency Contact Name & Number, Blood Type, Current Medications, Known Allergies, and Medical Notes.",
            pass_criteria="All profile sections and health fields are visible.",
            fail_criteria="Profile fails to load or fields are missing."
        ),
        TestCase(
            id="",
            description="Edit and save contact number, emergency contact, and address",
            preconditions="Student is on /patient/profile.",
            steps=[
                "Click 'Edit Profile' button.",
                "Update Contact Number to '09171234567'.",
                "Update Address to 'Manila, Philippines'.",
                "Update Emergency Contact Name to 'Maria Dela Cruz' and Number to '09189876543'.",
                "Click 'Save Changes'."
            ],
            test_data="Phone: 09171234567, Address: Manila, Philippines, Emergency: Maria Dela Cruz (09189876543)",
            expected_result="Success alert 'Profile updated successfully' is displayed. Fields switch back to view mode showing updated info.",
            pass_criteria="Changes are persisted and remain after page refresh.",
            fail_criteria="Save fails or old values reappear upon reload."
        ),
        TestCase(
            id="",
            description="Update Blood Type selection in health profile",
            preconditions="Student is in Edit mode on /patient/profile.",
            steps=[
                "Select Blood Type dropdown.",
                "Choose 'O+'.",
                "Click 'Save Changes'."
            ],
            test_data="Blood Type: O+",
            expected_result="Profile saves and displays 'O+' as student's blood type.",
            pass_criteria="Selected blood type is saved and visible.",
            fail_criteria="Blood type defaults back to empty or fails to save."
        ),
        TestCase(
            id="",
            description="Cancel profile editing without saving modifications",
            preconditions="Student is in Edit mode on /patient/profile.",
            steps=[
                "Modify address text.",
                "Click 'Cancel' button."
            ],
            test_data="Modified text",
            expected_result="Form reverts to original unedited profile values without saving modifications.",
            pass_criteria="Original values are restored and edit mode exits.",
            fail_criteria="Unsaved edits remain visible in view mode."
        ),
        TestCase(
            id="",
            description="Upload valid JPEG/PNG profile photo on Patient Profile",
            preconditions="Student is on /patient/profile in edit mode.",
            steps=[
                "Click 'Change Photo' / 'Upload Photo' button.",
                "Select a valid JPEG image file (e.g. 1.5 MB, dimensions 400x400px).",
                "Observe preview update and click 'Save Changes'."
            ],
            test_data="File: student_photo.jpg (1.5 MB)",
            expected_result="Photo uploads successfully. Avatar updates on profile page and navbar header.",
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
            description="Remove custom profile photo and revert to default avatar placeholder",
            preconditions="Student has an existing custom profile photo.",
            steps=[
                "Click 'Remove Photo' button on /patient/profile.",
                "Confirm photo removal.",
                "Click 'Save Changes'."
            ],
            test_data="Action: Remove custom avatar",
            expected_result="Custom photo is removed and replaced by standard clinic default avatar placeholder.",
            pass_criteria="Default avatar placeholder image is displayed.",
            fail_criteria="Broken image icon appears or removal fails."
        )
    ]
    sections.append(TestSection(8, "Patient Portal — Profile & Avatar Photo", "Profile overview, contact updating, blood type, medications/allergies, image upload constraints (5MB limit), and avatar fallback.", sec_h_cases))

    # =========================================================================
    # SECTION I — PATIENT MESSAGING (MESSENGER-LIKE UI)
    # =========================================================================
    sec_i_cases = [
        TestCase(
            id="",
            description="Open New Inquiry modal and inspect Concern Categories",
            preconditions="Student is on https://tup-icare.tech/patient/messages.",
            steps=[
                "Click '+ New Inquiry' button.",
                "Inspect Concern Category dropdown options."
            ],
            test_data="N/A",
            expected_result="Modal opens with categories: 'General clinic inquiry', 'Appointment concern', 'Follow-up question', 'Medical inquiry', 'Dental inquiry'.",
            pass_criteria="All 5 concern categories are present in dropdown.",
            fail_criteria="Modal fails to open or categories are missing."
        ),
        TestCase(
            id="",
            description="Send new medical inquiry to clinic staff",
            preconditions="Student is on /patient/messages with New Inquiry modal open.",
            steps=[
                "Select Recipient: 'Clinic Personnel (General)' or specific clinician.",
                "Select Concern Category: 'Medical inquiry'.",
                "Type initial message: 'Good day doctor, I have a question regarding my prescribed allergy medication.'",
                "Click 'Send Inquiry'."
            ],
            test_data="Category: Medical inquiry, Message: 'Good day doctor...'",
            expected_result="Inquiry is created. Modal closes. Conversation opens in Active list and sent message bubble appears on the right side.",
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
            description="Student message bubble alignment on right side in Patient Portal chat",
            preconditions="An active conversation is open in patient messaging window.",
            steps=[
                "Type a follow-up reply in message composer (placeholder: 'Type your message...').",
                "Click Send button or press Enter.",
                "Inspect message bubble alignment."
            ],
            test_data="Reply: 'Thank you for the advice.'",
            expected_result="Student's message bubble appears aligned on the RIGHT side with crimson theme styling and timestamp.",
            pass_criteria="Student message bubble is rendered on the right side.",
            fail_criteria="Student message appears on the left side."
        ),
        TestCase(
            id="",
            description="Clinician message bubble alignment on left side in Patient Portal chat",
            preconditions="Clinician has sent a reply to the student.",
            steps=[
                "Observe incoming clinician message in the active chat thread."
            ],
            test_data="Clinician reply received",
            expected_result="Clinician's reply bubble appears aligned on the LEFT side with clinician avatar, staff name, and timestamp.",
            pass_criteria="Clinician reply bubble is rendered on the left side.",
            fail_criteria="Clinician reply appears on the right side."
        ),
        TestCase(
            id="",
            description="Realtime receipt of clinician reply without manual page refresh",
            preconditions="Student has /patient/messages open on an active conversation.",
            steps=[
                "Observe active chat window as clinician sends reply from Staff Portal in another browser.",
                "Do NOT refresh page."
            ],
            test_data="Clinician reply: 'Please visit Room 102 for a quick checkup.'",
            expected_result="Clinician's reply appears in realtime on the left side and chat automatically scrolls to latest message.",
            pass_criteria="Reply arrives dynamically without page reload.",
            fail_criteria="Message requires manual page refresh to appear."
        ),
        TestCase(
            id="",
            description="Resolved conversation automatically moves from Active to Past Inquiries/History tab",
            preconditions="Clinician marks active conversation as 'Resolved' from Staff Portal.",
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
                "Inspect bottom composer area."
            ],
            test_data="N/A",
            expected_result="Resolution banner is displayed: 'This conversation has been resolved. You can start a new inquiry if you have further concerns.' The text composer is disabled or hidden.",
            pass_criteria="Resolution banner is shown and resolved thread is read-only.",
            fail_criteria="Student can send new messages into an already resolved thread."
        ),
        TestCase(
            id="",
            description="Student A cannot see or access Student B's private messages",
            preconditions="Student A is logged in. Student B has private conversations with clinic staff.",
            steps=[
                "Student A inspects /patient/messages."
            ],
            test_data="Student A: TUPM-25-0001, Student B: TUPM-25-0002",
            expected_result="Student A sees only their own conversations. Student B's conversations are completely inaccessible.",
            pass_criteria="Complete patient conversation isolation is enforced.",
            fail_criteria="Student A can view or access Student B's messages."
        ),
        TestCase(
            id="",
            description="Sending multiline message in patient composer using Shift+Enter",
            preconditions="Student is in active conversation on /patient/messages.",
            steps=[
                "Type 'Line 1: Symptoms started yesterday.' in composer.",
                "Press Shift+Enter.",
                "Type 'Line 2: Mild fever 37.8C.' in composer.",
                "Click Send button."
            ],
            test_data="Multiline text with Shift+Enter",
            expected_result="Message is sent and rendered with preserved line breaks inside message bubble.",
            pass_criteria="Line breaks are rendered cleanly without truncation.",
            fail_criteria="Shift+Enter sends message prematurely or strips line breaks."
        ),
        TestCase(
            id="",
            description="Sending message containing emoji characters in patient chat",
            preconditions="Student is in active conversation.",
            steps=[
                "Type 'Good morning doc! 🙏💊 Feeling much better today.' in composer.",
                "Click Send button."
            ],
            test_data="Emoji text: 'Good morning doc! 🙏💊'",
            expected_result="Message is sent and emojis render cleanly on both student and staff chat views.",
            pass_criteria="Emojis render properly without corruption.",
            fail_criteria="Emojis cause message dispatch failure."
        ),
        TestCase(
            id="",
            description="Chat auto-scrolls to the newest message upon opening conversation",
            preconditions="A conversation with 15+ historical messages exists.",
            steps=[
                "Click on the long conversation thread in inbox list.",
                "Observe chat scroll position."
            ],
            test_data="Thread with 15+ messages",
            expected_result="Chat window automatically scrolls to bottom to show most recent message.",
            pass_criteria="Latest message is immediately visible at bottom.",
            fail_criteria="Chat remains stuck at top requiring manual scrolling."
        ),
        TestCase(
            id="",
            description="Switching between active conversations updates chat thread immediately",
            preconditions="Student has 2 active conversations (Conversation 1 and Conversation 2).",
            steps=[
                "Click Conversation 1 -> observe messages.",
                "Click Conversation 2 -> observe messages."
            ],
            test_data="2 active conversations",
            expected_result="Chat view switches instantly showing Conversation 2 messages without delay or cross-thread bleeding.",
            pass_criteria="Correct conversation messages load on demand.",
            fail_criteria="Messages from previous thread linger in new view."
        ),
        TestCase(
            id="",
            description="Clinician default avatar fallback placeholder in patient chat",
            preconditions="Clinician has not uploaded a custom profile image.",
            steps=[
                "Receive reply from clinician.",
                "Inspect clinician avatar icon next to message bubble."
            ],
            test_data="Clinician without uploaded avatar",
            expected_result="Standard clinic clinician fallback avatar icon is rendered cleanly without broken image symbol.",
            pass_criteria="Default avatar placeholder renders.",
            fail_criteria="Broken image icon is displayed."
        ),
        TestCase(
            id="",
            description="Search active inquiries by clinician name",
            preconditions="Multiple active conversations exist on /patient/messages.",
            steps=[
                "Type 'Dr. Physician' in conversation search input."
            ],
            test_data="Search: 'Dr. Physician'",
            expected_result="Inbox list filters to show only threads involving Dr. Physician.",
            pass_criteria="Matching conversation is displayed.",
            fail_criteria="Search filter fails to update."
        )
    ]
    sections.append(TestSection(9, "Patient Portal — Realtime Messaging & Inquiries", "Messenger-like interaction model, concern categories, message bubble alignment (right for student, left for clinician), realtime sync, resolution transitions, and privacy isolation.", sec_i_cases))

    return sections
