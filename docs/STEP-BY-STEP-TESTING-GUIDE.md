# Travelogue: Setup and Step-by-Step Testing

This guide is for running and manually demonstrating the current local-development build. It does not describe a production deployment.

For endpoint-by-endpoint API checks, example `curl` commands, authorization cases, and broader release testing, use the [API and feature test plan](./API-AND-FEATURE-TEST-PLAN.md).

## 1. Prerequisites

- Node.js 22.13 or newer and npm installed.
- A terminal opened at the repository root.
- Dependencies installed in both `frontend/` and `backend/` if this is a fresh checkout.
- The backend environment configured before starting the API.

The repository does not include a committed `.env.example`. Do not share or commit `.env` values. If an existing `backend/.env` is present, keep its database URL and secrets intact; back up the local database before running migrations against it.

## 2. Configure and migrate the backend

From the repository root:

```sh
cd backend
npm install
```

Configure these values in `backend/.env`:

```dotenv
DATABASE_URL="file:./dev.db"
JWT_SECRET="<a unique local development secret>"
ENCRYPTION_KEY="<exactly 32 bytes for local development>"
OTP_SECRET="<a separate local OTP hashing secret>"
FRONTEND_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

Use local-only secrets and keep this file private. The encryption key must remain the same for as long as encrypted data needs to be read. Changing it makes existing encrypted fields and files undecryptable. Production requires secure secret/key management and production OTP delivery is not implemented.

Apply migrations and start the API:

```sh
npx prisma migrate deploy
npm run start:dev
```

Expected: NestJS reports that the API is listening at `http://localhost:4000/api`. Keep this terminal open.

## 3. Start the frontend

Open a second terminal at the repository root:

```sh
cd frontend
npm install
npm run dev
```

Expected: Next.js serves the app at `http://localhost:3000`. If the API is not at its default address, configure `NEXT_PUBLIC_API_BASE` for the frontend before starting it.

## 4. Sign in

1. Open `http://localhost:3000`.
2. Choose sign-in or sign-up and enter a valid email address or phone number.
3. Request the verification code.
4. For local development, enter **123456**. The API response explains that no email or WhatsApp message was sent; the code is shown only for local development.
5. Confirm that the authenticated dashboard loads.
6. Reload the page and confirm the session is restored.

The OTP is a fixed development code. No email or WhatsApp message is sent. Do not use this flow as production authentication.

## 5. Test bill capture, upload, and review

1. Open the scan/capture workflow.
2. Select an image or PDF, or try camera capture if the browser/device supports it and permission is granted.
3. Upload the bill. The backend accepts images and PDFs up to 10 MB.
4. Wait for processing. The app polls the extraction endpoint.
5. Review the extracted merchant, date, bill number, total, tax, currency, payment method, and confidence indicators.
6. Edit at least one field to confirm manual correction works.
7. Select a view/category and set the personal marker if desired.
8. Confirm/save the bill.
9. Verify the bill appears in the bill list with an appropriate status.
10. Open the bill file and confirm the uploaded image/PDF can be retrieved.

**OCR test expectation:** the backend runs Tesseract.js locally using a bundled English model. It recognizes image content and renders PDF pages locally (up to 10 pages) before recognition. Text patterns estimate common receipt fields; values are marked uncertain and require manual correction. Test with clear, non-sensitive receipt images and PDFs. OCR accuracy has not been benchmarked, and multilingual receipts or unusual layouts may produce missing or incorrect fields.

## 6. Test bill listing and organization

1. Upload and confirm multiple sample bills.
2. Search by a merchant name or bill number.
3. Filter by view and category.
4. Try date ranges (including a custom range if available).
5. Create a new view with a recognizable name.
6. Move a bill to a different view, then reload and verify the assignment persists.
7. Create or select a category/subcategory and verify it is available in bill review/filtering.
8. Open an existing bill and confirm the saved values and file are present.

