# src/scripts/test_case_generator/sections_a_to_c.py
from generator_core import TestCase, TestSection

def get_sections_a_to_c():
    sections = []

    # =========================================================================
    # SECTION A — AUTHENTICATION & ACCOUNT SECURITY
    # =========================================================================
    sec_a_cases = [
        TestCase(
            id="",
            description="Valid student login on Patient Portal with verified @tup.edu.ph credentials",
            preconditions="User is on Patient Portal login page (https://tup-icare.tech/login). A verified student account exists.",
            steps=[
                "Enter registered student email in Email field.",
                "Enter correct student password in Password field.",
                "Click 'Sign In' button."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: StudentTest@123",
            expected_result="System authenticates successfully and redirects to Patient Dashboard (https://tup-icare.tech/patient/dashboard). Welcome banner with student name is displayed.",
            pass_criteria="Patient Dashboard opens with student name visible in header.",
            fail_criteria="Login fails, displays generic error, or stays on login page."
        ),
        TestCase(
            id="",
            description="Valid staff login on Admin Staff Portal with clinician credentials",
            preconditions="User is on Staff Portal login page (https://tup-icare-staff.me/login) on desktop browser. Staff account exists.",
            steps=[
                "Enter staff email in Email field.",
                "Enter correct staff password in Password field.",
                "Click 'Sign In' button."
            ],
            test_data="Email: physician@tupclinic.local, Password: Physician@123",
            expected_result="System authenticates successfully and redirects to Staff Dashboard (https://tup-icare-staff.me/dashboard). Sidebar shows clinician name and Clinical Administration menu.",
            pass_criteria="Staff Dashboard loads with clinician name, metrics, and navigation sidebar.",
            fail_criteria="Login fails, redirects to patient portal, or error message is shown."
        ),
        TestCase(
            id="",
            description="Login attempt with unregistered email address",
            preconditions="User is on the Login page.",
            steps=[
                "Enter an unregistered email address.",
                "Enter any arbitrary password.",
                "Click 'Sign In'."
            ],
            test_data="Email: nonexistent.user999@tup.edu.ph, Password: ArbitraryPassword123!",
            expected_result="System rejects login attempt and displays 'Invalid email or password' error message without disclosing account non-existence.",
            pass_criteria="Error banner displays 'Invalid email or password' and user remains on login page.",
            fail_criteria="System reveals whether the email exists or allows unauthenticated access."
        ),
        TestCase(
            id="",
            description="Login attempt with incorrect password for existing registered account",
            preconditions="User is on Login page. Account exists.",
            steps=[
                "Enter registered email address.",
                "Enter incorrect password.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: WrongPassword999#",
            expected_result="System rejects login attempt and displays 'Invalid email or password'.",
            pass_criteria="'Invalid email or password' message is displayed and password field retains focus.",
            fail_criteria="System logs user in or exposes internal authentication details."
        ),
        TestCase(
            id="",
            description="Login attempt with both email and password incorrect",
            preconditions="User is on Login page.",
            steps=[
                "Enter unregistered email address.",
                "Enter incorrect password.",
                "Click 'Sign In'."
            ],
            test_data="Email: bad.email@tup.edu.ph, Password: BadPassword123",
            expected_result="System rejects login with standard 'Invalid email or password' message.",
            pass_criteria="Standard error banner is displayed.",
            fail_criteria="System crashes or gives inconsistent error messages."
        ),
        TestCase(
            id="",
            description="Login attempt with blank email field",
            preconditions="User is on Login page.",
            steps=[
                "Leave Email field empty.",
                "Enter valid password.",
                "Click 'Sign In'."
            ],
            test_data="Email: (empty), Password: StudentTest@123",
            expected_result="System prevents submission and displays 'Please enter email and password' or highlights the email input.",
            pass_criteria="Validation alert appears immediately; network request is blocked.",
            fail_criteria="Form submits empty email to server."
        ),
        TestCase(
            id="",
            description="Login attempt with blank password field",
            preconditions="User is on Login page.",
            steps=[
                "Enter valid email address.",
                "Leave Password field empty.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: (empty)",
            expected_result="System prevents submission and displays validation prompt.",
            pass_criteria="Validation prompt appears immediately.",
            fail_criteria="Form submits empty password."
        ),
        TestCase(
            id="",
            description="Login attempt with both email and password fields blank",
            preconditions="User is on Login page.",
            steps=[
                "Leave both Email and Password fields empty.",
                "Click 'Sign In'."
            ],
            test_data="Email: (empty), Password: (empty)",
            expected_result="System prevents submission and displays 'Please enter email and password'.",
            pass_criteria="Validation alert 'Please enter email and password' appears.",
            fail_criteria="Form submits empty request."
        ),
        TestCase(
            id="",
            description="Login attempt with invalid email format (missing @ or domain)",
            preconditions="User is on Login page.",
            steps=[
                "Enter 'notanemailaddress' in Email field.",
                "Enter password.",
                "Click 'Sign In'."
            ],
            test_data="Email: notanemailaddress, Password: StudentTest@123",
            expected_result="Browser/system displays standard email format validation error.",
            pass_criteria="Invalid email format is flagged before submission.",
            fail_criteria="System accepts malformed email string without error."
        ),
        TestCase(
            id="",
            description="Toggle password masking visibility in login form",
            preconditions="User is on Login page with password typed into Password input.",
            steps=[
                "Type 'SecretPassword123' in Password field.",
                "Observe masked bullet characters.",
                "Click eye icon toggle button.",
                "Observe plaintext characters.",
                "Click eye icon again."
            ],
            test_data="Password: SecretPassword123",
            expected_result="Password characters toggle cleanly between plain visible text and masked bullets.",
            pass_criteria="Input type switches between 'password' and 'text'.",
            fail_criteria="Password remains masked or icon is unresponsive."
        ),
        TestCase(
            id="",
            description="Login submit button loading state and double-click prevention",
            preconditions="User is on Login page with credentials entered.",
            steps=[
                "Rapidly double-click 'Sign In' button."
            ],
            test_data="Credentials entered",
            expected_result="Button displays loading indicator ('Signing in…') and disables, executing exactly one login request.",
            pass_criteria="Button prevents duplicate concurrent submissions.",
            fail_criteria="Multiple concurrent login requests fire."
        ),
        TestCase(
            id="",
            description="Account lockout threshold after 5 consecutive failed login attempts",
            preconditions="User is on Login page with a registered email.",
            steps=[
                "Enter registered email.",
                "Enter incorrect password and click 'Sign In'.",
                "Repeat step 2 for a total of 5 consecutive failed attempts.",
                "Observe error message on the 5th attempt."
            ],
            test_data="Email: qa.student02@tup.edu.ph, Password: BadPasswordAttempt",
            expected_result="System temporarily locks account and displays lockout message indicating too many failed attempts.",
            pass_criteria="Lockout message appears stating account is temporarily locked (e.g. 15 minutes).",
            fail_criteria="System permits infinite brute-force password guessing."
        ),
        TestCase(
            id="",
            description="Login attempt during active lockout period",
            preconditions="Account is currently in locked status from 5 failed attempts.",
            steps=[
                "Enter correct password for the locked account.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student02@tup.edu.ph, Password: CorrectPassword@123",
            expected_result="System continues to block login and displays remaining lockout duration message.",
            pass_criteria="Login is denied during lockout even with correct password.",
            fail_criteria="Correct password bypasses active lockout timer."
        ),
        TestCase(
            id="",
            description="Deactivated account login rejection",
            preconditions="An account marked as deactivated by administrators exists.",
            steps=[
                "Enter deactivated user's email and password.",
                "Click 'Sign In'."
            ],
            test_data="Email: deactivated.user@tup.edu.ph, Password: ValidPass@123",
            expected_result="System rejects login and displays 'Your account has been deactivated. Please contact an administrator.'",
            pass_criteria="Deactivated notice is displayed and session is not created.",
            fail_criteria="Deactivated user gains portal access."
        ),
        TestCase(
            id="",
            description="Unverified account login barrier",
            preconditions="An account was registered but OTP email verification was not completed.",
            steps=[
                "Enter unverified student credentials and click 'Sign In'."
            ],
            test_data="Email: unverified.student@tup.edu.ph, Password: StudentPass@2026",
            expected_result="System detects unverified email status and directs user to OTP verification screen.",
            pass_criteria="User is prompted to verify email before portal access is granted.",
            fail_criteria="Unverified user gains full access to clinical features."
        ),
        TestCase(
            id="",
            description="Staff attempting to log in on Patient/User Portal surface",
            preconditions="Application is running on User Portal (https://tup-icare.tech). Clinician credentials exist.",
            steps=[
                "Navigate to https://tup-icare.tech/login.",
                "Enter clinician staff credentials.",
                "Click 'Sign In'."
            ],
            test_data="Email: physician@tupclinic.local, Password: Physician@123",
            expected_result="System blocks login and displays 'Only patient accounts can log in on this portal.'",
            pass_criteria="Surface mismatch error message is shown and staff is not logged into patient portal.",
            fail_criteria="Staff user is logged into student dashboard or system crashes."
        ),
        TestCase(
            id="",
            description="Student attempting to log in on Clinical Administrative Staff Portal surface",
            preconditions="Application is running on Staff Portal (https://tup-icare-staff.me). Student credentials exist.",
            steps=[
                "Navigate to https://tup-icare-staff.me/login.",
                "Enter student credentials.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: StudentTest@123",
            expected_result="System blocks login and displays 'Patient accounts are not allowed on this portal.'",
            pass_criteria="Surface mismatch error is displayed and staff dashboard access is denied.",
            fail_criteria="Student account gains access to staff administration portal."
        ),
        TestCase(
            id="",
            description="Direct access to protected Patient route without authentication",
            preconditions="Browser has no active session.",
            steps=[
                "Type URL in address bar: https://tup-icare.tech/patient/dashboard.",
                "Press Enter."
            ],
            test_data="URL: https://tup-icare.tech/patient/dashboard",
            expected_result="System intercepts request and redirects browser to /login immediately.",
            pass_criteria="Browser redirects to /login; protected content does not render.",
            fail_criteria="Protected dashboard content flashes or is accessible."
        ),
        TestCase(
            id="",
            description="Direct access to protected Staff route without authentication",
            preconditions="Browser has no active session.",
            steps=[
                "Type URL in address bar: https://tup-icare-staff.me/dashboard.",
                "Press Enter."
            ],
            test_data="URL: https://tup-icare-staff.me/dashboard",
            expected_result="System intercepts request and redirects browser to /login.",
            pass_criteria="Browser lands on /login page.",
            fail_criteria="Staff administrative dashboard is displayed."
        ),
        TestCase(
            id="",
            description="Session persistence across browser page refresh",
            preconditions="Student is logged into Patient Portal.",
            steps=[
                "Navigate to /patient/dashboard.",
                "Press browser reload button (F5).",
                "Observe page state."
            ],
            test_data="N/A",
            expected_result="Application restores active session cleanly and renders Patient Dashboard without logging user out.",
            pass_criteria="User remains logged in on dashboard after refresh.",
            fail_criteria="User is logged out on reload."
        ),
        TestCase(
            id="",
            description="Explicit sign out from Patient Portal",
            preconditions="Student is logged into Patient Portal.",
            steps=[
                "Click user profile menu in header.",
                "Click 'Log Out' / 'Sign Out'.",
                "Attempt to use browser Back button."
            ],
            test_data="N/A",
            expected_result="Session is terminated immediately. Browser redirects to /login. Pressing Back button redirects back to /login.",
            pass_criteria="User is signed out and protected pages cannot be accessed via history.",
            fail_criteria="Protected clinical data is visible after logout."
        ),
        TestCase(
            id="",
            description="Open new browser tab after logout",
            preconditions="User has logged out in Tab 1.",
            steps=[
                "Open a new browser tab (Tab 2).",
                "Navigate to https://tup-icare.tech/patient/dashboard."
            ],
            test_data="URL: /patient/dashboard",
            expected_result="Tab 2 recognizes terminated session and redirects to /login.",
            pass_criteria="Session remains terminated in new tabs.",
            fail_criteria="New tab retains previous authenticated session."
        ),
        TestCase(
            id="",
            description="Cross-tab session logout synchronization",
            preconditions="User has Patient Portal open in Tab 1 and Tab 2 simultaneously.",
            steps=[
                "In Tab 1, click 'Log Out'.",
                "Switch to Tab 2 and click 'Book Appointment' or any navigation link."
            ],
            test_data="Multi-tab browser session",
            expected_result="Tab 2 detects terminated session and redirects immediately to /login.",
            pass_criteria="Session logout is synchronized across open tabs.",
            fail_criteria="Tab 2 remains authenticated after Tab 1 signs out."
        ),
        TestCase(
            id="",
            description="Password reset request for registered email address",
            preconditions="User is on Forgot Password view on Login page.",
            steps=[
                "Enter registered student email.",
                "Click 'Send Reset Link' / 'Request Password Reset'."
            ],
            test_data="Email: qa.student01@tup.edu.ph",
            expected_result="System displays confirmation notice: 'If an account with that email exists, password reset instructions have been sent.'",
            pass_criteria="Standard anti-enumeration success message is displayed.",
            fail_criteria="System crashes or indicates error."
        ),
        TestCase(
            id="",
            description="Password reset request for unregistered email address",
            preconditions="User is on Forgot Password view.",
            steps=[
                "Enter unregistered email.",
                "Click 'Send Reset Link'."
            ],
            test_data="Email: unregistered999@tup.edu.ph",
            expected_result="System displays the exact same anti-enumeration confirmation message.",
            pass_criteria="Exact same message is shown, preventing email harvesting.",
            fail_criteria="System discloses 'Email does not exist'."
        ),
        TestCase(
            id="",
            description="Open Reset Password page with valid recovery link",
            preconditions="User clicks valid, unexpired recovery link from email.",
            steps=[
                "Navigate to recovery URL (/reset-password?type=recovery&token_hash=...).",
                "Observe rendered page."
            ],
            test_data="Valid recovery token URL",
            expected_result="System validates recovery session and displays 'Set New Password' form with New Password and Confirm Password inputs.",
            pass_criteria="New password form is rendered with brand header.",
            fail_criteria="Page shows expired error or redirects to login."
        ),
        TestCase(
            id="",
            description="Open Reset Password page with expired recovery link",
            preconditions="Recovery link token has expired.",
            steps=[
                "Navigate to /reset-password with expired token parameters."
            ],
            test_data="Expired token URL",
            expected_result="System displays error: 'Password reset link is invalid or has expired' and provides 'Back to Login' button.",
            pass_criteria="Error card is displayed; password input form is hidden.",
            fail_criteria="System allows password submission on expired link."
        ),
        TestCase(
            id="",
            description="Open Reset Password page with already-used recovery link",
            preconditions="Recovery link was already used once to reset password.",
            steps=[
                "Navigate to the previously consumed recovery URL."
            ],
            test_data="Reused token URL",
            expected_result="System detects consumed token and displays invalid/expired link notice.",
            pass_criteria="Reused token is rejected.",
            fail_criteria="Token allows multiple password resets."
        ),
        TestCase(
            id="",
            description="Submit new password with mismatched confirmation",
            preconditions="User is on valid Reset Password form.",
            steps=[
                "Enter 'NewPassword@2026' in New Password field.",
                "Enter 'DifferentPass@2026' in Confirm Password field.",
                "Click 'Update Password'."
            ],
            test_data="New: NewPassword@2026, Confirm: DifferentPass@2026",
            expected_result="System blocks submission and displays 'Passwords do not match.'",
            pass_criteria="Validation alert appears and password is not changed.",
            fail_criteria="Form submits with mismatched passwords."
        ),
        TestCase(
            id="",
            description="Submit new password with length shorter than 6 characters",
            preconditions="User is on valid Reset Password form.",
            steps=[
                "Enter '12345' in both password fields.",
                "Click 'Update Password'."
            ],
            test_data="Password: 12345",
            expected_result="System blocks submission and displays 'Password must be at least 6 characters.'",
            pass_criteria="Validation alert prevents short password.",
            fail_criteria="Short password is accepted."
        ),
        TestCase(
            id="",
            description="Successful password update and post-recovery login",
            preconditions="User is on valid Reset Password form.",
            steps=[
                "Enter valid new password 'BrandNewPass@2026' in both fields.",
                "Click 'Update Password'.",
                "Observe success confirmation.",
                "Click 'Proceed to Login'.",
                "Log in using the new password."
            ],
            test_data="New Password: BrandNewPass@2026",
            expected_result="Password is successfully updated. User can sign in with new password; previous old password is no longer accepted.",
            pass_criteria="Success message confirms update and login with new credentials succeeds.",
            fail_criteria="Login with new password fails or old password still works."
        ),
        TestCase(
            id="",
            description="Old password rejection after password reset",
            preconditions="Password has just been reset to BrandNewPass@2026.",
            steps=[
                "Navigate to /login.",
                "Enter registered email.",
                "Enter old previous password.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: OldPreviousPassword@123",
            expected_result="System rejects login with 'Invalid email or password'.",
            pass_criteria="Old password is completely invalidated.",
            fail_criteria="Old password continues to grant access."
        ),
        TestCase(
            id="",
            description="Active password recovery session blocks navigation into protected portal",
            preconditions="A password recovery link is active.",
            steps=[
                "While on /reset-password, manually type /patient/dashboard in address bar.",
                "Press Enter."
            ],
            test_data="URL: /patient/dashboard",
            expected_result="ProtectedRoute intercepts request and forces redirect back to /reset-password until password update is completed.",
            pass_criteria="User cannot bypass password reset form while in recovery mode.",
            fail_criteria="User accesses portal before completing password reset."
        )
    ]
    sections.append(TestSection(1, "Authentication, Login & Account Security", "Verification of credentials, lockout policies, session persistence, surface segregation, and password recovery.", sec_a_cases))

    # =========================================================================
    # SECTION B — REGISTRATION & STUDENT ID VALIDATION
    # =========================================================================
    sec_b_cases = [
        TestCase(
            id="",
            description="Valid student registration with valid TUP email and valid Student ID",
            preconditions="User is on Sign-Up tab on Patient Portal (https://tup-icare.tech/login). Student ID and email are unregistered.",
            steps=[
                "Click 'Sign Up' tab.",
                "Enter Student ID in format TUPM-YY-XXXX (e.g. TUPM-25-0101).",
                "Enter Full Name (e.g. Juan Dela Cruz).",
                "Select Year Level (e.g. Year 1).",
                "Enter official TUP email ending in @tup.edu.ph.",
                "Enter password (min 8 chars with numbers/symbols).",
                "Enter matching password in Confirm Password field.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-0101, Name: Juan Dela Cruz, Year: 1, Email: juan.delacruz@tup.edu.ph, Pass: TupPatient@2026",
            expected_result="Registration succeeds and transitions to OTP Email Verification screen with notice that a 6-digit code has been dispatched.",
            pass_criteria="System routes to OTP verification view displaying target email.",
            fail_criteria="Registration errors out or creates active session without OTP."
        ),
        TestCase(
            id="",
            description="Registration with invalid Student ID format (missing TUPM prefix)",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter invalid student ID '12345678'.",
                "Fill in remaining valid fields.",
                "Click 'Sign Up'."
            ],
            test_data="ID: 12345678",
            expected_result="System blocks submission and displays 'Please enter a valid Student ID in format TUPM-YY-XXXX (e.g. TUPM-XX-XXXX).'",
            pass_criteria="Validation message specifies exact required format TUPM-YY-XXXX.",
            fail_criteria="Arbitrary numeric string is accepted."
        ),
        TestCase(
            id="",
            description="Student ID casing auto-normalization (lowercase 'tupm-25-0101')",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter lowercase student ID 'tupm-25-0101'.",
                "Fill in remaining fields and submit."
            ],
            test_data="ID: tupm-25-0101",
            expected_result="System automatically normalizes casing to uppercase 'TUPM-25-0101' upon input or submission.",
            pass_criteria="Student ID is saved in canonical uppercase format.",
            fail_criteria="Lowercase ID causes format error or creates mismatched casing record."
        ),
        TestCase(
            id="",
            description="Student ID with leading and trailing spaces",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter Student ID with spaces: '  TUPM-25-0102  '.",
                "Fill in remaining fields and submit."
            ],
            test_data="ID: '  TUPM-25-0102  '",
            expected_result="System automatically trims whitespace and accepts valid trimmed ID 'TUPM-25-0102'.",
            pass_criteria="Whitespace is cleanly trimmed without validation error.",
            fail_criteria="Spaces cause format rejection or save untrimmed string."
        ),
        TestCase(
            id="",
            description="Student ID with invalid extra characters or symbols",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter 'TUPM-25-0102#$%' in Student ID field.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-0102#$%",
            expected_result="System rejects invalid characters and prompts for valid TUPM-YY-XXXX format.",
            pass_criteria="Special characters in ID are rejected.",
            fail_criteria="ID with symbols is accepted."
        ),
        TestCase(
            id="",
            description="Student ID too short (e.g. 'TUPM-25-1')",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter 'TUPM-25-1' in Student ID field.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-1",
            expected_result="System displays format validation error requiring 4-digit suffix.",
            pass_criteria="Short ID is rejected.",
            fail_criteria="Short ID is accepted."
        ),
        TestCase(
            id="",
            description="Student ID too long (e.g. 'TUPM-25-000001')",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter 'TUPM-25-000001' in Student ID field.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-000001",
            expected_result="System rejects oversized ID format.",
            pass_criteria="Oversized ID is rejected.",
            fail_criteria="Oversized ID is accepted."
        ),
        TestCase(
            id="",
            description="Registration with non-TUP email domain (gmail.com, yahoo.com)",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter valid Student ID 'TUPM-25-0103'.",
                "Enter email 'juan.student@gmail.com'.",
                "Fill in other fields and click 'Sign Up'."
            ],
            test_data="Email: juan.student@gmail.com",
            expected_result="System rejects registration and displays 'Please use your official TUP email address ending in @tup.edu.ph.'",
            pass_criteria="Clear error message enforces @tup.edu.ph domain requirement.",
            fail_criteria="Non-university email is accepted."
        ),
        TestCase(
            id="",
            description="Registration with blank required fields",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Leave all fields blank.",
                "Click 'Sign Up'."
            ],
            test_data="All fields empty",
            expected_result="System prevents submission and highlights required fields.",
            pass_criteria="Form validation flags blank required inputs.",
            fail_criteria="Blank form submits to server."
        ),
        TestCase(
            id="",
            description="Registration with mismatched password confirmation",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Fill in valid student ID, name, and email.",
                "Enter 'SecretPass@2026' in Password field.",
                "Enter 'DifferentPass@2026' in Confirm Password field.",
                "Click 'Sign Up'."
            ],
            test_data="Pass: SecretPass@2026, Confirm: DifferentPass@2026",
            expected_result="System blocks submission and displays 'Passwords do not match.'",
            pass_criteria="Validation alert 'Passwords do not match' is shown.",
            fail_criteria="Form proceeds with mismatched passwords."
        ),
        TestCase(
            id="",
            description="Duplicate registration attempt with existing verified Student ID",
            preconditions="Student ID TUPM-25-0001 is already associated with an existing verified account.",
            steps=[
                "Attempt to sign up a new account using existing Student ID 'TUPM-25-0001' with a new email.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-0001, Email: new.attempt@tup.edu.ph",
            expected_result="System prevents duplicate registration without overwriting existing account.",
            pass_criteria="Existing account data remains completely untouched and duplicate registration is blocked.",
            fail_criteria="Existing student account is overwritten or duplicate record is created."
        ),
        TestCase(
            id="",
            description="Duplicate registration attempt with existing verified email address",
            preconditions="Email qa.student01@tup.edu.ph is already registered and verified.",
            steps=[
                "Enter existing email qa.student01@tup.edu.ph in Sign-Up form with different Student ID.",
                "Submit registration."
            ],
            test_data="Email: qa.student01@tup.edu.ph, ID: TUPM-25-0999",
            expected_result="System provides safe standard anti-enumeration response indicating that if eligible, verification instructions have been dispatched.",
            pass_criteria="No raw database constraint errors or account details leaked.",
            fail_criteria="System crashes or exposes existing user details."
        ),
        TestCase(
            id="",
            description="Rapid repeated clicks on Sign Up submit button",
            preconditions="Sign-Up form is filled with valid data.",
            steps=[
                "Rapidly click 'Sign Up' button 4 times in quick succession."
            ],
            test_data="Valid registration data",
            expected_result="Button enters loading state and disables, sending exactly one registration request.",
            pass_criteria="Exactly 1 registration request executes; no duplicate errors.",
            fail_criteria="Multiple concurrent registration requests fire."
        )
    ]
    sections.append(TestSection(2, "Patient Registration & Student ID Validation", "Student ID format verification, TUP email domain enforcement, password confirmation, duplicate protection, and anti-enumeration.", sec_b_cases))

    # =========================================================================
    # SECTION C — OTP / EMAIL VERIFICATION LIFECYCLE
    # =========================================================================
    sec_c_cases = [
        TestCase(
            id="",
            description="Verify account with valid 6-digit OTP code",
            preconditions="User has submitted registration and is on OTP Verification screen.",
            steps=[
                "Enter valid 6-digit numeric OTP code received in email.",
                "Click 'Verify Account' / 'Confirm Code'."
            ],
            test_data="OTP Code: 123456",
            expected_result="System verifies email, activates account, and displays success confirmation routing to Login or Dashboard.",
            pass_criteria="Account transitions to verified status and user can sign in.",
            fail_criteria="Valid code is rejected or verification hangs."
        ),
        TestCase(
            id="",
            description="Verify account with invalid 6-digit OTP code",
            preconditions="User is on OTP Verification screen.",
            steps=[
                "Enter incorrect 6-digit code '000000'.",
                "Click 'Verify Account'."
            ],
            test_data="OTP Code: 000000",
            expected_result="System rejects code and displays 'Invalid verification code. Please check your email and try again.'",
            pass_criteria="Error banner indicates invalid code; OTP input remains editable.",
            fail_criteria="System activates account with wrong code."
        ),
        TestCase(
            id="",
            description="Verify account with blank OTP code",
            preconditions="User is on OTP Verification screen.",
            steps=[
                "Leave OTP code field empty.",
                "Click 'Verify Account'."
            ],
            test_data="OTP Code: (empty)",
            expected_result="System prevents submission and displays 'Please enter the 6-digit verification code.'",
            pass_criteria="Validation alert appears.",
            fail_criteria="Empty OTP code submits."
        ),
        TestCase(
            id="",
            description="Verify account with incomplete OTP code (e.g. 4 digits)",
            preconditions="User is on OTP Verification screen.",
            steps=[
                "Enter '1234' in OTP field.",
                "Click 'Verify Account'."
            ],
            test_data="OTP Code: 1234",
            expected_result="System prevents submission requiring full 6 digits.",
            pass_criteria="Incomplete code is flagged.",
            fail_criteria="Short code submits."
        ),
        TestCase(
            id="",
            description="Verify account with non-numeric characters in OTP field",
            preconditions="User is on OTP Verification screen.",
            steps=[
                "Type 'ABCDEF' into OTP field."
            ],
            test_data="OTP Code: ABCDEF",
            expected_result="Input field blocks non-numeric keystrokes or displays numeric validation error.",
            pass_criteria="Non-numeric characters cannot be entered.",
            fail_criteria="Letters are accepted in OTP input."
        ),
        TestCase(
            id="",
            description="OTP resend cooldown timer behavior (60s countdown)",
            preconditions="User has just requested an OTP code.",
            steps=[
                "Observe 'Resend Code' button.",
                "Verify countdown timer (e.g. 'Resend in 60s') is displayed.",
                "Attempt to click 'Resend Code' while timer is active.",
                "Wait until timer reaches 0s.",
                "Click 'Resend Code' after cooldown expires."
            ],
            test_data="Cooldown duration: 60 seconds",
            expected_result="Resend button is disabled during countdown and becomes clickable only when cooldown reaches 0.",
            pass_criteria="Button is unclickable during cooldown and dispatches new OTP once enabled.",
            fail_criteria="Resend can be spam-clicked repeatedly without cooldown."
        ),
        TestCase(
            id="",
            description="Page refresh during OTP verification preserves verification state",
            preconditions="User is on OTP Verification screen.",
            steps=[
                "Reload browser page (F5).",
                "Observe rendered view."
            ],
            test_data="N/A",
            expected_result="Page reloads and maintains OTP verification form with target email displayed.",
            pass_criteria="User remains on OTP verification view without losing context.",
            fail_criteria="Page resets to blank login screen without email context."
        ),
        TestCase(
            id="",
            description="Login attempt after successful email verification",
            preconditions="Account has just been successfully verified via OTP.",
            steps=[
                "Navigate to /login.",
                "Enter verified student email and password.",
                "Click 'Sign In'."
            ],
            test_data="Email: newly.verified@tup.edu.ph, Password: StudentPass@2026",
            expected_result="System authenticates user and grants full access to Patient Dashboard.",
            pass_criteria="Verified student logs in seamlessly.",
            fail_criteria="System continues to block user as unverified."
        ),
        TestCase(
            id="",
            description="Pasting 6-digit OTP code into input auto-populates verification field",
            preconditions="User has copied 6-digit OTP code to clipboard.",
            steps=[
                "Focus the OTP input box.",
                "Paste clipboard text (Ctrl+V).",
                "Observe OTP input boxes."
            ],
            test_data="Pasted Code: 839201",
            expected_result="All 6 digits populate accurately across the input boxes and focus advances to confirmation button.",
            pass_criteria="Pasted OTP code is accepted.",
            fail_criteria="Paste fails or populates only first box."
        ),
        TestCase(
            id="",
            description="Registration password with exactly 8 characters (Boundary test)",
            preconditions="User is on Sign-Up tab.",
            steps=[
                "Enter valid student info.",
                "Enter password with exactly 8 characters: 'Pass@123'.",
                "Enter matching confirmation.",
                "Click 'Sign Up'."
            ],
            test_data="Password: Pass@123 (8 chars)",
            expected_result="System accepts 8-character password satisfying minimum length boundary and proceeds to OTP verification.",
            pass_criteria="8-character minimum password is accepted.",
            fail_criteria="System rejects 8-character password."
        ),
        TestCase(
            id="",
            description="Password reset request with email containing leading/trailing whitespace",
            preconditions="User is on Forgot Password view.",
            steps=[
                "Enter email with spaces: '  qa.student01@tup.edu.ph  '.",
                "Click 'Send Reset Link'."
            ],
            test_data="Email: '  qa.student01@tup.edu.ph  '",
            expected_result="System automatically trims whitespace and dispatches reset link with standard confirmation message.",
            pass_criteria="Whitespace is cleanly trimmed.",
            fail_criteria="Spaces cause email validation error."
        )
    ]
    sections.append(TestSection(3, "Email & OTP Verification Lifecycle", "6-digit OTP code validation, cooldown timers, resend throttling, incomplete code handling, and verified login.", sec_c_cases))

    return sections
