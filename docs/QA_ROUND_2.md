# QA Round 2 — Findings and Changes (2026-11-12)

Checked against the code and the live Supabase database (read-only).

## Bugs

| # | Bug | Cause | Action taken |
|---|---|---|---|
| 1 | **Admin:** Staff invitation link does not work when setting the password | The invitation expiry setting is **5 minutes** in production. The physician invite sent 11/11 expired at 5 minutes and is still "pending". Brevo delivery plus opening the email often takes longer. | No code change. **Set "Invitation expiry" to 60 minutes in Admin → Settings** (allowed range 5–60), then resend the pending invitations. |
| 2 | **Patient:** Cannot book a Medical appointment while a Dental appointment exists ("You already have an active appointment…") | The app and the database trigger already check per clinic, but an older unique index (`idx_appointments_one_active_per_student`) still allowed only **one scheduled appointment per patient across both clinics**. | Migration `20261112100000_booking_per_clinic_and_own_birthday.sql` rebuilds the index per patient **per clinic**. |
| 3 | **Dental:** In Edit Record, typing in any field (Place of Birth, address…) jumps into Surname | The dialog re-ran its "focus the first field" step on every keystroke, because the page passed it a new close handler each render. The Reschedule and Cancel dialogs had the same problem. | `DentalDialog` focuses the first field only when it opens. Tested: typing "Manila" in Place of Birth stays there; Surname stays empty. |
| 4 | **Doctor:** Appointments → "Open" just goes to the Dashboard | Open leads to Encounter / Medical Log. The physician has no access to either page, so the page guard sends them to the Dashboard. | Open is hidden for roles without Encounter access. Nurses still have it. |
| 5 | **Doctor:** Archive Files → "Back to Enrollees Queue" | The physician has no Enrollees access (same cause as #4). | The button is hidden for roles without Enrollees access. |
| 6 | **Patient/Enrollee:** Privacy policy flashes briefly after signing in | While the portal checked whether the policy was already accepted, it showed the policy screen with "Loading policies…". | The portal shows "Loading session..." during the check. The policy screen appears only for accounts that have not accepted. |
| 7 | **Patient:** Birthday shows "Not on file" and cannot be changed | Only 1 of 29 patients has a birthday. Accounts made before sign-up asked for it have none, and patients have no permission to edit the patient record. | New function `set_my_date_of_birth` (in the same migration). In Edit profile, a date field appears **only when no birthday is on file**, and it can be set once. Changing a recorded birthday stays with the clinic. |
| 8 | **All portals except admin:** Password Requirements box touches the New/Confirm password fields | The box had no top spacing. | 12px space above the box in every portal. Admin dialogs are unchanged (their layout already spaces it). |

## Valid concerns

| # | Concern | My take | Action taken |
|---|---|---|---|
| 9 | **Admin/Medical/Dental:** A user deleted in Admin still shows in Medical/Dental | Deleting the **account** must not delete the **medical records**; they are retained by design. The real problem was that nothing showed the account was gone. | Deleting a user account now **archives** the patient with reason "Account deleted". The 2 already-deleted accounts are archived by the migration. Signing up again restores them. Records stay viewable under Archived. |
| 10 | **Nurse:** Archive graduates / people no longer at TUP so Registered Patients doesn't fill up | Valid; the list grows every year. One "archived" status covers both #9 and #10. I put it on the Patients page as an **Active / Archived** switch rather than in Archive Files, because Archive Files holds enrollee documents, not patients. | Migration `20261112110000_patient_archive.sql` adds `archived_at` / `archived_reason`. Medical Patients: **Archive** button (reason: Graduated, No longer at TUP, Account deleted, Other) and **Restore**. Dental Patients: the same Active/Archived split (view only). Archive and restore actions are written to the audit trail. |
| 11 | **Doctor/Nurse:** Queue # column is usually empty; change it to Date | Queue numbers exist only for same-day bookings, so future appointments always showed "—". | The column is now **Date**. The queue number appears as a small **#N** tag next to the time when there is one. |
| 12 | **All staff:** Reopen a resolved message | Valid: staff cannot start a conversation, so reopening is the only way to follow up. **The database never blocked replies on a resolved conversation**; only the screen did (the database blocks only reactions, and those work again once reopened). So **no migration was needed**. | A **Reopen** button on resolved inquiries moves the inquiry back to Active, and both sides can message again. As you asked: photos deleted on resolve are **not** restored, and photos sent after reopening are deleted again on the next resolve. |
| 13 | **Patient:** Email the patient when the dentist/clerk books the next session | Valid; patients may not open the portal. The email service already exists (patient bookings, message replies) but was never called for dental bookings. | Saving a dental visit with a next appointment now emails the patient (date, time, procedure, dentist). The patient's email notification settings still apply. A failed email never blocks the save. |
| 14 | **Patient:** Default profile picture is a doctor | Valid; the placeholder image is a doctor in a white coat. | Patients with no photo show their **initials** (e.g. "JC") in the header, sidebar and profile, and in the staff view of the patient. Uploading a photo replaces them. Staff avatars are unchanged. |
| 15 | **All portals:** Loading / confirmation when signing out | Valid. You asked for a confirmation dialog everywhere. | One shared **Sign Out?** dialog on every portal. It shows **"Signing out…"** until sign-out finishes. Added where it was missing (the staff, dental and admin top-bar menu); it replaces the three separate copies used by the sidebars and the patient header. |
| 16 | **Patient:** Name cannot be changed in profile settings | **Intentional.** The registered name is locked because it ties together the student's clinical records. Typos are now caught at sign-up by the "Review your details" step (QA round 1). A correction after that goes through clinic staff. | No change. |
| 17 | **New Enrollee:** Where do enrollee messages go? | They go to **Enrollees → Review** for that applicant, which only the **nurse** can open. They never appear in Patient Messages, so the doctor and dentist did not see them. The real gap was that the queue gave no sign a message was waiting. | The Enrollees queue shows an **"N new messages"** badge on applicants with unread messages. Opening the review marks them read. |
| — | **Admin:** Login page description | Requested change. | Title, description and motto updated on the admin login. |
| — | **Medicine log → inventory** (question) | **Already connected.** Recording a quantity in the medicine log deducts it from inventory. | No change needed. |

## To deploy

1. Apply the migrations, **before** deploying the new frontend, because the Patients pages read the new archive columns:
   - `20261112100000_booking_per_clinic_and_own_birthday.sql`
   - `20261112110000_patient_archive.sql`
2. Deploy the frontend for all four portals.
3. In Admin → Settings, set Invitation expiry to 60 minutes, then resend the pending invitations.

## Open item found during review

- `send-patient-notification` accepts a `recipient_email` from any signed-in caller, so a signed-in user could make it email any address. It is not part of this round; it should be restricted to the patient's own email on file.
