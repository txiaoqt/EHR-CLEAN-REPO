# src/scripts/test_case_generator/sections_part1.py
from generator_core import TestCase, TestSection

def get_sections_part1():
    sections = []
    
    # -------------------------------------------------------------------------
    # SECTION 1: AUTHENTICATION, LOGIN & SECURITY CONTROLS (STAFF & PATIENT)
    # -------------------------------------------------------------------------
    sec1_cases = [
        TestCase(
            id="",
            description="Student login with valid verified @tup.edu.ph credentials on User Portal",
            preconditions="User is on the Student/Patient Portal Login page (https://tup-icare.tech/login). A verified student account exists.",
            steps=[
                "Enter registered student email in the Email input field.",
                "Enter valid password in the Password input field.",
                "Click the 'Sign In' / 'Log In' button."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: StudentTest@123",
            expected_result="System authenticates successfully and redirects to Patient Dashboard (https://tup-icare.tech/patient/dashboard). Welcome banner with student name is displayed.",
            pass_criteria="Patient Dashboard opens with student account details visible in header.",
            fail_criteria="Login fails, displays generic error, or stays on login page."
        ),
        TestCase(
            id="",
            description="Staff login with valid clinician credentials on Admin Staff Portal",
            preconditions="User is on the Staff Portal Login page (https://tup-icare-staff.me/login) on a supported desktop browser. Staff account exists.",
            steps=[
                "Enter staff email in the Email input field.",
                "Enter valid staff password in the Password input field.",
                "Click the 'Sign In' button."
            ],
            test_data="Email: physician@tupclinic.local, Password: Physician@123",
            expected_result="System authenticates successfully and redirects to Staff Portal Dashboard (https://tup-icare-staff.me/dashboard). Sidebar shows clinician name and Clinical Administration menu items.",
            pass_criteria="Staff Dashboard loads with clinician name, metrics, and navigation sidebar.",
            fail_criteria="Login fails, redirects to patient portal, or error message is shown."
        ),
        TestCase(
            id="",
            description="Login attempt with non-existent email address",
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
            description="Login attempt with incorrect password for an existing account",
            preconditions="User is on the Login page. Account exists.",
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
            description="Login attempt with blank email or password fields",
            preconditions="User is on the Login page.",
            steps=[
                "Leave Email and Password fields empty.",
                "Click 'Sign In'."
            ],
            test_data="Email: (empty), Password: (empty)",
            expected_result="System prevents submission and displays 'Please enter email and password' prompt.",
            pass_criteria="Validation alert 'Please enter email and password' appears immediately.",
            fail_criteria="Form submits empty network request or crashes."
        ),
        TestCase(
            id="",
            description="Toggle password visibility masking in login form",
            preconditions="User is on the Login page with text typed in the Password field.",
            steps=[
                "Type 'SecretPassword123' in the Password field.",
                "Observe masked dot/bullet characters.",
                "Click the eye icon button inside the Password field.",
                "Observe plain text visibility.",
                "Click the eye icon button again."
            ],
            test_data="Password: SecretPassword123",
            expected_result="Password characters toggle smoothly between plain visible text and masked characters.",
            pass_criteria="Eye icon toggles state and input type switches between 'password' and 'text'.",
            fail_criteria="Password remains masked or icon does not respond."
        ),
        TestCase(
            id="",
            description="Account lockout after 5 consecutive failed login attempts",
            preconditions="User is on the Login page with a known registered email address.",
            steps=[
                "Enter registered email.",
                "Enter an incorrect password and submit.",
                "Repeat step 2 for a total of 5 consecutive failed attempts.",
                "Observe the error message on the 5th failed attempt."
            ],
            test_data="Email: qa.student02@tup.edu.ph, Password: BadPasswordAttempt",
            expected_result="System locks the account temporarily and displays a message indicating that the account has been temporarily locked due to too many failed attempts.",
            pass_criteria="Lockout message appears stating temporary lock duration (e.g. 15 minutes).",
            fail_criteria="System allows infinite brute-force login attempts without lockout."
        ),
        TestCase(
            id="",
            description="Deactivated account login attempt",
            preconditions="An account whose status has been deactivated by administrators exists.",
            steps=[
                "Enter deactivated user's email.",
                "Enter correct password.",
                "Click 'Sign In'."
            ],
            test_data="Email: deactivated.student@tup.edu.ph, Password: ValidPassword@123",
            expected_result="System rejects login and displays 'Your account has been deactivated. Please contact an administrator.'",
            pass_criteria="Deactivated notice is displayed and session is not established.",
            fail_criteria="Deactivated user is allowed to access portal."
        ),
        TestCase(
            id="",
            description="Staff attempting to log in on Patient/User Portal surface",
            preconditions="Application is running on the User/Patient Portal deployment surface. Staff user credentials exist.",
            steps=[
                "Navigate to User Portal login page.",
                "Enter clinician staff email and password.",
                "Click 'Sign In'."
            ],
            test_data="Email: physician@tupclinic.local, Password: Physician@123",
            expected_result="System blocks login and displays 'Only patient accounts can log in on this portal.'",
            pass_criteria="Clear surface mismatch error message is shown and staff is not logged into patient dashboard.",
            fail_criteria="Staff user is routed to student dashboard or system crashes."
        ),
        TestCase(
            id="",
            description="Patient attempting to log in on Clinical Administrative Staff Portal surface",
            preconditions="Application is running on the Admin/Staff Portal deployment surface. Student credentials exist.",
            steps=[
                "Navigate to Staff Portal login page on desktop browser.",
                "Enter student email and password.",
                "Click 'Sign In'."
            ],
            test_data="Email: qa.student01@tup.edu.ph, Password: StudentTest@123",
            expected_result="System blocks login and displays 'Patient accounts are not allowed on this portal.'",
            pass_criteria="Surface mismatch error message is displayed and access to admin dashboard is denied.",
            fail_criteria="Student account accesses staff clinical administration portal."
        )
    ]
    sections.append(TestSection(1, "Authentication, Login & Security Controls", "Verification of credentials, lockout policies, surface segregation, and login form controls.", sec1_cases))

    # -------------------------------------------------------------------------
    # SECTION 2: PATIENT REGISTRATION & STUDENT ID VERIFICATION
    # -------------------------------------------------------------------------
    sec2_cases = [
        TestCase(
            id="",
            description="Successful patient registration with valid TUP email and valid Student ID",
            preconditions="User is on the Registration / Sign-Up tab on the Patient Portal. Student ID and email are not yet registered.",
            steps=[
                "Click 'Create an account' / 'Sign Up' tab.",
                "Enter Student ID in format TUPM-YY-XXXX (e.g. TUPM-25-0101).",
                "Enter Full Name (e.g. Juan Dela Cruz).",
                "Select Year Level (e.g. Year 1).",
                "Enter official TUP email ending in @tup.edu.ph.",
                "Enter password (minimum 8 characters with numbers and symbols).",
                "Enter matching password in Confirm Password field.",
                "Click 'Sign Up' / 'Register'."
            ],
            test_data="ID: TUPM-25-0101, Name: Juan Dela Cruz, Year: 1, Email: juan.delacruz@tup.edu.ph, Pass: TupPatient@2026",
            expected_result="Registration succeeds and transitions to OTP Email Verification screen with notice that a 6-digit verification code has been dispatched.",
            pass_criteria="System routes to OTP verification view displaying target email.",
            fail_criteria="Registration errors out or creates an active session without OTP verification."
        ),
        TestCase(
            id="",
            description="Registration with invalid Student ID format",
            preconditions="User is on the Sign-Up tab.",
            steps=[
                "Enter invalid student ID '12345678' (missing TUPM prefix and year format).",
                "Fill in remaining valid fields.",
                "Click 'Sign Up'."
            ],
            test_data="ID: 12345678, Email: test.student@tup.edu.ph",
            expected_result="System blocks submission and displays 'Please enter a valid Student ID in format TUPM-YY-XXXX (e.g. TUPM-XX-XXXX).'",
            pass_criteria="Validation message specifies exact required format TUPM-YY-XXXX.",
            fail_criteria="System accepts arbitrary non-standard ID string."
        ),
        TestCase(
            id="",
            description="Registration with non-TUP email domain (e.g. gmail.com, yahoo.com)",
            preconditions="User is on the Sign-Up tab.",
            steps=[
                "Enter valid Student ID 'TUPM-25-0102'.",
                "Enter email 'juan.student@gmail.com'.",
                "Fill in other fields and click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-0102, Email: juan.student@gmail.com",
            expected_result="System rejects registration and displays 'Please use your official TUP email address ending in @tup.edu.ph.'",
            pass_criteria="Clear error message enforces @tup.edu.ph domain requirement.",
            fail_criteria="Non-university email is accepted."
        ),
        TestCase(
            id="",
            description="Registration with mismatched password and confirm password fields",
            preconditions="User is on the Sign-Up tab.",
            steps=[
                "Fill in valid student ID, name, and email.",
                "Enter 'SecretPass@2026' in Password field.",
                "Enter 'DifferentPass@2026' in Confirm Password field.",
                "Click 'Sign Up'."
            ],
            test_data="Pass: SecretPass@2026, ConfirmPass: DifferentPass@2026",
            expected_result="System blocks submission and highlights that passwords do not match.",
            pass_criteria="Validation message 'Passwords do not match' is shown.",
            fail_criteria="Form proceeds with mismatched passwords."
        ),
        TestCase(
            id="",
            description="Registration attempt with already registered and verified Student ID",
            preconditions="Student ID TUPM-25-0001 is already associated with an existing active account.",
            steps=[
                "Attempt to sign up a new account with a different email but using existing Student ID 'TUPM-25-0001'.",
                "Click 'Sign Up'."
            ],
            test_data="ID: TUPM-25-0001, Email: second.email@tup.edu.ph",
            expected_result="System prevents duplicate registration and displays standard eligibility/conflict message without overwriting the existing account.",
            pass_criteria="Existing account remains intact and new registration is prevented.",
            fail_criteria="Existing account is overwritten or duplicate ID record is created."
        ),
        TestCase(
            id="",
            description="Anti-enumeration response during duplicate email registration",
            preconditions="An account with email qa.student01@tup.edu.ph already exists.",
            steps=[
                "Enter existing email qa.student01@tup.edu.ph in the Sign-Up form.",
                "Submit the registration request."
            ],
            test_data="Email: qa.student01@tup.edu.ph",
            expected_result="System provides a safe, standard response indicating that if the account is eligible, verification instructions have been sent.",
            pass_criteria="No internal database errors or unhandled exceptions exposed to tester.",
            fail_criteria="System crashes or exposes raw database constraint messages."
        )
    ]
    sections.append(TestSection(2, "Patient Registration & Student ID Verification", "Validation of student identifiers, TUP email domain enforcement, password confirmation, and duplicate protection.", sec2_cases))

    # -------------------------------------------------------------------------
    # SECTION 3: EMAIL & OTP VERIFICATION LIFECYCLE
    # -------------------------------------------------------------------------
    sec3_cases = [
        TestCase(
            id="",
            description="Verify account with valid 6-digit OTP code",
            preconditions="User has submitted registration and is on the OTP Verification screen.",
            steps=[
                "Enter the valid 6-digit numeric OTP code received in email.",
                "Click 'Verify Account' / 'Confirm Code'."
            ],
            test_data="OTP Code: 123456",
            expected_result="System verifies email, activates account, and displays success confirmation routing to Login or Dashboard.",
            pass_criteria="Account transitions to verified status and user can sign in.",
            fail_criteria="Valid code is rejected or verification hangs."
        ),
        TestCase(
            id="",
            description="Verify account with invalid or incorrect OTP code",
            preconditions="User is on the OTP Verification screen.",
            steps=[
                "Enter an incorrect 6-digit code '000000'.",
                "Click 'Verify Account'."
            ],
            test_data="OTP Code: 000000",
            expected_result="System rejects code and displays 'Invalid verification code. Please check your email and try again.'",
            pass_criteria="Error banner indicates invalid code; OTP input field remains editable.",
            fail_criteria="System activates account with wrong code."
        ),
        TestCase(
            id="",
            description="OTP resend cooldown timer behavior",
            preconditions="User has just requested an OTP code.",
            steps=[
                "Observe the 'Resend Code' button.",
                "Verify that a countdown timer (e.g. 'Resend in 60s') is displayed.",
                "Attempt to click 'Resend Code' while timer is active.",
                "Wait until timer reaches 0s.",
                "Click 'Resend Code' after cooldown expires."
            ],
            test_data="Cooldown duration: 60 seconds",
            expected_result="Resend button is disabled during countdown and becomes active only when cooldown reaches 0.",
            pass_criteria="Button is unclickable during cooldown and triggers new OTP dispatch once enabled.",
            fail_criteria="Resend can be spam-clicked repeatedly without cooldown."
        ),
        TestCase(
            id="",
            description="Unverified account barrier during standard login attempt",
            preconditions="An account was registered but OTP verification was not completed.",
            steps=[
                "Navigate to Login page.",
                "Enter unverified student credentials and click 'Sign In'."
            ],
            test_data="Email: unverified.student@tup.edu.ph, Password: StudentPass@2026",
            expected_result="System detects unverified email status and directs user to OTP verification screen to complete activation.",
            pass_criteria="User is prompted to verify email before portal access is granted.",
            fail_criteria="Unverified user gains full access to clinical features."
        )
    ]
    sections.append(TestSection(3, "Email & OTP Verification Lifecycle", "Testing 6-digit OTP code validation, cooldown timers, resend throttling, and unverified account barriers.", sec3_cases))

    # -------------------------------------------------------------------------
    # SECTION 4: PASSWORD RECOVERY & RESET LIFECYCLE
    # -------------------------------------------------------------------------
    sec4_cases = [
        TestCase(
            id="",
            description="Request password reset with registered email address",
            preconditions="User is on the Forgot Password tab/view on the Login page.",
            steps=[
                "Enter registered student or staff email.",
                "Click 'Send Reset Link' / 'Request Password Reset'."
            ],
            test_data="Email: qa.student01@tup.edu.ph",
            expected_result="System displays confirmation notice: 'If an account with that email exists, password reset instructions have been sent.'",
            pass_criteria="Standard anti-enumeration success message is displayed.",
            fail_criteria="System crashes or indicates error."
        ),
        TestCase(
            id="",
            description="Request password reset with non-existent email address",
            preconditions="User is on the Forgot Password view.",
            steps=[
                "Enter an unregistered email address.",
                "Click 'Send Reset Link'."
            ],
            test_data="Email: unregistered999@tup.edu.ph",
            expected_result="System displays the exact same anti-enumeration message without disclosing whether the email exists in the database.",
            pass_criteria="Exact same confirmation message appears preventing email harvesting.",
            fail_criteria="System reveals 'Email does not exist' or 'User not found'."
        ),
        TestCase(
            id="",
            description="Open Reset Password page with a valid recovery session link",
            preconditions="User clicks a valid, unexpired recovery link from email containing type=recovery token.",
            steps=[
                "Navigate to recovery URL (/reset-password?type=recovery&token_hash=...).",
                "Observe the rendered page."
            ],
            test_data="URL: /reset-password#type=recovery&access_token=...",
            expected_result="System validates recovery session and displays the 'Set New Password' form with New Password and Confirm Password fields.",
            pass_criteria="New password input form is rendered with brand header.",
            fail_criteria="Page shows expired error or redirects to login immediately."
        ),
        TestCase(
            id="",
            description="Open Reset Password page with an expired or malformed recovery link",
            preconditions="Recovery link has expired or contains invalid token.",
            steps=[
                "Navigate to /reset-password?error=otp_expired&error_description=Email+link+is+invalid+or+has+expired.",
                "Observe page state."
            ],
            test_data="URL with expired token parameters",
            expected_result="System displays error message 'Password reset link is invalid or has expired' and provides a 'Back to Login' button.",
            pass_criteria="Error card is displayed; password input form is hidden.",
            fail_criteria="System allows password submission on expired link."
        ),
        TestCase(
            id="",
            description="Submit new password with mismatched confirmation",
            preconditions="User is on the valid Reset Password form.",
            steps=[
                "Enter 'NewPassword@2026' in New Password field.",
                "Enter 'DifferentPass@2026' in Confirm Password field.",
                "Click 'Update Password'."
            ],
            test_data="New: NewPassword@2026, Confirm: DifferentPass@2026",
            expected_result="System blocks submission and displays 'Passwords do not match.'",
            pass_criteria="Error notification appears and password is not changed.",
            fail_criteria="Form submits with mismatched passwords."
        ),
        TestCase(
            id="",
            description="Submit new password with length shorter than 6 characters",
            preconditions="User is on the valid Reset Password form.",
            steps=[
                "Enter '12345' in both password fields.",
                "Click 'Update Password'."
            ],
            test_data="New Password: 12345",
            expected_result="System blocks submission and displays 'Password must be at least 6 characters.'",
            pass_criteria="Validation alert prevents submission.",
            fail_criteria="Short password is accepted."
        ),
        TestCase(
            id="",
            description="Successful password update and post-recovery login",
            preconditions="User is on the valid Reset Password form.",
            steps=[
                "Enter valid new password 'BrandNewPass@2026' in both fields.",
                "Click 'Update Password'.",
                "Observe success modal / notification.",
                "Click 'Proceed to Login'.",
                "Log in using the new password."
            ],
            test_data="New Password: BrandNewPass@2026",
            expected_result="Password is successfully updated. User can now sign in with the new password; previous old password is no longer accepted.",
            pass_criteria="Success message confirms update and subsequent login with new credentials succeeds.",
            fail_criteria="Login with new password fails or old password still works."
        )
    ]
    sections.append(TestSection(4, "Password Recovery & Reset Lifecycle", "Testing password reset requests, token validation, expired link handling, matching rules, and post-reset login.", sec4_cases))

    # -------------------------------------------------------------------------
    # SECTION 5: SESSION MANAGEMENT & SURFACE ROUTING PROTECTION
    # -------------------------------------------------------------------------
    sec5_cases = [
        TestCase(
            id="",
            description="Unauthenticated access attempt to protected Patient Dashboard route",
            preconditions="Browser has no active authentication session.",
            steps=[
                "Directly navigate to URL: http://localhost:5173/patient/dashboard in address bar.",
                "Press Enter."
            ],
            test_data="URL: /patient/dashboard",
            expected_result="System detects unauthenticated state and immediately redirects browser to /login.",
            pass_criteria="Browser lands on /login page; protected clinical content is not rendered.",
            fail_criteria="Protected dashboard content flashes or is accessible without login."
        ),
        TestCase(
            id="",
            description="Unauthenticated access attempt to protected Staff Admin Dashboard route",
            preconditions="Browser has no active authentication session.",
            steps=[
                "Directly navigate to URL: http://localhost:5173/dashboard.",
                "Press Enter."
            ],
            test_data="URL: /dashboard",
            expected_result="System immediately redirects browser to /login.",
            pass_criteria="Redirects to login page; staff KPIs and patient lists remain protected.",
            fail_criteria="Protected administrative data is displayed."
        ),
        TestCase(
            id="",
            description="Session persistence across browser page reload",
            preconditions="Student is logged in and viewing Patient Dashboard.",
            steps=[
                "Press browser reload/refresh button (F5).",
                "Observe application reload behavior."
            ],
            test_data="N/A",
            expected_result="Application restores active session cleanly and renders Patient Dashboard without logging the user out.",
            pass_criteria="User remains authenticated on /patient/dashboard after reload.",
            fail_criteria="User is unexpectedly logged out or redirected to login."
        ),
        TestCase(
            id="",
            description="Explicit sign out from Patient Portal",
            preconditions="Student is logged in to Patient Portal.",
            steps=[
                "Click student avatar/profile in top navigation bar.",
                "Click 'Log Out' / 'Sign Out'.",
                "Attempt to use browser Back button."
            ],
            test_data="N/A",
            expected_result="Session is terminated immediately. Browser redirects to /login. Pressing Back button redirects back to /login.",
            pass_criteria="User is signed out and cannot navigate back into protected portal.",
            fail_criteria="Protected data is visible via browser history/back button."
        ),
        TestCase(
            id="",
            description="Active password recovery session blocks navigation into protected portal",
            preconditions="A password recovery link has been opened (isPasswordRecoverySession is active).",
            steps=[
                "While on /reset-password, manually type /patient/dashboard or /dashboard into address bar.",
                "Press Enter."
            ],
            test_data="URL: /patient/dashboard",
            expected_result="ProtectedRoute intercepts request and forces redirect back to /reset-password until password update is completed.",
            pass_criteria="User cannot bypass password reset form while in recovery mode.",
            fail_criteria="User accesses portal before resetting password."
        )
    ]
    sections.append(TestSection(5, "Session Management & Surface Routing Protection", "Route protection guards, session persistence on reload, clean sign-out, and recovery session priority.", sec5_cases))

    # -------------------------------------------------------------------------
    # SECTION 6: PC ACCESS & DEVICE SAFEGUARDS (STAFF PORTAL)
    # -------------------------------------------------------------------------
    sec6_cases = [
        TestCase(
            id="",
            description="Staff Portal accessed on a desktop screen viewport (>= 1024px width)",
            preconditions="Browser window width is 1280px or higher on the Staff Portal.",
            steps=[
                "Open Staff Portal on standard desktop monitor.",
                "Navigate to /dashboard or /login."
            ],
            test_data="Viewport: 1366x768px (Desktop)",
            expected_result="Staff Portal renders normally without device blocking banner.",
            pass_criteria="Login form and clinical navigation are fully accessible.",
            fail_criteria="PCAccessRequired blocking screen appears on desktop."
        ),
        TestCase(
            id="",
            description="Staff Portal accessed on mobile/smartphone viewport (< 1024px width)",
            preconditions="Browser viewport is resized to mobile width (e.g. 390px) on the Staff Portal.",
            steps=[
                "Resize browser window or use mobile device emulation to 390px width.",
                "Navigate to Staff Portal."
            ],
            test_data="Viewport: 390x844px (Mobile)",
            expected_result="System activates PC Access Safeguard and displays the PCAccessRequired modal indicating 'PC / Desktop Access Required' with an option to log out.",
            pass_criteria="Blocking overlay appears with clinic logo and instruction to use PC/laptop.",
            fail_criteria="Staff administrative tables render in cramped/broken state on mobile without safeguard."
        ),
        TestCase(
            id="",
            description="Log out from PC Access Required screen",
            preconditions="Staff user is logged in but viewport is shrunk below supported width.",
            steps=[
                "On PCAccessRequired blocking screen, click 'Log Out' button."
            ],
            test_data="N/A",
            expected_result="User session is cleanly terminated and user is redirected to login.",
            pass_criteria="Logout executes and session is cleared.",
            fail_criteria="Button does not respond or error occurs."
        ),
        TestCase(
            id="",
            description="Patient Portal is fully accessible on mobile devices without PC restriction",
            preconditions="User is on the Patient Portal using a mobile viewport (390px).",
            steps=[
                "Open Patient Portal on mobile device.",
                "Navigate to /patient/dashboard, /patient/schedule, /patient/messages."
            ],
            test_data="Viewport: 390x844px (Mobile)",
            expected_result="Patient Portal allows seamless mobile access with responsive mobile header and navigation drawer without device blocking.",
            pass_criteria="All patient features are accessible on mobile.",
            fail_criteria="PCAccessRequired blocking screen mistakenly appears on Patient Portal."
        )
    ]
    sections.append(TestSection(6, "PC Access & Device Safeguards (Staff Portal)", "Enforcement of PC/laptop requirement for clinical administration while maintaining mobile access for students.", sec6_cases))

    # -------------------------------------------------------------------------
    # SECTION 7: CLINIC HOURS POLICY ENFORCEMENT
    # -------------------------------------------------------------------------
    sec7_cases = [
        TestCase(
            id="",
            description="Staff portal access during allowed clinic operating hours (07:00–19:00 Asia/Manila)",
            preconditions="Current time in Asia/Manila is between 07:00 and 19:00.",
            steps=[
                "Staff user enters valid credentials on Staff Portal.",
                "Click 'Sign In'."
            ],
            test_data="Time: 10:30 AM Asia/Manila",
            expected_result="Access is granted immediately to Staff Dashboard.",
            pass_criteria="Dashboard loads successfully without clinic hours warning.",
            fail_criteria="Access is blocked during regular hours."
        ),
        TestCase(
            id="",
            description="Staff login attempt outside clinic operating hours (e.g. 02:00 AM Asia/Manila)",
            preconditions="Current time in Asia/Manila is outside 07:00–19:00 (when policy enforcement is active).",
            steps=[
                "Attempt staff login at 02:00 AM.",
                "Click 'Sign In'."
            ],
            test_data="Time: 02:00 AM Asia/Manila",
            expected_result="System blocks login and displays 'System access is allowed only during clinic hours: 07:00 to 19:00 (Asia/Manila).'",
            pass_criteria="Clinic hours policy message is displayed and login is denied.",
            fail_criteria="Staff login is permitted outside operating hours."
        ),
        TestCase(
            id="",
            description="Patient Portal 24/7 access availability",
            preconditions="Current time is outside 07:00–19:00.",
            steps=[
                "Student logs into Patient Portal at 08:00 PM.",
                "View schedule, messages, and records."
            ],
            test_data="Time: 08:00 PM Asia/Manila",
            expected_result="Student can view records, send inquiries, and check appointments 24/7 without clinic hours lockout.",
            pass_criteria="Patient portal remains accessible at all times.",
            fail_criteria="Student is locked out of viewing their health records after 19:00."
        )
    ]
    sections.append(TestSection(7, "Clinic Hours Policy Enforcement", "Operating hours restriction (07:00–19:00 Asia/Manila) on staff administrative portal.", sec7_cases))

    # -------------------------------------------------------------------------
    # SECTION 8: PATIENT PORTAL — HOME & DASHBOARD NAVIGATION
    # -------------------------------------------------------------------------
    sec8_cases = [
        TestCase(
            id="",
            description="Verify Patient Dashboard layout, welcome greeting, and quick action cards",
            preconditions="Student is logged into Patient Portal.",
            steps=[
                "Navigate to /patient/dashboard.",
                "Observe page header, welcome greeting, quick action cards (Book Appointment, Medical Records, Messages), and clinic advisory banner."
            ],
            test_data="N/A",
            expected_result="Dashboard renders personalized welcome banner, active appointment status card, quick action buttons, and operating hours advisory.",
            pass_criteria="All cards are visible, properly aligned, and interactive.",
            fail_criteria="Dashboard displays blank screen or missing cards."
        ),
        TestCase(
            id="",
            description="Click 'Book Appointment' quick action button on Dashboard",
            preconditions="Student is on Patient Dashboard.",
            steps=[
                "Click the 'Book Appointment' button on the quick actions card."
            ],
            test_data="N/A",
            expected_result="System navigates seamlessly to the Patient Scheduling page (/patient/schedule).",
            pass_criteria="Appointment Booking Flow loads on /patient/schedule.",
            fail_criteria="Button does not navigate or wrong page loads."
        ),
        TestCase(
            id="",
            description="Click 'My Records' quick action button on Dashboard",
            preconditions="Student is on Patient Dashboard.",
            steps=[
                "Click the 'Medical Records' / 'View Records' button."
            ],
            test_data="N/A",
            expected_result="System navigates to Patient Records page (/patient/records).",
            pass_criteria="Patient Records page renders with consultation history table.",
            fail_criteria="Navigation fails."
        ),
        TestCase(
            id="",
            description="Click 'Messages' quick action button on Dashboard",
            preconditions="Student is on Patient Dashboard.",
            steps=[
                "Click the 'Messages' / 'Contact Clinic' button."
            ],
            test_data="N/A",
            expected_result="System navigates to Patient Messages page (/patient/messages).",
            pass_criteria="Messaging inbox loads with Active and History tabs.",
            fail_criteria="Navigation fails."
        )
    ]
    sections.append(TestSection(8, "Patient Portal — Home & Dashboard Navigation", "Dashboard layout verification, personalized welcome banner, advisory banners, and quick action navigation.", sec8_cases))

    # -------------------------------------------------------------------------
    # SECTION 9: PATIENT PORTAL — EVENTS & ANNOUNCEMENTS
    # -------------------------------------------------------------------------
    sec9_cases = [
        TestCase(
            id="",
            description="View published university clinic events and health announcements",
            preconditions="Student is logged in. At least one event is in 'Published' status.",
            steps=[
                "Navigate to /patient/events.",
                "Observe the list of published health events and wellness announcements."
            ],
            test_data="N/A",
            expected_result="Events cards are displayed showing Event Title, Category, Date, Time, Location, and Summary Description.",
            pass_criteria="Published events appear as cards with complete event details.",
            fail_criteria="Events page is empty despite published events existing."
        ),
        TestCase(
            id="",
            description="Draft and cancelled events are hidden from student portal",
            preconditions="Staff has created an event with status 'Draft' and another with status 'Cancelled'.",
            steps=[
                "Student navigates to /patient/events.",
                "Search or inspect visible cards."
            ],
            test_data="Draft Event: 'Draft Health Seminar', Cancelled Event: 'Cancelled Flu Drive'",
            expected_result="Draft and cancelled events are completely hidden from the student view.",
            pass_criteria="Only published events are visible to students.",
            fail_criteria="Draft or cancelled administrative events leak to student portal."
        ),
        TestCase(
            id="",
            description="Search events by title keyword",
            preconditions="Multiple published events exist (e.g. 'Blood Donation Drive', 'Dental Checkup Campaign').",
            steps=[
                "On /patient/events, type 'Blood' in the search bar."
            ],
            test_data="Search query: 'Blood'",
            expected_result="List filters in realtime to show only events matching 'Blood'.",
            pass_criteria="Matching event card is shown; non-matching events are hidden.",
            fail_criteria="Search filter does not update the list."
        ),
        TestCase(
            id="",
            description="Open event details modal",
            preconditions="Events list contains a published event.",
            steps=[
                "Click on an event card or its 'View Details' button."
            ],
            test_data="N/A",
            expected_result="Event Details modal opens displaying full description, schedule, venue, and clinic contact information with a close button.",
            pass_criteria="Modal opens with full text and closes cleanly when clicking close icon.",
            fail_criteria="Modal fails to open or cannot be closed."
        )
    ]
    sections.append(TestSection(9, "Patient Portal — Events & Announcements", "Student-facing events feed, draft/cancelled isolation, search filtering, and event details modal.", sec9_cases))

    # -------------------------------------------------------------------------
    # SECTION 10: PATIENT PORTAL — APPOINTMENT SCHEDULING & SERVICE SELECTION
    # -------------------------------------------------------------------------
    sec10_cases = [
        TestCase(
            id="",
            description="Department selection toggle between Medical Clinic and Dental Clinic",
            preconditions="Student is on /patient/schedule with no active appointment.",
            steps=[
                "Observe the Department selector options.",
                "Click 'Medical Clinic'. Observe available Service Types.",
                "Click 'Dental Clinic'. Observe available Service Types."
            ],
            test_data="Departments: Medical Clinic, Dental Clinic",
            expected_result="Medical Clinic displays services ['Consultation', 'Check-up']. Dental Clinic displays services ['Dental cleaning', 'Tooth extraction/bunot', 'Dental check-up'].",
            pass_criteria="Service Type dropdown options dynamically update based on selected department.",
            fail_criteria="Services do not change or show mismatched clinic options."
        ),
        TestCase(
            id="",
            description="Time slot selection from standard clinic slots",
            preconditions="Student is on /patient/schedule on an available future date.",
            steps=[
                "Observe available time slot buttons:",
                "Slot 1: 09:00-12:00 (Morning)",
                "Slot 2: 13:00-16:00 (Afternoon)",
                "Slot 3: 16:00-19:00 (Late Afternoon / Evening)",
                "Click on Slot 2 (13:00-16:00)."
            ],
            test_data="Time Slot: 13:00-16:00",
            expected_result="Slot 2 is highlighted as selected; appointment summary updates with selected time window.",
            pass_criteria="Selected slot displays active styling and updates booking form state.",
            fail_criteria="Slot is not selectable."
        ),
        TestCase(
            id="",
            description="Book appointment with reason/remarks entered",
            preconditions="Student is on /patient/schedule.",
            steps=[
                "Select Medical Clinic.",
                "Select Consultation service.",
                "Select available date and time slot.",
                "Enter reason for visit: 'Experiencing recurrent mild headaches for 3 days'.",
                "Click 'Confirm & Book Appointment'."
            ],
            test_data="Reason: 'Experiencing recurrent mild headaches for 3 days'",
            expected_result="Booking confirms successfully. Success modal displays Appointment Reference Code (APT-YYYYMMDD-XXXX), date, time, and department.",
            pass_criteria="Reference code is generated and active appointment card appears on dashboard.",
            fail_criteria="Booking fails or error message appears."
        )
    ]
    sections.append(TestSection(10, "Patient Portal — Appointment Scheduling & Service Selection", "Department switching, dynamic service menus, time slot selection, and booking confirmation.", sec10_cases))

    # -------------------------------------------------------------------------
    # SECTION 11: SAME-DAY VS FUTURE DATE RULES & SLOT EXPIRATION
    # -------------------------------------------------------------------------
    sec11_cases = [
        TestCase(
            id="",
            description="Same-day Appointment mode restricts calendar date selection strictly to Today",
            preconditions="Student selects 'Same-day Appointment' toggle on /patient/schedule.",
            steps=[
                "Observe calendar dates.",
                "Verify today's date is selected.",
                "Attempt to click tomorrow or a future date on the calendar."
            ],
            test_data="Mode: Same-day Appointment, Today: Current Date (Asia/Manila)",
            expected_result="Only today's date is clickable and active. Future dates are visually disabled and unselectable under Same-day mode.",
            pass_criteria="Future dates cannot be selected while in Same-day mode.",
            fail_criteria="Student is able to select a future date under Same-day Appointment mode."
        ),
        TestCase(
            id="",
            description="Future Appointment mode restricts calendar date selection to Tomorrow onwards",
            preconditions="Student selects 'Future Appointment' toggle on /patient/schedule.",
            steps=[
                "Observe calendar dates.",
                "Verify date automatically advances to tomorrow or later.",
                "Attempt to click today's date on the calendar."
            ],
            test_data="Mode: Future Appointment, Tomorrow: Current Date + 1",
            expected_result="Today and past dates are visually disabled and unselectable. Tomorrow and upcoming future dates are selectable.",
            pass_criteria="Today's date is blocked from selection under Future Appointment mode.",
            fail_criteria="Student is allowed to book today's date under Future Appointment mode."
        ),
        TestCase(
            id="",
            description="Same-day time slot expiration when current clock has passed slot end time",
            preconditions="Current Asia/Manila time is 14:00 (2:00 PM). Student is on Same-day Appointment mode for today.",
            steps=[
                "Inspect the Morning slot (09:00-12:00, end time 12:00).",
                "Inspect the Afternoon slot (13:00-16:00, end time 16:00).",
                "Inspect the Evening slot (16:00-19:00, end time 19:00)."
            ],
            test_data="Current Time: 14:00 Asia/Manila",
            expected_result="Morning slot (09:00-12:00) is marked as 'Expired / Passed' and is disabled. Afternoon and Evening slots remain active and selectable.",
            pass_criteria="Expired morning slot is disabled and cannot be booked.",
            fail_criteria="Student can book a time slot whose hours have already passed today."
        ),
        TestCase(
            id="",
            description="All same-day slots disabled when current time is past 19:00 (Clinic Closed)",
            preconditions="Current Asia/Manila time is 19:30 (7:30 PM).",
            steps=[
                "Select Same-day Appointment mode for today.",
                "Inspect slot availability."
            ],
            test_data="Current Time: 19:30 Asia/Manila",
            expected_result="All three same-day slots are marked expired. A banner advises student to book a Future Appointment for tomorrow onwards.",
            pass_criteria="No same-day slots can be booked after 19:00.",
            fail_criteria="System allows booking slots after clinic closing time."
        )
    ]
    sections.append(TestSection(11, "Same-Day vs Future Rules & Slot Expiration", "Enforcement of Asia/Manila calendar date boundaries, same-day vs future segregation, and time-of-day slot expiration.", sec11_cases))

    # -------------------------------------------------------------------------
    # SECTION 12: SLOT CAPACITY, COLLISION & MULTI-USER BOOKING
    # -------------------------------------------------------------------------
    sec12_cases = [
        TestCase(
            id="",
            description="Occupied slot renders disabled with 'Occupied' status badge for other students",
            preconditions="Student A has already booked Medical Clinic, Tomorrow, Slot 1 (09:00-12:00). Student B logs in.",
            steps=[
                "Student B navigates to /patient/schedule.",
                "Select Medical Clinic, Future Appointment, and select Tomorrow's date.",
                "Observe Slot 1 (09:00-12:00)."
            ],
            test_data="Student A: TUPM-25-0001 (booked), Student B: TUPM-25-0002",
            expected_result="Slot 1 displays an 'Occupied / Full' badge and is disabled. Slot 2 and Slot 3 remain available.",
            pass_criteria="Student B cannot select the occupied slot.",
            fail_criteria="Slot 1 remains available or Student B can double-book the slot."
        ),
        TestCase(
            id="",
            description="Multi-user concurrent booking collision prevention",
            preconditions="Student A and Student B both have the schedule page open on the same unbooked slot simultaneously.",
            steps=[
                "Student A clicks 'Confirm & Book' on Slot 2.",
                "Student A's booking succeeds.",
                "1 second later, Student B clicks 'Confirm & Book' on the same Slot 2 without refreshing."
            ],
            test_data="Slot: Tomorrow 13:00-16:00",
            expected_result="Student B's submission is intercepted and rejected with a notification: 'This appointment slot was just booked by another student. Please select an alternate time slot.'",
            pass_criteria="System prevents double booking and preserves Student A's reservation.",
            fail_criteria="Both students are granted confirmed bookings for the single-capacity slot."
        ),
        TestCase(
            id="",
            description="Slot availability segregation between Medical Clinic and Dental Clinic",
            preconditions="Student A has booked Medical Clinic, Tomorrow, Slot 1 (09:00-12:00).",
            steps=[
                "Student B navigates to /patient/schedule.",
                "Select 'Dental Clinic', Tomorrow's date.",
                "Observe Slot 1 (09:00-12:00) for Dental Clinic."
            ],
            test_data="Department: Dental Clinic, Slot: 09:00-12:00",
            expected_result="Dental Clinic Slot 1 remains available and bookable (Medical and Dental clinics maintain independent department capacities).",
            pass_criteria="Dental slot is available; Medical booking does not block Dental clinic.",
            fail_criteria="Medical booking incorrectly marks Dental slot as occupied."
        )
    ]
    sections.append(TestSection(12, "Slot Capacity, Collision & Multi-User Booking", "Single-slot capacity limits, real-time collision detection, and department independence.", sec12_cases))

    # -------------------------------------------------------------------------
    # SECTION 13: ACTIVE APPOINTMENT RESTRICTION & LIFECYCLE
    # -------------------------------------------------------------------------
    sec13_cases = [
        TestCase(
            id="",
            description="Student blocked from booking a second appointment while an active 'Scheduled' appointment exists",
            preconditions="Student already has an active appointment with status 'Scheduled'.",
            steps=[
                "Student navigates to /patient/schedule.",
                "Observe page state."
            ],
            test_data="Active Appointment Reference: APT-20260831-1001 (Scheduled)",
            expected_result="Booking form is replaced by an Active Appointment Details card. System displays notice: 'You already have an active appointment. You may only hold one active appointment at a time.'",
            pass_criteria="New booking form is hidden; active appointment details and Cancel button are shown.",
            fail_criteria="Student can create multiple active concurrent bookings."
        ),
        TestCase(
            id="",
            description="Student blocked from booking while appointment status is 'Checked-in'",
            preconditions="Staff has updated student's appointment status from 'Scheduled' to 'Checked-in'.",
            steps=[
                "Student visits /patient/schedule."
            ],
            test_data="Appointment Status: Checked-in",
            expected_result="Student remains restricted from booking another appointment while in Checked-in status.",
            pass_criteria="Active appointment barrier persists during clinic visit.",
            fail_criteria="Checked-in status allows student to book another appointment simultaneously."
        ),
        TestCase(
            id="",
            description="Student cancels their active Scheduled appointment",
            preconditions="Student has an active 'Scheduled' appointment.",
            steps=[
                "On /patient/schedule or /patient/dashboard, click 'Cancel Appointment' button.",
                "Confirm cancellation in confirmation modal."
            ],
            test_data="Appointment ID: APT-20260831-1001",
            expected_result="Appointment status changes to 'Cancelled'. Success alert confirms cancellation. Booking schedule re-opens and the student is immediately eligible to book a new appointment.",
            pass_criteria="Appointment is cancelled; previously occupied slot becomes available to other students.",
            fail_criteria="Cancellation fails or student remains blocked from booking."
        ),
        TestCase(
            id="",
            description="Staff marks appointment as 'Completed' releasing student for new bookings",
            preconditions="Staff marks student's appointment as 'Completed' on Staff Portal.",
            steps=[
                "Student refreshes /patient/schedule."
            ],
            test_data="Appointment Status: Completed",
            expected_result="Completed appointment is archived into medical records. Student is no longer considered to have an active appointment and can book a future follow-up.",
            pass_criteria="Scheduling form is accessible again after visit completion.",
            fail_criteria="Completed appointment continues to block student from future bookings."
        )
    ]
    sections.append(TestSection(13, "Active Appointment Restriction & Lifecycle", "One active appointment rule (Scheduled, Checked-in), cancellation release, and completed state handling.", sec13_cases))

    # -------------------------------------------------------------------------
    # SECTION 14: PATIENT HEALTH RECORDS & COMPLETED ENCOUNTERS
    # -------------------------------------------------------------------------
    sec14_cases = [
        TestCase(
            id="",
            description="View completed clinical encounters on Patient Records page",
            preconditions="Student has completed clinical visits recorded by clinic staff.",
            steps=[
                "Navigate to /patient/records.",
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
                "Inspect the Vitals column for the completed visit on /patient/records."
            ],
            test_data="Vitals object with full metrics",
            expected_result="Vitals are formatted cleanly as: 'BP: 120/80 • HR: 72 bpm • Temp: 36.6°C • RR: 18/min • SpO2: 99% • Weight: 65 kg'.",
            pass_criteria="All metrics are separated by bullets with proper units.",
            fail_criteria="Vitals display raw unformatted JSON or missing units."
        )
    ]
    sections.append(TestSection(14, "Patient Health Records & Completed Encounters", "Display of finalized clinical visits, formatted vitals metrics, assessment summaries, and empty states.", sec14_cases))

    # -------------------------------------------------------------------------
    # SECTION 15: PATIENT PROFILE & CONTACT INFORMATION
    # -------------------------------------------------------------------------
    sec15_cases = [
        TestCase(
            id="",
            description="View patient profile metadata and health information",
            preconditions="Student is logged into Patient Portal.",
            steps=[
                "Navigate to /patient/profile.",
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
            expected_result="Success alert 'Profile updated successfully' is displayed. Fields switch back to view mode showing the updated information.",
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
            description="Cancel profile editing without saving changes",
            preconditions="Student is in Edit mode on /patient/profile.",
            steps=[
                "Modify address text.",
                "Click 'Cancel' button."
            ],
            test_data="Modified text",
            expected_result="Form reverts to original unedited profile values without saving modifications.",
            pass_criteria="Original values are restored and edit mode exits.",
            fail_criteria="Unsaved edits remain visible in view mode."
        )
    ]
    sections.append(TestSection(15, "Patient Profile & Contact Information", "Student profile overview, contact information updating, emergency details, blood type, allergies, and cancel actions.", sec15_cases))

    return sections
