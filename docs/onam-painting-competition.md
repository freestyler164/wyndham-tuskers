# Onam 2026 Painting Competition

## Public Flow

1. Open `/onam-painting-competition`.
2. Under-5 participants download and colour the published template.
3. Participants aged 5-14 create an original drawing, painting or pencil sketch.
4. Select `Submit a painting` and enter the child name, parent or guardian name and age group.
5. Upload a clear image of the finished painting and accept the guardian consent statement.
6. After submission, the dialog closes and a confirmation with the submission reference appears at the top of the page.

Artwork submissions accept only validated JPG or PNG files up to 4 MB.

## Admin Flow

Open `/admin/painting-competition` as an administrator.

- Set the competition to `Draft`, `Open for entries` or `Closed`.
- Edit the title, event date, venue, painting instructions and consent statement.
- Upload PDF colouring templates for the Under 5 group.
- Publish or hide individual templates.
- Search submissions, preview private artwork and set judging status.
- Store private judging notes or delete an entry and its artwork.

The four submission groups are `Under 5`, `5-7`, `7-10` and `11-14`. Only the Under 5 group requires a published template.

## Security

- Submitted artwork is stored in a dedicated private S3 bucket.
- The bucket blocks all public access and is not attached to CloudFront.
- Artwork is returned only through an admin-authenticated API.
- Uploads are restricted to JPG and PNG using file signatures, not extensions.
- Image dimensions and file size are validated.
- Object keys are random UUIDs and do not contain participant names.
- Production uploads record their S3 version IDs so admin deletion removes the exact stored object version.
- Template PDFs reject common active-content features including JavaScript, launch actions and embedded files.
- Public submissions are rate limited.
- Parent and child details are stored only in the submissions table and are never returned by public APIs.

## Local Testing

```powershell
docker compose up -d --build
```

Open:

- Public: `http://localhost:3000/onam-painting-competition`
- Admin: `http://localhost:3000/admin/painting-competition`

LocalStack tables:

- `painting_competition`
- `painting_submissions`

LocalStack private bucket:

- `wt-local-painting-assets`
