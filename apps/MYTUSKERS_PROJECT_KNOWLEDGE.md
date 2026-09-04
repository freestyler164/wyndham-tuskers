# MyTuskers Project Knowledge

Last updated: 2026-07-28

This note captures the practical project knowledge for the MyTuskers app in this repository. It is intentionally operational and should not contain secrets, API keys, passwords, or private Terraform variable values.

## Project Shape

MyTuskers is a separate PWA-style app inside the Wyndham Tuskers repository. It is separate from the existing public club website.

Main app folders:

- `apps/mytuskers-web`: React + Vite PWA frontend.
- `apps/mytuskers-api`: Express API, deployable as Lambda and runnable locally as Node.
- `packages/mytuskers-contracts`: Shared TypeScript contracts.
- `infra/terraform-mytuskers`: Production AWS infrastructure for MyTuskers.

Local support:

- `docker-compose.yml`: runs LocalStack, `mytuskers-api`, and `mytuskers-web`.
- LocalStack mocks DynamoDB and S3 for local development.
- Local web URL: `http://localhost:3100`.
- Local API URL: `http://localhost:4100`.

Production:

- App URL: `https://mytuskers.wyndhamtuskers.com`.
- API is served through the same CloudFront/API Gateway setup.
- CloudFront distribution ID: `E1WZY9NATJY2FU`.
- Production Lambda: `mytuskers-prod-api`.
- Production DynamoDB tables:
  - `mytuskers-prod-core`
  - `mytuskers-prod-finance`
  - `mytuskers-prod-audit`
- Production receipts/assets bucket: `mytuskers-prod-receipts-654654635402`.

## Core Product Model

The app is team-centric. A user can belong to one or more teams.

Main roles:

- `PLAYER`: normal team member.
- `CAPTAIN`: team operator.
- `TEAM_ADMIN`: same operational access as captain.
- `GLOBAL_ADMIN`: global administration access, and should also retain team/captain-style access where relevant.

Important user flows:

- Username/password login.
- Signup with name, email, phone, and password.
- Profile setup including preferred name, playing role, and profile photo.
- Smart invite links for joining a team.
- Persistent sessions are used to reduce login toil.
- First-run install/notification guidance is shown after signup/join flows.

## Frontend Notes

The frontend is intentionally mobile-first and app-like. Most UI is currently implemented in `apps/mytuskers-web/src/main.jsx`, with styling in `apps/mytuskers-web/src/styles.css`.

Key screens/routes:

- `/`: player home, or admin redirect for global admin.
- `/login`
- `/profile`
- `/join/:token`
- `/wallet`
- `/collections/:collectionId`
- `/schedule`
- `/matches/:matchId`
- `/feed`
- `/feed/:postId`
- `/captain/availability`
- `/more`
- `/captain`
- `/captain/wallet`
- `/captain/collections/new`
- `/captain/collections/:collectionId`
- `/captain/matches`
- `/admin`
- `/admin/teams`

PWA assets:

- `apps/mytuskers-web/public/manifest.webmanifest`
- `apps/mytuskers-web/public/sw.js`
- app icon/logo assets include `wt_logo.png`

Design direction:

- Mobile app feel, not a marketing site.
- Cream/off-white background with white cards and orange accent.
- Bottom nav is a floating app-style nav.
- Avoid crowded button rows; use menus/icon buttons for secondary actions.
- Feed cards use a social/X-style layout with author avatar rail, white bubble, like/comment pills, and one latest comment preview.

## Feed And Appreciation

The team feed is based on appreciation posts with comments and likes.

Current behavior:

- Feed lives at `/feed`. Feed components live in `apps/mytuskers-web/src/feed/`.
- Post button opens a modal labelled `Post`.
- Posts have a short description and optional long description.
- Typing `@` in the long description opens a teammate picker.
- Mentioning a teammate is optional.
- The author row sits on the cream background above the white bubble, with a kebab menu for delete.
- Feed shows only the latest comment preview on the card, with a two-line clamp.
- Tapping a card opens the detail route `/feed/:postId`, which carries all comments and the full liker list. The old detail modal is gone.
- Recent likers render as an avatar stack beside the like/comment pills; tapping it opens the likers sheet.
- Pull down at the top of the feed to refresh.
- Feed avatars use uploaded profile photos when available, falling back to initials.

