# src/scripts/test_case_generator/build_test_cases.py
import os
import sys

# Ensure UTF-8 stdout on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import docx
from docx.shared import Pt, RGBColor
from generator_core import (
    create_styled_document,
    add_header_banner,
    add_table_of_contents,
    render_test_case_table
)
from sections_a_to_c import get_sections_a_to_c
from sections_d_to_f import get_sections_d_to_f
from sections_g_to_i import get_sections_g_to_i
from sections_j_to_n import get_sections_j_to_n
from sections_o_to_s import get_sections_o_to_s
from sections_t_to_x import get_sections_t_to_x
from sections_y_to_ad import get_sections_y_to_ad

def main():
    print("================================================================================")
    print(" TUP CLINIC EHR — COMPLETE BLACK-BOX TEST SUITE GENERATOR")
    print(" Deployments: User Portal (https://tup-icare.tech) | Admin (https://tup-icare-staff.me)")
    print("================================================================================\n")

    # 1. Gather all sections
    all_sections = []
    all_sections.extend(get_sections_a_to_c())
    all_sections.extend(get_sections_d_to_f())
    all_sections.extend(get_sections_g_to_i())
    all_sections.extend(get_sections_j_to_n())
    all_sections.extend(get_sections_o_to_s())
    all_sections.extend(get_sections_t_to_x())
    all_sections.extend(get_sections_y_to_ad())

    total_sections = len(all_sections)
    print(f"[*] Loaded {total_sections} functional testing sections.")

    # 2. Renumber sections and assign sequential Test Case IDs (TC001, TC002, ...)
    current_tc_num = 1
    total_test_cases = 0
    all_cases_list = []

    for s_idx, sec in enumerate(all_sections, start=1):
        sec.number = s_idx
        for tc in sec.test_cases:
            tc.id = f"TC{current_tc_num:03d}"
            # Ensure Actual Result is ALWAYS completely blank for manual tester entry
            tc.actual_result = ""
            all_cases_list.append(tc)
            current_tc_num += 1
            total_test_cases += 1

    print(f"[*] Assigned globally sequential IDs to {total_test_cases} test cases (TC001 to TC{total_test_cases:03d}).")

    # 3. Quality Assurance & Validation Checks
    print("\n[*] Running Quality Assurance & Strict Black-Box Audit...")
    validation_errors = []

    # A. Check sequential IDs and uniqueness
    seen_ids = set()
    for idx, tc in enumerate(all_cases_list, start=1):
        expected_id = f"TC{idx:03d}"
        if tc.id != expected_id:
            validation_errors.append(f"Sequence Error: Expected {expected_id}, found {tc.id}")
        if tc.id in seen_ids:
            validation_errors.append(f"Duplicate Error: ID {tc.id} repeated.")
        seen_ids.add(tc.id)

        # B. Check that Actual Result is strictly blank
        if tc.actual_result != "":
            validation_errors.append(f"Actual Result not blank in {tc.id}: '{tc.actual_result}'")

        # C. Check required fields
        if not tc.description or not tc.preconditions or not tc.steps or not tc.test_data or not tc.expected_result or not tc.pass_criteria or not tc.fail_criteria:
            validation_errors.append(f"Missing required field in {tc.id}")

        # D. Strict Black-Box Compliance Audit (No internal code, SQL, DevTools, or trigger names)
        forbidden_terms = [
            "SELECT *", "INSERT INTO", "DELETE FROM", "UPDATE users", "supabase.from", "localStorage.setItem",
            "DevTools", "trg_", "get_login_lockout_status", "register_failed_login", "rpc("
        ]
        content_to_check = f"{tc.description} {tc.preconditions} {' '.join(tc.steps)} {tc.expected_result} {tc.pass_criteria} {tc.fail_criteria}"
        for term in forbidden_terms:
            if term.lower() in content_to_check.lower():
                validation_errors.append(f"Black-Box Violation in {tc.id}: Found prohibited term '{term}'")

    if validation_errors:
        print("\n[!] Validation Failed with Errors:")
        for err in validation_errors:
            print(f"    - {err}")
        sys.exit(1)
    else:
        print("  ✓ All test case IDs are unique, sequential, and correctly formatted.")
        print("  ✓ All 'Actual Result' fields are completely blank.")
        print("  ✓ Strict Black-Box QA compliance verified (0 white-box/gray-box violations).")

    # 4. Generate Microsoft Word Document (.docx)
    print("\n[*] Generating Microsoft Word Document: TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx...")
    doc = create_styled_document()

    # Add Title Banner
    add_header_banner(doc, total_test_cases, total_sections)

    # Add Table of Contents
    add_table_of_contents(doc, all_sections)

    # Render Sections and Test Cases
    for sec in all_sections:
        # Section Heading
        h_sec = doc.add_paragraph()
        r_sec = h_sec.add_run(f"Section {sec.number}: {sec.title}")
        r_sec.font.name = 'Segoe UI'
        r_sec.font.size = Pt(15)
        r_sec.font.bold = True
        r_sec.font.color.rgb = RGBColor(0x99, 0x1B, 0x1B)

        p_desc = doc.add_paragraph()
        r_desc = p_desc.add_run(sec.description)
        r_desc.font.size = Pt(9.5)
        r_desc.font.italic = True
        r_desc.font.color.rgb = RGBColor(0x4B, 0x55, 0x63)

        doc.add_paragraph()

        # Render test case tables
        for tc in sec.test_cases:
            render_test_case_table(doc, tc)

        doc.add_page_break()

    # Document Summary Section
    h_sum = doc.add_paragraph()
    r_sum = h_sum.add_run("Executive Test Suite Summary & Coverage Matrix")
    r_sum.font.name = 'Segoe UI'
    r_sum.font.size = Pt(16)
    r_sum.font.bold = True
    r_sum.font.color.rgb = RGBColor(0x99, 0x1B, 0x1B)

    summary_paragraphs = [
        f"• TOTAL BLACK-BOX TEST CASES: {total_test_cases} Cases (TC001 – TC{total_test_cases:03d})",
        f"• TOTAL FUNCTIONAL MODULES: {total_sections} Distinct Sections (Section A through Section AD)",
        "• PRIMARY DEPLOYMENT SURFACES:",
        "    - Student / Patient Portal: https://tup-icare.tech",
        "    - Clinical Administrative Staff Portal: https://tup-icare-staff.me",
        "• CLINICIAN STAFF CREDENTIALS:",
        "    - Email: physician@tupclinic.local",
        "    - Password: Physician@123",
        "• STUDENT TEST CREDENTIALS:",
        "    - Email: qa.student01@tup.edu.ph / student.test@tup.edu.ph",
        "    - Password: StudentTest@123",
        "• CENSUS EXPORT AUTHORIZATION PASSWORD: TUPCensus@2026",
        "• USER ROLE COVERAGE:",
        "    - Patient / Student: Full self-service appointment scheduling, messaging, profile photo management, records access",
        "    - Clinic Nurse: Triage, vital signs recording, medication dispensing, appointment queue management (deletion-restricted)",
        "    - Attending Physician: Full clinical authority, Assessment & Plan formulation, diagnosis, clinical encounters, deletions",
        "    - Clinic Administrator: System settings, staff oversight, user directory, census analytics, offline JSON backups",
        "• PLATFORM & RESPONSIVE COVERAGE:",
        "    - Desktop Web Browsers (1440px, 1280px, 1024px)",
        "    - Tablet Devices (820px, 768px)",
        "    - Mobile Smartphones (414px, 390px, 360px)",
        "• CORE ARCHITECTURAL RULES TESTED:",
        "    - One active appointment per student constraint (Scheduled, Checked-in)",
        "    - Single-capacity slot availability & global collision prevention",
        "    - Same-day (today only) vs Future (tomorrow+) appointment date rules",
        "    - Same-day time slot expiration based on slot end times (09:00-12:00, 13:00-16:00, 16:00-19:00)",
        "    - PC Access Safeguard for clinical staff portal (< 1024px blocking)",
        "    - Operating hours enforcement (07:00–19:00 Asia/Manila)",
        "    - High-sensitivity clinical record field masking (ABAC)",
        "    - Global Light/Dark theme switching, contrast, and storage persistence",
        "    - Realtime bidirectional messaging and inquiry resolution lifecycle"
    ]

    for sp in summary_paragraphs:
        p = doc.add_paragraph()
        r = p.add_run(sp)
        r.font.size = Pt(9.5)
        if sp.startswith("• TOTAL") or sp.startswith("• PRIMARY") or sp.startswith("• CLINICIAN") or sp.startswith("• STUDENT") or sp.startswith("• CENSUS") or sp.startswith("• USER") or sp.startswith("• PLATFORM") or sp.startswith("• CORE"):
            r.font.bold = True

    saved_docx_paths = []
    for docx_path in ["TUP_Clinic_EHR_Complete_Black_Box_Test_Cases_Revised.docx", "TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx"]:
        try:
            doc.save(docx_path)
            print(f"  ✓ Saved Word document: {docx_path} ({os.path.getsize(docx_path):,} bytes)")
            saved_docx_paths.append(docx_path)
        except PermissionError:
            print(f"  [!] Notice: {docx_path} is currently open in another program. Saved to alternative path.")

    # 5. Generate Markdown Index Summary File
    md_path = "TUP_Clinic_EHR_Black_Box_Test_Case_Index.md"
    print(f"\n[*] Generating Index Markdown: {md_path}...")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# TUP Clinic EHR — Comprehensive Black-Box Test Case Index\n\n")
        f.write("## Executive Specification & Quality Assurance Overview\n\n")
        f.write(f"- **Application Name:** TUP Clinic Electronic Health Records (EHR) System\n")
        f.write(f"- **Student / Patient Portal URL:** `https://tup-icare.tech`\n")
        f.write(f"- **Staff / Administrative Portal URL:** `https://tup-icare-staff.me`\n")
        f.write(f"- **Clinician Credentials:** `physician@tupclinic.local` / `Physician@123`\n")
        f.write(f"- **Student Credentials:** `qa.student01@tup.edu.ph` / `StudentTest@123`\n")
        f.write(f"- **Census Authorization Password:** `TUPCensus@2026`\n")
        f.write(f"- **Testing Methodology:** Strict Black-Box Functional & End-to-End QA Testing\n")
        f.write(f"- **Total Test Cases:** **{total_test_cases} Test Cases** (`TC001` to `TC{total_test_cases:03d}`)\n")
        f.write(f"- **Total Modules & Sections:** **{total_sections} Functional Sections (Section A – Section AD)**\n")
        f.write(f"- **Master DOCX Document:** [`TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx`](file:///c:/Users/Christopher%20x%20Angel/Documents/EHR-PROJECT1/TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx)\n\n")

        f.write("---\n\n")
        f.write("## Module & Test Case Range Directory\n\n")
        f.write("| Section # | Module / Section Title | Test Case ID Range | Case Count |\n")
        f.write("| :---: | :--- | :---: | :---: |\n")

        for sec in all_sections:
            start_id = sec.test_cases[0].id if sec.test_cases else "N/A"
            end_id = sec.test_cases[-1].id if sec.test_cases else "N/A"
            id_range = f"`{start_id}` – `{end_id}`" if start_id != end_id else f"`{start_id}`"
            f.write(f"| **{sec.number}** | {sec.title} | {id_range} | **{len(sec.test_cases)}** |\n")

        f.write("\n---\n\n")
        f.write("## Detailed Test Coverage Breakdown\n\n")

        f.write("### 1. User Roles & Permission Coverage\n")
        f.write("- **Patient (Student):** Self-service registration, OTP verification, password recovery, same-day and future appointment scheduling (Medical & Dental), active appointment lifecycle, medical records review, profile contact updating, photo avatar management, realtime messaging with clinicians, Light/Dark theme switching.\n")
        f.write("- **Clinic Nurse:** Clinical dashboard metrics review, appointment queue viewing and check-in status transitions, patient registry searching, vitals recording on encounters, medical inventory restock and dispense adjustments, inquiry resolution.\n")
        f.write("- **Attending Physician:** Complete clinical authority, comprehensive encounter documentation (HPI, Physical Exam, Assessment & Plan, Vitals), patient profile diagnosis management, medical summary PDF generation with doctor signature, destructive record deletion with password verification.\n")
        f.write("- **Clinic Administrator:** Global staff oversight, full inquiry oversight across all clinicians, system appearance settings, clinical census exports, offline JSON database backups.\n\n")

        f.write("### 2. Platform & Viewport Coverage\n")
        f.write("- **Desktop Screens (`1440px`, `1280px`, `1024px`):** Full grid layouts, collapsible sidebar rails, table responsive containers, KPI metric boards, multi-column clinical profiles.\n")
        f.write("- **Tablet Devices (`820px`, `768px`):** Adaptive 2-column to 1-column layouts, touch-friendly dropdowns, card-based clinical records.\n")
        f.write("- **Mobile Smartphones (`414px`, `390px`, `360px`):** Fixed header with brand identity, sliding navigation drawer with backdrop, full-screen conversation threads with back navigation, mobile scheduling cards.\n")
        f.write("- **PC Access Safeguard (`PCAccessRequired`):** Strict device guard requiring >= 1024px width for clinical staff portal operations while maintaining 100% mobile accessibility for students.\n\n")

        f.write("### 3. Core Business Rules & Validations Tested\n")
        f.write("1. **One Active Appointment Rule:** Strict restriction limiting students to at most 1 active booking (`Scheduled` or `Checked-in`). Cancelled and Completed visits release the student.\n")
        f.write("2. **Slot Capacity & Collision:** 1 booking per department/date/time slot with immediate occupied badge display and multi-user collision prevention.\n")
        f.write("3. **Same-Day vs Future Date Separation:** Same-day mode restricted to today's date in Asia/Manila; Future mode restricted to tomorrow onwards.\n")
        f.write("4. **Same-Day Slot Expiration:** Automated disabling of same-day time slots whose scheduled hours have elapsed (09:00–12:00 after 12:00, 13:00–16:00 after 16:00, 16:00–19:00 after 19:00).\n")
        f.write("5. **Clinic Operating Hours:** 07:00 to 19:00 Asia/Manila staff portal boundary enforcement.\n")
        f.write("6. **Attribute-Based Masking (ABAC):** High-sensitivity clinical assessment hiding for unauthorized staff.\n")
        f.write("7. **Email Blast Audience Filters:** Precision targeting by Year Levels (1–6) and Blood Types (A+, A-, B+, B-, AB+, AB-, O+, O-, Not Specified).\n")
        f.write("8. **Global Theme System:** 180ms smooth transitions, high contrast slate palette (`#0f172a`, `#1e293b`), and `tup-clinic-theme` storage persistence.\n\n")

        f.write("### 4. QA Manual Execution Instructions\n")
        f.write("1. Open the master test document [`TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx`](file:///c:/Users/Christopher%20x%20Angel/Documents/EHR-PROJECT1/TUP_Clinic_EHR_Complete_Black_Box_Test_Cases.docx).\n")
        f.write("2. Execute each test case step-by-step using the web browser UI on `https://tup-icare.tech` (Patient Portal) or `https://tup-icare-staff.me` (Staff Portal).\n")
        f.write("3. Record observed findings into the blank **Actual Result** field.\n")
        f.write("4. Mark **Pass** if all observable conditions in Pass Criteria are met; mark **Fail** if any deviation occurs.\n")

    print(f"  ✓ Saved Index summary: {md_path} ({os.path.getsize(md_path):,} bytes)")
    print("\n================================================================================")
    print(f" 🎉 TEST SUITE GENERATION COMPLETE: {total_test_cases} TEST CASES ACROSS {total_sections} SECTIONS")
    print("================================================================================\n")

if __name__ == "__main__":
    main()
