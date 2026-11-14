# Travelogue: API and Feature Test Plan

This guide is for testing the current local-development implementation. Use a disposable local database and test accounts only. Do not run these tests against production or upload real receipts, contact details, or financial data.

The backend does not currently have an automated test suite: `backend/package.json` defines `npm test` as a placeholder. This plan is a manual API and product checklist, not evidence that every check has passed.

## 1. Prepare an isolated local test environment

1. Follow the setup steps in [the step-by-step testing guide](./STEP-BY-STEP-TESTING-GUIDE.md).
2. Back up any local database you want to keep. Prefer a separate disposable SQLite database for API testing; do not point test runs at a production or important personal database.
3. Start the API and frontend. Confirm the API is listening at `http://localhost:4000/api`.
4. Install or have `curl` and `jq` available. Prepare a small, non-sensitive PNG/JPEG and PDF receipt for OCR checks.
5. In a terminal, set the API base URL:

```sh
API="http://localhost:4000/api"
```

Keep tokens private. Do not paste terminal output containing a bearer token into tickets, chat, screenshots, or commits.

## 2. API inventory

Every endpoint below is under `/api`. All endpoints except OTP send/verify require `Authorization: Bearer <JWT>`.

| Method | Route | What to verify |
|---|---|---|
| POST | `/auth/otp/send` | Local development OTP response, normalized contact, invalid contact rejection, request throttling |
| POST | `/auth/otp/verify` | Valid OTP returns `accessToken` and user; invalid/expired code is rejected |
| GET | `/auth/me` | Valid token returns the current user; absent/invalid token is rejected |
| POST | `/bills/upload` | Image/PDF upload, optional view/category/personal metadata, invalid or oversized upload rejection |
| GET | `/bills/:id/extraction` | Owner can poll status and read extraction; another user cannot read a private bill |
| POST | `/bills/:id/confirm` | User-reviewed values persist; complete fields become `VERIFIED`, incomplete fields remain `NEEDS_REVIEW` |
| GET | `/bills` | User’s own bills, text search, view/category/date filters |
| GET | `/bills/:id/file` | Owner and authorized active share recipient can retrieve original file; unauthorized user cannot |
| POST | `/bills/:id/move` | Owner can move a bill to their own view; invalid/other-user view is rejected |
| GET | `/views` | Current user’s views and bill counts |
| POST | `/views` | New view is persisted; blank and duplicate names are rejected |
| POST | `/views/:id/bills` | Owner can move owned bills into their view |
| GET | `/categories` | Category list is returned |
| POST | `/categories` | Category is created; blank/duplicate name is rejected |
| GET | `/shares/outgoing` | Owner sees shares they created |
| GET | `/shares/incoming` | Recipient sees active shares for their contact |
| POST | `/shares` | Bill/view share with valid recipient and expiry is persisted |
| DELETE | `/shares/:id` | Owner can revoke a share; another user cannot revoke it |

**Scope note:** the current category catalog is stored globally, not per user. Creating a category affects the shared catalog, and there is no delete-category API. Use a unique test category only if needed and avoid repeatedly creating categories.

## 3. Sign-in and token checks

Use two distinct test contacts, for example `travelogue-api-a@example.test` and `travelogue-api-b@example.test`.

### Request a development OTP

```sh
curl -i -X POST "$API/auth/otp/send" \
  -H "Content-Type: application/json" \
  -d '{"contact":"travelogue-api-a@example.test","name":"API Test A"}'
```

Expected: success response states that this is local development and no message was sent. The local code is `123456`; no email or WhatsApp message is delivered.

### Verify and save the token

```sh
TOKEN_A=$(curl -sS -X POST "$API/auth/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"contact":"travelogue-api-a@example.test","code":"123456"}' \
  | jq -r '.accessToken')
test -n "$TOKEN_A" && test "$TOKEN_A" != "null" && echo "Token received"
```

Repeat with contact B to save `TOKEN_B`. Keep the token values in your terminal only.

### Authentication checks

```sh
curl -i "$API/auth/me" -H "Authorization: Bearer $TOKEN_A"
curl -i "$API/auth/me"
curl -i "$API/auth/me" -H "Authorization: Bearer not-a-real-token"
```

Expected: the first request returns account A’s profile; the other two are rejected as unauthenticated. Also check:

