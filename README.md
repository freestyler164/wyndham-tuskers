# Wyndham Tuskers Club Website

A lightweight club platform for Wyndham Tuskers — a Malayalam community sports club. This repository includes:

- Frontend: React + Vite dark-themed landing site
- Backend: Node + Express authentication API
- Local development: Docker Compose with LocalStack for AWS emulation
- Deployment target: AWS ECS / Fargate with DynamoDB and S3

## Getting started

1. Install dependencies:
   - `cd backend && npm install`
   - `cd frontend && npm install`

2. Start local services:
   - `make up`

3. Visit:
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:4000`

## Local AWS emulation

LocalStack is included to emulate DynamoDB, S3, and SES for local testing. The backend connects with `AWS_ENDPOINT=http://localstack:4566`.

## Notes

- Password reset uses email via AWS SES when running in production.
- Auth is email/password with JWT tokens.
- Admin/member roles are supported in the backend schema.
- Production AWS deployment IaC is in `infra/terraform`. See `infra/terraform/README.md` for Dockerized Terraform and Dockerized AWS CLI deployment steps.
