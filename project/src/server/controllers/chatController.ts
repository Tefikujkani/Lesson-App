import { Request, Response, NextFunction } from "express";
import { groqChatCompletion } from "../config/groq.ts";

type HistoryMessage = {
  role?: string;
  sender?: string;
  text?: string;
  content?: string;
};

/**
 * Controller to handle AI student study chat requests (Groq).
 */
export async function handleStudyChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message, lectureContext, fileName, fileType, originalText, history } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing or invalid 'message' parameter in request body." });
      return;
    }

    const context = typeof lectureContext === "string" ? lectureContext : "";
    const nameVal = typeof fileName === "string" ? fileName : "reference document";
    const typeVal = typeof fileType === "string" ? fileType : "text";
    const originalTextRaw = typeof originalText === "string" ? originalText : context;
    const originalTextVal = originalTextRaw.slice(0, 20000);
    const hasLectureContext = context.trim().length > 0;

    const languageRules = `LANGUAGE RULES (critical):
- Match the language of the student's LATEST message.
- If the latest message is English, reply in English — even if earlier messages were Albanian.
- If the latest message is Albanian (including informal spelling like "me spijego", "me kjart", "spo kuptoj", dialect/Gheg, missing diacritics), reply in clear Albanian.
- If the student explicitly asks to switch language (e.g. "speak in English", "trego në shqip", "tell me in english"), switch immediately and keep that language until they ask otherwise.
- Never invent a language barrier. Never refuse to explain because of language.
- Treat typos/informal chat as understandable. Infer intent and explain simply with short sentences and concrete examples.
- When they ask to repeat/explain the previous topic in another language, continue THAT same topic — do not restart with a generic welcome.`;

    const systemInstruction = hasLectureContext
      ? `You are a patient, encouraging, and clear academic tutor assisting a student with their studies.

${languageRules}

Your primary source of truth is the following study guide/notes context:
=== START STUDY GUIDE NOTES ===
${context}
=== END STUDY GUIDE NOTES ===

The student has also provided/uploaded an associated original source file named "${nameVal}" (Type: ${typeVal}).
Here is the original text / transcription content of that file "${nameVal}":
=== START ORIGINAL SOURCE FILE CONTENT ===
${originalTextVal}
=== END ORIGINAL SOURCE FILE CONTENT ===

Follow these strict rules when answering the student:
1. Ground your answers in the provided study guide and original source file content.
2. IMPORTANT FILE-REFERENCING INSTRUCTION: Actively refer to the source file name and content, using citation phrases in the reply language.
3. If the student asks for clarification, break it down with clear, concrete examples. Prefer simpler wording when they say they don't understand.
4. If the study guide and original file do NOT contain the answer, say this idea in the reply language (English form: "This wasn't covered directly in your lecture notes, but here is how it works...") and then answer from general academic knowledge.
5. Keep your tone encouraging, patient, highly structured, and easy to follow. Use bullet points and clean markdown formatting where appropriate.
6. Use the conversation history so short follow-ups like "now in English" or "explain simpler" still refer to the previous topic.`
      : `You are a patient, encouraging, and clear academic tutor in Study Hub.

${languageRules}

The student may or may not have selected a lecture yet.
Answer from general academic knowledge when no lecture notes are attached.
Help with studying strategy, explanations, examples, and clarifying any question they ask.
Keep your tone encouraging, highly structured, and easy to follow. Use bullet points and clean markdown where appropriate.
If useful, gently suggest uploading lecture notes on the left so answers can be grounded in their material.
Use the conversation history so follow-ups continue the same topic instead of restarting.`;

    const priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (Array.isArray(history)) {
      for (const item of history as HistoryMessage[]) {
        const text = (typeof item.text === "string" ? item.text : item.content) || "";
        if (!text.trim()) continue;

        const sender = (item.sender || item.role || "").toLowerCase();
        if (sender === "student" || sender === "user") {
          priorMessages.push({ role: "user", content: text.slice(0, 4000) });
        } else if (sender === "tutor" || sender === "assistant") {
          // Skip the canned welcome so it does not dominate short-follow-up replies.
          if (/i'?m your study hub tutor|greetings! i am your academic tutor/i.test(text)) continue;
          priorMessages.push({ role: "assistant", content: text.slice(0, 4000) });
        }
      }
    }

    // Keep last ~10 turns to stay within context and preserve recent topic/language.
    const recentHistory = priorMessages.slice(-10);

    const reply = await groqChatCompletion({
      messages: [
        { role: "system", content: systemInstruction },
        ...recentHistory,
        { role: "user", content: message },
      ],
      temperature: 0.7,
    });

    res.json({ reply: reply || "I'm sorry, I could not generate a response." });
  } catch (error: any) {
    next(error);
  }
}
