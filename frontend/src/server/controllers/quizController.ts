import { Request, Response, NextFunction } from "express";
import { groqChatCompletion, parseJsonFromModel } from "../config/groq.ts";

/**
 * Controller to generate dynamic multiple-choice quizzes based on lecture notes (Groq).
 */
export async function generateLectureQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { lectureTitle, lectureContext } = req.body;

    if (!lectureContext || typeof lectureContext !== "string") {
      res.status(400).json({ error: "Missing or invalid 'lectureContext' parameter in request body." });
      return;
    }

    const title = typeof lectureTitle === "string" ? lectureTitle : "the lecture";

    const systemInstruction = `You are an academic assessor. Create a challenging, accurate, and fair 3-question multiple-choice quiz based ONLY on the provided lecture notes.

Return ONLY valid JSON in this exact shape:
{
  "quiz": [
    {
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "string"
    }
  ]
}

Rules:
1. Exactly 3 questions.
2. Each question has exactly 4 options.
3. Only one option is correct.
4. correctIndex is the 0-based index of the correct option (0, 1, 2, or 3).
5. explanation briefly says why the answer is correct based on the notes.
6. All questions must come from the lecture context.`;

    const prompt = `Generate a 3-question multiple-choice quiz for the lecture titled "${title}".

=== START LECTURE NOTES ===
${lectureContext}
=== END LECTURE NOTES ===`;

    const text = await groqChatCompletion({
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      json: true,
    });

    const parsed = parseJsonFromModel(text) as any;
    const quizData = Array.isArray(parsed) ? parsed : parsed?.quiz;

    if (!Array.isArray(quizData) || quizData.length === 0) {
      throw new Error("Invalid quiz format returned by AI.");
    }

    res.json({ quiz: quizData });
  } catch (error: any) {
    next(error);
  }
}
