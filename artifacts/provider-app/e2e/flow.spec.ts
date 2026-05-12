import { expect, test } from "@playwright/test";

// Generate a unique email + MRN per test run so the suite doesn't trip
// over a prior run's signup. We don't truncate the test DB between
// playwright runs — the api-server seeds it on boot and the E2E flow
// adds more.
const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const NEW_USER_EMAIL = `e2e-${RUN_ID}@halonote.test`;
const NEW_USER_PASSWORD = "correct horse battery staple";
const NEW_USER_NAME = "Dr. E2E Tester";
const NEW_PATIENT_MRN = `MRN-E2E-${RUN_ID}`;
const NEW_PATIENT_FIRST = "Quill";
const NEW_PATIENT_LAST = "Anderson";
const NEW_PATIENT_DOB = "1972-08-15";

test("provider can sign up, add a patient, write a note, and push it to the EHR mock", async ({
  page,
}) => {
  // ---------- Signup ----------
  await page.goto("/signup");

  await page.getByLabel("Full name").fill(NEW_USER_NAME);
  await page.getByLabel("Email").fill(NEW_USER_EMAIL);
  await page.getByLabel("Password").fill(NEW_USER_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // Landed on the patients list (signup auto-logs in).
  await expect(
    page.getByRole("heading", { name: /^patients$/i }),
  ).toBeVisible();

  // Seeded patients show up.
  await expect(page.getByText("Aguirre, Marisol")).toBeVisible();

  // ---------- Add a patient ----------
  await page.getByRole("button", { name: /add patient/i }).click();
  await expect(
    page.getByRole("heading", { name: /add patient/i }),
  ).toBeVisible();

  await page.getByLabel("First name").fill(NEW_PATIENT_FIRST);
  await page.getByLabel("Last name").fill(NEW_PATIENT_LAST);
  await page.getByLabel("Date of birth").fill(NEW_PATIENT_DOB);
  await page.getByLabel("MRN").fill(NEW_PATIENT_MRN);
  await page.getByRole("button", { name: /save patient/i }).click();

  // Lands on the patient detail page for the new patient.
  await expect(
    page.getByRole("heading", {
      name: `${NEW_PATIENT_LAST}, ${NEW_PATIENT_FIRST}`,
    }),
  ).toBeVisible();
  await expect(page.getByText(NEW_PATIENT_MRN)).toBeVisible();

  // ---------- Write + send a note ----------
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(
    page.getByRole("heading", { name: /^new note$/i }),
  ).toBeVisible();

  const noteBody = `E2E ${RUN_ID}: SOAP — Subjective: c/o headache. Objective: vitals stable. Assessment: tension. Plan: hydration, follow up in 2w.`;
  await page.getByLabel("Note").fill(noteBody);

  await page.getByRole("button", { name: /save & send to ehr/i }).click();

  // Inline "Sent to EHR (mock — mock)" confirmation shows up before the
  // 1.1s navigation timer fires.
  await expect(page.getByText(/Sent to EHR \(mock/i)).toBeVisible({
    timeout: 10_000,
  });

  // Then it should bounce us back to the patient detail page.
  await expect(
    page.getByRole("heading", {
      name: `${NEW_PATIENT_LAST}, ${NEW_PATIENT_FIRST}`,
    }),
  ).toBeVisible({ timeout: 10_000 });

  // The new note is in the Recent notes list with the green pill.
  await expect(
    page.getByText(noteBody.slice(0, 50)),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Sent · mock/i)).toBeVisible();

  // ---------- Sign out ----------
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(
    page.getByRole("heading", { name: /^sign in$/i }),
  ).toBeVisible({ timeout: 10_000 });
});

test("a non-admin user signing in cannot see the audit log nav link", async ({
  page,
}) => {
  await page.goto("/login");

  // bob is the seeded "member" account from the api-server's
  // seedUsersIfEmpty() — set up by index.ts on boot.
  await page.getByLabel("Email").fill("bob@halonote.example");
  await page.getByLabel("Password").fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(
    page.getByRole("heading", { name: /^patients$/i }),
  ).toBeVisible();

  // Audit log button is hidden for non-admins.
  await expect(page.getByRole("button", { name: /audit log/i })).toHaveCount(
    0,
  );
});

test("alice (admin) sees the audit log nav and can open the page", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("alice@halonote.example");
  await page.getByLabel("Password").fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(
    page.getByRole("heading", { name: /^patients$/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /audit log/i }).click();
  await expect(
    page.getByRole("heading", { name: /^audit log$/i }),
  ).toBeVisible();
});
