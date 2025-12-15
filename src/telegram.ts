import axios from "axios";

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
};

type TelegramApiResponse<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };

export type TelegramClient = {
  sendMessage(args: { chatId: number; text: string; replyToMessageId?: number }): Promise<void>;
  getUpdates(args: { offset?: number; limit?: number; allowedUpdates?: string[] }): Promise<TelegramUpdate[]>;
  getFile(args: { fileId: string }): Promise<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>;
  getFileUrl(args: { filePath: string }): string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function createTelegramClient(): TelegramClient {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const baseURL = `https://api.telegram.org/bot${token}`;

  const http = axios.create({
    baseURL,
    timeout: 20_000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  async function call<T>(method: string, data?: unknown): Promise<T> {
    const res = await http.post<TelegramApiResponse<T>>(`/${method}`, data ?? {});
    if (!res.data || res.data.ok !== true) {
      const description = res.data && "description" in res.data ? res.data.description : undefined;
      throw new Error(`Telegram API error calling ${method}: ${description ?? `HTTP ${res.status}`}`);
    }
    return res.data.result;
  }

  return {
    async sendMessage({ chatId, text, replyToMessageId }) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true,
        disable_web_page_preview: true,
      });
    },

    async getUpdates({ offset, limit, allowedUpdates }) {
      return call("getUpdates", {
        offset,
        limit,
        allowed_updates: allowedUpdates,
      });
    },

    async getFile({ fileId }) {
      return call("getFile", { file_id: fileId });
    },

    getFileUrl({ filePath }) {
      return `https://api.telegram.org/file/bot${token}/${filePath}`;
    },
  };
}

