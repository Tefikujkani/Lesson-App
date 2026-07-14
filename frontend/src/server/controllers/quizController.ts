import { Request, Response, NextFunction } from "express";
import { groqChatCompletion, parseJsonFromModel } from "../config/groq.ts";

function normalizeQuizQuestion(raw: any) {
  const options = Array.isArray(raw?.options) ? raw.options.map(String).slice(0, 4) : [];
  while (options.length < 4) options.push(`Option ${options.length + 1}`);

  let correctIndices: number[] = [];
  if (Array.isArray(raw?.correctIndices)) {
    correctIndices = raw.correctIndices
      .map((n: unknown) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length);
  } else if (typeof raw?.correctIndex === "number" && Number.isInteger(raw.correctIndex)) {
    correctIndices = [raw.correctIndex];
  }

  // De-dupe + sort
  correctIndices = [...new Set(correctIndices)].sort((a, b) => a - b);
  if (correctIndices.length === 0) correctIndices = [0];

  const multiSelect = Boolean(raw?.multiSelect) || correctIndices.length > 1;

  return {
    question: String(raw?.question || "Question"),
    options,
    correctIndex: correctIndices[0],
    correctIndices,
    multiSelect,
    explanation: String(raw?.explanation || ""),
  };
}

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

    const systemInstruction = `You are an academic assessor. Create a challenging, accurate, and fair 10-question quiz based ONLY on the provided lecture notes.

Return ONLY valid JSON in this exact shape:
{
  "quiz": [
    {
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "multiSelect": false,
      "correctIndices": [0],
      "explanation": "string"
    }
  ]
}

Rules:
1. Exactly 10 questions covering different parts of the notes when possible.
2. Each question has exactly 4 options.
3. Use "multiSelect": true when MORE THAN ONE option is correct (select-all-that-apply). Put ALL correct option indexes in "correctIndices".
4. Use "multiSelect": false when exactly one option is correct. correctIndices must contain exactly one index.
5. correctIndices values are 0-based (0, 1, 2, or 3).
6. About 3–4 of the 10 questions should be multiSelect when the material allows (e.g. "which of the following are…", "select all that apply…"). Phrase those questions clearly as select-all-that-apply.
7. Never create a multi-correct fact pattern with multiSelect false (that is unfair).
8. explanation briefly says why the correct option(s) are right based on the notes.
9. Mix difficulty: some recall, some application/understanding.
10. All questions must come from the lecture context.`;

    const prompt = `Generate a 10-question quiz for the lecture titled "${title}". Include a mix of single-answer and multi-select questions.

=== START LECTURE NOTES ===
${lectureContext.slice(0, 18000)}
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

    res.json({ quiz: quizData.slice(0, 10).map(normalizeQuizQuestion) });
  } catch (error: any) {
    next(error);
  }
}
