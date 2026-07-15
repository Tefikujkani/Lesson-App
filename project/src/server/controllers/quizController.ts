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

  // Shuffle option order so retakes don't show A/B/C/D in the same place
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const shuffledOptions = order.map((i) => options[i]);
  const indexMap = new Map<number, number>(
    order.map((oldIdx, newIdx) => [oldIdx, newIdx] as [number, number])
  );
  const shuffledCorrect = correctIndices
    .map((i) => indexMap.get(i))
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);

  return {
    question: String(raw?.question || "Question"),
    options: shuffledOptions,
    correctIndex: shuffledCorrect[0],
    correctIndices: shuffledCorrect,
    multiSelect,
    explanation: String(raw?.explanation || ""),
  };
}

const QUIZ_FOCUS_ANGLES = [
  "definitions and key terms",
  "cause-and-effect relationships",
  "comparisons and contrasts",
  "processes and sequences",
  "examples and case applications",
  "why/how reasoning rather than pure recall",
  "edge cases and common misconceptions",
  "numerical or factual details from the notes",
  "summarizing main ideas in new wording",
  "applying concepts to a short scenario",
] as const;

/**
 * Controller to generate dynamic multiple-choice quizzes based on lecture notes (Groq).
 * Each request intentionally varies so retakes get fresh questions.
 */
export async function generateLectureQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { lectureTitle, lectureContext, previousQuestions } = req.body;

    if (!lectureContext || typeof lectureContext !== "string") {
      res.status(400).json({ error: "Missing or invalid 'lectureContext' parameter in request body." });
      return;
    }

    const title = typeof lectureTitle === "string" ? lectureTitle : "the lecture";
    const avoidList = Array.isArray(previousQuestions)
      ? previousQuestions
          .map((q: unknown) => String(q || "").trim())
          .filter(Boolean)
          .slice(-30)
      : [];

    const variantSeed = Math.floor(Math.random() * 900000) + 100000;
    const focusAngle = QUIZ_FOCUS_ANGLES[Math.floor(Math.random() * QUIZ_FOCUS_ANGLES.length)];

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
10. All questions must come from the lecture context.
11. CRITICAL VARIETY: Every quiz request must produce NEW wording and different question angles. Do not recycle near-identical stems or options from prior quizzes. Prefer a different mix of topics/subtopics when the notes allow.`;

    const avoidBlock =
      avoidList.length > 0
        ? `

Do NOT repeat or closely paraphrase any of these previous questions (create clearly different ones):
${avoidList.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
        : "";

    const prompt = `Generate a FRESH 10-question quiz for the lecture titled "${title}".
Variant seed: ${variantSeed}
Emphasize this angle when possible: ${focusAngle}
Include a mix of single-answer and multi-select questions. Shuffle which facts/concepts you test so this set differs from earlier quizzes on the same notes.${avoidBlock}

=== START LECTURE NOTES ===
${lectureContext.slice(0, 18000)}
=== END LECTURE NOTES ===`;

    const text = await groqChatCompletion({
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      temperature: 0.95,
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
