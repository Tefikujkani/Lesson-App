import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth.ts";
import { GROQ_VISION_MODEL, groqChatCompletion } from "../config/groq.ts";

function wantsHintMode(cleaned: string, mode?: string): boolean {
  return (
    mode === "hint" ||
    /\b(hint|clue|stuck|nudge|help us figure|don't (give|spoil) the answer)\b/i.test(cleaned)
  );
}

function buildSystemPrompt(wantsHint: boolean, hasBoard: boolean): string {
  const boardRules = hasBoard
    ? `
WHITEBOARD (critical):
- An image of the group's shared whiteboard is attached.
- Carefully READ any handwriting, typed text, numbers, equations, diagrams, arrows, or sketches on it.
- Base your reply on what is actually on the board plus the student's question.
- If the board is mostly blank, say so briefly and still help from the chat question.`
    : "";

  const mathRules = `
MATH / FORMATTING (critical):
- NEVER use dollar signs or LaTeX (no $2+2$, no $$...$$, no \\frac).
- Write math in plain text only, e.g. 2+2=4, x^2, (a+b)/c.`;

  if (wantsHint) {
    return `You are the group's AI Learning Buddy in a multiplayer study room.
Students are stuck on a hard problem (chat and/or whiteboard).
Respond with EXACTLY one clever sentence that is a hint/clue — never the full answer, never a step-by-step solution.
Be playful but useful. Match the language of the student's message.
No markdown fences. No preamble like "Hint:".${boardRules}${mathRules}`;
  }

  return `You are the group's AI Learning Buddy hanging out in a study room chat.
When students tag you, explain the concept using short, simple, funny real-world analogies.
Keep replies under ~140 words. Prefer 1–3 short paragraphs or a few bullets.
Match the language of the student's latest message.
Be encouraging and collaborative (talk to "you all" / the group). Avoid dumping textbooks.${boardRules}${mathRules}`;
}

/** Strip LaTeX-style $ math so chat never shows dollar signs around equations. */
export function stripMathDollarSigns(text: string): string {
  let out = text;
  // $$...$$ blocks
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner: string) => inner.trim());
  // $...$ inline (avoid lone currency if rare; study chat is about math)
  out = out.replace(/\$([^$\n]+?)\$/g, (_, inner: string) => inner.trim());
  // leftover stray $
  out = out.replace(/\$/g, "");
  return out.trim();
}

/**
 * AI Learning Buddy for group study rooms.
 * - Default: short, simple, funny real-world analogies
 * - Hint mode: one clever sentence of clue (no full solution)
 * - Can "see" the shared whiteboard via vision when a board image is provided
 */
export async function askRoomAi(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    const boardImage =
      typeof req.body?.boardImage === "string" && req.body.boardImage.startsWith("data:image")
        ? req.body.boardImage
        : undefined;
    const mode = req.body?.mode === "hint" ? "hint" : "explain";

    if (!message) {
      res.status(400).json({ error: "Bad Request", message: "Message is required." });
      return;
    }

    const result = await generateRoomAiReply({ message, topic, boardImage, mode });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** Shared helper used by Socket.IO when someone tags @AI in chat. */
export async function generateRoomAiReply(params: {
  message: string;
  topic?: string;
  boardImage?: string;
  mode?: "hint" | "explain";
}): Promise<{ reply: string; mode: "hint" | "explain" }> {
  const message = params.message.trim();
  const cleaned = message.replace(/@AI\b/gi, "").trim() || message;
  const wantsHint = wantsHintMode(cleaned, params.mode);
  const hasBoard = Boolean(
    params.boardImage &&
      params.boardImage.startsWith("data:image") &&
      params.boardImage.length > 64
  );

  const system = buildSystemPrompt(wantsHint, hasBoard);
  const userText = [
    params.topic ? `Room topic: ${params.topic}` : "",
    `Student question: ${cleaned || "Please look at our whiteboard and explain what we drew / wrote."}`,
    hasBoard
      ? "The attached image is the group's shared whiteboard right now — read it carefully."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const reply = hasBoard
    ? await groqChatCompletion({
        model: GROQ_VISION_MODEL,
        temperature: wantsHint ? 0.85 : 0.7,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: params.boardImage! } },
            ],
          },
        ],
      })
    : await groqChatCompletion({
        temperature: wantsHint ? 0.85 : 0.75,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
      });

  return { reply: stripMathDollarSigns(reply), mode: wantsHint ? "hint" : "explain" };
}
