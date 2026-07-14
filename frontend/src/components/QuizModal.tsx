import React, { useState, useEffect } from "react";
import { X, Trophy, Brain, CheckCircle2, XCircle, ChevronRight, RefreshCw, GraduationCap } from "lucide-react";
import { QuizQuestion } from "../types.ts";
import { apiFetch } from "../lib/api.ts";

interface QuizModalProps {
  lectureTitle: string;
  lectureContext: string;
  onClose: () => void;
}

export function QuizModal({ lectureTitle, lectureContext, onClose }: QuizModalProps) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Quiz progression state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // For storing user's selected option indices across questions
  const [userAnswers, setUserAnswers] = useState<number[]>([]);

  const fetchQuiz = async () => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedOptionIndex(null);
    setIsSubmitted(false);
    setScore(0);
    setUserAnswers([]);

    try {
      const data = await apiFetch<{ quiz: QuizQuestion[] }>("/api/quiz", {
        method: "POST",
        body: JSON.stringify({
          lectureTitle,
          lectureContext
        })
      });

      if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
        setQuestions(data.quiz);
      } else {
        throw new Error("Invalid quiz format received from AI backend.");
      }
    } catch (err: any) {
      console.error("Failed to generate quiz:", err);
      setError(err.message || "Failed to generate dynamic quiz. Check Groq API configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuiz();
  }, [lectureTitle]);

  const handleOptionSelect = (index: number) => {
    if (isSubmitted) return;
    setSelectedOptionIndex(index);
  };

  const handleAnswerSubmit = () => {
    if (selectedOptionIndex === null || isSubmitted) return;

    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedOptionIndex === currentQuestion.correctIndex;

    if (isCorrect) {
      setScore(prev => prev + 1);
    }

    setUserAnswers(prev => [...prev, selectedOptionIndex]);
    setIsSubmitted(true);
  };

  const handleNextQuestion = () => {
    setIsSubmitted(false);
    setSelectedOptionIndex(null);
    setCurrentQuestionIndex(prev => prev + 1);
  };

  // Feedback details depending on score
  const getFeedbackMessage = () => {
    const percentage = (score / questions.length) * 100;
    if (percentage === 100) {
      return {
        title: "Summa Cum Laude",
        desc: "Outstanding! You scored a perfect 100% on this assessment. You have fully synthesized this curriculum material.",
        color: "text-emerald-800 bg-emerald-50 border-emerald-100"
      };
    } else if (percentage >= 60) {
      return {
        title: "Passed with Merit",
        desc: "Excellent progress! You have a solid command of the main thesis of these notes. Review the explanations for the missed concept.",
        color: "text-amber-800 bg-amber-50 border-amber-100"
      };
    } else {
      return {
        title: "Academic Review Needed",
        desc: "Keep studying. Try reading the source document carefully, asking the tutor clarify questions, and retaking the quiz to consolidate learning.",
        color: "text-rose-800 bg-rose-50 border-rose-100"
      };
    }
  };

  const activeQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const isFinished = currentQuestionIndex >= totalQuestions && totalQuestions > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div 
        id="quiz-modal-container"
        className="bg-white border border-[#c5d5da] shadow-2xl rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="p-6 border-b border-[#c5d5da] flex justify-between items-center bg-[#f4f8f9] flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-black" />
            <h3 className="font-display font-extrabold tracking-tight text-base font-bold text-black truncate max-w-xs md:max-w-md">
              Knowledge Check: {lectureTitle}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Loading Screen */}
        {loading && (
          <div className="flex-1 p-12 flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-[#e7f0f2] border-t-[#0d8f7c] animate-spin" />
              <GraduationCap className="w-6 h-6 absolute inset-0 m-auto text-[#0c1a1f] animate-pulse" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h4 className="font-display font-extrabold tracking-tight text-lg font-bold text-black">Formulating Exam Questions...</h4>
              <p className="text-xs text-[#5a737a] leading-relaxed">
                Analyzing the source context of "{lectureTitle}" to draft 10 multiple-choice conceptual challenges...
              </p>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[#8aa0a6] font-bold font-mono">
              Powered by Groq
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex-1 p-12 flex flex-col items-center justify-center text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-700">
              <XCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2 max-w-md">
              <h4 className="font-display font-extrabold tracking-tight text-lg font-bold text-rose-800">Assessment Generation Interrupted</h4>
              <p className="text-xs text-[#2a3d44] leading-relaxed">
                We encountered an error generating your customized test questions. 
              </p>
              <p className="text-xs font-mono text-rose-900 bg-rose-50 p-3 rounded-lg border border-rose-100 max-h-32 overflow-y-auto">
                {error}
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={fetchQuiz}
                className="bg-[#0c1a1f] hover:bg-[#076b5c] text-white px-5 py-2.5 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Generation</span>
              </button>
              <button
                onClick={onClose}
                className="border border-[#c5d5da] hover:bg-[#e7f0f2] text-black px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Quiz In-Progress Screen */}
        {!loading && !error && !isFinished && activeQuestion && (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col">
            {/* Progress indicator */}
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#5a737a] mb-4">
              <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
              <span className="text-black font-mono">{(score / totalQuestions * 100).toFixed(0)}% accuracy potential</span>
            </div>
            <div className="w-full h-1.5 bg-[#f4f8f9] rounded-full overflow-hidden mb-6 border border-[#c5d5da]/40">
              <div 
                className="h-full bg-[#0c1a1f] transition-all duration-300" 
                style={{ width: `${((currentQuestionIndex) / totalQuestions) * 100}%` }}
              />
            </div>

            {/* Question Card */}
            <h4 className="font-display font-extrabold tracking-tight text-lg md:text-xl font-bold text-black leading-relaxed mb-6">
              {activeQuestion.question}
            </h4>

            {/* Options list */}
            <div className="space-y-3 flex-1 mb-6">
              {activeQuestion.options.map((option, idx) => {
                const isSelected = selectedOptionIndex === idx;
                const isCorrectOption = idx === activeQuestion.correctIndex;
                
                let optionStyle = "border-[#c5d5da] hover:border-[#0d8f7c] bg-white";
                if (isSelected) optionStyle = "border-[#0d8f7c] bg-[#e7f0f2] font-semibold";
                
                if (isSubmitted) {
                  if (isCorrectOption) {
                    optionStyle = "border-emerald-500 bg-emerald-50/50 text-emerald-950 font-semibold";
                  } else if (isSelected) {
                    optionStyle = "border-rose-500 bg-rose-50/50 text-rose-950";
                  } else {
                    optionStyle = "border-[#c5d5da]/70 bg-white opacity-60";
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => handleOptionSelect(idx)}
                    className={`w-full text-left p-4 rounded-xl border text-xs md:text-sm transition-all flex items-start space-x-3 ${optionStyle}`}
                  >
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      isSelected ? "bg-[#0d8f7c] text-white border-[#0d8f7c]" : "border-[#c5d5da] text-[#5a737a]"
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="leading-normal">{option}</span>
                  </button>
                );
              })}
            </div>

            {/* Explanation card (post submission) */}
            {isSubmitted && (
              <div className="bg-[#f4f8f9] border border-[#c5d5da] rounded-xl p-4 mb-6 text-xs leading-relaxed">
                <div className="flex items-center space-x-2 mb-1.5">
                  {selectedOptionIndex === activeQuestion.correctIndex ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-800 uppercase tracking-wider text-[10px]">Correct Answer</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span className="font-bold text-rose-800 uppercase tracking-wider text-[10px]">Incorrect Answer</span>
                    </>
                  )}
                </div>
                <p className="text-[#2a3d44]">{activeQuestion.explanation}</p>
              </div>
            )}

            {/* Navigation / Submission controls */}
            <div className="mt-auto pt-4 border-t border-[#c5d5da] flex justify-end">
              {!isSubmitted ? (
                <button
                  type="button"
                  disabled={selectedOptionIndex === null}
                  onClick={handleAnswerSubmit}
                  className={`px-6 py-3 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md ${
                    selectedOptionIndex === null
                      ? "bg-[#e7f0f2] text-[#8aa0a6] cursor-not-allowed"
                      : "bg-[#0c1a1f] text-white hover:bg-[#0c1a1f]"
                  }`}
                >
                  Verify Selection
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="bg-[#0c1a1f] hover:bg-[#076b5c] text-white px-6 py-3 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md flex items-center space-x-2"
                >
                  <span>{currentQuestionIndex + 1 === totalQuestions ? "Review Scorecard" : "Next Question"}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scorecard / Finished Screen */}
        {!loading && !error && isFinished && (
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-black/5 flex items-center justify-center text-black mb-4">
              <Trophy className="w-8 h-8 text-amber-500" />
            </div>

            <div className="space-y-1 mb-6">
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#5a737a] font-bold">Consolidated Score</span>
              <h2 className="font-display font-extrabold tracking-tight text-3xl font-bold text-black">
                {score} / {totalQuestions} Correct
              </h2>
              <p className="text-xs text-[#5a737a] font-mono">
                Accuracy: {((score / totalQuestions) * 100).toFixed(0)}%
              </p>
            </div>

            {/* Custom feedback card */}
            <div className={`p-5 rounded-xl border text-xs text-left max-w-md mb-8 space-y-1.5 ${getFeedbackMessage().color}`}>
              <h5 className="font-bold uppercase tracking-wider text-[10px]">
                {getFeedbackMessage().title}
              </h5>
              <p className="leading-relaxed">
                {getFeedbackMessage().desc}
              </p>
            </div>

            {/* Actions */}
            <div className="flex space-x-3 w-full max-w-md">
              <button
                onClick={fetchQuiz}
                className="flex-1 bg-[#0c1a1f] hover:bg-[#076b5c] text-white py-3 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake Assessment</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 border border-[#c5d5da] hover:bg-[#e7f0f2] text-black py-3 rounded-lg text-xs uppercase tracking-wider font-bold transition-all"
              >
                Close Scorecard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
