# MyTuskers Production-Quality Local Target

The current MyTuskers code is no longer treated as a design prototype. The target is a production-quality application that can run locally against LocalStack, with AWS services mocked locally and the same domain/security rules expected in deployed environments.

## What LocalStack Must Cover

- DynamoDB tables: `mytuskers-core`, `mytuskers-finance`, `mytuskers-audit`
- S3 bucket: `mytuskers-local-receipts`
- Local OTP auth adapter with fixed code `123456`; production uses Cognito SMS OTP.
- Future production-parity work: LocalStack Cognito custom-auth flow, receipt upload URLs, notification queues, and email/push providers

## Current Local Guarantees

- Role-aware API access is enforced server-side for player, captain, and global admin routes.
- Session restore uses an HTTP-only cookie and `/v1/me`; the frontend does not store long-lived tokens in localStorage.
- Local dev sessions last 180 days to match the PRP addendum's low-toil player experience.
- Player wallet routes use `/v1/teams/{teamId}/wallet/me`.
- Captain routes manage members, invites, join requests, matches, lineups, player wallets, and expenses.
- Global admin routes manage teams, captain assignment, users, and audit.
- Player cannot access captain/admin APIs.
- Captain cannot access global admin APIs or another team’s captain APIs.
- Players cannot see draft lineups.

## Run Locally

```powershell
make mytuskers-up
npm run mytuskers:verify
```

App: `http://localhost:3100`

API: `http://localhost:4100`

Phone on the same Wi-Fi/LAN: `http://192.168.4.67:3100`

When opened from a phone, the web app derives the API host from the browser URL and calls `http://192.168.4.67:4100` instead of `localhost:4100`.

OTP: `123456`

Seed users:

- Player: `+61400000123`
- Captain: `+61400000111`
- Global admin: `+61473623614`
- Guest/profile flow: `+61400000444`

## Still Not Production-Complete

- LocalStack still uses the fixed-code OTP adapter rather than a LocalStack Cognito custom-auth flow.
- Expense approval does not yet create full transactional ledger debits/reversals for every allocation.
- Receipt uploads are not yet implemented with pre-signed S3 URLs and MIME/size validation.
- Email, push notifications, DLQs, and CloudWatch alarms are not implemented.
- The frontend is functional and role-aware, but not yet complete for every PRP screen/state.
