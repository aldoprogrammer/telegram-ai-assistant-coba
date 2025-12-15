import type { TelegramMessage, TelegramUpdate } from "./telegram";

export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string };

const MAX_PER_CHAT = 20;
const cache = new Map<number, ChatTurn[]>();

function normalizeText(m: TelegramMessage): string | null {
  return (m.text ?? m.caption ?? "").trim() || null;
}

export function rememberIncoming(update: TelegramUpdate): void {
  const m = update.message;
  if (!m) return;
  const text = normalizeText(m);
  if (!text) return;
  const chatId = m.chat.id;
  const turns = cache.get(chatId) ?? [];
  turns.push({ role: "user", text });
  cache.set(chatId, turns.slice(-MAX_PER_CHAT));
}

export function rememberAssistant(chatId: number, text: string): void {
  const turns = cache.get(chatId) ?? [];
  turns.push({ role: "assistant", text });
  cache.set(chatId, turns.slice(-MAX_PER_CHAT));
}

export function getCachedTurns(chatId: number): ChatTurn[] {
  return cache.get(chatId) ?? [];
}
