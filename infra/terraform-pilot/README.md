# Wyndham Tuskers Serverless Deploy

This stack serves the production site at `https://wyndhamtuskers.com`.

`https://pilot.wyndhamtuskers.com` is kept as an alias on the same CloudFront distribution for validation and troubleshooting.

## Architecture

- Frontend: Vite build in a private S3 bucket
- CDN/TLS: CloudFront with an ACM certificate in `us-east-1`
- API: API Gateway HTTP API + Lambda running the existing Express app
- Database: DynamoDB tables with point-in-time recovery enabled
- Secrets: AWS Secrets Manager for JWT signing secret and Resend API key
- Email: Resend in production, LocalStack SES/console preview in local dev
- Domain: Route53 alias records for `wyndhamtuskers.com` and `pilot.wyndhamtuskers.com`

There is no ECS, ECR, ALB, NAT Gateway, or public database in this stack.

## 1. AWS Login

Use the existing Dockerized AWS CLI/Terraform helpers:

```powershell
$env:AWS_PROFILE = "tpl"
$env:AWS_REGION = "ap-southeast-2"

docker compose -f docker-compose.deploy.yml run --rm awscli sts get-caller-identity
```

## 2. Configure Local Terraform Files

Create ignored local config from the examples:

```powershell
Copy-Item infra\terraform-pilot\backend.example.hcl infra\terraform-pilot\backend.hcl
Copy-Item infra\terraform-pilot\pilot.tfvars.example infra\terraform-pilot\pilot.tfvars
```

The current deployed serverless stack uses this state key:

```hcl
key = "wyndham-tuskers/pilot-serverless/terraform.tfstate"
```

Do not reuse the old ECS production state key. The old ECS stack has been decommissioned and its state is empty.

## 3. Build Deploy Assets

Build the frontend and Lambda zip with Docker:

```powershell
docker compose -f docker-compose.deploy.yml run --rm node "rm -rf /tmp/frontend-build /workspace/frontend/dist && mkdir -p /tmp/frontend-build && cp /workspace/frontend/package*.json /tmp/frontend-build/ && cp /workspace/frontend/index.html /tmp/frontend-build/ && cp /workspace/frontend/vite.config.* /tmp/frontend-build/ 2>/dev/null || true && cp -R /workspace/frontend/src /tmp/frontend-build/src && cd /tmp/frontend-build && npm ci && npm run build && cp -R dist /workspace/frontend/dist"

docker compose -f docker-compose.deploy.yml run --rm node "apk add --no-cache zip >/dev/null && rm -rf /tmp/backend-lambda /workspace/build/backend-lambda.zip && mkdir -p /tmp/backend-lambda /workspace/build && cp /workspace/backend/package*.json /tmp/backend-lambda/ && cd /tmp/backend-lambda && npm ci --omit=dev && cp -R /workspace/backend/src /tmp/backend-lambda/src && zip -qr /workspace/build/backend-lambda.zip ."
```

Or run:

```powershell
make build-pilot-assets
```

## 4. Resend Secret

Update the generated Secrets Manager secret after apply. Terraform intentionally ignores future changes to the secret value so applies do not overwrite the production key with a placeholder.

PowerShell example:

```powershell
$SECRET_ID = docker compose -f docker-compose.deploy.yml run --rm terraform-pilot output -raw resend_api_key_secret_id
$RESEND_API_KEY = Read-Host "Resend API key"

docker compose -f docker-compose.deploy.yml run --rm `
  -e SECRET_ID=$SECRET_ID `
  -e RESEND_API_KEY=$RESEND_API_KEY `
  --entrypoint sh awscli `
  -lc 'aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "$RESEND_API_KEY" --region ap-southeast-2'
```

The secret is stored in AWS Secrets Manager and the Lambda reads it at runtime. Do not commit API keys or admin passwords.

## 5. Terraform Init/Apply

```powershell
docker compose -f docker-compose.deploy.yml run --rm terraform-pilot init -reconfigure '-backend-config=backend.hcl'

docker compose -f docker-compose.deploy.yml run --rm terraform-pilot plan '-var-file=pilot.tfvars'

docker compose -f docker-compose.deploy.yml run --rm terraform-pilot apply '-var-file=pilot.tfvars'
```

Terraform creates:

- `wyndhamtuskers.com` and `pilot.wyndhamtuskers.com` A/AAAA records pointing to CloudFront
- CloudFront certificate DNS validation records
- Private frontend S3 bucket
- API Gateway + Lambda backend
- DynamoDB tables with PITR
- JWT and Resend Secrets Manager secrets

## 6. Create the First Admin

After apply, create the first admin with a strong password. The password must be at least 12 characters and include uppercase, lowercase, and a number.

```powershell
$TABLES_JSON = docker compose -f docker-compose.deploy.yml run --rm terraform-pilot output -json dynamodb_tables
$MEMBERS_TABLE = ($TABLES_JSON | ConvertFrom-Json).members

$env:USERS_TABLE = $MEMBERS_TABLE
$env:ADMIN_EMAIL = "admin@wyndhamtuskers.com"
$env:ADMIN_PASSWORD = Read-Host "Admin password"

docker compose -f docker-compose.deploy.yml run --rm node "cd /workspace/backend && npm ci --omit=dev && node src/seedAdmin.js"
```

Clear the local secret variables afterwards:

```powershell
Remove-Item Env:\ADMIN_PASSWORD
Remove-Item Env:\RESEND_API_KEY
```

## 7. LocalStack Testing

Local dev still uses Docker Compose and LocalStack:

```powershell
Copy-Item .env.localstack.example .env.localstack
notepad .env.localstack
docker compose up -d --build
```

Set these in `.env.localstack` if you want a local seeded admin:

```text
SEED_ADMIN_EMAIL=admin@wyndhamtuskers.local
SEED_ADMIN_PASSWORD=<strong-local-password>
```

Local email uses `EMAIL_PROVIDER=localstack`. If LocalStack SES does not accept the message, the backend prints a local email preview to the container logs.

## 8. Security Checklist

- Admin passwords are bcrypt-hashed with 12 rounds.
- Password reset tokens expire after one hour and the pilot DynamoDB token table has TTL enabled.
- Production JWT secret is generated/stored in Secrets Manager.
- Resend API key is stored in Secrets Manager.
- DynamoDB is accessed through Lambda IAM only; no public database endpoint exists.
- CloudFront redirects viewers to HTTPS.
- Backend rejects non-HTTPS forwarded production traffic.
- CORS is restricted to `https://wyndhamtuskers.com` and `https://pilot.wyndhamtuskers.com`.
- Login/reset endpoints are rate limited.
- Local/test credentials are not committed.
- Dependabot is configured for weekly npm and Terraform dependency updates.

Member login is already compatible with this shape: keep member records in the same `members` table, use `role = "member"` after approval, and protect future member-only APIs with token verification while reserving `requireAdmin` for admin-only routes.

## 9. Old ECS Stack

The old ECS/ALB/ECR/VPC stack under `infra/terraform` has been destroyed. Do not run `terraform apply` from `infra/terraform` unless the intention is to recreate that legacy container stack.