- A malformed email/too-short phone contact is rejected.
- A wrong six-digit code is rejected; do not exhaust attempts on a contact you need for later testing.
- The OTP expires after five minutes, and repeated requests are rate limited (maximum five per contact in ten minutes).
- The browser can sign out and the old browser session no longer accesses authenticated features.
- Production mode does not pretend to send OTP; delivery providers are not configured in this build.

## 4. Views, categories, and bills

### Create a view and list views

```sh
curl -sS -X POST "$API/views" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"API Test Trip 2026"}' | jq

curl -sS "$API/views" -H "Authorization: Bearer $TOKEN_A" | jq
```

Save the returned view `id` as `VIEW_A`. Verify that a blank name and a duplicate view name are rejected, and that account B does not see account A’s view.

### List categories

```sh
curl -sS "$API/categories" -H "Authorization: Bearer $TOKEN_A" | jq
```

Verify the response includes available categories and subcategories. If testing category creation, use a unique name and remember that this catalog is global and has no delete route.

### Upload an image or PDF

Set `VIEW_A` to a view ID belonging to account A and use a local test fixture:

```sh
VIEW_A="<view-id>"
curl -sS -X POST "$API/bills/upload" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@./test-receipt.png;type=image/png" \
  -F "viewId=$VIEW_A" \
  -F "category=Travel" \
  -F "subcategory=Taxi and Cab" \
  -F "isPersonal=false" | jq
```

Save the returned `billId` as `BILL_A`. Repeat with a PDF fixture. Verify that:

- The response starts with `PROCESSING` and provides a bill ID.
- Polling `GET /bills/$BILL_A/extraction` eventually returns extracted fields or an explicit manual-entry error.
- The upload API rejects a missing file, a non-image/non-PDF, and a file larger than 10 MB.
- The uploaded PDF is rendered locally for OCR; PDFs above the supported 10-page limit fail into a manual-review path.
- An image and PDF open as the original file after upload.

Example extraction request:

```sh
curl -sS "$API/bills/$BILL_A/extraction" \
  -H "Authorization: Bearer $TOKEN_A" | jq
```

OCR results are best-effort English text and heuristic field candidates. Compare them with the fixture, correct any mistakes, and do not treat extraction as accounting truth.

### Confirm, list, search, filter, and move

Confirm a bill using values you have reviewed:

```sh
curl -sS -X POST "$API/bills/$BILL_A/confirm" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"merchant\":\"Test Taxi\",\"date\":\"2026-11-14\",\"billNo\":\"TEST-001\",\"total\":\"1200.00\",\"tax\":\"100.00\",\"currency\":\"INR\",\"payment\":\"UPI\",\"viewId\":\"$VIEW_A\",\"category\":\"Travel\",\"subcategory\":\"Taxi and Cab\",\"isPersonal\":false}" | jq
```

Check that merchant, total, and date produce `VERIFIED`; omit one required value in a separate disposable bill to confirm `NEEDS_REVIEW`.

Exercise the listing endpoint:

```sh
curl -sS "$API/bills" -H "Authorization: Bearer $TOKEN_A" | jq
curl -sS "$API/bills?q=Test%20Taxi" -H "Authorization: Bearer $TOKEN_A" | jq
curl -sS "$API/bills?viewId=$VIEW_A&category=Travel" \
  -H "Authorization: Bearer $TOKEN_A" | jq
curl -sS "$API/bills?fromDate=2026-11-01&toDate=2026-11-30" \
  -H "Authorization: Bearer $TOKEN_A" | jq
```

Verify the search and each filter return only the matching account A records. Also check `dateFilter=30` and `dateFilter=prev`.

Move a bill to another view that belongs to account A:

```sh
curl -sS -X POST "$API/bills/$BILL_A/move" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"viewId":"<another-view-id-owned-by-A>"}' | jq
```

Test adding bills to a view:

```sh
curl -sS -X POST "$API/views/$VIEW_A/bills" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"billIds\":[\"$BILL_A\"]}" | jq
```

Verify bill assignment and view counts persist after restarting the API.

## 5. File access, encryption, and account isolation

Download a bill file as its owner:

```sh
curl -sS "$API/bills/$BILL_A/file" \
  -H "Authorization: Bearer $TOKEN_A" \
  -o retrieved-test-bill.png
file retrieved-test-bill.png
```

