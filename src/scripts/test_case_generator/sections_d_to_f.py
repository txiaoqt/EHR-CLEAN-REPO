# src/scripts/test_case_generator/sections_d_to_f.py
from generator_core import TestCase, TestSection

def get_sections_d_to_f():
    sections = []

    # =========================================================================
    # SECTION D — PATIENT DASHBOARD
    # =========================================================================
    sec_d_cases = [
        TestCase(
            id="",
            description="Patient Dashboard layout, welcome banner, and personalized student greeting",
            preconditions="Student is logged into Patient Portal (https://tup-icare.tech).",
            steps=[
                "Navigate to https://tup-icare.tech/patient/dashboard.",
                "Observe top header, student name, welcome greeting, and clinic operating hours advisory banner."
            ],
            test_data="N/A",
            expected_result="Dashboard renders personalized welcome banner displaying student full name, active appointment status card, and clinic schedule advisory.",
            pass_criteria="Personalized welcome greeting and clinic banners render cleanly.",
            fail_criteria="Dashboard displays blank screen or wrong student name."
        ),
        TestCase(
            id="",
            description="Dashboard metric counts (Active Appointments, Completed Visits, Open Inquiries)",
            preconditions="Student is on /patient/dashboard.",
            steps=[
                "Inspect summary metric counters displayed on dashboard cards."
            ],
            test_data="N/A",
            expected_result="Counters display accurate numerical totals matching student's actual active bookings, completed consults, and open messaging inquiries.",
            pass_criteria="All metric counters display accurate numbers.",
            fail_criteria="Counters display NaN, blank, or erroneous totals."
        ),
        TestCase(
            id="",
            description="Click 'Book Appointment' quick action button on Dashboard",
            preconditions="Student is on /patient/dashboard with no active appointment.",
            steps=[
                "Click 'Book Appointment' button on Quick Actions card."
            ],
            test_data="N/A",
            expected_result="System navigates seamlessly to the Patient Scheduling page (/patient/schedule).",
            pass_criteria="Appointment Booking Flow loads on /patient/schedule.",
            fail_criteria="Button does not navigate or wrong page loads."
        ),
        TestCase(
            id="",
            description="Click 'Medical Records' quick action button on Dashboard",
            preconditions="Student is on /patient/dashboard.",
            steps=[
                "Click 'Medical Records' / 'View Records' button."
            ],
            test_data="N/A",
            expected_result="System navigates to Patient Records page (/patient/records).",
            pass_criteria="Patient Records page renders with consultation history table.",
            fail_criteria="Navigation fails."
        ),
        TestCase(
            id="",
            description="Click 'Messages' quick action button on Dashboard",
            preconditions="Student is on /patient/dashboard.",
            steps=[
                "Click 'Messages' / 'Contact Clinic' button."
            ],
            test_data="N/A",
            expected_result="System navigates to Patient Messages page (/patient/messages).",
            pass_criteria="Messaging inbox loads with Active and History tabs.",
            fail_criteria="Navigation fails."
        ),
        TestCase(
            id="",
            description="Dashboard active appointment card display when booking exists",
            preconditions="Student has an active booking with status 'Scheduled'.",
            steps=[
                "Navigate to /patient/dashboard.",
                "Inspect Active Appointment card."
            ],
            test_data="Active booking: Tomorrow 09:00-12:00 Medical Clinic",
            expected_result="Card displays formatted date, time window, clinic department (Medical/Dental), service type, clinician, status badge 'Scheduled', and 'View Details / Cancel' button.",
            pass_criteria="Active appointment details render with clear status badge.",
            fail_criteria="Card shows no appointment or incorrect booking info."
        ),
        TestCase(
            id="",
            description="Dashboard empty appointment state when student has no active bookings",
            preconditions="Student has zero active appointments.",
            steps=[
                "Navigate to /patient/dashboard.",
                "Inspect Appointment status section."
            ],
            test_data="Active appointments: 0",
            expected_result="Card displays: 'No active appointments scheduled. Book a visit with the campus clinic when needed.' with a 'Book Appointment' button.",
            pass_criteria="Clean empty state card is displayed.",
            fail_criteria="Card displays broken layout or false appointment data."
        ),
        TestCase(
            id="",
            description="Dashboard state persistence across browser reload",
            preconditions="Student is viewing populated dashboard.",
            steps=[
                "Reload browser page (F5)."
            ],
            test_data="N/A",
            expected_result="Dashboard reloads and displays identical metrics, greeting, and appointment status.",
            pass_criteria="Data reloads seamlessly without session loss.",
            fail_criteria="Dashboard crashes or logs out user on reload."
        )
    ]
    sections.append(TestSection(4, "Patient Portal — Home & Dashboard Navigation", "Welcome banner, metric counters, quick actions routing, active appointment card, and empty states.", sec_d_cases))

    # =========================================================================
    # SECTION E — PATIENT EVENTS & ANNOUNCEMENTS
    # =========================================================================
    sec_e_cases = [
        TestCase(
            id="",
            description="View published university clinic events and health announcements",
            preconditions="Student is logged in on /patient/events. Published events exist in database.",
            steps=[
                "Navigate to https://tup-icare.tech/patient/events.",
                "Observe the events feed list."
            ],
            test_data="N/A",
            expected_result="Event cards render showing Event Title, Category badge, Date, Time window, Location, and Summary Description.",
            pass_criteria="Published events appear as cards with complete event details.",
            fail_criteria="Events page is empty despite published events existing."
        ),
        TestCase(
            id="",
            description="Draft, cancelled, and archived events are strictly hidden from students",
            preconditions="Staff has created events in Draft, Cancelled, and Archived states.",
            steps=[
                "Student navigates to /patient/events.",
                "Inspect visible event cards and search feed."
            ],
            test_data="Draft/Cancelled/Archived events in system",
            expected_result="Draft, cancelled, and archived administrative events are completely hidden from student view.",
            pass_criteria="Only published events are visible to students.",
            fail_criteria="Draft or cancelled administrative events leak into student feed."
        ),
        TestCase(
            id="",
            description="Search events feed by keyword",
            preconditions="Published events exist (e.g. 'Blood Donation Drive', 'Dental Hygiene Seminar').",
            steps=[
                "Type 'Blood' in events search input."
            ],
            test_data="Query: 'Blood'",
            expected_result="List filters in realtime to display only events matching 'Blood'.",
            pass_criteria="Matching event card is shown; non-matching are hidden.",
            fail_criteria="Search filter does not update list."
        ),
        TestCase(
            id="",
            description="Events search with no matching results displays clean empty state",
            preconditions="Student is on /patient/events.",
            steps=[
                "Type 'NonExistentEventKeyword123' in search bar."
            ],
            test_data="Query: 'NonExistentEventKeyword123'",
            expected_result="Feed displays: 'No announcements matching your search criteria.'",
            pass_criteria="Clean no-results message is displayed.",
            fail_criteria="Page breaks or shows blank container."
        ),
        TestCase(
            id="",
            description="Open Event Details modal to view full announcement content",
            preconditions="Student is on /patient/events with visible event cards.",
            steps=[
                "Click on an event card or 'View Details' button.",
                "Inspect modal content.",
                "Click the close (X) button."
            ],
            test_data="N/A",
            expected_result="Event Details modal opens displaying full description, schedule, venue, and clinic contact info; closes cleanly upon clicking close icon.",
            pass_criteria="Modal opens with full text and closes cleanly.",
            fail_criteria="Modal fails to open or cannot be closed."
        )
    ]
    sections.append(TestSection(5, "Patient Portal — Events & Announcements", "Student-facing events feed, draft/cancelled isolation, search filtering, empty states, and details modal.", sec_e_cases))

    # =========================================================================
    # SECTION F — PATIENT APPOINTMENT SCHEDULING (COMPREHENSIVE)
    # =========================================================================
    sec_f_cases = [
        TestCase(
            id="",
            description="Department selection toggle between Medical Clinic and Dental Clinic",
            preconditions="Student is on /patient/schedule with no active appointment.",
            steps=[
                "Observe Department selector options.",
                "Click 'Medical Clinic'. Observe available Service Types.",
                "Click 'Dental Clinic'. Observe available Service Types."
            ],
            test_data="Departments: Medical Clinic, Dental Clinic",
            expected_result="Medical Clinic displays services ['Consultation', 'Check-up']. Dental Clinic displays services ['Dental cleaning', 'Tooth extraction/bunot', 'Dental check-up'].",
            pass_criteria="Service Type options update dynamically based on selected department.",
            fail_criteria="Services do not change or show mismatched clinic options."
        ),
        TestCase(
            id="",
            description="Department switch resets selected service type to clinic default",
            preconditions="Student selected 'Medical Clinic' -> 'Consultation'.",
            steps=[
                "Click 'Dental Clinic'.",
                "Observe Service Type dropdown."
            ],
            test_data="Department switch: Medical -> Dental",
            expected_result="Service Type automatically resets to the first Dental service ('Dental cleaning') and clears medical service selection.",
            pass_criteria="Service type cleanly updates to match new department.",
            fail_criteria="Previous medical service remains selected under Dental clinic."
        ),
        TestCase(
            id="",
            description="Same-day Appointment mode restricts calendar date strictly to Today (Asia/Manila)",
            preconditions="Student selects 'Same-day Appointment' toggle on /patient/schedule.",
            steps=[
                "Observe calendar dates.",
                "Verify today's date is selected.",
                "Attempt to click tomorrow or any future date."
            ],
            test_data="Mode: Same-day Appointment, Today: Current Date (Asia/Manila)",
            expected_result="Only today's date is selectable. Future dates are visually disabled and unclickable.",
            pass_criteria="Future dates cannot be selected while in Same-day mode.",
            fail_criteria="Student can select a future date under Same-day mode."
        ),
        TestCase(
            id="",
            description="Future Appointment mode restricts calendar date to Tomorrow onwards",
            preconditions="Student selects 'Future Appointment' toggle on /patient/schedule.",
            steps=[
                "Observe calendar dates.",
                "Verify date automatically advances to tomorrow.",
                "Attempt to click today's date on calendar."
            ],
            test_data="Mode: Future Appointment, Tomorrow: Current Date + 1",
            expected_result="Today and past dates are visually disabled and unclickable. Tomorrow and upcoming future dates are selectable.",
            pass_criteria="Today's date is blocked from selection under Future Appointment mode.",
            fail_criteria="Student is allowed to book today's date under Future Appointment mode."
        ),
        TestCase(
            id="",
            description="Past calendar dates are disabled across all appointment modes",
            preconditions="Student is on /patient/schedule.",
            steps=[
                "Inspect past dates on the calendar (dates before today).",
                "Attempt to click a past date."
            ],
            test_data="Past dates",
            expected_result="All past dates have disabled attribute, muted opacity, cursor: not-allowed, and cannot be selected.",
            pass_criteria="Past dates are strictly unselectable.",
            fail_criteria="Past dates can be selected for booking."
        ),
        TestCase(
            id="",
            description="Same-day Morning slot (09:00–12:00) expiration after 12:00 PM (Asia/Manila)",
            preconditions="Current Asia/Manila time is past 12:00 (e.g. 13:30). Mode: Same-day.",
            steps=[
                "Inspect Morning slot (09:00-12:00).",
                "Inspect Afternoon slot (13:00-16:00).",
                "Inspect Evening slot (16:00-19:00)."
            ],
            test_data="Current Time: 13:30 Asia/Manila",
            expected_result="Morning slot (09:00-12:00) is marked as 'Expired / Passed' and is disabled. Afternoon and Evening slots remain active.",
            pass_criteria="Expired morning slot is disabled.",
            fail_criteria="Student can book a morning slot whose hours have passed today."
        ),
        TestCase(
            id="",
            description="Same-day Afternoon slot (13:00–16:00) expiration after 16:00 (4:00 PM)",
            preconditions="Current Asia/Manila time is past 16:00 (e.g. 16:45). Mode: Same-day.",
            steps=[
                "Inspect slot availability for today."
            ],
            test_data="Current Time: 16:45 Asia/Manila",
            expected_result="Morning and Afternoon slots are marked expired and disabled. Evening slot (16:00-19:00) remains available.",
            pass_criteria="Only evening slot is bookable.",
            fail_criteria="Passed afternoon slot remains bookable."
        ),
        TestCase(
            id="",
            description="All same-day slots disabled after clinic closing (past 19:00 Asia/Manila)",
            preconditions="Current Asia/Manila time is 19:30 (7:30 PM).",
            steps=[
                "Select Same-day Appointment mode for today.",
                "Inspect slot availability."
            ],
            test_data="Current Time: 19:30 Asia/Manila",
            expected_result="All three same-day slots are marked expired. A banner advises student to book a Future Appointment for tomorrow onwards.",
            pass_criteria="No same-day slots can be booked after 19:00.",
            fail_criteria="System allows booking slots after clinic closing."
        ),
        TestCase(
            id="",
            description="Slot availability and capacity badge display (1 of 1 slot available)",
            preconditions="An unbooked slot exists for a chosen date.",
            steps=[
                "Select available date and inspect slot button.",
                "Observe capacity badge text."
            ],
            test_data="Unbooked slot",
            expected_result="Slot button displays time window (e.g. '09:00-12:00') with green '1 of 1 slot available' badge.",
            pass_criteria="Available capacity badge is clearly displayed.",
            fail_criteria="Capacity text is missing or indicates full."
        ),
        TestCase(
            id="",
            description="Occupied slot renders disabled with 'Occupied / Full' badge for other students",
            preconditions="Student A has booked Medical Clinic, Tomorrow, Slot 1 (09:00-12:00). Student B logs in.",
            steps=[
                "Student B navigates to /patient/schedule.",
                "Select Medical Clinic, Future Appointment, Tomorrow's date.",
                "Observe Slot 1 (09:00-12:00)."
            ],
            test_data="Student A: TUPM-25-0001 (booked), Student B: TUPM-25-0002",
            expected_result="Slot 1 displays an amber/red 'Occupied / Full' badge and is disabled. Slot 2 and Slot 3 remain available.",
            pass_criteria="Student B cannot select the occupied slot.",
            fail_criteria="Slot 1 remains available or Student B can double-book."
        ),
        TestCase(
            id="",
            description="Selected slot visual highlighting and booking summary update",
            preconditions="Student is on /patient/schedule on an available date.",
            steps=[
                "Click Slot 2 (13:00-16:00).",
                "Observe slot button styling.",
                "Inspect Booking Summary sidebar card."
            ],
            test_data="Slot: 13:00-16:00",
            expected_result="Slot 2 is highlighted with primary active border; Booking Summary updates showing selected Date, Time window, Department, and Service.",
            pass_criteria="Selected slot displays active styling and updates summary card.",
            fail_criteria="Slot is not highlighted or summary does not update."
        ),
        TestCase(
            id="",
            description="Successful appointment booking creates Scheduled status and Reference Code",
            preconditions="Student is on /patient/schedule with valid slot selected.",
            steps=[
                "Select Medical Clinic -> Consultation.",
                "Select tomorrow's date and Slot 1 (09:00-12:00).",
                "Enter reason for visit: 'Follow-up for seasonal allergies'.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Reason: 'Follow-up for seasonal allergies'",
            expected_result="Booking confirms successfully. Success modal displays Reference Code (APT-YYYYMMDD-XXXX), date, time, and department.",
            pass_criteria="Reference code is generated and active appointment card appears.",
            fail_criteria="Booking fails or errors out."
        ),
        TestCase(
            id="",
            description="One Active Appointment Rule — Student blocked from booking while 'Scheduled' exists",
            preconditions="Student already has an active appointment with status 'Scheduled'.",
            steps=[
                "Student navigates to /patient/schedule.",
                "Observe page state."
            ],
            test_data="Active booking: APT-20260831-1001 (Scheduled)",
            expected_result="Booking form is replaced by Active Appointment Details card with message: 'You already have an active appointment. You may only hold one active appointment at a time.'",
            pass_criteria="New booking form is hidden; active appointment details and Cancel button are shown.",
            fail_criteria="Student can create multiple active concurrent bookings."
        ),
        TestCase(
            id="",
            description="One Active Appointment Rule — Student blocked while appointment is 'Checked-in'",
            preconditions="Staff has updated student's appointment status from 'Scheduled' to 'Checked-in'.",
            steps=[
                "Student visits /patient/schedule."
            ],
            test_data="Status: Checked-in",
            expected_result="Student remains restricted from booking another appointment while in Checked-in status.",
            pass_criteria="Active appointment barrier persists during clinic visit.",
            fail_criteria="Checked-in status allows student to book another appointment simultaneously."
        ),
        TestCase(
            id="",
            description="Student cancels active appointment and is immediately released to book again",
            preconditions="Student has an active 'Scheduled' appointment.",
            steps=[
                "On /patient/schedule, click 'Cancel Appointment' button.",
                "Confirm cancellation in modal."
            ],
            test_data="Action: Cancel booking",
            expected_result="Appointment status changes to 'Cancelled'. Success alert confirms cancellation. Scheduling form re-opens and student can immediately book a new appointment.",
            pass_criteria="Appointment is cancelled; previously occupied slot becomes available.",
            fail_criteria="Cancellation fails or student remains blocked."
        ),
        TestCase(
            id="",
            description="Cancelled appointment releases slot for other students to book",
            preconditions="Student A cancels their booking for Tomorrow Slot 1. Student B is on schedule page.",
            steps=[
                "Student A cancels booking.",
                "Student B selects Tomorrow's date on /patient/schedule."
            ],
            test_data="Released Slot: Tomorrow 09:00-12:00",
            expected_result="Slot 1 updates from 'Occupied' to '1 of 1 slot available' and is clickable for Student B.",
            pass_criteria="Slot is released and bookable by other students.",
            fail_criteria="Slot remains stuck as occupied after cancellation."
        ),
        TestCase(
            id="",
            description="Multi-user concurrent booking collision on the same slot",
            preconditions="Student A and Student B both have schedule open on same unbooked slot simultaneously.",
            steps=[
                "Student A clicks 'Confirm & Book'. Booking succeeds.",
                "1 second later, Student B clicks 'Confirm & Book' on same slot without refreshing."
            ],
            test_data="Slot: Tomorrow 13:00-16:00",
            expected_result="Student B's submission is rejected with notification: 'This appointment slot was just booked by another student. Please select an alternate time slot.'",
            pass_criteria="System prevents double booking and preserves Student A's reservation.",
            fail_criteria="Both students receive confirmed bookings for the single-capacity slot."
        ),
        TestCase(
            id="",
            description="Medical Clinic and Dental Clinic slot capacity independence",
            preconditions="Student A has booked Medical Clinic, Tomorrow, Slot 1 (09:00-12:00).",
            steps=[
                "Student B navigates to /patient/schedule.",
                "Select 'Dental Clinic', Tomorrow's date.",
                "Observe Slot 1 (09:00-12:00) for Dental Clinic."
            ],
            test_data="Department: Dental Clinic, Slot: 09:00-12:00",
            expected_result="Dental Clinic Slot 1 remains available and bookable (Medical and Dental clinics maintain independent capacities).",
            pass_criteria="Dental slot is available; Medical booking does not block Dental clinic.",
            fail_criteria="Medical booking incorrectly marks Dental slot as occupied."
        ),
        TestCase(
            id="",
            description="Newly booked appointment immediately appears on Staff Schedule as 'Scheduled'",
            preconditions="Student completes booking on Patient Portal. Clinician is on Staff Portal.",
            steps=[
                "Student books Medical Clinic, Tomorrow, Slot 1.",
                "Clinician navigates to /appointments on Staff Portal and selects Tomorrow's date tab."
            ],
            test_data="Student: TUPM-25-0001",
            expected_result="The appointment appears in Staff Schedule table with status 'Scheduled', matching Student ID, department, service, and time.",
            pass_criteria="Appointment reflects on Staff schedule with Scheduled status.",
            fail_criteria="Appointment is missing from staff portal."
        ),
        TestCase(
            id="",
            description="Book Dental Clinic service 'Tooth extraction/bunot'",
            preconditions="Student is on /patient/schedule on an available future date.",
            steps=[
                "Select Department: 'Dental Clinic'.",
                "Select Service Type: 'Tooth extraction/bunot'.",
                "Select Date and available time slot.",
                "Enter Reason: 'Severe lower molar toothache requiring extraction'.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Dept: Dental Clinic, Service: 'Tooth extraction/bunot'",
            expected_result="Booking confirms successfully. Reference code generated and appointment card displays Dental Clinic and Tooth extraction.",
            pass_criteria="Dental procedure appointment is booked with reference code.",
            fail_criteria="Booking fails or reverts to medical clinic."
        ),
        TestCase(
            id="",
            description="Book Dental Clinic service 'Dental cleaning'",
            preconditions="Student is on /patient/schedule on an available date.",
            steps=[
                "Select Department: 'Dental Clinic'.",
                "Select Service Type: 'Dental cleaning'.",
                "Select Date and Slot 2 (13:00-16:00).",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Dept: Dental Clinic, Service: 'Dental cleaning'",
            expected_result="Dental cleaning appointment is booked and appears under active appointment details.",
            pass_criteria="Booking confirms with Dental cleaning service.",
            fail_criteria="Booking fails."
        ),
        TestCase(
            id="",
            description="Book Medical Clinic service 'Check-up'",
            preconditions="Student is on /patient/schedule.",
            steps=[
                "Select Department: 'Medical Clinic'.",
                "Select Service Type: 'Check-up'.",
                "Select Date and Slot 1 (09:00-12:00).",
                "Enter Reason: 'Annual student medical clearance check-up'.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Dept: Medical Clinic, Service: 'Check-up'",
            expected_result="Medical Check-up appointment is confirmed and active card appears.",
            pass_criteria="Medical checkup appointment is booked successfully.",
            fail_criteria="Booking fails."
        ),
        TestCase(
            id="",
            description="Calendar month forward navigation button",
            preconditions="Student is on /patient/schedule in Future Appointment mode.",
            steps=[
                "Locate calendar header showing current month/year.",
                "Click right chevron / 'Next Month' button.",
                "Observe calendar dates update to the following month."
            ],
            test_data="Action: Next month navigation",
            expected_result="Calendar advances to the next month and displays future bookable dates.",
            pass_criteria="Calendar transitions to next month.",
            fail_criteria="Month does not advance or calendar breaks."
        ),
        TestCase(
            id="",
            description="Calendar month backward navigation boundary",
            preconditions="Student is on /patient/schedule in Future Appointment mode on current month.",
            steps=[
                "Inspect left chevron / 'Previous Month' button.",
                "Attempt to navigate backward to a month entirely in the past."
            ],
            test_data="Action: Navigate to past month",
            expected_result="Previous month button is disabled or past month dates are entirely disabled.",
            pass_criteria="System prevents booking in past months.",
            fail_criteria="Past dates become selectable."
        ),
        TestCase(
            id="",
            description="Cancel appointment confirmation modal: Dismiss action preserves active appointment",
            preconditions="Student has an active booking on /patient/schedule.",
            steps=[
                "Click 'Cancel Appointment' button.",
                "In confirmation modal, click 'No, Keep Appointment' / 'Cancel'.",
                "Observe appointment status."
            ],
            test_data="Action: Dismiss cancellation modal",
            expected_result="Modal dismisses and appointment remains active with status 'Scheduled'.",
            pass_criteria="Appointment is NOT cancelled.",
            fail_criteria="Appointment is accidentally cancelled."
        ),
        TestCase(
            id="",
            description="Booking appointment with maximum allowed reason text length (255 characters)",
            preconditions="Student is on /patient/schedule with slot selected.",
            steps=[
                "Enter exactly 255 characters of descriptive text in Reason field.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Reason: 255 characters text string",
            expected_result="Booking confirms and full reason is stored without truncation.",
            pass_criteria="255-character reason is accepted and saved.",
            fail_criteria="Booking errors out on 255 characters."
        ),
        TestCase(
            id="",
            description="Booking appointment with emoji and punctuation in reason field",
            preconditions="Student is on /patient/schedule with slot selected.",
            steps=[
                "Enter Reason: 'Experiencing mild cough & fever 😷 - need consultation!'.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Reason with emojis and punctuation",
            expected_result="Booking confirms and emojis/punctuation render properly in booking summary and staff view.",
            pass_criteria="Emojis and punctuation are safely accommodated.",
            fail_criteria="Emoji causes database error or booking failure."
        ),
        TestCase(
            id="",
            description="Staff marks appointment as 'Completed' releasing active appointment restriction",
            preconditions="Student had an active Checked-in visit. Staff marks visit as 'Completed' on Staff Portal.",
            steps=[
                "Student refreshes /patient/schedule on Patient Portal."
            ],
            test_data="Status: Completed",
            expected_result="Active appointment card is cleared and standard booking form re-appears, allowing student to book a future appointment.",
            pass_criteria="Student is released to book future appointments after visit completion.",
            fail_criteria="Student remains blocked from future booking."
        )
    ]
    sections.append(TestSection(6, "Patient Portal — Appointment Scheduling & Business Rules", "Medical & Dental clinic options, Same-day vs Future boundaries, slot expiration, capacity limits, collisions, active appointment restrictions, and lifecycle.", sec_f_cases))

    return sections
