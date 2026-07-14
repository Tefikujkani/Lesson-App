export interface Lecture {
  id: string;
  title: string;
  content: string;
  fileName?: string;
  fileType?: "text" | "image" | "pdf";
  fileDataUrl?: string;
  originalText?: string;
}

export interface Subject {
  id: string;
  name: string;
  icon: string; // Lucide icon name or type
  lectures: Lecture[];
}

export interface Message {
  id: string;
  sender: "student" | "tutor";
  text: string;
  timestamp: string;
}

export interface User {
  id?: string;
  name: string;
  email: string;
  major: string;
  avatarUrl?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Legacy single-answer index (still accepted from older quiz payloads). */
  correctIndex?: number;
  /** Preferred: one or more correct option indices (0-based). */
  correctIndices?: number[];
  /** When true, student may select multiple options before verifying. */
  multiSelect?: boolean;
  explanation: string;
}
