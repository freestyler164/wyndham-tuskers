# MyTuskers Local Assumptions

- Local OTP uses fixed code `123456`.
- Local sessions use a development-only HTTP-only cookie signed by the MyTuskers API.
- Production Cognito, CloudFront, Route53, WAF, and Terraform deployment are intentionally out of this local slice.
- The LocalStack version creates `mytuskers-core`, `mytuskers-finance`, `mytuskers-audit`, and `mytuskers-local-receipts`.
- Seed users:
  - Ravi, multi-team player: `+61400000123`
- Priya, 1st XI captain: `+61400000111`
- Global admin: `+61473623614`
  - Guest/new profile flow: `+61400000444`
- Seed smart invite token: `join-1st-xi-local`
- Whole-team split, approval policy, receipt limits, and production notification defaults remain the PRP recommended MVP defaults until implemented in the finance/notification slices.
