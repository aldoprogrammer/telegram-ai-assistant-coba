import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateReply } from '../src/openai';
import { createTelegramClient } from '../src/telegram';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
    console.log("WEBHOOK HIT");
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }
    console.log("BODY:", req.body);

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== secret) {
      return res.status(401).json({ ok: false });
    }
  }

  const update = req.body;
  const message = update?.message;
  if (!message?.chat?.id) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text ?? message.caption ?? '';

  const telegram = createTelegramClient();

const reply = await generateReply({
  userText: text,
  context: [],
});


  await telegram.sendMessage({
    chatId,
    text: reply,
    replyToMessageId: message.message_id,
  });

  return res.status(200).json({ ok: true });
}
