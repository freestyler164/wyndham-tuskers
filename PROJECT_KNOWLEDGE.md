# Wyndham Tuskers Project Knowledge

This file captures working knowledge about the Wyndham Tuskers codebase, local environment, production deployment, and major product features. It is intended as a handoff/reference document for future development sessions.

## Project Summary

Wyndham Tuskers is a full-stack community club platform for the Wyndham Tuskers Malayalam community in Wyndham, Melbourne.

The site supports:

- Public club website with home, about, gallery, club news, marketplace, Onam Art, and Onam 2026 schedule pages.
- Anonymous/public forms for club surveys and event registrations.
- Admin portal for forms, survey analytics, member registration approvals, members, marketplace, news, painting competition, guest access, and Onam schedule management.
- Short-lived guest users with scoped admin access for limited workflows such as painting judging and Onam schedule operation.
- Local development using Docker Compose and LocalStack.
- Production deployment on AWS serverless infrastructure.

## Technology Stack

- Frontend: React + Vite.
- Backend: Node.js + Express.
- Database: DynamoDB.
- Object storage: S3 for frontend assets and private uploaded assets.
- Local AWS emulation: LocalStack Pro.
- Email: Resend in production, LocalStack/console preview locally.
- Production frontend hosting: Private S3 bucket behind CloudFront.
- Production API: API Gateway HTTP API + Lambda wrapping the Express app.
- Secrets: AWS Secrets Manager.
- Infrastructure: Terraform, driven through Docker Compose helpers.

## Repository Layout

- `frontend/`: main public/admin React app.
- `backend/`: Express API, Lambda entrypoint, route modules, seed/import scripts.
- `infra/terraform-pilot/`: current production serverless stack for `wyndhamtuskers.com`.
- `infra/terraform/`: legacy ECS stack. It has been decommissioned; do not use unless intentionally recreating the old stack.
- `infra/terraform-mytuskers/`: infrastructure work for the newer MyTuskers app area.
- `apps/mytuskers-api/`, `apps/mytuskers-web/`, `packages/mytuskers-contracts/`: separate MyTuskers workspace packages.
- `local/localstack-init/`: LocalStack initialization scripts.
- `docs/`: design notes, PRPs, email prototypes, and feature docs.
- `onam.json`: reusable Onam survey/form JSON.
- `Tuskers Members.xlsx`: source spreadsheet used/planned for member imports.

## Local Development

Primary local stack is Docker Compose:

```powershell
docker compose up -d --build
```

Local service URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- LocalStack: `http://localhost:4566`
- MyTuskers API: `http://localhost:4100`
- MyTuskers Web: `http://localhost:3100`

Local environment file:

- `.env.localstack`
- Example: `.env.localstack.example`

Important local backend env vars are configured in `docker-compose.yml`, including:

- `USERS_TABLE=members`
- `TOKENS_TABLE=password_reset_tokens`
- `SURVEYS_TABLE=surveys`
- `RESPONSES_TABLE=survey_responses`
- `EVENTS_TABLE=events`
- `NEWS_TABLE=news_posts`
- `MARKETPLACE_TABLE=marketplace`
- `SETTINGS_TABLE=settings`
- `PAINTING_COMPETITION_TABLE=painting_competition`
- `PAINTING_SUBMISSIONS_TABLE=painting_submissions`
- `ONAM_SCHEDULE_TABLE=onam_schedule`
- `PAINTING_ASSETS_BUCKET=wt-local-painting-assets`
- `MARKETPLACE_ASSETS_BUCKET=wt-local-marketplace-assets`
- `ONAM_SCHEDULE_ASSETS_BUCKET=wt-local-onam-schedule-assets`

Local member registration is controlled by the runtime setting in the settings table and by the local env default. Historically `ENABLE_MEMBER_REGISTRATION=false` was used for first release, but the admin console now has controls to enable/disable public applications.

## Production Deployment

The current production stack is the serverless Terraform stack in:

```text
infra/terraform-pilot
```

Production URLs:

- Main: `https://wyndhamtuskers.com`
- Alias/troubleshooting: `https://pilot.wyndhamtuskers.com`

Known production AWS details:

- AWS account: `654654635402`
- Region: `ap-southeast-2`
- AWS profile commonly used locally: `tpl`
- CloudFront distribution: `E1D9FTGN0M5HRU`
- Backend Lambda: `wyndham-tuskers-pilot-backend`

Deployment helpers use:

```powershell
docker-compose.deploy.yml
```

Typical deploy flow:

