import { Request, Response, NextFunction } from "express";
import { groqChatCompletion } from "../config/groq.ts";

/**
 * Controller to handle AI student study chat requests (Groq).
 */
export async function handleStudyChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message, lectureContext, fileName, fileType, originalText } = req.body;

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
- Always reply in the same language the student is writing in.
- If they write Albanian (including informal spelling like "me spijego", "me kjart", "spo kuptoj", dialect/Gheg forms, missing diacritics), answer clearly in Albanian.
- Never say you cannot translate, never invent a "language barrier", and never switch to English unless the student writes in English.
- Treat typos and informal chat as understandable. Infer the intent and explain simply.
- When explaining hard concepts, use short sentences, concrete examples, and simple words.`;

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
2. IMPORTANT FILE-REFERENCING INSTRUCTION: Actively refer to the source file name and content, using citation phrases in the student's language. Examples in English: "As it shows in this file…", "In the file you uploaded…". In Albanian use natural equivalents like "Sipas skedarit që ngarkove…", "Në dokumentin Basic Electronics.pdf…".
3. If the student asks for clarification, break it down with clear, concrete examples. Prefer simpler wording when they say they don't understand.
4. If the study guide and original file do NOT contain the answer, say this idea in the student's language (English form: "This wasn't covered directly in your lecture notes, but here is how it works...") and then answer from general academic knowledge.
5. Keep your tone encouraging, patient, highly structured, and easy to follow. Use bullet points and clean markdown formatting where appropriate.`
      : `You are a patient, encouraging, and clear academic tutor in Study Hub.

${languageRules}

The student has not selected a lecture yet, so answer from general academic knowledge.
Help with studying strategy, explanations, examples, and clarifying any question they ask.
Keep your tone encouraging, highly structured, and easy to follow. Use bullet points and clean markdown where appropriate.
If useful, gently suggest uploading lecture notes on the left so answers can be grounded in their material.`;

    const reply = await groqChatCompletion({
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message },
      ],
      temperature: 0.7,
    });

    res.json({ reply: reply || "I'm sorry, I could not generate a response." });
  } catch (error: any) {
    next(error);
  }
}
