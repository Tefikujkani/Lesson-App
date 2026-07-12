import React, { useState, useRef, useEffect } from "react";
import { 
  Cpu, 
  Orbit, 
  BookOpen, 
  ChevronDown, 
  ChevronRight, 
  Send, 
  Sparkles, 
  X, 
  BookOpenText, 
  GraduationCap,
  ClipboardCheck,
  ClipboardCopy,
  Search,
  Type,
  Maximize2,
  Minimize2,
  Plus,
  LogOut,
  Brain,
  FilePlus,
  User as UserIcon,
  UploadCloud,
  Trash2,
  Loader2,
  Check,
  FileText,
  Image
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SUBJECTS_DATA } from "./data.ts";
import { Message, Subject, User } from "./types.ts";
import { MarkdownView } from "./components/MarkdownView.tsx";
import { LoginScreen } from "./components/LoginScreen.tsx";
import { AddLectureModal } from "./components/AddLectureModal.tsx";
import { QuizModal } from "./components/QuizModal.tsx";
import { SuggestedLectureModal } from "./components/SuggestedLectureModal.tsx";
import { apiFetch, clearAuthSession, getToken } from "./lib/api.ts";

export default function App() {
  // 1. User Authentications State (JWT session from MongoDB-backed auth)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (!getToken()) return null;
    const savedUser = localStorage.getItem("study_hub_user");
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        console.error("Failed to parse saved user credentials", e);
      }
    }
    return null;
  });

  // 2. Dynamic Curriculum State — loaded from MongoDB after login
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curriculumReady, setCurriculumReady] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedLectureId, setSelectedLectureId] = useState("");
  
  // Collapse state for subjects in left sidebar
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  // Search Filter for Lectures
  const [searchQuery, setSearchQuery] = useState("");

  // Toggle subject expand/collapse
  const toggleSubject = (subjectId: string) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectId]: !prev[subjectId]
    }));
  };

  // Chat History Mapped by Lecture ID (synced to MongoDB)
  const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>({});
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [, setErrorText] = useState<string | null>(null);
  const skipNextCurriculumSave = useRef(false);

  // UI Drawer & Modals States
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [readerTextSize, setReaderTextSize] = useState<"sm" | "base" | "lg">("base");
  const [searchInNotes, setSearchInNotes] = useState("");
  const [isNotesMaximized, setIsNotesMaximized] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"notes" | "source">("notes");

  // Drag & Drop / File Upload States
  const [isDragging, setIsDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState("");
  const [droppedFileText, setDroppedFileText] = useState("");
  const [droppedFileDataUrl, setDroppedFileDataUrl] = useState("");
  const [droppedFileType, setDroppedFileType] = useState<"text" | "image" | "pdf">("text");
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [suggestedSubject, setSuggestedSubject] = useState("");
  const [suggestedSummary, setSuggestedSummary] = useState("");
  const [showSuggestionConfirm, setShowSuggestionConfirm] = useState(false);

  // Modal Triggers
  const [isAddLectureOpen, setIsAddLectureOpen] = useState(false);
  const [modalSubjectId, setModalSubjectId] = useState<string | undefined>(undefined);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);

  // References
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to find currently selected subject & lecture
  const currentSubject = subjects.find(s => s.id === selectedSubjectId) || subjects[0] || null;
  const currentLecture = currentSubject?.lectures?.find(l => l.id === selectedLectureId) || currentSubject?.lectures?.[0] || null;

  // Load curriculum + verify session from MongoDB when user is present
  useEffect(() => {
    if (!currentUser || !getToken()) return;

    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch<{ subjects: Subject[] }>("/api/curriculum");
        if (cancelled) return;

        skipNextCurriculumSave.current = true;
        setSubjects(data.subjects || []);
        setCurriculumReady(true);

        if (data.subjects?.length > 0 && data.subjects[0].lectures.length > 0) {
          setSelectedSubjectId(data.subjects[0].id);
          setSelectedLectureId(data.subjects[0].lectures[0].id);
        } else {
          setSelectedSubjectId("");
          setSelectedLectureId("");
        }
      } catch (err) {
        console.error("Failed to load curriculum from MongoDB:", err);
        if (!cancelled) {
          setCurriculumReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.email]);

  // Persist curriculum to MongoDB (debounced) whenever it changes after initial load
  useEffect(() => {
    if (!currentUser || !curriculumReady || !getToken()) return;
    if (skipNextCurriculumSave.current) {
      skipNextCurriculumSave.current = false;
      return;
    }

    const timer = setTimeout(() => {
      apiFetch("/api/curriculum", {
        method: "PUT",
        body: JSON.stringify({ subjects }),
      }).catch((err) => {
        console.error("Failed to save curriculum to MongoDB:", err);
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [subjects, curriculumReady, currentUser?.id, currentUser?.email]);

  // Expand category automatically when a lecture is selected
  useEffect(() => {
    if (selectedSubjectId) {
      setExpandedSubjects(prev => ({
        ...prev,
        [selectedSubjectId]: true
      }));
    }
  }, [selectedSubjectId]);

  // Reset drawer tab + load chat history when lecture changes
  useEffect(() => {
    setDrawerTab("notes");

    if (!selectedLectureId || !getToken()) return;
    if (chatHistories[selectedLectureId]) return;

    apiFetch<{ messages: Message[] }>(`/api/chat/${encodeURIComponent(selectedLectureId)}`)
      .then((data) => {
        if (data.messages?.length) {
          setChatHistories((prev) => ({
            ...prev,
            [selectedLectureId]: data.messages,
          }));
        }
      })
      .catch((err) => console.error("Failed to load chat history:", err));
  }, [selectedLectureId]);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistories, selectedLectureId, isSending]);

  // Copy notes to clipboard helper
  const handleCopyNotes = () => {
    if (currentLecture) {
      navigator.clipboard.writeText(currentLecture.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Get current messages for active lecture (or seed default if empty)
  const getCurrentMessages = (): Message[] => {
    if (!currentLecture) return [];
    
    const history = chatHistories[currentLecture.id];
    if (history) return history;
    
    return [
      {
        id: "welcome",
        sender: "tutor",
        text: `Greetings! I am your academic tutor for **${currentLecture.title}**. 

I have analyzed your lecture material and am fully grounded in its source content. Ask me to break down difficult concepts with clear examples, summarize sections, or clarify out-of-scope queries.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ];
  };

  // Trigger quick question buttons
  const handleQuickQuestion = (question: string) => {
    if (isSending) return;
    setInputText(question);
    sendMessage(question);
  };

  // Send message API request
  const sendMessage = async (overrideText?: string) => {
    if (!currentLecture) return;
    const textToSend = (overrideText || inputText).trim();
    if (!textToSend) return;

    // Reset input and clear errors
    if (!overrideText) setInputText("");
    setErrorText(null);
    setIsSending(true);

    // Create unique ID for new student message
    const studentMessage: Message = {
      id: `student-${Date.now()}`,
      sender: "student",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // Update state with student message
    const currentHistory = chatHistories[currentLecture.id] || getCurrentMessages();
    const updatedHistory = [...currentHistory, studentMessage];
    setChatHistories(prev => ({
      ...prev,
      [currentLecture.id]: updatedHistory
    }));

    try {
      // POST Request directly to Express backend API (Gemini)
      const data = await apiFetch<{ reply: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: textToSend,
          lectureContext: currentLecture.content,
          fileName: currentLecture.fileName || `${currentLecture.title}.txt`,
          fileType: currentLecture.fileType || "text",
          originalText: currentLecture.originalText || currentLecture.content
        })
      });
      
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        sender: "tutor",
        text: data.reply || "I couldn't generate an answer. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      const finalHistory = [...updatedHistory, tutorMessage];
      setChatHistories(prev => ({
        ...prev,
        [currentLecture.id]: finalHistory
      }));

      // Persist chat thread to MongoDB
      apiFetch(`/api/chat/${encodeURIComponent(currentLecture.id)}`, {
        method: "PUT",
        body: JSON.stringify({ messages: finalHistory }),
      }).catch((err) => console.error("Failed to save chat history:", err));
    } catch (error: any) {
      console.error("Failed to send chat message:", error);
      setErrorText(error.message || "Could not reach the AI tutor. Check server configuration.");
      
      const isApiKeyErr = error.message && (
        error.message.toLowerCase().includes("groq_api_key") ||
        error.message.toLowerCase().includes("gemini_api_key") || 
        error.message.toLowerCase().includes("api key") || 
        error.message.toLowerCase().includes("credentials")
      );

      const errorTextContent = isApiKeyErr
        ? `⚠️ **API Key Configuration Required**\n\nYour **GROQ_API_KEY** is not configured. Add it to \`frontend/.env\` and restart the server (\`npm run dev\`).`
        : `⚠️ **Connection Error**: ${error.message || "Unable to reach the study helper."}\n\n*Please check that your network connection is active and your API configuration is set up properly.*`;

      // Add a helpful failed message back in history
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        sender: "tutor",
        text: errorTextContent,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setChatHistories(prev => ({
        ...prev,
        [currentLecture.id]: [...updatedHistory, errorMessage]
      }));
    } finally {
      setIsSending(false);
    }
  };

  // Keypress listener for Enter to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Logout Helper
  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    setSubjects([]);
    setChatHistories({});
    setSelectedSubjectId("");
    setSelectedLectureId("");
    setCurriculumReady(false);
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your Study Hub account and all saved lectures/chats? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      await apiFetch("/api/auth/me", { method: "DELETE" });
      handleLogout();
    } catch (err: any) {
      window.alert(err.message || "Could not delete account.");
    }
  };

  // Add Dynamic Custom Lecture manually
  const handleAddCustomLecture = (lectureData: {
    title: string;
    content: string;
    subjectId: string;
    newSubjectName?: string;
    fileName?: string;
    fileType?: "text" | "image";
    fileDataUrl?: string;
    originalText?: string;
  }) => {
    const newLecId = `custom-lec-${Date.now()}`;
    const newLecture = {
      id: newLecId,
      title: lectureData.title,
      content: lectureData.content,
      fileName: lectureData.fileName,
      fileType: lectureData.fileType,
      fileDataUrl: lectureData.fileDataUrl,
      originalText: lectureData.originalText
    };

    if (lectureData.newSubjectName) {
      // Create fresh new subject category
      const newSub: Subject = {
        id: lectureData.subjectId,
        name: lectureData.newSubjectName,
        icon: "GraduationCap",
        lectures: [newLecture]
      };
      setSubjects(prev => [...prev, newSub]);
      setExpandedSubjects(prev => ({ ...prev, [lectureData.subjectId]: true }));
      setSelectedSubjectId(lectureData.subjectId);
    } else {
      // Append to existing subject category
      setSubjects(prev => prev.map(sub => {
        if (sub.id === lectureData.subjectId) {
          return {
            ...sub,
            lectures: [...sub.lectures, newLecture]
          };
        }
        return sub;
      }));
      setExpandedSubjects(prev => ({ ...prev, [lectureData.subjectId]: true }));
      setSelectedSubjectId(lectureData.subjectId);
    }

    setSelectedLectureId(newLecId);
    setIsAddLectureOpen(false);
  };

  // Delete lecture completely
  const handleDeleteLecture = (lectureIdToDelete: string, subjectIdOfLec: string) => {
    const updatedSubjects = subjects.map(sub => {
      if (sub.id === subjectIdOfLec) {
        return {
          ...sub,
          lectures: sub.lectures.filter(l => l.id !== lectureIdToDelete)
        };
      }
      return sub;
    }).filter(sub => sub.lectures.length > 0); // Remove subject category if no lectures left
    
    setSubjects(updatedSubjects);

    // Find another lecture to select
    if (lectureIdToDelete === selectedLectureId) {
      if (updatedSubjects.length > 0 && updatedSubjects[0].lectures.length > 0) {
        setSelectedSubjectId(updatedSubjects[0].id);
        setSelectedLectureId(updatedSubjects[0].lectures[0].id);
      } else {
        setSelectedSubjectId("");
        setSelectedLectureId("");
      }
    }
  };

  // Seeding sample lectures
  const handleLoadSamples = () => {
    setSubjects(SUBJECTS_DATA);
    setSelectedSubjectId("cs");
    setSelectedLectureId("cs-big-o");
  };

  // Completely clear curriculum
  const handleClearAllLectures = () => {
    setSubjects([]);
    setSelectedSubjectId("");
    setSelectedLectureId("");
    setChatHistories({});
    apiFetch("/api/curriculum", { method: "DELETE" }).catch((err) =>
      console.error("Failed to clear curriculum in MongoDB:", err)
    );
  };

  // Render subject icon helper
  const renderSubjectIcon = (iconName: string) => {
    switch (iconName) {
      case "Cpu":
        return <Cpu id="icon-cpu" className="w-3.5 h-3.5 text-black" />;
      case "Orbit":
        return <Orbit id="icon-orbit" className="w-3.5 h-3.5 text-black" />;
      case "BookOpen":
        return <BookOpen id="icon-book" className="w-3.5 h-3.5 text-black" />;
      default:
        return <GraduationCap id="icon-grad" className="w-3.5 h-3.5 text-black" />;
    }
  };

  const activeMessages = getCurrentMessages();

  // Filter subjects and lectures by search query
  const filteredSubjects = subjects.map(subj => {
    const filteredLectures = subj.lectures.filter(lec =>
      lec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lec.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...subj, lectures: filteredLectures };
  }).filter(subj => subj.lectures.length > 0);

  // Highlight search text in notes
  const renderHighlightedNotesContent = () => {
    if (!currentLecture) return null;
    const content = currentLecture.content;
    if (!searchInNotes.trim()) {
      return <MarkdownView content={content} textSize={readerTextSize} />;
    }

    const occurrences = (content.toLowerCase().match(new RegExp(searchInNotes.toLowerCase(), "g")) || []).length;
    return (
      <div className="space-y-4">
        {occurrences > 0 && (
          <div className="bg-[#FAF9F6] border border-[#E5E3E1] px-3 py-2 rounded text-xs flex items-center justify-between text-[#8C8A88] font-bold tracking-wider">
            <span>🔍 Found {occurrences} match{occurrences > 1 ? "es" : ""} for "{searchInNotes}"</span>
            <button onClick={() => setSearchInNotes("")} className="text-black hover:underline text-[10px]">Clear</button>
          </div>
        )}
        <MarkdownView content={content} textSize={readerTextSize} />
      </div>
    );
  };

  // Drag and Drop File Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only remove state if drag is leaving the main window
    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const processUploadedFile = (file: File) => {
    setDroppedFileName(file.name);
    setUploadLoading(true);
    setShowSuggestionConfirm(true); // Open suggested view immediately in loading state

    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    const reader = new FileReader();
    if (isImage || isPdf) {
      setDroppedFileType(isPdf ? "pdf" : "image");
      reader.onload = async (event) => {
        const dataUrl = event.target?.result;
        if (typeof dataUrl === "string" && dataUrl.trim()) {
          setDroppedFileDataUrl(dataUrl);
          try {
            const result = await apiFetch<{
              title?: string;
              subject?: string;
              summary?: string;
              content?: string;
            }>("/api/analyze-file", {
              method: "POST",
              body: JSON.stringify({
                fileDataUrl: dataUrl,
                fileName: file.name
              })
            });

            setSuggestedTitle(result.title || file.name.replace(/\.[^/.]+$/, ""));
            setSuggestedSubject(result.subject || "General Study");
            setSuggestedSummary(result.summary || "Summarized study notes.");
            
            const detectedContent = result.content || `# ${result.title || file.name.replace(/\.[^/.]+$/, "")}\n\nThis is an analyzed document from the file **${file.name}**.`;
            setDroppedFileText(detectedContent);
          } catch (err) {
            console.error("AI Analysis failed, falling back:", err);
            const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            const fallbackTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            setSuggestedTitle(fallbackTitle);
            setSuggestedSubject("General Study");
            setSuggestedSummary("A customized study guide parsed from your document.");
            setDroppedFileText(`# ${fallbackTitle}\n\nUploaded file: **${file.name}**`);
          } finally {
            setUploadLoading(false);
          }
        } else {
          console.error("The dropped file could not be read.");
          setUploadLoading(false);
          setShowSuggestionConfirm(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setDroppedFileType("text");
      setDroppedFileDataUrl("");
      reader.onload = async (event) => {
        const text = event.target?.result;
        if (typeof text === "string" && text.trim()) {
          setDroppedFileText(text);

          try {
            const result = await apiFetch<{
              title?: string;
              subject?: string;
              summary?: string;
              content?: string;
            }>("/api/analyze-file", {
              method: "POST",
              body: JSON.stringify({
                fileText: text,
                fileName: file.name
              })
            });

            setSuggestedTitle(result.title || file.name.replace(/\.[^/.]+$/, ""));
            setSuggestedSubject(result.subject || "General Study");
            setSuggestedSummary(result.summary || "Summarized study notes.");
            
            if (result.content && result.content.trim()) {
              setDroppedFileText(result.content);
            }
          } catch (err) {
            console.error("AI Analysis failed, falling back:", err);
            const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            const fallbackTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            setSuggestedTitle(fallbackTitle);
            setSuggestedSubject("General Study");
            setSuggestedSummary("A customized study guide parsed from your text document.");
          } finally {
            setUploadLoading(false);
          }
        } else {
          console.error("The dropped file appears to be empty or unreadable as plain text.");
          setUploadLoading(false);
          setShowSuggestionConfirm(false);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleConfirmSuggestedLecture = (finalTitle: string, finalSubject: string) => {
    const cleanSubject = finalSubject.trim();
    const existingSubject = subjects.find(s => s.name.toLowerCase() === cleanSubject.toLowerCase());
    const subjectId = existingSubject ? existingSubject.id : `subject-${Date.now()}`;
    const lectureId = `lecture-${Date.now()}`;

    const newLecture = {
      id: lectureId,
      title: finalTitle.trim(),
      content: droppedFileText,
      fileName: droppedFileName,
      fileType: droppedFileType,
      fileDataUrl: droppedFileDataUrl,
      originalText: droppedFileType === "text" ? droppedFileText : ""
    };

    if (existingSubject) {
      setSubjects(prev => prev.map(sub => {
        if (sub.id === existingSubject.id) {
          return { ...sub, lectures: [...sub.lectures, newLecture] };
        }
        return sub;
      }));
      setSelectedSubjectId(existingSubject.id);
    } else {
      const newSub: Subject = {
        id: subjectId,
        name: cleanSubject,
        icon: "GraduationCap",
        lectures: [newLecture]
      };
      setSubjects(prev => [...prev, newSub]);
      setSelectedSubjectId(subjectId);
    }

    setSelectedLectureId(lectureId);
    setShowSuggestionConfirm(false);

    // Clean drop buffer
    setDroppedFileName("");
    setDroppedFileText("");
    setDroppedFileDataUrl("");
    setDroppedFileType("text");
    setSuggestedTitle("");
    setSuggestedSubject("");
    setSuggestedSummary("");
  };

  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Render Login state first if user hasn't logged in
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div 
      id="study-hub-root" 
      className="flex h-screen bg-[#FAF9F6] text-[#1A1A1A] font-sans overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Viewport Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-8 text-white border-8 border-dashed border-neutral-600/60 pointer-events-none"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center space-y-4 max-w-sm"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-white flex items-center justify-center text-black shadow-lg">
                <UploadCloud className="w-8 h-8 animate-bounce text-neutral-800" />
              </div>
              <h3 className="font-serif text-2xl font-bold italic">Drop study material here</h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Release your lecture transcripts, slides, notes, or image documents to automatically analyze, transcribe, and structure your study content!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".txt,.md,.json,.csv,.text,.jpg,.jpeg,.png,.webp,.gif,.pdf"
        className="hidden"
      />

      {/* 1. LEFT SIDEBAR: Collapsible Subjects & Lectures */}
      <aside id="sidebar-curriculum" className="w-72 border-r border-[#E5E3E1] flex flex-col flex-shrink-0 bg-[#FAF9F6] z-10">
        
        {/* Sidebar Header */}
        <div className="p-6 border-b border-[#E5E3E1]">
          <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[#8C8A88]">Study Hub</h2>
          <p className="mt-1 font-serif text-xl italic text-black font-semibold">Academic Console</p>
        </div>

        {/* User Card */}
        <div className="px-4 py-3 border-b border-[#E5E3E1]/70 bg-white flex items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2 overflow-hidden">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#E5E3E1]"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden">
              <h4 className="text-xs font-bold text-black truncate leading-tight">{currentUser.name}</h4>
              <p className="text-[10px] text-[#8C8A88] truncate font-medium">{currentUser.email || currentUser.major}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            title="Log out of academic console"
            className="p-1.5 text-[#8C8A88] hover:text-rose-700 hover:bg-rose-50 rounded transition-all shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeleteAccount}
            title="Delete account"
            className="p-1.5 text-[#8C8A88] hover:text-rose-700 hover:bg-rose-50 rounded transition-all shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic File Uploader & Reset actions */}
        <div className="p-3 border-b border-[#E5E3E1]/60 bg-white flex flex-col gap-2">
          <button
            onClick={() => setIsAddLectureOpen(true)}
            className="w-full flex items-center justify-center space-x-1.5 bg-black hover:bg-[#33312F] text-white py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
            title="Add a lecture manually"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Study Note</span>
          </button>
          
          {subjects.length > 0 && (
            <button
              onClick={handleClearAllLectures}
              className="w-full text-center text-[10px] text-rose-700 hover:text-rose-900 font-bold uppercase tracking-wider bg-rose-50/50 hover:bg-rose-50 py-1 rounded transition-colors"
            >
              Delete All Lectures
            </button>
          )}
        </div>

        {/* Minimalist Search Bar */}
        <div className="p-3 border-b border-[#E5E3E1]/70 bg-[#FDFCFB]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#8C8A88]" />
            <input
              type="text"
              placeholder="Search lectures/topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#E5E3E1] rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-black transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2.5 text-[#8C8A88] hover:text-black"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Subjects & Lectures List */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {filteredSubjects.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#8C8A88] italic font-medium space-y-3">
              <p>No lectures loaded.</p>
              <button
                onClick={handleSelectFileClick}
                className="text-[10px] uppercase font-bold text-black border border-[#E5E3E1] bg-white hover:bg-neutral-100 py-1 px-2.5 rounded shadow-xs"
              >
                Choose File
              </button>
            </div>
          ) : (
            filteredSubjects.map((subject) => {
              const isExpanded = expandedSubjects[subject.id] || searchQuery.length > 0;
              return (
                <div key={subject.id} className="space-y-1">
                  {/* Subject Accordion Header */}
                  <div
                    id={`subject-container-${subject.id}`}
                    className="w-full flex items-center justify-between p-1 rounded hover:bg-[#F2F0EB]/80 transition-colors group relative"
                  >
                    <button
                      id={`subject-btn-${subject.id}`}
                      onClick={() => toggleSubject(subject.id)}
                      className="flex-1 flex items-center space-x-2 p-1 text-left"
                    >
                      <span className="p-1 rounded bg-[#F2F0EB] group-hover:bg-[#E5E3E1] transition-colors">
                        {renderSubjectIcon(subject.icon)}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#33312F] truncate max-w-[130px]">
                        {subject.name}
                      </span>
                    </button>

                    <div className="flex items-center space-x-0.5 pr-1 shrink-0">
                      {/* Add Lecture directly to this folder category */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalSubjectId(subject.id);
                          setIsAddLectureOpen(true);
                        }}
                        className="p-1 text-[#8C8A88] hover:text-black hover:bg-[#E5E3E1] rounded transition-all"
                        title={`Add new lecture to ${subject.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {/* Expand/Collapse Chevron button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSubject(subject.id);
                        }}
                        className="p-1 text-[#8C8A88] hover:text-black rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Nested Lectures List */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden pl-3 pr-1 space-y-1 border-l border-[#E5E3E1] ml-4 mt-1"
                      >
                        {subject.lectures.map((lecture) => {
                          const isSelected = selectedLectureId === lecture.id;
                          return (
                            <div 
                              key={lecture.id}
                              className={`group w-full flex items-center justify-between text-xs rounded transition-all ${
                                isSelected ? "bg-[#F2F0EB]" : "hover:bg-[#F2F0EB]/50"
                              }`}
                            >
                              <button
                                id={`lecture-btn-${lecture.id}`}
                                onClick={() => {
                                  setSelectedSubjectId(subject.id);
                                  setSelectedLectureId(lecture.id);
                                }}
                                className={`flex-1 min-w-0 text-left px-3 py-2 text-xs font-medium flex flex-col gap-0.5 ${
                                  isSelected ? "text-black font-semibold border-l-2 border-black" : "text-[#6B6967]"
                                }`}
                              >
                                <span className="truncate">{lecture.title}</span>
                                {lecture.fileName ? (
                                  <span className="text-[10px] text-[#8C8A88] font-mono flex items-center gap-1 truncate max-w-[155px]">
                                    {lecture.fileType === "image" ? (
                                      <Image className="w-3 h-3 text-[#8C8A88] inline-block shrink-0" />
                                    ) : (
                                      <FileText className="w-3 h-3 text-[#8C8A88] inline-block shrink-0" />
                                    )}
                                    <span className="truncate">{lecture.fileName}</span>
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-neutral-400 font-mono flex items-center gap-1 uppercase tracking-wider">
                                    <BookOpenText className="w-2.5 h-2.5 inline-block shrink-0" />
                                    Study Note
                                  </span>
                                )}
                              </button>
                              
                              {/* Inline Delete Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLecture(lecture.id, subject.id);
                                }}
                                className="p-1.5 opacity-30 group-hover:opacity-100 text-[#8C8A88] hover:text-rose-700 transition-all rounded shrink-0 mr-1"
                                title="Delete lecture material"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#E5E3E1] bg-[#F2F0EB]/30 flex flex-col space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#8C8A88]">
            <span className="font-semibold">Model status</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </div>
      </aside>

      {/* 2. CENTRAL CHAT WORKSPACE / FILE DROP EMPTY STATE */}
      {!currentLecture ? (
        <main id="chat-workspace" className="flex-1 flex flex-col bg-white overflow-hidden relative justify-center items-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div 
              onClick={handleSelectFileClick}
              className="border-2 border-dashed border-[#E5E3E1] hover:border-black bg-[#FAF9F6] rounded-2xl p-10 cursor-pointer transition-all hover:shadow-md flex flex-col items-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center shadow">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif text-lg font-bold text-black italic">Drop lecture file here</h3>
                <p className="text-xs text-[#8C8A88] leading-relaxed">
                  Or <span className="text-black font-semibold underline">browse locally</span> to upload text, notes, or chapter outlines.
                </p>
              </div>
              <div className="pt-2">
                <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest bg-white border border-[#E5E3E1] py-1 px-3 rounded-full">
                  Supports PDF (.pdf), text (.txt, .md) & images (.png, .jpg, .webp)
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center space-x-2 text-xs text-[#8C8A88]">
                <span>No material ready?</span>
                <button
                  onClick={handleLoadSamples}
                  className="text-black font-bold underline hover:no-underline"
                >
                  Load Pre-seeded Sample Lectures
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main id="chat-workspace" className="flex-1 flex flex-col bg-white overflow-hidden relative">
          {/* Workspace Header */}
          <header className="h-16 border-b border-[#E5E3E1] flex items-center justify-between px-8 bg-white z-10 flex-shrink-0">
            <div className="flex items-center gap-4 overflow-hidden">
              <span className="text-[10px] uppercase tracking-widest bg-black text-white px-2.5 py-0.5 font-bold">
                Academic Dialogue
              </span>
              <h1 className="font-serif text-base font-bold text-black truncate tracking-tight">
                {currentLecture.title}
              </h1>
            </div>

            <div className="flex items-center space-x-2">
              {/* Delete Active Lecture Button */}
              <button
                onClick={() => handleDeleteLecture(currentLecture.id, selectedSubjectId)}
                className="text-[10px] uppercase tracking-wider font-bold px-3 py-2 rounded border border-rose-200 bg-rose-50/50 text-rose-800 hover:bg-rose-50 hover:text-rose-900 transition-all flex items-center space-x-1.5"
                title="Delete this lecture"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Notes</span>
              </button>

              {/* Take Quiz Button */}
              <button
                onClick={() => setIsQuizModalOpen(true)}
                className="text-[10px] uppercase tracking-wider font-bold px-3.5 py-2 rounded border border-[#E5E3E1] bg-white text-black hover:bg-black hover:text-white transition-all flex items-center space-x-2"
              >
                <Brain className="w-3.5 h-3.5 text-amber-500" />
                <span>Assessing learning</span>
              </button>

              {/* Toggle Drawer Button */}
              <button
                id="toggle-drawer-btn"
                onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
                className={`text-[10px] uppercase tracking-wider font-bold px-3.5 py-2 rounded border transition-all flex items-center space-x-2 ${
                  rightDrawerOpen 
                    ? "bg-[#F2F0EB] border-[#E5E3E1] text-[#33312F] hover:bg-[#E5E3E1]"
                    : "bg-black border-black text-white hover:bg-[#33312F] shadow-sm"
                }`}
              >
                <BookOpenText className="w-3.5 h-3.5" />
                <span>{rightDrawerOpen ? "Hide Notes" : "Open Notes"}</span>
              </button>
            </div>
          </header>

          {/* Connected File Banner */}
          {currentLecture.fileName && (
            <div className="bg-[#FAF9F6] border-b border-[#E5E3E1] px-8 py-2.5 flex items-center justify-between text-xs text-[#6B6967] z-10 shrink-0 shadow-xs">
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <div className="p-1.5 bg-white rounded border border-[#E5E3E1] shrink-0 text-black shadow-2xs">
                  {currentLecture.fileType === "image" ? (
                    <Image className="w-3.5 h-3.5" />
                  ) : currentLecture.fileType === "pdf" ? (
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-xs font-bold text-black truncate max-w-sm" title={currentLecture.fileName}>
                      {currentLecture.fileName}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#E5E3E1]/70 text-black">
                      Active Source
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8C8A88] truncate">
                    {currentLecture.fileType === "image" ? "Referencing uploaded diagram/handout" : currentLecture.fileType === "pdf" ? "Referencing uploaded PDF document source" : "Referencing uploaded text/document source"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setRightDrawerOpen(true);
                  setDrawerTab("source");
                }}
                className="text-[10px] font-bold uppercase tracking-wider text-black bg-white border border-[#E5E3E1] hover:bg-neutral-50 px-3 py-1.5 rounded-lg transition-all shadow-xs shrink-0 flex items-center space-x-1.5"
              >
                <span>View Original File / Source</span>
              </button>
            </div>
          )}

          {/* Messages Scrolling Container */}
          <div className="flex-1 overflow-y-auto p-8 bg-white space-y-6 scrollbar-thin">
            
            {/* Welcome Dashboard for Custom Uploads or default notes */}
            {activeMessages.length <= 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-[#E5E3E1] bg-[#FAF9F6] rounded-xl p-6 space-y-4 max-w-2xl mx-auto"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="font-serif text-lg font-bold text-black">Welcome to active assessment</h3>
                    <p className="text-xs text-[#6B6967] leading-relaxed">
                      This AI tutor is fully grounded in your active notes. Ask clarify questions, requests mock exam scenarios, or check your readiness with the quiz.
                    </p>
                  </div>
                  <div className="p-3 bg-black text-white rounded-lg">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                </div>

                <div className={`grid gap-3 pt-2 ${currentLecture.fileName ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                  <button
                    onClick={() => setIsQuizModalOpen(true)}
                    className="bg-white hover:bg-black text-black hover:text-white border border-[#E5E3E1] hover:border-black p-3 rounded-lg text-left transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500">Practice Quiz</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <h5 className="text-xs font-bold">Assess My Learning</h5>
                    <p className="text-[10px] text-[#8C8A88] leading-tight">Generate a 3-question MCQ to test knowledge.</p>
                  </button>

                  <button
                    onClick={() => handleQuickQuestion("Write a bulleted summary explaining the absolute key takeaways from these lecture notes.")}
                    className="bg-white hover:bg-black text-black hover:text-white border border-[#E5E3E1] hover:border-black p-3 rounded-lg text-left transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-blue-500">AI Assistant</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <h5 className="text-xs font-bold">Key Takeaways</h5>
                    <p className="text-[10px] text-[#8C8A88] leading-tight">Summarize core bullet points immediately.</p>
                  </button>

                  {currentLecture.fileName && (
                    <button
                      onClick={() => {
                        setRightDrawerOpen(true);
                        setDrawerTab("source");
                      }}
                      className="bg-white hover:bg-black text-black hover:text-white border border-[#E5E3E1] hover:border-black p-3 rounded-lg text-left transition-all space-y-1 group col-span-2 sm:col-span-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Original Source</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <h5 className="text-xs font-bold flex items-center gap-1.5 truncate">
                        {currentLecture.fileType === "image" ? <Image className="w-3.5 h-3.5" /> : currentLecture.fileType === "pdf" ? <FileText className="w-3.5 h-3.5 text-red-600" /> : <FileText className="w-3.5 h-3.5" />}
                        <span>View Original File</span>
                      </h5>
                      <p className="text-[10px] text-[#8C8A88] leading-tight truncate">
                        {currentLecture.fileName}
                      </p>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {activeMessages.map((msg) => {
                const isTutor = msg.sender === "tutor";
                return (
                  <motion.div
                    id={`chat-msg-${msg.id}`}
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${isTutor ? "justify-start" : "justify-end"}`}
                  >
                    <div className={`max-w-2xl flex items-start gap-4 ${isTutor ? "flex-row" : "flex-row-reverse"}`}>
                      {/* Avatar Badge */}
                      <div className={`w-8 h-8 rounded flex items-center justify-center shadow-sm text-sm shrink-0 ${
                        isTutor 
                          ? "bg-[#F2F0EB] text-black font-serif italic" 
                          : "bg-black text-white text-[10px] font-bold"
                      }`}>
                        {isTutor ? "T" : "ME"}
                      </div>

                      {/* Bubble Content */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-[#8C8A88] font-semibold">
                            {isTutor ? "Academic Tutor" : "Student"}
                          </span>
                          <span className="text-[9px] text-[#B5B3B0] font-medium">{msg.timestamp}</span>
                        </div>
                        
                        <div className={`p-5 rounded-lg border leading-relaxed ${
                          isTutor 
                            ? "bg-[#F9F8F6] border-[#F2F0EB] text-[#33312F]" 
                            : "bg-[#F2F0EB] border-[#E5E3E1] text-black text-[14px]"
                        }`}>
                          {isTutor ? (
                            <MarkdownView content={msg.text} />
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Typing/Loading Indicator */}
            {isSending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded bg-[#F2F0EB] flex items-center justify-center font-serif italic text-sm animate-pulse text-black">
                    T
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-[#8C8A88] font-semibold">Academic Tutor</p>
                    <div className="bg-[#F9F8F6] border border-[#F2F0EB] p-4 rounded-lg flex items-center space-x-3 shadow-sm">
                      <span className="text-xs text-[#6B6967] italic">Consulting academic notes and formulating answer...</span>
                      <div className="flex space-x-1 shrink-0">
                        <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          {/* Invisible target to force scroll */}
          <div ref={messagesEndRef} />
        </div>

        {/* Workspace Footer & Text Input Pane */}
        <footer className="p-6 bg-[#FAF9F6] border-t border-[#E5E3E1] flex-shrink-0 space-y-4">
          
          {/* Quick sample question suggestions based on active lecture */}
          {activeMessages.length <= 1 && !isSending && (
            <div id="quick-questions" className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#8C8A88] font-bold">Curriculum Suggestions</p>
              <div className="flex flex-wrap gap-2">
                <button
                  id="quick-q-clarify"
                  onClick={() => handleQuickQuestion("Can you clarify the core concepts in this lecture with dynamic examples?")}
                  className="text-[11px] uppercase tracking-wider bg-white hover:bg-black text-[#6B6967] hover:text-white border border-[#E5E3E1] hover:border-black rounded-full py-1.5 px-4 transition-all font-semibold"
                >
                  💡 Clarify core concept
                </button>
                <button
                  id="quick-q-summary"
                  onClick={() => handleQuickQuestion("Write a bulleted summary explaining the absolute key takeaways from these lecture notes.")}
                  className="text-[11px] uppercase tracking-wider bg-white hover:bg-black text-[#6B6967] hover:text-white border border-[#E5E3E1] hover:border-black rounded-full py-1.5 px-4 transition-all font-semibold"
                >
                  📝 Summarize key takeaways
                </button>
                <button
                  id="quick-q-fallback"
                  onClick={() => handleQuickQuestion("Can you explain how this concept compares to modern quantum mechanics?")}
                  className="text-[11px] uppercase tracking-wider bg-white hover:bg-black text-[#6B6967] hover:text-white border border-[#E5E3E1] hover:border-black rounded-full py-1.5 px-4 transition-all font-semibold"
                >
                  🧠 Ask external topic
                </button>
              </div>
            </div>
          )}

          {/* Interactive Chat Input Area */}
          <div className="relative flex items-center">
            <input
              id="chat-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the lecture notes..."
              disabled={isSending}
              className="w-full bg-white border border-[#E5E3E1] rounded-full py-3.5 pl-6 pr-28 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder-[#B5B3B0] transition-all"
            />
            <button
              id="send-message-btn"
              onClick={() => sendMessage()}
              disabled={isSending || !inputText.trim()}
              className={`absolute right-2 px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold transition-all ${
                isSending || !inputText.trim()
                  ? "bg-[#F2F0EB] text-[#B5B3B0] cursor-not-allowed"
                  : "bg-black text-white hover:bg-[#33312F] shadow-sm"
              }`}
            >
              Send
            </button>
          </div>
        </footer>
      </main>
      )}

      {/* 3. RIGHT DRAWER: Display Raw Lecture Notes */}
      <AnimatePresence>
        {rightDrawerOpen && currentLecture && (
          <motion.section
            id="drawer-lecture-content"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: isNotesMaximized ? 560 : 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="border-l border-[#E5E3E1] bg-[#FDFCFB] flex flex-col flex-shrink-0 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-[#E5E3E1] flex justify-between items-center bg-[#FDFCFB] flex-shrink-0">
              <div className="flex items-center gap-2">
                <BookOpenText className="w-4 h-4 text-black" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-black">Source Context</h2>
              </div>
              <div className="flex items-center space-x-1">
                {/* Maximize Toggle */}
                <button
                  onClick={() => setIsNotesMaximized(!isNotesMaximized)}
                  className="p-1.5 text-[#8C8A88] hover:text-black hover:bg-[#F2F0EB] rounded transition-all"
                  title={isNotesMaximized ? "Minimize size" : "Maximize size"}
                >
                  {isNotesMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                {/* Copy notes */}
                <button
                  id="copy-notes-btn"
                  onClick={handleCopyNotes}
                  className="p-1.5 text-[#8C8A88] hover:text-black hover:bg-[#F2F0EB] rounded transition-all"
                  title="Copy notes to clipboard"
                >
                  {copied ? <ClipboardCheck className="w-4 h-4 text-emerald-700" /> : <ClipboardCopy className="w-4 h-4" />}
                </button>
                <button
                  id="close-drawer-btn"
                  onClick={() => setRightDrawerOpen(false)}
                  className="p-1.5 text-[#8C8A88] hover:text-black hover:bg-[#F2F0EB] rounded transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="flex border-b border-[#E5E3E1] bg-[#FAF9F6] px-4 shrink-0">
              <button
                onClick={() => setDrawerTab("notes")}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                  drawerTab === "notes"
                    ? "border-b-2 border-black text-black"
                    : "border-b-2 border-transparent text-[#8C8A88] hover:text-black"
                }`}
              >
                <BookOpenText className="w-3.5 h-3.5" />
                <span>Study Guide</span>
              </button>
              <button
                onClick={() => setDrawerTab("source")}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                  drawerTab === "source"
                    ? "border-b-2 border-black text-black"
                    : "border-b-2 border-transparent text-[#8C8A88] hover:text-black"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Original File / Source</span>
              </button>
            </div>

            {drawerTab === "notes" ? (
              <>
                {/* Premium Interactive Reader Toolbar */}
                <div className="px-6 py-3 border-b border-[#E5E3E1]/70 bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                  {/* Text Size Configurer */}
                  <div className="flex items-center space-x-1">
                    <Type className="w-3.5 h-3.5 text-[#8C8A88] mr-1.5" />
                    {(["sm", "base", "lg"] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setReaderTextSize(sz)}
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${
                          readerTextSize === sz
                            ? "bg-black text-white"
                            : "bg-white hover:bg-[#F2F0EB] text-[#6B6967] border border-[#E5E3E1]"
                        }`}
                      >
                        {sz === "sm" ? "A-" : sz === "base" ? "A" : "A+"}
                      </button>
                    ))}
                  </div>

                  {/* In-Notes Search Filter */}
                  <div className="relative">
                    <Search className="absolute left-2 top-2 w-3 h-3 text-[#8C8A88]" />
                    <input
                      type="text"
                      placeholder="Find in notes..."
                      value={searchInNotes}
                      onChange={(e) => setSearchInNotes(e.target.value)}
                      className="bg-white border border-[#E5E3E1] rounded pl-6 pr-2 py-1 text-[11px] focus:outline-none focus:border-black w-32"
                    />
                  </div>
                </div>

                {/* Scrollable Document Pane */}
                <div className="flex-1 p-8 overflow-y-auto font-serif leading-relaxed text-[#4A4846] text-sm select-text scrollbar-thin">
                  <h3 className="text-xl mb-2 text-black border-l-4 border-black pl-4 font-serif font-bold">
                    {currentLecture.title}
                  </h3>
                  <p className="mb-6 italic text-[#8C8A88] text-xs">Curriculum Core Source — Verified Reference Material</p>
                  
                  <div className="prose prose-sm prose-slate max-w-none">
                    {renderHighlightedNotesContent()}
                  </div>
                </div>
              </>
            ) : (
              /* Original File / Source View */
              <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col space-y-4 scrollbar-thin">
                <div className="bg-[#FAF9F6] border border-[#E5E3E1] rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[9px] font-mono uppercase tracking-wider bg-black text-white px-2 py-0.5 rounded font-bold">
                        {currentLecture.fileType === "image" ? "Image / Visual Source" : currentLecture.fileType === "pdf" ? "PDF Document Source" : "Text Document Source"}
                      </span>
                      <h4 className="font-serif text-sm font-bold text-black truncate mt-1.5" title={currentLecture.fileName || `${currentLecture.title}.txt`}>
                        {currentLecture.fileName || `${currentLecture.title}.txt`}
                      </h4>
                      <p className="text-[10px] text-[#8C8A88]">
                        Uploaded / processed file referenced directly by AI
                      </p>
                    </div>
                    <div className="p-2.5 bg-[#F2F0EB] text-black rounded-lg shrink-0">
                      {currentLecture.fileType === "image" ? <Image className="w-5 h-5" /> : currentLecture.fileType === "pdf" ? <FileText className="w-5 h-5 text-red-600" /> : <FileText className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* File Visualization Display */}
                {currentLecture.fileType === "pdf" && currentLecture.fileDataUrl ? (
                  <div className="space-y-2 flex-1 flex flex-col min-h-[350px]">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8C8A88]">Interactive PDF Document Viewer</span>
                    <div className="border border-[#E5E3E1] p-1.5 rounded-xl bg-neutral-50 shadow-inner flex-1 flex">
                      <iframe
                        src={currentLecture.fileDataUrl}
                        title={currentLecture.fileName || "PDF document"}
                        className="w-full h-full min-h-[400px] rounded-lg bg-white border border-[#E5E3E1]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : null}

                {currentLecture.fileType === "image" && currentLecture.fileDataUrl ? (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8C8A88]">Visual Upload Preview</span>
                    <div className="border border-[#E5E3E1] p-3 rounded-xl bg-neutral-50 shadow-inner flex items-center justify-center">
                      <img 
                        src={currentLecture.fileDataUrl} 
                        alt={currentLecture.fileName || "Uploaded document"} 
                        className="max-h-[280px] max-w-full object-contain rounded-lg border border-[#E5E3E1] bg-white shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : null}

                {/* Raw Transcribed text / Source reference text */}
                {currentLecture.fileType !== "pdf" && (
                  <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8C8A88]">Source Text Reference</span>
                    <div className="flex-1 border border-[#E5E3E1] bg-[#FAF9F6]/50 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-[#555] overflow-y-auto whitespace-pre-wrap select-text shadow-inner">
                      {currentLecture.originalText || currentLecture.content}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Drawer Footer info / trigger quiz */}
            <div className="p-3 bg-[#FAF9F6] border-t border-[#E5E3E1] flex flex-col items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setIsQuizModalOpen(true)}
                className="w-full bg-black hover:bg-[#33312F] text-white py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center justify-center space-x-1.5"
              >
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                <span>Test Knowledge of this section</span>
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 4. MODALS & OVERLAYS */}
      {/* Upload Lecture Material Modal (Manual Input) */}
      {isAddLectureOpen && (
        <AddLectureModal
          subjects={subjects}
          preselectedSubjectId={modalSubjectId}
          onClose={() => {
            setIsAddLectureOpen(false);
            setModalSubjectId(undefined);
          }}
          onAddLecture={handleAddCustomLecture}
        />
      )}

      {/* Interactive Quiz Assessment Modal */}
      {isQuizModalOpen && currentLecture && (
        <QuizModal
          lectureTitle={currentLecture.title}
          lectureContext={currentLecture.content}
          onClose={() => setIsQuizModalOpen(false)}
        />
      )}

      {/* Suggested Lecture Metadata Confirmation Modal */}
      {showSuggestionConfirm && (
        <SuggestedLectureModal
          fileName={droppedFileName}
          suggestedTitle={suggestedTitle}
          suggestedSubject={suggestedSubject}
          suggestedSummary={suggestedSummary}
          isLoading={uploadLoading}
          onClose={() => setShowSuggestionConfirm(false)}
          onConfirm={handleConfirmSuggestedLecture}
        />
      )}

    </div>
  );
}
