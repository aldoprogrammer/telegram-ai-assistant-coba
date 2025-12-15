# Telegram AI Assistant (Fastify + Vercel)

## Environment variables

Create `.env` in the project root:

- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `APP_BASE_URL` (e.g. `https://your-project.vercel.app`)
- `TELEGRAM_WEBHOOK_SECRET` (optional)

## Local run

1. `npm i`
2. `copy .env.example .env` (then fill values)
3. `npm run dev`

Your webhook URL will be `http://localhost:3000/api/webhook`.

## Deploy to Vercel

1. Push to a Git repo
2. Import into Vercel
3. In Vercel Project Settings → General → Node.js Version, select `22.x`
3. Set env vars in Vercel project settings
4. Deploy

Your webhook URL will be `${APP_BASE_URL}/api/webhook`.

## Register Telegram webhook

Replace placeholders and run:

- Set webhook:
  - `curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d "url=$APP_BASE_URL/api/webhook" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"`
- Check webhook:
  - `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"`
- Delete webhook (optional):
  - `curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"`

If you don’t use a secret, omit `secret_token`.

## End-to-end test

1. Deploy to Vercel and confirm `GET $APP_BASE_URL/api/webhook` returns `{"ok":true}`
2. Register the webhook via `setWebhook`
3. Send a message to your bot in Telegram
4. Confirm you get a reply in Telegram
5. Send a photo with a caption; confirm you get a reply that considers the image
