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
    const originalTextVal = typeof originalText === "string" ? originalText : context;

    const systemInstruction = `You are a patient, encouraging, and clear academic tutor assisting a student with their studies.

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
2. IMPORTANT FILE-REFERENCING INSTRUCTION: You must actively refer directly to the source file name and content. When answering questions, write explicit file citation phrases, such as:
   - "As it shows in this file, you have..."
   - "In the file you uploaded, it indicates that..."
   - "As shown in this document, the key elements are..."
3. If the student's question asks for clarification on something inside the notes or source file, break it down using clear, concrete examples.
4. If the study guide and original file do NOT contain the answer, you MUST explicitly state this exact sentence:
   "This wasn't covered directly in your lecture notes, but here is how it works..."
   and then proceed to answer the question accurately using your general technical and academic knowledge.
5. Keep your tone encouraging, patient, highly structured, and easy to follow. Use bullet points and clean markdown formatting where appropriate.`;

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
