import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

/** Text chat / quiz / text analysis — llama-3.3-70b-versatile shut down for free/dev tiers in Aug 2026 */
export const GROQ_CHAT_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/** Image / multimodal — qwen/qwen3.6-27b shut down Sept 2026 */
export const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

const CHAT_FALLBACKS = [
  GROQ_CHAT_MODEL,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

const VISION_FALLBACKS = [GROQ_VISION_MODEL, "qwen/qwen3.8-27b"];

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
      "GROQ_API_KEY is not defined. Add it to project/.env (get a free key at https://console.groq.com)."
    );
  }
  return apiKey;
}

function unique(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

function messageHasImage(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part.type === "image_url")
  );
}

function stripImages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const omittedImage = m.content.some((part) => part.type === "image_url");
    const text = m.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
    const content = [
      text,
      omittedImage
        ? "[An attached image could not be analyzed. Do not infer its contents.]"
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return { role: m.role, content: content || "(Image omitted.)" } as ChatMessage;
  });
}

function extractMessageText(message: any): string {
  if (!message || typeof message !== "object") return "";

  const fromContent = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            if (typeof part.text === "string") return part.text;
            if (typeof part.content === "string") return part.content;
          }
          return "";
        })
        .join("\n");
    }
    return "";
  };

  let text = fromContent(message.content);
  if (!text.trim() && typeof message.reasoning === "string") {
    text = message.reasoning;
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```thinking[\s\S]*?```/gi, "")
    .trim();
}

function isRetryableModelError(status: number, message: string): boolean {
  if (status === 404 || status === 400 || status === 422) {
    return /model|decommission|deprecat|does not exist|not found|not supported|invalid/i.test(
      message
    );
  }
  return false;
}

async function callGroqOnce(options: ChatCompletionOptions & { model: string }): Promise<string> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_completion_tokens: options.json ? 4096 : 2048,
  };

  if (options.json) {
    body.response_format = { type: "json_object" };
    // JSON mode cannot use reasoning_format=raw; parsed keeps the answer in content.
    body.reasoning_format = "parsed";
  } else {
    body.reasoning_format = "hidden";
  }

  if (options.model.startsWith("qwen/")) {
    body.reasoning_effort = "none";
  } else if (options.model.startsWith("openai/gpt-oss")) {
    body.reasoning_effort = "low";
  }

  const post = (payload: Record<string, unknown>) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

  let payload = body;
  let response: Response;
  let data: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await post(payload);
    data = await response.json().catch(() => ({}));
    if (response.ok) break;

    const errText = String(data?.error?.message || data?.message || "");
    if (
      /reasoning/i.test(errText) &&
      ("reasoning_format" in payload || "reasoning_effort" in payload)
    ) {
      payload = { ...payload };
      delete payload.reasoning_format;
      delete payload.reasoning_effort;
      continue;
    }
    if (
      options.json &&
      /response_format|json_object/i.test(errText) &&
      "response_format" in payload
    ) {
      payload = { ...payload };
      delete payload.response_format;
      continue;
    }
    break;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `Groq API error (${response.status})`;
    const err = new Error(message) as Error & { status?: number; retryable?: boolean };
    err.status = response.status;
    err.retryable = isRetryableModelError(response.status, message);
    throw err;
  }

  const text = extractMessageText(data?.choices?.[0]?.message);
  if (!text) {
    const err = new Error("Empty response from Groq.") as Error & { retryable?: boolean };
    err.retryable = true;
    throw err;
  }
  return text;
}

/**
 * Call Groq's OpenAI-compatible Chat Completions API.
 * Retries on decommissioned / unsupported model IDs.
 */
export async function groqChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const hasImage = messageHasImage(options.messages);
  const preferred = options.model || (hasImage ? GROQ_VISION_MODEL : GROQ_CHAT_MODEL);
  const models = unique([
    preferred,
    ...(hasImage ? VISION_FALLBACKS : CHAT_FALLBACKS),
  ]);

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await callGroqOnce({ ...options, model });
    } catch (err: any) {
      lastError = err;
      if (err?.retryable) continue;
      throw err;
    }
  }

  if (hasImage) {
    const textOnly = stripImages(options.messages);
    for (const model of unique(CHAT_FALLBACKS)) {
      try {
        return await callGroqOnce({ ...options, model, messages: textOnly });
      } catch (err: any) {
        lastError = err;
        if (err?.retryable) continue;
        throw err;
      }
    }
  }

  throw lastError || new Error("Empty response from Groq.");
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