```powershell
$env:AWS_PROFILE = "tpl"
$env:AWS_REGION = "ap-southeast-2"

docker compose -f docker-compose.deploy.yml run --rm awscli sts get-caller-identity

docker compose -f docker-compose.deploy.yml run --rm node "rm -rf /tmp/frontend-build /workspace/frontend/dist && mkdir -p /tmp/frontend-build && cp /workspace/frontend/package*.json /tmp/frontend-build/ && cp /workspace/frontend/index.html /tmp/frontend-build/ && cp /workspace/frontend/vite.config.* /tmp/frontend-build/ 2>/dev/null || true && cp -R /workspace/frontend/src /tmp/frontend-build/src && cd /tmp/frontend-build && npm ci && npm run build && cp -R dist /workspace/frontend/dist"

docker compose -f docker-compose.deploy.yml run --rm node "apk add --no-cache zip >/dev/null && rm -rf /tmp/backend-lambda /workspace/build/backend-lambda.zip && mkdir -p /tmp/backend-lambda /workspace/build && cp /workspace/backend/package*.json /tmp/backend-lambda/ && cd /tmp/backend-lambda && npm ci --omit=dev && cp -R /workspace/backend/src /tmp/backend-lambda/src && zip -qr /workspace/build/backend-lambda.zip ."

docker compose -f docker-compose.deploy.yml run --rm terraform-pilot plan '-var-file=pilot.tfvars'
docker compose -f docker-compose.deploy.yml run --rm terraform-pilot apply -auto-approve '-var-file=pilot.tfvars'

docker compose -f docker-compose.deploy.yml run --rm awscli cloudfront create-invalidation --distribution-id E1D9FTGN0M5HRU --paths '/*'
```

After creating an invalidation, wait for completion:

```powershell
docker compose -f docker-compose.deploy.yml run --rm awscli cloudfront wait invalidation-completed --distribution-id E1D9FTGN0M5HRU --id <INVALIDATION_ID>
```

Production smoke checks:

```powershell
Invoke-WebRequest -UseBasicParsing https://wyndhamtuskers.com/ | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest -UseBasicParsing https://wyndhamtuskers.com/health | Select-Object -ExpandProperty Content
```

## Production Architecture

Current stack:

- CloudFront distribution in front of static frontend and API routes.
- Private S3 bucket for frontend build output.
- API Gateway HTTP API routing `/api/*` and `/health` to Lambda.
- Lambda runs the existing Express app through `serverless-http`.
- DynamoDB tables have point-in-time recovery enabled.
- JWT secret and Resend API key are stored in AWS Secrets Manager.
- Route53 hosts `wyndhamtuskers.com` and `pilot.wyndhamtuskers.com` aliases.
- ACM certificate for CloudFront is in `us-east-1`.

This serverless stack intentionally has no ECS, ECR, ALB, NAT Gateway, or public database.

## Main DynamoDB Tables

Current app tables include:

- `members`: admin, member, guest, and pending registration records.
- `password_reset_tokens`: password reset and member welcome/setup tokens.
- `surveys`: survey/form definitions.
- `survey_responses`: survey/form responses.
- `events`: generic upcoming events.
- `news`: club news/blog posts.
- `marketplace`: member marketplace businesses.
- `settings`: feature/runtime settings such as member registration open/closed.
- `painting_competition`: painting competition config and templates.
- `painting_submissions`: private submitted paintings metadata.
- `onam_schedule`: Onam 2026 live schedule config and rows.

Production table names are output by Terraform in `infra/terraform-pilot`.

## Authentication And Roles

Auth is email/password with JWT tokens.

Main roles:

- `admin`: full admin portal access.
- `member`: future/regular member login path.
- `guest`: short-lived scoped access for specific admin functions.

Guest scopes currently include:

- `painting:judge`
- `onam-schedule:manage`

Guest users can be created and managed through the admin guest access page. They should not be able to manage other guests or access unrelated admin areas.

Admin passwords are bcrypt-hashed. Strong password requirements are enforced for admin creation. Missing `passwordHash` users should receive friendly login guidance to use welcome/setup or forgot-password flows rather than causing bcrypt errors.

## Email

Production email uses Resend.

Local email uses LocalStack/console preview. If LocalStack SES does not accept an email, the backend can print a local preview to logs.

Secrets are not committed:

- JWT secret is in Secrets Manager.
- Resend API key is in Secrets Manager.
- Local `.env.localstack` can contain local-only values and should remain ignored.

## Security Baseline

Important security expectations:

- No admin/test credentials committed.
- No API keys committed.
- Production HTTPS only.
- CORS restricted to production domains.
- DynamoDB is private behind Lambda IAM permissions.
- Uploaded private painting assets are read only through authenticated admin/judge endpoints.
- Login and password reset endpoints are rate limited.
- Painting submissions are rate limited.
- Upload validation is server-side, not only frontend-side.
- Uploaded PDFs are checked for active content indicators before accepting as painting templates.
- Uploaded artwork is content-sniffed and validated before storage.

## Public Website Features

Pages/routes include:

- `/`: home page.
- `/club-news`: club news/blog list and article view.
- `/member-marketplace`: member business directory.
- `/onam-painting-competition`: Onam Art / kids painting competition page.
- `/onam-2026`: Onam 2026 live schedule page, shown in nav only when published.
- `/gallery`: gallery sourced from gallery assets.
- `/about`: about/community content.
- `/login`: login page.
- `/register`: hidden/member registration test route depending on settings.
- `/reset-password`: password reset/member access setup.

Design direction:

- Warm off-white background.
- Soft charcoal foreground.
- Terracotta/orange accent.
- Cream panels and subtle shadows.
- Montserrat primary font.
- Modern rounded UI, avoiding heavy borders and nested boxy layouts.

## Forms And Surveys

Surveys support:

- Anonymous public response submission.
- Admin-created forms.
- JSON import for survey creation.
- Conditional rendering via `visibleWhen`.
- Required fields.
- Content-only text blocks.
- Form accent images.
- Analysis modes such as none, count, list, and sum.
- Calculated amount questions using generic tier rules.
- Duplicate response prevention using configured field IDs, such as mobile number for Onam.
- Full response viewing.
- CSV export.
- Response deletion from analytics/full-response views.

The Onam survey in `onam.json` currently includes:

- Event detail content.
- Name.
- Mobile number.
- Attendance choice.
- Adult/kids counts.
- Bank/payment details.
- Calculated contribution based on adults only.
- Contribution acknowledgement.
- Program/team/organising/MC interest questions.
- Conditional not-attending reason and thank-you content.

Current Onam contribution logic:

- 1 adult: AUD 40.
- 2-3 adults: AUD 80.
- 4+ adults: AUD 100.
- Kids counts are not included in contribution calculation.

## Member Registration

Public member application form includes fields aligned to the members table:

- Name.
- Suburb.
- Postcode.
- Email.
- Mobile.
- Family counts.
- Games interested, multiple choice.
- Referral/how did you hear about us.
- Applied before checkbox.
- Indoor games subscription interest/current subscription.
- Onam participation/updates interest.
- Mandatory membership disclaimer.

Duplicate mobile checks are implemented for member registration.

Admin portal has:

- Pending registrations table.
- Details popup.
- Approve/reject actions.
- Delete option.
- Export CSV for pending registrations and members.
- Full-screen pending registrations layout.

Approving a registration should create/update an active member record and send/trigger member approval email where configured.

## Members And Imports

There is a PRP for importing existing members from `Tuskers Members.xlsx`:

- Phase 1 imports current renewed members only.
- Later phase can send welcome/setup emails.
- Member records preserve existing admin/password fields.
- No password should be created from import.

Admin members page has search, pagination, and CSV export.

## Club News

Club News is a blog-style feature:

- Public list and article detail layout.
- Admin management page.
- Cover photo and supporting photos.
- Sample/news seed for Tuskers Volleyball Championship 2026.
- Article view count tracking.

## Member Marketplace

Member Marketplace showcases member/family businesses.

Public page supports:

- Responsive cards.
- Category filter.
- Search.
- Featured listings.
- Detail page/modal style with full description, services, contact details, gallery/menu PDF where applicable.
- Call and WhatsApp actions.

Admin can:

- Add/edit/delete business.
- Mark featured/active.
- Upload logo/banner/gallery.
- Assign category.

Known seeded marketplace entries include:

- Sinis kitchen.
- Aussie Werribee - Naga Tapasvee Oggu.
- Curry Leaf by Lakshmi, with PDF menu.
- Reliance Manor Lakes / Reliance Real Estate.

Sponsor data is separate from marketplace data and lives in `frontend/src/data/sponsors.js`.

## Sponsors

Sponsor cards are used on:

- Home page sponsor carousel.
- Onam Art / Painting page sponsor section.

Current sponsor data source:

```text
frontend/src/data/sponsors.js
```

Known sponsor entries:

- Maxlend: Platinum sponsor, `/static/logos/maxlend_logo.jpeg`.
- HQRealtors: Silver sponsor, `/static/logos/hqr-logo.jpeg`.
- Eco Loans: Silver sponsor, `/static/logos/eco_loans.jpg`.
- Reliance Real Estate: Gold sponsor, `/static/logos/reliance_logo.jpg`.

The Onam Art page uses the static sponsor grid style; the home page uses a carousel.

## Onam Art / Painting Competition

Public route:

```text
/onam-painting-competition
```

Admin route:

```text
/admin/painting-competition
```

Features:

- Admin-controlled competition status.
- Public instructions.
- Under-5 template download.
- Public painting submission popup.
- Private S3-backed artwork uploads.
- Admin/judge review page.
- Guest judging access via `painting:judge`.
- Judge status updates and private notes.
- Delete submissions.
- Download submitted artwork.
- Rotate preview left/right/reset in judging modal.
- Larger desktop judging modal for image review.

Age groups:

- `<5 years`: colouring using provided template.
- `5-7 years`: drawing and painting, or pencil sketch.
- `8-10 years`: drawing and painting, or pencil sketch.
- `11-14 years`: drawing and painting, or pencil sketch.

Upload support:

- Public form accepts JPG, PNG, HEIC, and HEIF up to 4 MB.
- Backend validates real file type.
- HEIC/HEIF files are converted server-side to JPEG before storing.
- Stored judge/download artifact is browser-viewable JPEG.
- Original HEIC file name and size are stored in metadata.

Known production verification:

- `IMG_3712.HEIC` was tested successfully in production.
- Test submission was deleted afterwards.

## Onam 2026 Live Schedule

Public route:

```text
/onam-2026
```

Admin route:

```text
/admin/onam-schedule
```

Features:

- Admin-configurable hero/header content.
- Optional banner image upload.
- Event date, venue, status.
- Schedule item list with time, title, location, status, published toggle, and ordering.
- Publish/unpublish.
- Start event and complete event workflow.
- Completing the event removes/hides the public view.
- Guest manager access via `onam-schedule:manage`.
- Public nav item appears only when schedule is published and public.
- Home page "What's new" tile can switch to "Live Onam updates" when schedule is published.

Status values:

- `upcoming`
- `live`
- `completed`

Schedule row statuses:

- Upcoming.
- Live Now.
- Completed.

## Logo And Static Assets

Current main website logo:

```text
frontend/src/public/static/logos/wt_logo.png
```

Old/cricket logo retained as:

```text
frontend/src/public/static/logos/cricket_logo.png
```

Static assets used by the built frontend are copied/deployed from `frontend/src/public/static`.

## Common Gotchas

- PowerShell JSON quoting often breaks AWS CLI commands. Prefer writing temp JSON files and using `file:///workspace/...` inside Docker.
- Terraform S3 object diff often shows `static/photos/home/onam-celebrations.MOV` changes; this has recurred during deploys.
- Terraform marketplace seed items do not always update live edited marketplace records. For live data fixes, update DynamoDB item directly and then invalidate CloudFront if needed.
- Frontend `npm ci` inside Docker may hit Windows-mounted `node_modules` I/O issues. The deploy build copies source to `/tmp/frontend-build` to avoid this.
- The frontend npm audit currently reports high-severity findings. Backend audit was clean after adding HEIC conversion.
- CloudFront invalidation is required after frontend deployments.
- Lambda package must be rebuilt whenever backend code or backend dependencies change.
- Avoid committing `.env.localstack`, `backend.hcl`, `pilot.tfvars`, API keys, admin passwords, or generated credentials.

## Useful Commands

Check AWS identity:

```powershell
$env:AWS_PROFILE = "tpl"
$env:AWS_REGION = "ap-southeast-2"
docker compose -f docker-compose.deploy.yml run --rm awscli sts get-caller-identity
```

Frontend local build:

```powershell
npm run build
```

Backend syntax check example:

```powershell
node --check backend/src/routes/paintingCompetition.js
```

Create a guest user locally/through env-driven script:

```powershell
cd backend
npm run create:guest
```

Create/seed admin:

```powershell
cd backend
npm run seed:admin
```

## Current Operational Stance

- Treat `infra/terraform-pilot` as the live production stack.
- Treat `infra/terraform` as legacy/decommissioned unless explicitly asked.
- Use Dockerized deploy tooling rather than relying on local Terraform/AWS CLI installs.
- Use LocalStack for local DynamoDB/S3/SES-style testing.
- Keep production data changes explicit and verify with smoke checks.
- Do not revert unrelated dirty worktree changes.