Use a private bill belonging to account A and try to access it with `TOKEN_B`:

```sh
curl -i "$API/bills/$BILL_A/extraction" -H "Authorization: Bearer $TOKEN_B"
curl -i "$API/bills/$BILL_A/file" -H "Authorization: Bearer $TOKEN_B"
```

Expected: private data is not disclosed to account B. Repeat for account A’s private views, bill moves, and share revocation. Verify:

- Account A’s `/bills` result does not include account B’s private bills, and vice versa.
- Re-uploaded and retrieved files have matching content (compare hashes locally if desired).
- Restarting the backend does not make existing local encrypted files unreadable when the same local key/database are used.
- Do not inspect or commit `.env`, raw database files, or uploaded bill files as part of testing.

## 6. Share workflow with account B

Create a share owned by A and addressed to B:

```sh
curl -sS -X POST "$API/shares" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"targetType\":\"bill\",\"targetId\":\"$BILL_A\",\"recipientContact\":\"travelogue-api-b@example.test\",\"expiresInDays\":7}" | jq
```

Save the returned share `id` as `SHARE_ID`. Check the lifecycle:

1. `GET /shares/outgoing` as A lists the share.
2. `GET /shares/incoming` as B lists the active share.
3. B can retrieve the shared bill file and see it in incoming shares, but cannot edit the bill, move it, or revoke A’s share.
4. Try an invalid target type, nonexistent target, invalid recipient, and unsupported expiry such as 14 days; confirm the request is rejected.
5. Try revoking A’s share using B’s token; it must not revoke the owner’s share.
6. Revoke using A’s token and verify it disappears from incoming/outgoing results and B’s file access is denied.
7. Repeat for a view share and confirm it grants access only to bills in that view.

`expiresInDays` supports 7, 30, and 90. Omitting it means no expiry. No email or WhatsApp notification is sent when a share is created.

## 7. Frontend and whole-feature checks

API checks do not replace user-interface testing. Follow [the step-by-step testing guide](./STEP-BY-STEP-TESTING-GUIDE.md) and include:

- Sign-up/sign-in using both email and WhatsApp selection; local mode sends no code.
- Reload/session restoration and logout.
- Image selection, camera capture where permitted, PDF upload, OCR progress/error states, field editing, and confirmation.
- Bill list search; view/category/date/custom-range filters; one mobile filter sheet open at a time; clear/apply/dismiss controls.
- Create views/categories, move bills, and check persistence after reload.
- Share creation, incoming/outgoing lists, read-only access, expiry choice, and revoke.
- Responsive layouts at about 375px, 768px, and 1280px; keyboard focus, browser zoom, and no horizontal overflow.
- Useful error messages when the API is unavailable, the file is invalid, OCR fails, or a request is unauthorized.

## 8. Reliability, privacy, and release checks

Before any real deployment, test and document these separately:

- Automated unit, integration, and end-to-end coverage (currently absent).
- Database migration, backup, restore, and data retention/deletion.
- Secret/key rotation and recovery; changing `ENCRYPTION_KEY` makes prior encrypted data unreadable unless migrated.
- OCR accuracy using a consented, representative set of receipts and expected field-level metrics.
- API behavior under concurrent uploads, large allowed files, OCR failures, and server restart during processing.
- Monitoring/logging, rate-limit behavior, CORS allowlist, and production OTP delivery.
- Security and privacy review of JWT storage, authorization boundaries, metadata exposure, file validation, and share expiry/revocation.
- Accessibility and browser/device coverage.

The current OCR work runs in the API process, not a durable queue. A server restart during processing may leave a bill requiring manual review; do not describe the current workflow as production-scalable.

## 9. Record the results

For each test, record date/build, test account aliases (not actual contacts), pass/fail, evidence location, and a bug reference. Never record OTPs, JWTs, secret values, real receipt contents, or personal data in the test report.

| Area | Result | Notes / issue reference |
|---|---|---|
| OTP and authentication | Not run | |
| Views and categories | Not run | |
| Upload and OCR | Not run | |
| Confirm/list/search/filter/move | Not run | |
| File authorization and isolation | Not run | |
| Bill/view sharing and revocation | Not run | |
| Mobile, tablet, desktop UI | Not run | |
| Build and Prisma validation | Not run | |
| Production readiness checks | Not run | |
