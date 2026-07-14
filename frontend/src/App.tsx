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
  Image,
  Menu
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
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  // Open notes drawer by default on desktop only
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setRightDrawerOpen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  const GENERAL_CHAT_ID = "__general__";
  const activeChatId = currentLecture?.id ?? GENERAL_CHAT_ID;

  // Get current messages for active lecture (or open general chat)
  const getCurrentMessages = (): Message[] => {
    const history = chatHistories[activeChatId];
    if (history) return history;

    if (!currentLecture) {
      return [
        {
          id: "welcome-general",
          sender: "tutor",
          text: `Hi — I'm your Study Hub tutor.

Ask me anything while you get set up. When you upload a lecture on the left, I can ground answers in that material too.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ];
    }

    return [
      {
        id: "welcome",
        sender: "tutor",
        text: `Greetings! I am your academic tutor for **${currentLecture.title}**. 

I have analyzed your lecture material and am fully grounded in its source content. Ask me to break down difficult concepts with clear examples, summarize sections, or clarify out-of-scope queries.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  };

  // Trigger quick question buttons
  const handleQuickQuestion = (question: string) => {
    if (isSending) return;
    setInputText(question);
    sendMessage(question);
  };

  // Send message API request (works with or without a selected lecture)
  const sendMessage = async (overrideText?: string) => {
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
    const currentHistory = chatHistories[activeChatId] || getCurrentMessages();
    const updatedHistory = [...currentHistory, studentMessage];
    setChatHistories(prev => ({
      ...prev,
      [activeChatId]: updatedHistory
    }));

    try {
      // POST Request directly to Express backend API (Gemini)
      const data = await apiFetch<{ reply: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: textToSend,
          lectureContext: currentLecture?.content || "",
          fileName: currentLecture?.fileName || (currentLecture ? `${currentLecture.title}.txt` : undefined),
          fileType: currentLecture?.fileType || "text",
          originalText: currentLecture?.originalText || currentLecture?.content || ""
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
        [activeChatId]: finalHistory
      }));

      // Persist chat thread to MongoDB when tied to a lecture
      if (currentLecture) {
        apiFetch(`/api/chat/${encodeURIComponent(currentLecture.id)}`, {
          method: "PUT",
          body: JSON.stringify({ messages: finalHistory }),
        }).catch((err) => console.error("Failed to save chat history:", err));
      }
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
        [activeChatId]: [...updatedHistory, errorMessage]
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
          <div className="bg-[#f4f8f9] border border-[#c5d5da] px-3 py-2 rounded text-xs flex items-center justify-between text-[#5a737a] font-bold tracking-wider">
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
      className="app-shell flex h-[100dvh] max-h-[100dvh] text-[#0c1a1f] font-sans overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close curriculum menu"
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

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
              <div className="mx-auto w-16 h-16 rounded-xl bg-white flex items-center justify-center text-ink shadow-lg">
                <UploadCloud className="w-8 h-8 animate-bounce text-[#076b5c]" />
              </div>
              <h3 className="font-display text-2xl font-extrabold tracking-tight">Drop study material here</h3>
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
      <aside
        id="sidebar-curriculum"
        className={`app-sidebar fixed inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 border-r border-[#c5d5da] transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:z-10 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        
        {/* Sidebar Header */}
        <div className="px-4 py-4 sm:p-5 border-b border-[#c5d5da] flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-ink leading-none">Study Hub</h2>
            <p className="mt-1 text-[11px] sm:text-xs font-medium text-[#5a737a]">Your lectures & tutors</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-[#c5d5da]/70 bg-white/80 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-2 overflow-hidden min-w-0">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#c5d5da]"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-ink text-white flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden min-w-0">
              <h4 className="text-xs font-bold text-black truncate leading-tight">{currentUser.name}</h4>
              <p className="text-[10px] text-[#5a737a] truncate font-medium">{currentUser.email || currentUser.major}</p>
            </div>
          </div>
          <div className="flex items-center shrink-0">
          <button 
            onClick={handleLogout}
            title="Log out of academic console"
            className="p-2 text-[#5a737a] hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeleteAccount}
            title="Delete account"
            className="p-2 text-[#5a737a] hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          </div>
        </div>

        {/* Dynamic File Uploader & Reset actions */}
        <div className="p-3 border-b border-[#c5d5da]/60 bg-white flex flex-col gap-2">
          <button
            onClick={() => setIsAddLectureOpen(true)}
            className="w-full flex items-center justify-center space-x-1.5 bg-ink hover:bg-[#076b5c] text-white py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
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
        <div className="p-3 border-b border-[#c5d5da]/70 bg-[#f4f8f9]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#5a737a]" />
            <input
              type="text"
              placeholder="Search lectures/topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#c5d5da] rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#0d8f7c] transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2.5 text-[#5a737a] hover:text-black"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Subjects & Lectures List */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {filteredSubjects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <button
                type="button"
                onClick={handleSelectFileClick}
                className="w-full text-left border-2 border-dashed border-[#c5d5da] hover:border-[#0d8f7c] bg-white/70 hover:bg-white rounded-xl p-4 transition-all group"
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-ink text-white flex items-center justify-center shadow-[0_10px_24px_-12px_rgba(13,143,124,0.45)] group-hover:scale-105 transition-transform">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold tracking-tight text-ink">No lectures loaded</p>
                    <p className="text-[11px] text-[#5a737a] leading-relaxed">
                      Drop a file here or choose one to start grounding the tutor.
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center w-full bg-ink text-white text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg group-hover:bg-[#076b5c] transition-colors">
                    Choose File
                  </span>
                  <span className="text-[9px] uppercase tracking-widest font-bold text-[#5a737a]">
                    PDF · text · images
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={handleLoadSamples}
                className="w-full text-[11px] font-semibold text-[#076b5c] hover:text-ink underline underline-offset-2"
              >
                Load sample lectures
              </button>
            </motion.div>
          ) : (
            filteredSubjects.map((subject) => {
              const isExpanded = expandedSubjects[subject.id] || searchQuery.length > 0;
              return (
                <div key={subject.id} className="space-y-1">
                  {/* Subject Accordion Header */}
                  <div
                    id={`subject-container-${subject.id}`}
                    className="w-full flex items-center justify-between p-1 rounded hover:bg-[#e7f0f2]/80 transition-colors group relative"
                  >
                    <button
                      id={`subject-btn-${subject.id}`}
                      onClick={() => toggleSubject(subject.id)}
                      className="flex-1 flex items-center space-x-2 p-1 text-left"
                    >
                      <span className="p-1 rounded bg-[#e7f0f2] group-hover:bg-[#c5d5da] transition-colors">
                        {renderSubjectIcon(subject.icon)}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#0c1a1f] truncate max-w-[130px]">
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
                        className="p-1 text-[#5a737a] hover:text-black hover:bg-[#c5d5da] rounded transition-all"
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
                        className="p-1 text-[#5a737a] hover:text-black rounded"
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
                        className="overflow-hidden pl-3 pr-1 space-y-1 border-l border-[#c5d5da] ml-4 mt-1"
                      >
                        {subject.lectures.map((lecture) => {
                          const isSelected = selectedLectureId === lecture.id;
                          return (
                            <div 
                              key={lecture.id}
                              className={`group w-full flex items-center justify-between text-xs rounded transition-all ${
                                isSelected ? "bg-[#e7f0f2]" : "hover:bg-[#e7f0f2]/50"
                              }`}
                            >
                              <button
                                id={`lecture-btn-${lecture.id}`}
                                onClick={() => {
                                  setSelectedSubjectId(subject.id);
                                  setSelectedLectureId(lecture.id);
                                  setMobileSidebarOpen(false);
                                }}
                                className={`flex-1 min-w-0 text-left px-3 py-2 text-xs font-medium flex flex-col gap-0.5 ${
                                  isSelected ? "text-ink font-semibold border-l-2 border-[#0d8f7c]" : "text-[#2a3d44]"
                                }`}
                              >
                                <span className="truncate">{lecture.title}</span>
                                {lecture.fileName ? (
                                  <span className="text-[10px] text-[#5a737a] font-mono flex items-center gap-1 truncate max-w-[155px]">
                                    {lecture.fileType === "image" ? (
                                      <Image className="w-3 h-3 text-[#5a737a] inline-block shrink-0" />
                                    ) : (
                                      <FileText className="w-3 h-3 text-[#5a737a] inline-block shrink-0" />
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
                                className="p-1.5 opacity-30 group-hover:opacity-100 text-[#5a737a] hover:text-rose-700 transition-all rounded shrink-0 mr-1"
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
        <div className="p-4 border-t border-[#c5d5da] bg-[#e7f0f2]/30 flex flex-col space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#5a737a]">
            <span className="font-semibold">Model status</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </div>
      </aside>

      {/* 2. CENTRAL AI CHAT WORKSPACE */}
        <main id="chat-workspace" className="app-main flex-1 flex flex-col overflow-hidden relative min-w-0">
          {/* Workspace Header */}
          <header className="min-h-12 sm:min-h-14 border-b border-[#c5d5da] flex items-center justify-between gap-2 px-2.5 sm:px-5 lg:px-6 py-1.5 bg-white/80 backdrop-blur-sm z-10 flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-2.5 rounded-lg border border-[#c5d5da] bg-white text-ink shrink-0"
                aria-label="Open curriculum menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <span className="hidden md:inline text-[10px] uppercase tracking-widest bg-ink text-white px-2.5 py-0.5 font-bold shrink-0 rounded">
                Dialogue
              </span>
              <h1 className="font-display text-[13px] sm:text-base font-extrabold text-ink truncate tracking-tight min-w-0">
                {currentLecture ? currentLecture.title : "Ask anything"}
              </h1>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {currentLecture ? (
                <>
              <button
                onClick={() => handleDeleteLecture(currentLecture.id, selectedSubjectId)}
                className="p-2 sm:px-3 sm:py-2 rounded-lg border border-rose-200 bg-rose-50/50 text-rose-800 hover:bg-rose-50 transition-all flex items-center"
                title="Delete this lecture"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden lg:inline ml-1.5 text-[10px] uppercase tracking-wider font-bold">Delete</span>
              </button>

              <button
                onClick={() => setIsQuizModalOpen(true)}
                className="p-2 sm:px-3 sm:py-2 rounded-lg border border-[#c5d5da] bg-white text-ink hover:bg-[#076b5c] hover:text-white hover:border-[#076b5c] transition-all flex items-center"
                title="Take quiz"
              >
                <Brain className="w-3.5 h-3.5 text-[#e8a54b]" />
                <span className="hidden lg:inline ml-1.5 text-[10px] uppercase tracking-wider font-bold">Quiz</span>
              </button>

              <button
                id="toggle-drawer-btn"
                onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
                className={`p-2 sm:px-3 sm:py-2 rounded-lg border transition-all flex items-center ${
                  rightDrawerOpen 
                    ? "bg-[#e7f0f2] border-[#c5d5da] text-[#0c1a1f] hover:bg-[#c5d5da]"
                    : "bg-ink border-ink text-white hover:bg-[#076b5c] hover:border-[#076b5c]"
                }`}
                title={rightDrawerOpen ? "Hide notes" : "Open notes"}
              >
                <BookOpenText className="w-3.5 h-3.5" />
                <span className="hidden lg:inline ml-1.5 text-[10px] uppercase tracking-wider font-bold">{rightDrawerOpen ? "Hide" : "Notes"}</span>
              </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSelectFileClick}
                  className="p-2 sm:px-3 sm:py-2 rounded-lg border border-[#c5d5da] bg-white text-ink hover:bg-[#076b5c] hover:text-white hover:border-[#076b5c] transition-all flex items-center"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline ml-1.5 text-[10px] uppercase tracking-wider font-bold">Upload</span>
                </button>
              )}
            </div>
          </header>

          {/* Connected File Banner */}
          {currentLecture?.fileName && (
            <div className="bg-[#f4f8f9] border-b border-[#c5d5da] px-3 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-2 text-xs text-[#2a3d44] z-10 shrink-0 shadow-xs">
              <div className="flex items-center space-x-2.5 overflow-hidden min-w-0">
                <div className="p-1.5 bg-white rounded border border-[#c5d5da] shrink-0 text-black shadow-2xs">
                  {currentLecture.fileType === "image" ? (
                    <Image className="w-3.5 h-3.5" />
                  ) : currentLecture.fileType === "pdf" ? (
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="font-mono text-xs font-bold text-black truncate" title={currentLecture.fileName}>
                      {currentLecture.fileName}
                    </span>
                    <span className="hidden sm:inline text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#c5d5da]/70 text-black shrink-0">
                      Active Source
                    </span>
                  </div>
                  <span className="text-[10px] text-[#5a737a] truncate hidden sm:block">
                    {currentLecture.fileType === "image" ? "Referencing uploaded diagram/handout" : currentLecture.fileType === "pdf" ? "Referencing uploaded PDF document source" : "Referencing uploaded text/document source"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setRightDrawerOpen(true);
                  setDrawerTab("source");
                }}
                className="text-[10px] font-bold uppercase tracking-wider text-black bg-white border border-[#c5d5da] hover:bg-neutral-50 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all shadow-xs shrink-0 flex items-center space-x-1.5"
              >
                <span className="hidden sm:inline">View Original File / Source</span>
                <span className="sm:hidden">Source</span>
              </button>
            </div>
          )}

          {/* Messages Scrolling Container */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8 min-h-0 scrollbar-thin">
            <div className="chat-thread space-y-4 sm:space-y-6">
            
            {/* Welcome Dashboard for Custom Uploads or default notes */}
            {activeMessages.length <= 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-[#c5d5da] bg-white/80 rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-display text-base sm:text-lg font-extrabold tracking-tight text-ink">
                      {currentLecture ? "Ready when you are" : "Ask me anything"}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-[#2a3d44] leading-relaxed">
                      {currentLecture
                        ? "This tutor is grounded in your active notes. Ask questions, get summaries, or check readiness with a quiz."
                        : "Chat freely here. Upload a lecture on the left anytime if you want answers grounded in your own notes."}
                    </p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-ink text-white rounded-xl shrink-0">
                    <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>

                {currentLecture ? (
                <div className={`grid gap-2 sm:gap-3 pt-1 ${currentLecture.fileName ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                  <button
                    onClick={() => setIsQuizModalOpen(true)}
                    className="bg-white hover:bg-[#076b5c] text-ink hover:text-white border border-[#c5d5da] hover:border-[#076b5c] p-3 rounded-lg text-left transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[#e8a54b]">Practice Quiz</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <h5 className="text-xs font-bold">Assess My Learning</h5>
                    <p className="text-[10px] text-[#5a737a] leading-tight group-hover:text-white/80">Generate a 3-question MCQ to test knowledge.</p>
                  </button>

                  <button
                    onClick={() => handleQuickQuestion("Write a bulleted summary explaining the absolute key takeaways from these lecture notes.")}
                    className="bg-white hover:bg-[#076b5c] text-ink hover:text-white border border-[#c5d5da] hover:border-[#076b5c] p-3 rounded-lg text-left transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[#0d8f7c] group-hover:text-white/90">AI Assistant</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <h5 className="text-xs font-bold">Key Takeaways</h5>
                    <p className="text-[10px] text-[#5a737a] leading-tight group-hover:text-white/80">Summarize core bullet points immediately.</p>
                  </button>

                  {currentLecture.fileName && (
                    <button
                      onClick={() => {
                        setRightDrawerOpen(true);
                        setDrawerTab("source");
                      }}
                      className="bg-white hover:bg-[#076b5c] text-ink hover:text-white border border-[#c5d5da] hover:border-[#076b5c] p-3 rounded-lg text-left transition-all space-y-1 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Original Source</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <h5 className="text-xs font-bold flex items-center gap-1.5 truncate">
                        {currentLecture.fileType === "image" ? <Image className="w-3.5 h-3.5" /> : currentLecture.fileType === "pdf" ? <FileText className="w-3.5 h-3.5 text-red-600" /> : <FileText className="w-3.5 h-3.5" />}
                        <span>View Original File</span>
                      </h5>
                      <p className="text-[10px] text-[#5a737a] leading-tight truncate">
                        {currentLecture.fileName}
                      </p>
                    </button>
                  )}
                </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 pt-1">
                    <button
                      onClick={() => handleQuickQuestion("Help me build a focused study plan for this week.")}
                      className="bg-white hover:bg-[#076b5c] text-ink hover:text-white border border-[#c5d5da] hover:border-[#076b5c] p-3 rounded-lg text-left transition-all space-y-1 group"
                    >
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[#0d8f7c]">Study plan</span>
                      <h5 className="text-xs font-bold">Plan my week</h5>
                      <p className="text-[10px] text-[#5a737a] leading-tight group-hover:text-white/80">Get a clear, realistic study schedule.</p>
                    </button>
                    <button
                      onClick={() => handleQuickQuestion("Explain a hard concept to me as if I'm learning it for the first time.")}
                      className="bg-white hover:bg-[#076b5c] text-ink hover:text-white border border-[#c5d5da] hover:border-[#076b5c] p-3 rounded-lg text-left transition-all space-y-1 group"
                    >
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[#e8a54b]">Explain</span>
                      <h5 className="text-xs font-bold">Simplify a concept</h5>
                      <p className="text-[10px] text-[#5a737a] leading-tight group-hover:text-white/80">Break hard topics into plain language.</p>
                    </button>
                  </div>
                )}
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
                    <div className={`w-full flex items-start gap-2 sm:gap-3 ${isTutor ? "flex-row" : "flex-row-reverse"}`}>
                      {/* Avatar Badge */}
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shadow-sm text-sm shrink-0 ${
                        isTutor 
                          ? "bg-[#e7f0f2] text-ink font-display font-bold" 
                          : "bg-ink text-white text-[10px] font-bold"
                      }`}>
                        {isTutor ? "T" : "ME"}
                      </div>

                      {/* Bubble Content */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-[#5a737a] font-semibold">
                            {isTutor ? "Tutor" : "You"}
                          </span>
                          <span className="text-[9px] text-[#8aa0a6] font-medium">{msg.timestamp}</span>
                        </div>
                        
                        <div className={`p-3 sm:p-4 rounded-xl border leading-relaxed overflow-x-auto text-[13px] sm:text-sm ${
                          isTutor 
                            ? "bg-white/80 border-[#c5d5da] text-[#0c1a1f]" 
                            : "bg-[#e7f0f2] border-[#c5d5da] text-ink"
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
                  <div className="w-8 h-8 rounded-lg bg-[#e7f0f2] flex items-center justify-center font-display font-bold text-sm animate-pulse text-ink">
                    T
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-[#5a737a] font-semibold">Tutor</p>
                    <div className="bg-white/80 border border-[#c5d5da] p-4 rounded-xl flex items-center space-x-3">
                      <span className="text-xs text-[#2a3d44]">Reading your notes…</span>
                      <div className="flex space-x-1 shrink-0">
                        <span className="w-1.5 h-1.5 bg-[#0d8f7c] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-[#0d8f7c] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-[#0d8f7c] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          {/* Invisible target to force scroll */}
          <div ref={messagesEndRef} />
            </div>
        </div>

        {/* Workspace Footer & Text Input Pane */}
        <footer className="chat-composer px-3 pt-3 sm:px-5 sm:pt-4 lg:px-6 bg-[#f4f8f9]/90 border-t border-[#c5d5da] flex-shrink-0 space-y-2.5 sm:space-y-3 backdrop-blur-sm">
          
          {/* Quick sample question suggestions based on active lecture */}
          {activeMessages.length <= 1 && !isSending && (
            <div id="quick-questions" className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#5a737a] font-bold">Suggestions</p>
              <div className="suggestion-rail">
                {currentLecture ? (
                  <>
                <button
                  id="quick-q-clarify"
                  onClick={() => handleQuickQuestion("Can you clarify the core concepts in this lecture with dynamic examples?")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Clarify core concept
                </button>
                <button
                  id="quick-q-summary"
                  onClick={() => handleQuickQuestion("Write a bulleted summary explaining the absolute key takeaways from these lecture notes.")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Summarize key takeaways
                </button>
                <button
                  id="quick-q-fallback"
                  onClick={() => handleQuickQuestion("Can you explain how this concept compares to modern quantum mechanics?")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Ask related topic
                </button>
                  </>
                ) : (
                  <>
                <button
                  onClick={() => handleQuickQuestion("Help me build a focused study plan for this week.")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Build a study plan
                </button>
                <button
                  onClick={() => handleQuickQuestion("What are good techniques for remembering lecture material?")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Memory techniques
                </button>
                <button
                  onClick={() => handleQuickQuestion("Explain spaced repetition and how I should use it.")}
                  className="text-[10px] sm:text-[11px] uppercase tracking-wider bg-white hover:bg-[#076b5c] text-[#2a3d44] hover:text-white border border-[#c5d5da] hover:border-[#076b5c] rounded-lg py-1.5 px-3 transition-all font-semibold"
                >
                  Spaced repetition
                </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Interactive Chat Input Area */}
          <div className="relative flex items-center max-w-3xl mx-auto w-full">
            <input
              id="chat-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentLecture ? "Ask about the lecture notes..." : "Ask the AI tutor anything..."}
              disabled={isSending}
              className="w-full bg-white border border-[#c5d5da] rounded-xl py-3 pl-3.5 sm:pl-5 pr-[4.75rem] sm:pr-28 text-base sm:text-sm focus:outline-none focus:border-[#0d8f7c] focus:ring-1 focus:ring-[#0d8f7c] placeholder-[#8aa0a6] transition-all"
            />
            <button
              id="send-message-btn"
              onClick={() => sendMessage()}
              disabled={isSending || !inputText.trim()}
              className={`absolute right-1.5 sm:right-2 px-3.5 sm:px-5 py-2 rounded-lg text-[11px] sm:text-xs uppercase tracking-widest font-bold transition-all ${
                isSending || !inputText.trim()
                  ? "bg-[#e7f0f2] text-[#8aa0a6] cursor-not-allowed"
                  : "bg-ink text-white hover:bg-[#076b5c]"
              }`}
            >
              Send
            </button>
          </div>
        </footer>
      </main>

      {/* 3. RIGHT DRAWER: Display Raw Lecture Notes */}
      <AnimatePresence>
        {rightDrawerOpen && currentLecture && (
          <motion.section
            id="drawer-lecture-content"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "tween", duration: 0.2 }}
            className={`fixed inset-0 z-40 w-full border-l border-[#c5d5da] app-panel flex flex-col overflow-hidden lg:relative lg:inset-auto lg:z-10 lg:flex-shrink-0 ${
              isNotesMaximized ? "lg:w-[min(560px,42vw)]" : "lg:w-[min(380px,34vw)]"
            }`}
          >
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-[#c5d5da] flex justify-between items-center bg-white/50 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpenText className="w-4 h-4 text-ink shrink-0" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-ink truncate">Source Context</h2>
              </div>
              <div className="flex items-center space-x-1">
                {/* Maximize Toggle — desktop only */}
                <button
                  onClick={() => setIsNotesMaximized(!isNotesMaximized)}
                  className="hidden lg:inline-flex p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded transition-all"
                  title={isNotesMaximized ? "Minimize size" : "Maximize size"}
                >
                  {isNotesMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                {/* Copy notes */}
                <button
                  id="copy-notes-btn"
                  onClick={handleCopyNotes}
                  className="p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded transition-all"
                  title="Copy notes to clipboard"
                >
                  {copied ? <ClipboardCheck className="w-4 h-4 text-emerald-700" /> : <ClipboardCopy className="w-4 h-4" />}
                </button>
                <button
                  id="close-drawer-btn"
                  onClick={() => setRightDrawerOpen(false)}
                  className="p-1.5 text-[#5a737a] hover:text-black hover:bg-[#e7f0f2] rounded transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="flex border-b border-[#c5d5da] bg-[#f4f8f9] px-2 sm:px-4 shrink-0 overflow-x-auto">
              <button
                onClick={() => setDrawerTab("notes")}
                className={`py-3 px-2.5 sm:px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  drawerTab === "notes"
                    ? "border-b-2 border-[#0d8f7c] text-ink"
                    : "border-b-2 border-transparent text-[#5a737a] hover:text-ink"
                }`}
              >
                <BookOpenText className="w-3.5 h-3.5" />
                <span>Study Guide</span>
              </button>
              <button
                onClick={() => setDrawerTab("source")}
                className={`py-3 px-2.5 sm:px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  drawerTab === "source"
                    ? "border-b-2 border-[#0d8f7c] text-ink"
                    : "border-b-2 border-transparent text-[#5a737a] hover:text-ink"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="sm:hidden">Source</span>
                <span className="hidden sm:inline">Original File / Source</span>
              </button>
            </div>

            {drawerTab === "notes" ? (
              <>
                {/* Premium Interactive Reader Toolbar */}
                <div className="px-6 py-3 border-b border-[#c5d5da]/70 bg-[#f4f8f9] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                  {/* Text Size Configurer */}
                  <div className="flex items-center space-x-1">
                    <Type className="w-3.5 h-3.5 text-[#5a737a] mr-1.5" />
                    {(["sm", "base", "lg"] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setReaderTextSize(sz)}
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${
                          readerTextSize === sz
                            ? "bg-ink text-white"
                            : "bg-white hover:bg-[#e7f0f2] text-[#2a3d44] border border-[#c5d5da]"
                        }`}
                      >
                        {sz === "sm" ? "A-" : sz === "base" ? "A" : "A+"}
                      </button>
                    ))}
                  </div>

                  {/* In-Notes Search Filter */}
                  <div className="relative">
                    <Search className="absolute left-2 top-2 w-3 h-3 text-[#5a737a]" />
                    <input
                      type="text"
                      placeholder="Find in notes..."
                      value={searchInNotes}
                      onChange={(e) => setSearchInNotes(e.target.value)}
                      className="bg-white border border-[#c5d5da] rounded pl-6 pr-2 py-1 text-[11px] focus:outline-none focus:border-[#0d8f7c] w-32"
                    />
                  </div>
                </div>

                {/* Scrollable Document Pane */}
                <div className="flex-1 p-4 sm:p-8 overflow-y-auto font-serif leading-relaxed text-[#2a3d44] text-sm select-text scrollbar-thin">
                  <h3 className="text-xl mb-2 text-ink border-l-4 border-[#0d8f7c] pl-4 font-display font-extrabold tracking-tight">
                    {currentLecture.title}
                  </h3>
                  <p className="mb-6 text-[#5a737a] text-xs font-medium">Verified reference material</p>
                  
                  <div className="prose prose-sm prose-slate max-w-none">
                    {renderHighlightedNotesContent()}
                  </div>
                </div>
              </>
            ) : (
              /* Original File / Source View */
              <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col space-y-4 scrollbar-thin">
                <div className="bg-[#f4f8f9] border border-[#c5d5da] rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[9px] font-mono uppercase tracking-wider bg-ink text-white px-2 py-0.5 rounded font-bold">
                        {currentLecture.fileType === "image" ? "Image / Visual Source" : currentLecture.fileType === "pdf" ? "PDF Document Source" : "Text Document Source"}
                      </span>
                      <h4 className="font-display text-sm font-extrabold tracking-tight text-ink truncate mt-1.5" title={currentLecture.fileName || `${currentLecture.title}.txt`}>
                        {currentLecture.fileName || `${currentLecture.title}.txt`}
                      </h4>
                      <p className="text-[10px] text-[#5a737a]">
                        Uploaded / processed file referenced directly by AI
                      </p>
                    </div>
                    <div className="p-2.5 bg-[#e7f0f2] text-black rounded-lg shrink-0">
                      {currentLecture.fileType === "image" ? <Image className="w-5 h-5" /> : currentLecture.fileType === "pdf" ? <FileText className="w-5 h-5 text-red-600" /> : <FileText className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* File Visualization Display */}
                {currentLecture.fileType === "pdf" && currentLecture.fileDataUrl ? (
                  <div className="space-y-2 flex-1 flex flex-col min-h-[350px]">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#5a737a]">Interactive PDF Document Viewer</span>
                    <div className="border border-[#c5d5da] p-1.5 rounded-xl bg-neutral-50 shadow-inner flex-1 flex">
                      <iframe
                        src={currentLecture.fileDataUrl}
                        title={currentLecture.fileName || "PDF document"}
                        className="w-full h-full min-h-[400px] rounded-lg bg-white border border-[#c5d5da]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : null}

                {currentLecture.fileType === "image" && currentLecture.fileDataUrl ? (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#5a737a]">Visual Upload Preview</span>
                    <div className="border border-[#c5d5da] p-3 rounded-xl bg-neutral-50 shadow-inner flex items-center justify-center">
                      <img 
                        src={currentLecture.fileDataUrl} 
                        alt={currentLecture.fileName || "Uploaded document"} 
                        className="max-h-[280px] max-w-full object-contain rounded-lg border border-[#c5d5da] bg-white shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : null}

                {/* Raw Transcribed text / Source reference text */}
                {currentLecture.fileType !== "pdf" && (
                  <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#5a737a]">Source Text Reference</span>
                    <div className="flex-1 border border-[#c5d5da] bg-[#f4f8f9]/50 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-[#555] overflow-y-auto whitespace-pre-wrap select-text shadow-inner">
                      {currentLecture.originalText || currentLecture.content}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Drawer Footer info / trigger quiz */}
            <div className="p-3 bg-[#f4f8f9] border-t border-[#c5d5da] flex flex-col items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setIsQuizModalOpen(true)}
                className="w-full bg-ink hover:bg-[#076b5c] text-white py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5"
              >
                <Brain className="w-3.5 h-3.5 text-[#e8a54b]" />
                <span>Test knowledge of this section</span>
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