## 7. Test sharing with two accounts

1. In the first browser/session, sign in as account A and create a bill or view to share.
2. In the sharing workflow, enter the exact email or phone contact for account B.
3. Select one expiry option (7, 30, 90 days, or never) and create the share.
4. Confirm it appears under outgoing shares.
5. Open a private/incognito browser window or another browser profile and sign in as account B using the same contact used in the share.
6. Open incoming shares and verify the shared bill/view is visible.
7. Confirm account B can read shared content but cannot modify or revoke account A’s share.
8. Return to account A and revoke the share.
9. Confirm it disappears from outgoing shares and is no longer available as an active incoming share.

Sharing is authenticated and contact-based; there is no anonymous URL that can be opened without signing in.

## 8. Test file validation and access boundaries

- Try a file larger than 10 MB and verify upload is rejected.
- Try a non-image/non-PDF file and verify upload is rejected.
- Sign in as a second user and try to access account A’s private bill ID; access should be denied/not found.
- Confirm normal owner access to the bill still works.
- Confirm shared access works only for an active share.

Use disposable test accounts and files. Avoid uploading real financial or personal information to a local demo.

## 9. Test responsive behavior

Use browser developer tools to check approximate widths:

- Mobile: 375px
- Tablet: 768px
- Desktop: 1280px

At each width, inspect navigation, upload/review form, bill list, filters, sharing dialogs, and buttons. On mobile, open the views, category, and date filters one at a time; confirm each opens as a bottom sheet, can be dismissed, and applying a selection updates the list. Verify controls remain visible, usable, and do not overlap. In an authenticated session, use Log out and confirm the app returns to sign-in; sign in again to continue checks. Also test browser zoom and keyboard focus where time permits.

## 10. Build checks

Run these from the repository root (each command runs in a subshell, so the working directory remains the repository root):

```sh
(cd frontend && npm run build)
```

```sh
(cd backend && npm run build && npx prisma validate)
```

These are build/schema checks, not an automated functional test suite. `backend/package.json` currently defines `npm test` as a placeholder that exits with an error. Manual API/browser checks are required until tests are added.

## 11. Troubleshooting

| Symptom | Check |
|---|---|
| Frontend cannot contact API | Confirm the backend is listening on port 4000 and `NEXT_PUBLIC_API_BASE` points to `/api`. Check `FRONTEND_ORIGINS` for the frontend origin. |
| OTP does not work | Use `123456` in local development and check that both API requests use the same normalized contact. |
| API fails at startup | Check `backend/.env`, database URL, port 4000 availability, and Prisma migration status. Do not paste secrets into tickets or chat. |
| Bill upload rejected | Verify it is an image or PDF and is at most 10 MB. |
| Bill file cannot be decrypted | Verify `ENCRYPTION_KEY` has not changed since the bill was uploaded and the encrypted file still exists. |
| Extracted details do not match bill | OCR reads the uploaded file, but OCR recognition and heuristic field parsing can be wrong or incomplete. Review and correct the fields before confirming the bill. |
| Database migration issue | Back up the database first; confirm the correct `DATABASE_URL` is selected before migration commands. |

## Completion checklist

- [ ] API and frontend start locally.
- [ ] Email/WhatsApp method selection, local OTP sign-in, session restoration, and logout work. Confirm the local response says no message was sent.
- [ ] Image and PDF upload succeeds; invalid/oversized files are rejected.
- [ ] Real local OCR runs on image and PDF files; candidate fields can be reviewed and corrected before saving.
- [ ] Search, filters, views, categories, and moves persist.
- [ ] Bill file retrieval works.
- [ ] Bill/view sharing, incoming shares, and revocation work across two accounts.
- [ ] Owner/private access restrictions behave as expected.
- [ ] Layout has been checked at mobile, tablet, and desktop widths; mobile filters open one at a time and logout returns to sign-in.
- [ ] Frontend/backend builds and Prisma validation pass.