Retention and paging:

- Appreciation posts expire after 30 days via `expiresAtEpoch`; API filtering hides expired posts immediately even if DynamoDB TTL cleanup is delayed.
- Posts carry `GSI1PK = TEAM#<teamId>#FEED` and `GSI1SK = <createdAt>#<postId>`, so the feed reads newest-first off GSI1 rather than scanning the team partition.
- The list endpoint pages with an opaque `cursor` (default 20, max 50). The roster for the mention picker is only returned on the first page.
- `apps/mytuskers-api/src/backfillFeedIndex.js` backfills GSI attributes on posts created before this change. Run once per environment, then delete.

Photos:

- One photo per post, cropped client-side with `react-easy-crop` (1:1, 4:5, 16:9, free).
- Upload is two-step: the photo goes to S3 when the crop is confirmed, and the post request only carries the returned key. Abandoned uploads are orphans until the lifecycle rule sweeps them.
- Objects live under `feed-media/<teamId>/<uuid>.<ext>` in the receipts bucket, and the API only accepts keys matching the caller's team prefix.
- Media is served at `/feed-media/*` straight from S3 through a dedicated CloudFront behaviour, not through `/v1/assets/*`, which 302s to a presigned URL and would cost a Lambda invocation per image per viewer. The API has a matching local route so the same URL resolves in development.
- Cards reserve the aspect ratio from the stored width/height so the scroll position does not jump on load.
- Deleting a post deletes its S3 object. Dynamo TTL never touches S3, so the bucket has a lifecycle rule expiring `feed-media/` at 35 days, deliberately with no transition to Glacier or Infrequent Access. The bucket is versioned, so the rule also expires noncurrent versions and delete markers.

API endpoints:

- `GET /v1/teams/:teamId/appreciation` (supports `cursor` and `limit`)
- `GET /v1/teams/:teamId/appreciation/:postId`
- `POST /v1/teams/:teamId/appreciation`
- `DELETE /v1/teams/:teamId/appreciation/:postId` (author or team manager)
- `POST /v1/teams/:teamId/appreciation/media`
- `POST /v1/teams/:teamId/appreciation/:postId/like`
- `DELETE /v1/teams/:teamId/appreciation/:postId/like`
- `POST /v1/teams/:teamId/appreciation/:postId/comments`

Notifications:

- New appreciation posts notify active members of the team, excluding the author.
- New comments notify relevant post participants excluding the commenter.

## Wallet Model

Money is represented as integer cents/minor units only.

Player wallet use cases:

- Players start with credits/topups.
- Approved expenses can deduct from player wallets based on allocation.
- Tournament match fees can debit selected lineup players.
- Friendly/training games should not charge match fees.
- Low/negative balance prompts topup request.
- Actual payments happen outside the app; the app captures and approves requests.
- Prepaid collections hold money in `earmarkedMinor` separately from match-fee `availableMinor`.
- Collection flow: captain creates per-player amounts → player confirms offline payment → captain approves (COLLECTION_CREDIT to earmarked) → captain records purchase (COLLECTION_DEBIT; leftover COLLECTION_RELEASE to available).

Captain/admin wallet controls:

- Expense approvals.
- Topup approvals.
- Prepaid collections (create, approve payments, mark paid, record purchase, cancel).
- Add credit to selected players or all players.
- Add expense on behalf of a player.
- Edit wallet transactions directly where correction is needed.

Important display distinction:

- Team expense total should not be displayed as if it is the player’s personal debit.
- Player wallet activity should show the player’s actual share/debit as the debit, and the total team expense only as contextual/note-style information when needed.

## Matches And Lineups

Captain Match Hub:

- Create/edit matches.
- Request availability.
- Copy availability link.
- Publish/edit lineup.
- Cancel/reopen/delete matches.
- Delete is only allowed where appropriate, especially before lineup publication.
- Completed/cancelled handling should preserve enough history for captain/admin follow-up.

Captain availability list:

- The captain keeps their own availability list, stored separately from what players answer and never overwriting it.
- Rows are `PK=MATCH#<matchId>`, `SK=CAPTAIN_AVAILABILITY#<userId>` with `status`, `note`, `setByUserId`, `setAt`.
- Visible to captains, team admins and global admins only. The gate is `requireCaptainOrAdmin` on the endpoints, and `canManageMatch` on `availabilityRows` in `getMatchDetail`.
- The list lives at `/captain/availability` and inside the match summary modal, showing the player's answer and the captain's mark side by side. Tapping a row cycles unmarked, available, maybe, unavailable.
- Match Hub cards show a badge reading "Captain's list: N confirmed of M marked", fed by `captainAvailabilitySummary` on the dashboard so no extra fetch is needed.
- Publishing a lineup with no saved lineup prefills from the captain's confirmed players rather than the first twelve on the roster.
- Endpoints, all `requireCaptainOrAdmin`:
  - `GET /v1/teams/:teamId/matches/:matchId/captain-availability`
  - `PUT /v1/teams/:teamId/matches/:matchId/captain-availability` (bulk, `{ entries: [{ userId, status, note }] }`)
  - `PUT /v1/teams/:teamId/matches/:matchId/captain-availability/:userId`
  - `DELETE /v1/teams/:teamId/matches/:matchId/captain-availability/:userId`

Match result:

- Completing a match is a form, not a one-tap action. The captain picks a result and can add a short summary, and both are stored on the match record as `result` and `resultSummary`.
- `result` is one of `WON`, `LOST`, `DRAW`, `TIE`, `NO_RESULT`, always from the Tuskers' point of view. An unrecognised value is dropped rather than stored.
- `resultSummary` is trimmed to 280 characters. It is visible to every player, on the schedule row and the match detail page.
- Reopening or cancelling a match clears both fields, so a live fixture can never show a stale scoreline. An unrelated edit to a completed match leaves them alone.
- Captains edit a saved result from the Match Hub menu ("Edit result" / "Add result"). That path sends only `result` and `resultSummary`, so `completedAt` is not re-stamped.
- Everything goes through the existing `PATCH /v1/teams/:teamId/matches/:matchId`, which is already `requireCaptainOrAdmin`.

Player schedule:

- Schedule should focus to next match but allow scrolling up to past matches.
- Availability badges should reflect actual player response where lineup is not published.
- Published lineup should show whether the player is in the team; if not selected, no confusing “not answered” badge should appear.
- Closed matches show the result pill and a clamped two-line summary instead of a bare status word.
- Opening a completed match keeps the record of the day: the result card, the captain's Man of the Match, and the published team sheet. Only availability actions are closed off.

Lineup:

- Published lineup display should not show an “Order” column.
- “Team for the day” is preferred wording over “Starting XI” because teams may have 12 players.
- Guest players can be added at publish time.
- Published tournament lineup can trigger match fee debits to selected registered players.

Lineup sharing:

- Share generates an in-browser JPEG image.
- Image uses a dark/orange club-branded design with logo, match metadata, and two-column player grid.
- Web Share support differs by device/browser; iOS may show preview/download behavior depending on context and file type.

Calendar:

- iOS can use generated `.ics`.
- Android should prefer a Google Calendar web event link where possible.

## Push Notifications

Push notifications use Web Push with VAPID, not Firebase.

Configuration:

- VAPID public/private keys are configured through environment/Terraform variables.
- Do not commit VAPID private keys or Resend keys.

Implemented notification workflows:

- Availability requested by captain: notifies team members.
- Lineup published: notifies team members.
- Expense/topup submitted: notifies team managers.
- Expense/topup approved: notifies submitter.
- Appreciation post created: notifies team members excluding author.
- Appreciation comment created: notifies relevant participants excluding commenter.

There is also an admin utility for sending test push notifications.

## Local Development

Start local stack:

```powershell
docker compose up -d --build mytuskers-api mytuskers-web
```

