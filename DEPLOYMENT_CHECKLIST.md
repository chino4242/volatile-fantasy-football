# Deployment Checklist

Follow these steps to deploy the automated ingestion system to production.

## 1. Generate CRON_SECRET

Generate a secure random secret:

```bash
openssl rand -base64 32
```

Copy the output - you'll need it in step 3.

## 2. Commit and Push Changes

```bash
git add .
git commit -m "Add automated daily player ingestion via Vercel Cron"
git push origin main
```

Vercel will automatically deploy the changes.

## 3. Add Environment Variable

In Vercel Dashboard:

1. Go to your project → Settings → Environment Variables
2. Add new variable:
   - **Name:** `CRON_SECRET`
   - **Value:** (paste the secret from step 1)
   - **Environments:** Production, Preview, Development
3. Click "Save"

## 4. Redeploy

After adding the environment variable:

1. Go to Deployments tab
2. Click the three dots on the latest deployment
3. Select "Redeploy"
4. Check "Use existing Build Cache"
5. Click "Redeploy"

This ensures the new environment variable is available to the cron job.

## 5. Verify Cron Job

Wait until 6:00 AM UTC (or trigger manually):

```bash
# Manual trigger to test immediately
curl -X POST https://volatile-fantasy-football.vercel.app/api/ingest
```

Check the response:
```json
{
  "success": true,
  "message": "Player data ingested successfully",
  "timestamp": "2026-03-10T15:47:00.000Z"
}
```

## 6. Monitor Execution

In Vercel Dashboard:

1. Go to Deployments → Functions
2. Filter by `/api/cron/ingest-players`
3. Check logs for successful execution at 6:00 AM UTC daily

## Troubleshooting

### "Unauthorized" error on cron endpoint

- Verify `CRON_SECRET` is set in Vercel environment variables
- Redeploy after adding the variable

### Cron job not running

- Check `vercel.json` is in the repository root
- Verify the file was included in the deployment
- Cron jobs only run on Production deployments, not Preview

### Database connection errors

- Verify `DATABASE_URL` is set correctly
- Check Supabase connection pooler is enabled
- Ensure `?sslmode=require` is in the connection string

## Next Steps

After successful deployment:

1. Monitor the first few automatic runs
2. Check data freshness on the site after 6:00 AM UTC
3. Set up alerts (optional) for failed ingestions
4. Consider adding a "Last Updated" timestamp to the UI

## Rollback

If you need to disable automatic ingestion:

1. Remove the `crons` section from `vercel.json`
2. Commit and push
3. Vercel will stop scheduling the cron job

Manual ingestion will still work via:
- `/api/ingest` endpoint
- `npx tsx scripts/ingest-players.ts` locally
