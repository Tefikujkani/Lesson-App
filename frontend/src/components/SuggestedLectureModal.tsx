import React, { useState, useEffect } from "react";
import { Sparkles, FileText, Check, Loader2, ArrowRight, X, BookOpen, Hash } from "lucide-react";

interface SuggestedLectureModalProps {
  fileName: string;
  suggestedTitle: string;
  suggestedSubject: string;
  suggestedSummary: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (finalTitle: string, finalSubject: string) => void;
}

export function SuggestedLectureModal({
  fileName,
  suggestedTitle,
  suggestedSubject,
  suggestedSummary,
  isLoading,
  onClose,
  onConfirm,
}: SuggestedLectureModalProps) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (!isLoading) {
      setTitle(suggestedTitle);
      setSubject(suggestedSubject);
    }
  }, [isLoading, suggestedTitle, suggestedSubject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim()) return;
    onConfirm(title.trim(), subject.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div
        id="ai-suggestion-modal"
        className="bg-white border border-[#E5E3E1] shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Banner with shimmer */}
        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-black p-6 text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#F2F0EB]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center space-x-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20 backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold italic tracking-tight">AI Curatorial Analysis</h3>
              <p className="text-[10px] uppercase tracking-wider text-neutral-300 font-semibold font-mono">
                Processed via Gemini 3.5 Flash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="absolute top-6 right-6 p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-5">
            <Loader2 className="w-10 h-10 text-black animate-spin" />
            <div className="space-y-1.5">
              <h4 className="font-serif text-base font-bold text-black italic">Reading "{fileName}"...</h4>
              <p className="text-xs text-[#8C8A88] max-w-xs">
                Gemini is parsing the text, extracting the overarching thesis, and drafting formal metadata.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-5">
            {/* Source file info indicator */}
            <div className="bg-[#FAF9F6] border border-[#E5E3E1]/80 rounded-xl p-3.5 flex items-center space-x-3">
              <div className="p-2 bg-neutral-200/50 rounded-lg shrink-0">
                <FileText className="w-4 h-4 text-[#6B6967]" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[9px] uppercase tracking-wider text-[#8C8A88] font-bold">Source Document</p>
                <p className="text-xs text-[#33312F] font-mono truncate font-semibold">{fileName}</p>
              </div>
            </div>

            {/* Suggested summary card */}
            <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-4 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-amber-800 font-bold">Intellectual Scope</span>
              <p className="text-xs text-neutral-800 leading-relaxed font-serif italic">
                "{suggestedSummary}"
              </p>
            </div>

            {/* Interactive metadata form fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[#6B6967] flex items-center space-x-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Suggested Lecture Title</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E3E1] rounded-lg py-2.5 px-4 text-sm font-semibold text-black focus:outline-none focus:border-black transition-all"
                  placeholder="e.g., Kepler's Planetary Motion Laws"
                />
                <p className="text-[9px] text-[#8C8A88]">Polished academic title suggested by Gemini</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[#6B6967] flex items-center space-x-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Suggested Subject Category</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#E5E3E1] rounded-lg py-2.5 px-4 text-sm font-semibold text-black focus:outline-none focus:border-black transition-all"
                  placeholder="e.g., Astrophysics"
                />
                <p className="text-[9px] text-[#8C8A88]">Overarching curriculum category</p>
              </div>
            </div>

            {/* Action footer */}
            <div className="pt-4 border-t border-[#E5E3E1] flex justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs uppercase tracking-wider font-bold text-[#6B6967] hover:text-black hover:bg-[#F2F0EB] rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md flex items-center space-x-1.5"
              >
                <span>Confirm & Create</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
