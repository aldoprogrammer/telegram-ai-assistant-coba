import type { IncomingMessage, ServerResponse } from "node:http";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { getCachedTurns, rememberAssistant, rememberIncoming } from "../src/chatContext";
import { generateReply } from "../src/openai";
import { createTelegramClient, type TelegramMessage, type TelegramUpdate } from "../src/telegram";

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function pickText(m: TelegramMessage): string | null {
  return (m.text ?? m.caption ?? "").trim() || null;
}

function pickBestPhotoFileId(m: TelegramMessage): string | null {
  if (!m.photo?.length) return null;
  const sorted = [...m.photo].sort((a, b) => (a.file_size ?? 0) - (b.file_size ?? 0));
  const last = sorted[sorted.length - 1];
  return last ? last.file_id : null;
}

const app = Fastify({ logger: true });

async function health(req: FastifyRequest, reply: FastifyReply) {
  req.log.info({ url: req.url }, "healthcheck hit");
  return reply.code(200).send({ ok: true });
}

app.get("/", health);
app.get("/api/webhook", health);

async function telegramWebhook(req: FastifyRequest<{ Body: TelegramUpdate }>, reply: FastifyReply) {
  req.log.info({ url: req.url }, "webhook hit");

  const expectedSecret = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = req.headers["x-telegram-bot-api-secret-token"];
    const gotValue = Array.isArray(got) ? got[0] : got;
    if (gotValue !== expectedSecret) {
      req.log.warn({ hasSecretHeader: Boolean(gotValue) }, "telegram secret token mismatch");
      return reply.code(401).send({ ok: false });
    }
  }

  const update = req.body;
  const message = update?.message;
  if (!message?.chat?.id) return reply.code(200).send({ ok: true });

  const chatId = message.chat.id;
  const userText = pickText(message) ?? "";
  const photoFileId = pickBestPhotoFileId(message);

  req.log.info(
    { chatId, messageId: message.message_id, hasText: Boolean(userText), hasPhoto: Boolean(photoFileId) },
    "telegram message received",
  );

  const telegram = createTelegramClient();

  try {
    rememberIncoming(update);
    const cached = getCachedTurns(chatId);
    const context = cached.slice(0, -1).slice(-20);

    let vision: { imageUrl: string; text?: string } | undefined;
    if (photoFileId) {
      const file = await telegram.getFile({ fileId: photoFileId });
      if (file.file_path) {
        vision = {
          imageUrl: telegram.getFileUrl({ filePath: file.file_path }),
          ...(message.caption ? { text: message.caption } : {}),
        };
      }
    }

    const replyText = await generateReply({
      systemPrompt: "You are a helpful Telegram AI assistant. Keep replies concise and correct.",
      context,
      userText,
      ...(vision ? { vision } : {}),
    });

    await telegram.sendMessage({ chatId, text: replyText, replyToMessageId: message.message_id });
    rememberAssistant(chatId, replyText);
  } catch (err) {
    req.log.error({ err }, "webhook processing failed");
    try {
      await telegram.sendMessage({
        chatId,
        text: "Sorry—something went wrong. Please try again.",
        replyToMessageId: message.message_id,
      });
    } catch {}
  }

  return reply.code(200).send({ ok: true });
}

app.post("/", telegramWebhook);
app.post("/api/webhook", telegramWebhook);

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}
