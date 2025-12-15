import type { IncomingMessage, ServerResponse } from "node:http";

import Fastify from "fastify";

import { getCachedTurns, rememberAssistant, rememberIncoming, type ChatTurn } from "../src/chatContext.js";
import { generateReply } from "../src/openai.js";
import { createTelegramClient, type TelegramMessage, type TelegramUpdate } from "../src/telegram.js";

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
  return sorted.at(-1)?.file_id ?? null;
}

async function fetchLast20FromTelegram(chatId: number): Promise<ChatTurn[]> {
  const telegram = createTelegramClient();
  const updates = await telegram.getUpdates({ limit: 100, allowedUpdates: ["message"] });
  const messages = updates
    .map((u) => u.message)
    .filter((m): m is TelegramMessage => Boolean(m && m.chat?.id === chatId))
    .sort((a, b) => a.date - b.date)
    .slice(-20);

  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const text = pickText(m);
    if (!text) continue;
    const isBot = m.from?.is_bot ?? false;
    turns.push({ role: isBot ? "assistant" : "user", text });
  }
  return turns;
}

const app = Fastify({ logger: true });

app.get("/api/webhook", async () => ({ ok: true }));

app.post<{ Body: TelegramUpdate }>("/api/webhook", async (req, reply) => {
  const expectedSecret = optionalEnv("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = req.headers["x-telegram-bot-api-secret-token"];
    const gotValue = Array.isArray(got) ? got[0] : got;
    if (gotValue !== expectedSecret) return reply.code(401).send({ ok: false });
  }

  const update = req.body;
  if (!update?.message?.chat?.id) return reply.code(200).send({ ok: true });

  const message = update.message;
  const chatId = message.chat.id;
  rememberIncoming(update);

  const userText = pickText(message);
  const photoFileId = pickBestPhotoFileId(message);

  const telegram = createTelegramClient();

  try {
    const [fromTelegram, cached] = await Promise.all([
      fetchLast20FromTelegram(chatId).catch(() => [] as ChatTurn[]),
      Promise.resolve(getCachedTurns(chatId)),
    ]);

    const context = [...fromTelegram, ...cached].slice(-20);

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
      userText: userText ?? "",
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
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit("request", req, res);
}
