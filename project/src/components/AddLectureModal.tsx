import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, BookOpen, UploadCloud, FileText, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Subject } from "../types.ts";
import { apiUrl } from "../lib/api.ts";

interface AddLectureModalProps {
  subjects: Subject[];
  preselectedSubjectId?: string;
  onClose: () => void;
  onAddLecture: (lectureData: {
    title: string;
    content: string;
    subjectId: string;
    newSubjectName?: string;
    fileName?: string;
    fileType?: "text" | "image" | "pdf";
    fileDataUrl?: string;
    originalText?: string;
  }) => void;
}

export function AddLectureModal({ subjects, preselectedSubjectId, onClose, onAddLecture }: AddLectureModalProps) {
  const initialSubject = subjects.find(sub => sub.id === preselectedSubjectId) || subjects[0];
  const [subjectName, setSubjectName] = useState(initialSubject?.name || "");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [fileDataUrl, setFileDataUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    setError("");
    setFileDataUrl("");
    setFileText("");

    const isImage = selectedFile.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(selectedFile.name);
    const isPdf = selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name);

    const reader = new FileReader();
    if (isImage || isPdf) {
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string" && result.trim()) {
          setFile(selectedFile);
          setFileDataUrl(result);
          setFileText("");
        } else {
          setError("The selected file could not be read.");
        }
      };
      reader.readAsDataURL(selectedFile);
    } else {
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string" && text.trim()) {
          setFile(selectedFile);
          setFileText(text);
          setFileDataUrl("");
        } else {
          setError("The selected file appears to be empty or unreadable as plain text.");
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedSubjectName = subjectName.trim();
    if (!trimmedSubjectName) {
      setError("Please provide a subject category name.");
      return;
    }

    if (!file || (!fileText.trim() && !fileDataUrl.trim())) {
      setError("Please drop or choose a lecture file or image before uploading.");
      return;
    }

    setIsLoading(true);

    const matchedSubject = subjects.find(
      sub => sub.name.toLowerCase() === trimmedSubjectName.toLowerCase()
    );

    const finalSubjectId = matchedSubject ? matchedSubject.id : "custom-" + Date.now();
    const finalSubjectName = matchedSubject ? undefined : trimmedSubjectName;

    try {
      // Send file content (text or image dataUrl) to backend
      const response = await fetch(apiUrl("/api/analyze-file"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileText: fileText,
          fileDataUrl: fileDataUrl,
          fileName: file.name
        })
      });

      let detectedTitle = "";
      let finalContent = fileText;
      let extractedOriginal = fileText;

      if (response.ok) {
        const result = await response.json();
        detectedTitle = result.title;
        
        if (result.content && result.content.trim()) {
          finalContent = result.content;
        }
        if (typeof result.extractedText === "string" && result.extractedText.trim()) {
          extractedOriginal = result.extractedText.trim();
        }
      } else {
        console.warn("AI Analysis returned non-ok status, falling back to file name.");
      }

      // Fallback if AI fails or returns empty title
      if (!detectedTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        detectedTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }

      if (!finalContent && fileDataUrl) {
        finalContent = `# ${detectedTitle}\n\nThis is an analyzed visual document from the file **${file.name}**. Detailed study guide generation failed, but the file was recognized as an academic resource.`;
      }

      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
      const detectedFileType: "text" | "image" | "pdf" = isPdf ? "pdf" : (isImage ? "image" : "text");

      onAddLecture({
        title: detectedTitle,
        content: finalContent || "No content extracted.",
        subjectId: finalSubjectId,
        newSubjectName: finalSubjectName,
        fileName: file.name,
        fileType: detectedFileType,
        fileDataUrl: fileDataUrl,
        originalText: detectedFileType === "image" ? "" : (extractedOriginal || fileText || finalContent)
      });
    } catch (err) {
      console.error("AI Analysis failed inside modal, running fallback:", err);
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const fallbackTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
      const detectedFileType: "text" | "image" | "pdf" = isPdf ? "pdf" : (isImage ? "image" : "text");

      onAddLecture({
        title: fallbackTitle,
        content: fileText || `# ${fallbackTitle}\n\nUploaded file: **${file.name}**`,
        subjectId: finalSubjectId,
        newSubjectName: finalSubjectName,
        fileName: file.name,
        fileType: detectedFileType,
        fileDataUrl: fileDataUrl,
        originalText: detectedFileType === "image" ? "" : fileText
      });
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs font-sans">
      <div 
        id="add-lecture-modal"
        className="bg-white border border-[#c5d5da] shadow-2xl rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="p-6 border-b border-[#c5d5da] flex justify-between items-center bg-[#f4f8f9] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-neutral-100 rounded-lg">
              <BookOpen className="w-4 h-4 text-black" />
            </div>
            <div>
              <h3 className="font-display font-extrabold tracking-tight text-base font-bold text-black">Upload Lecture Document</h3>
              <p className="text-[10px] text-[#5a737a] uppercase tracking-wider font-semibold font-mono">
                AI Detected Metadata
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded-full transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {isLoading ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-5 flex-1 min-h-[300px]">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-black animate-spin" />
              <Sparkles className="w-5 h-5 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-display font-extrabold tracking-tight text-base font-bold text-black">Analyzing Document...</h4>
              <p className="text-xs text-[#5a737a] max-w-xs leading-relaxed">
                Gemini is parsing the text content to extract a formal academic title, key themes, and descriptive context.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold p-3.5 rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            {/* Subject Category selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[#2a3d44]">
                Subject Category
              </label>
              <input
                type="text"
                list="existing-subjects"
                placeholder="Enter category name (e.g., World History, Physics)..."
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full bg-[#f4f8f9] border border-[#c5d5da] rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-[#0d8f7c] transition-all text-black font-semibold"
              />
              <datalist id="existing-subjects">
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.name} />
                ))}
              </datalist>
              <p className="text-[10px] text-[#5a737a]">
                Type any category name you want, or select an existing one from the dropdown suggestions.
              </p>
            </div>

            {/* Premium Drag and Drop Zone */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[#2a3d44]">
                Lecture Document File
              </label>
              
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 min-h-[160px] ${
                  isDragging
                    ? "border-[#0d8f7c] bg-neutral-50/50"
                    : file
                    ? "border-emerald-200 bg-emerald-50/10 hover:bg-emerald-50/20"
                    : "border-[#c5d5da] bg-[#f4f8f9] hover:border-[#0d8f7c] hover:bg-neutral-50/50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".txt,.md,.text,.json,.jpg,.jpeg,.png,.webp,.gif,.pdf"
                  className="hidden"
                />

                {file ? (
                  <>
                    <div className="p-3 bg-emerald-100 rounded-full text-emerald-800">
                      <CheckCircle2 className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-black font-mono truncate max-w-xs">{file.name}</p>
                      <p className="text-[10px] text-emerald-800 font-semibold font-mono">
                        {(file.size / 1024).toFixed(1)} KB • Loaded successfully
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5a737a] hover:text-black underline">
                      Replace File
                    </span>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-neutral-100 rounded-full text-neutral-500">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-black">Drag & drop your lecture or image file here</p>
                      <p className="text-[10px] text-[#5a737a] font-medium">or click to browse your local device</p>
                    </div>
                    <div className="pt-1">
                      <span className="text-[9px] font-bold text-neutral-400 bg-white border border-neutral-200 py-0.5 px-2 rounded-full">
                        Supports PDF (.pdf), text (.txt, .md) & images (.png, .jpg, .webp)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#c5d5da] flex justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs uppercase tracking-wider font-bold text-[#2a3d44] hover:text-black hover:bg-[#e7f0f2] rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file}
                className={`px-5 py-2.5 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md flex items-center space-x-1.5 ${
                  file
                    ? "bg-[#0c1a1f] hover:bg-[#076b5c] text-white"
                    : "bg-neutral-100 text-neutral-400 cursor-not-allowed border border-neutral-200 shadow-none"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Upload & Detect</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
