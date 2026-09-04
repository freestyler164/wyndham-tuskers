# MyTuskers Terraform

This stack deploys the MyTuskers PWA separately from the public Wyndham Tuskers website.

It creates:

- S3 + CloudFront for `apps/mytuskers-web`
- API Gateway HTTP API + Lambda for `apps/mytuskers-api`
- Email/password auth in the MyTuskers API, with Resend for verification and password reset emails
- DynamoDB tables for core, finance, and audit data
- Private S3 bucket for receipt assets
- Optional ACM certificate and Route53 records for a custom domain

## Build Artifacts

From the repository root:

```powershell
npm install
npm run build -w @wyndham-tuskers/mytuskers-web

Remove-Item -Recurse -Force build/mytuskers-api-lambda-src -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force build/mytuskers-api-lambda-src
Copy-Item apps/mytuskers-api/src build/mytuskers-api-lambda-src/src -Recurse
Copy-Item apps/mytuskers-api/package.json build/mytuskers-api-lambda-src/package.json
Copy-Item apps/mytuskers-api/package-lock.json build/mytuskers-api-lambda-src/package-lock.json
Push-Location build/mytuskers-api-lambda-src
npm ci --omit=dev
Compress-Archive -Path * -DestinationPath ../mytuskers-api-lambda.zip -Force
Pop-Location
```

The web build defaults to same-origin API calls in production, so CloudFront routes `/v1/*` and `/health` to the API.

## Plan

```powershell
cd infra/terraform-mytuskers
Copy-Item mytuskers.tfvars.example mytuskers.tfvars
docker run --rm -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v ${env:USERPROFILE}\.aws:/root/.aws:ro -v ${PWD}\..\..:/workspace -w /workspace/infra/terraform-mytuskers hashicorp/terraform:1.9.8 init -reconfigure -backend-config backend.example.hcl
docker run --rm -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v ${env:USERPROFILE}\.aws:/root/.aws:ro -v ${PWD}\..\..:/workspace -w /workspace/infra/terraform-mytuskers hashicorp/terraform:1.9.8 plan -var-file mytuskers.tfvars
```

Set `domain_name = ""` and `create_dns_records = false` in `mytuskers.tfvars` to deploy on the CloudFront default hostname first.

Set `resend_api_key` and `email_from` to enable real account emails. If `resend_api_key` is empty, the API logs email links instead of sending them.

## Apply

```powershell
docker run --rm -e AWS_PROFILE=tpl -e AWS_SDK_LOAD_CONFIG=1 -v ${env:USERPROFILE}\.aws:/root/.aws:ro -v ${PWD}\..\..:/workspace -w /workspace/infra/terraform-mytuskers hashicorp/terraform:1.9.8 apply -var-file mytuskers.tfvars
```
