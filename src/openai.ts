import OpenAI from "openai";

import type { ChatTurn } from "./chatContext.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export type VisionInput = { imageUrl: string; text?: string };

export type GenerateReplyArgs = {
  systemPrompt?: string;
  context: ChatTurn[];
  userText: string;
  vision?: VisionInput;
};

export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const input: OpenAI.Responses.ResponseInputItem[] = [];

  if (args.systemPrompt) {
    input.push({
      role: "system",
      content: [{ type: "input_text", text: args.systemPrompt }],
    });
  }

  for (const turn of args.context) {
    input.push({
      role: turn.role,
      content: [{ type: "input_text", text: turn.text }],
    });
  }

  const userParts: Array<OpenAI.Responses.ResponseInputText | OpenAI.Responses.ResponseInputImage> = [];
  if (args.vision) {
    if (args.vision.text?.trim()) userParts.push({ type: "input_text", text: args.vision.text.trim() });
    userParts.push({ type: "input_image", image_url: args.vision.imageUrl, detail: "auto" });
    if (args.userText.trim()) userParts.push({ type: "input_text", text: args.userText.trim() });
  } else {
    userParts.push({ type: "input_text", text: args.userText });
  }

  input.push({ role: "user", content: userParts });

  const resp = await client.responses.create({
    model: "gpt-4o-mini",
    input,
  });

  const text = resp.output_text?.trim();
  if (!text) return "Sorry—I'm not sure how to respond.";
  return text;
}
