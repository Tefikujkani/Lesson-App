import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

/** Text chat / quiz / text analysis */
export const GROQ_CHAT_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

/** Image / multimodal uploads */
export const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  json?: boolean;
}

function getApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not defined. Add it to frontend/.env (get a free key at https://console.groq.com)."
    );
  }
  return apiKey;
}

/**
 * Call Groq's OpenAI-compatible Chat Completions API.
 */
export async function groqChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model || GROQ_CHAT_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
  };

  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `Groq API error (${response.status})`;
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("Empty response from Groq.");
  }
  return text;
}

/** Pull a JSON object/array out of model output that may include markdown fences. */
export function parseJsonFromModel(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.search(/[\[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON.");
  }
}
