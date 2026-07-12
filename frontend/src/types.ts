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
  correctIndex: number;
  explanation: string;
}