Useful checks:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3100
Invoke-WebRequest -UseBasicParsing http://localhost:4100/health
```

Common validation:

```powershell
npm run build -w @wyndham-tuskers/mytuskers-web
npm run check -w @wyndham-tuskers/mytuskers-contracts
npm run test:integration -w @wyndham-tuskers/mytuskers-api
```

Root-level scripts:

```powershell
npm run mytuskers:build
npm run mytuskers:api:smoke
npm run mytuskers:api:test
npm run mytuskers:e2e
npm run mytuskers:verify
```

Note: the API package has `test:integration`, not a plain `test` script.

## Production Deployment

Terraform is run through Docker using AWS profile `tpl`.

Build web:

```powershell
npm run build -w @wyndham-tuskers/mytuskers-web
```

Package API Lambda:

```powershell
docker compose -f docker-compose.deploy.yml run --rm node "apk add --no-cache zip >/dev/null && rm -rf /tmp/mytuskers-api-lambda /workspace/build/mytuskers-api-lambda.zip && mkdir -p /tmp/mytuskers-api-lambda /workspace/build && cp /workspace/apps/mytuskers-api/package*.json /tmp/mytuskers-api-lambda/ && cd /tmp/mytuskers-api-lambda && npm ci --omit=dev && rm -rf node_modules/wyndham-tuskers && cp -R /workspace/apps/mytuskers-api/src /tmp/mytuskers-api-lambda/src && zip -qr /workspace/build/mytuskers-api-lambda.zip ."
```

Important packaging gotcha:

- `node_modules/wyndham-tuskers` can be a workspace symlink back to the repo root.
- If it is not removed before zipping, the Lambda zip can recurse into the workspace and hang or become huge.
- Always remove `node_modules/wyndham-tuskers` in the Lambda packaging step unless the API starts importing from it.

Plan/apply:

```powershell
$repo = (Resolve-Path .).Path
$aws = Join-Path $env:USERPROFILE '.aws'
docker run --rm --entrypoint sh -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v "${aws}:/root/.aws:ro" -v "${repo}:/workspace" -w /workspace/infra/terraform-mytuskers hashicorp/terraform:1.9.8 -c "terraform plan -var-file=domain.tfvars -out=/workspace/build/mytuskers-prod.tfplan"
docker run --rm --entrypoint sh -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v "${aws}:/root/.aws:ro" -v "${repo}:/workspace" -w /workspace/infra/terraform-mytuskers hashicorp/terraform:1.9.8 -c "terraform apply -auto-approve /workspace/build/mytuskers-prod.tfplan"
```

CloudFront invalidation:

```powershell
$aws = Join-Path $env:USERPROFILE '.aws'
docker run --rm -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v "${aws}:/root/.aws:ro" amazon/aws-cli:2.17.61 cloudfront create-invalidation --distribution-id E1WZY9NATJY2FU --paths "/*"
docker run --rm -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v "${aws}:/root/.aws:ro" amazon/aws-cli:2.17.61 cloudfront wait invalidation-completed --distribution-id E1WZY9NATJY2FU --id <INVALIDATION_ID>
```

Prod smoke checks:

```powershell
Invoke-WebRequest -UseBasicParsing https://mytuskers.wyndhamtuskers.com/
Invoke-WebRequest -UseBasicParsing https://mytuskers.wyndhamtuskers.com/health
```

For frontend-only changes, expected Terraform plan is usually:

- create new hashed JS/CSS assets,
- destroy old hashed JS/CSS assets,
- update `index.html`.

For API changes, expected Terraform plan should also update `aws_lambda_function.api.source_code_hash`.

## Secrets And Sensitive Files

Do not commit or paste secrets:

- Resend API key.
- VAPID private key.
- Admin password hash source values.
- AWS credentials/profile files.
- `domain.tfvars` if it contains live secret values.

When documenting commands, use placeholders for secrets.

## Known Operational Notes

- API Gateway access logs are not currently the primary debugging path. Use Lambda CloudWatch logs and DynamoDB/audit table scans when investigating production behavior.
- Successful API requests may not show useful logs unless the code explicitly audits/logs them.
- Local integration tests can create temporary appreciation/feed rows in LocalStack. Clean them if they clutter local test data.
- Browser/PWA behavior differs by platform:
  - iOS PWA install prompt cannot be triggered like Android Chrome.
  - Web Share with files behaves inconsistently across iOS/browser contexts.
  - Android calendar integration works better with Google Calendar links.

## Recent Feature Decisions

- Feed is a first-class bottom tab, not a home-page section.
- Home remains focused on wallet, next match, availability prompts, and pending expenses.
- Feed posts no longer require selecting a teammate.
- `@` mention in the post body opens a teammate picker.
- Only one latest comment is shown on each feed card; full comments are in the post popup.
- Feed supports pull-to-refresh.
- Comment send button is black when enabled and muted when disabled.
- Post composer button and modal use the simple label `Post`.

