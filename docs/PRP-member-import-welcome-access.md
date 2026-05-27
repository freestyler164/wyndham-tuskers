# PRP: Member Import And Welcome Access

## Goal

Implement a Docker-run CLI workflow that imports current members from `Tuskers Members.xlsx` into the existing DynamoDB `members` table.

Phase 1 is import-only. Do not send welcome emails or generate password setup tokens during the first production run. The import should use the workbook sheet `2026` and include only rows where the renewal answer is `Yes`.

Welcome emails and password setup links remain a later phase after the imported member list is reviewed and confirmed.

## Current Repo Context

- Member records are stored in the existing DynamoDB members table.
- The backend already has auth routes for login, forgot password, reset password, pending registration approval, member listing, and admin promotion.
- Password reset tokens are stored in the existing `password_reset_tokens` table with `email` and `token` as keys.
- Email sending already goes through `backend/src/services/email.js`, using Resend in production and LocalStack/console fallback locally.
- The reset password page already accepts `email` and `token` query parameters.
- Spreadsheet found in repo root: `Tuskers Members.xlsx`.

## Spreadsheet Facts

Expected source:

- File: `Tuskers Members.xlsx`
- Sheet: `2026`
- Total data rows observed: `83`
- Renewal `Yes` rows observed: `82`
- Missing email count in renewal `Yes` rows: `0`
- Missing mobile count in renewal `Yes` rows: `1`
- Duplicate email count in renewal `Yes` rows: `0`
- Duplicate mobile count in renewal `Yes` rows: `0`

The importer must not assume the counts are always identical. It should print actual counts every run.

## Functional Requirements

Add a backend CLI script, for example `backend/src/importMembers.js`, with these modes:

- `--dry-run`: parse Excel, validate rows, print summary/report, write nothing.
- `--import`: upsert member records, write no emails.
- `--send-welcome`: later-phase mode to generate setup tokens and email imported members. Do not run this in the initial import.
- `--force-welcome`: later-phase optional flag that allows sending welcome emails even if a member already has `passwordHash`.

Add the Excel parser package for the backend CLI so the script can parse `.xlsx` inside Docker. Keep it out of the production runtime install where possible because the importer is an operational CLI, not part of the Lambda request path.

The script must require explicit table environment variables:

- `USERS_TABLE`
- `TOKENS_TABLE`
- `FRONTEND_URL`

It must refuse to run if `USERS_TABLE` is missing, to avoid accidental writes to an implicit local/default table.

## Member Mapping

For every `2026` row where renewal answer is `Yes`, create or update a member item.

Required identity:

- `email`: lowercased value from `Email address`

Missing mobile is allowed, but must be reported in dry-run and import output.

Map fields:

- `email`: lowercased email
- `fullName`: `Name`
- `phone`: `Mobile`
- `role`: `member`, except preserve existing `admin`
- `membershipStatus`: `active`
- `membershipYear`: `2026-27`
- `source`: `tuskers-members-2026`
- `family`: `{ adults, kidsUnder5, kidsOver5 }`
- `partner`: `{ name, phone, wantsUpdates }`
- `sportsLastYear`: array split from comma-separated sports field
- `sportsNextYear`: array split from comma-separated sports field
- `engagementScore`: numeric engagement value where present
- `feedback`: `Questions and Feedback`
- `policyAccepted`: boolean from policy acceptance column
- `importedAt`: keep existing value if already present, otherwise current timestamp
- `updatedAt`: current timestamp

Security preservation:

- Never overwrite existing `passwordHash`.
- Never downgrade an existing `admin` role.
- If a member already exists, update profile and membership fields only.

## Welcome Email Later Phase

Do not send welcome emails during the first production import.

The later welcome setup phase should use the existing password reset flow.

For each eligible member:

- Generate a random token.
- Store a token row in `password_reset_tokens`.
- Expiry: 14 days.
- Token item fields:
  - `email`
  - `token`
  - `expiresAt`
  - `expiresAtEpoch`
  - `purpose: "member_welcome"`

Link format:

```text
${FRONTEND_URL}/reset-password?email=<encoded-email>&token=<token>&welcome=1
```

Subject:

```text
Welcome to Wyndham Tuskers - set up your member access
```

Email body should be short and include:

- Their membership has been added from the 2026-27 renewal list.
- Use the secure link to create a password.
- The link expires in 14 days.
- Ignore or contact the committee if unexpected.

When the later phase is explicitly approved, send welcome emails only to imported members who do not already have `passwordHash`, unless `--force-welcome` is passed.

## UX/Auth Adjustments

Update reset password page copy when `welcome=1` is present:

- Title: `Set up your member access`
- Success message: `Your member access is ready. You can now log in.`

Update login behavior for users without `passwordHash`:

- Do not call bcrypt with an undefined hash.
- Return a friendly error:

```text
Your account is ready. Please use the welcome email to create your password or use Forgot password.
```

## CLI Usage Shape

Recommended local/prod Docker pattern:

```powershell
$env:AWS_PROFILE = "tpl"
$env:AWS_REGION = "ap-southeast-2"
$TABLES_JSON = docker compose -f docker-compose.deploy.yml run --rm terraform-pilot output -json dynamodb_tables
$env:USERS_TABLE = ($TABLES_JSON | ConvertFrom-Json).members
$env:TOKENS_TABLE = ($TABLES_JSON | ConvertFrom-Json).tokens
$env:FRONTEND_URL = "https://wyndhamtuskers.com"

docker compose -f docker-compose.deploy.yml run --rm `
  -e USERS_TABLE `
  -e TOKENS_TABLE `
  -e FRONTEND_URL `
  node "cd /workspace/backend && npm ci && node src/importMembers.js --dry-run '/workspace/Tuskers Members.xlsx'"
```

Then run the import-only command:

```powershell
node src/importMembers.js --import '/workspace/Tuskers Members.xlsx'
```

Do not run `--send-welcome` as part of the first production import.

The final implementation should document exact commands after script flags are finalized.

## Test Plan

Dry-run:

- Run against `Tuskers Members.xlsx`.
- Confirm renewal `Yes` count is printed.
- Confirm no writes happen.
- Confirm missing mobile warning is printed.
- Confirm duplicate email/mobile checks are printed.

LocalStack:

- Import into local members table.
- Confirm member count increases.
- Do not send welcome emails for the first import-only validation.
- Later-phase validation can separately test welcome emails, setup links and member login.

Production-safe run:

- Run dry-run first.
- Run import.
- Verify members appear in the admin Members table.
- Do not run welcome email batch yet.
- After review/approval, run the later welcome email phase separately.

## Acceptance Criteria

- The importer can run without modifying app code paths during normal startup.
- Existing admins remain admins after import.
- Existing passwords are preserved.
- Phase 1 imports all eligible members without sending emails.
- No password setup tokens are generated during the initial import-only run.
- Later phase: members without passwords receive setup links.
- Later phase: members with passwords do not receive setup links unless `--force-welcome` is used.
- Later phase: reset-password welcome copy appears when `welcome=1`.
- Later phase: login for no-password accounts returns the friendly setup message.
- No real secrets, credentials, or generated reports containing private member data are committed.

## Assumptions

- Partners are stored on the primary member record only; no separate partner login accounts in v1.
- Missing mobile does not block import.
- First version is a Docker CLI workflow, not an admin upload screen.
- Initial run is import-only; welcome emails are explicitly deferred.
- Later welcome links use the existing reset-password token table with 14-day expiry.
