import React, { useState, useEffect, useRef } from "react";
import { GraduationCap, Sparkles, Mail, Lock, User as UserIcon } from "lucide-react";
import { motion } from "motion/react";
import { User } from "../types.ts";
import { apiFetch, setAuthSession } from "../lib/api.ts";

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-gsi");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  // undefined = still checking, null = not set up, string = ready to use
  const [googleClientId, setGoogleClientId] = useState<string | null | undefined>(undefined);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const finishGoogleLogin = async (idToken: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ token: string; user: User }>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      setAuthSession(data.token, data.user);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config = await apiFetch<{ googleClientId: string | null }>("/api/auth/config");
        if (cancelled) return;
        if (!config.googleClientId) {
          setGoogleClientId(null);
          return;
        }
        setGoogleClientId(config.googleClientId);
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (response: { credential?: string }) => {
            if (response.credential) {
              void finishGoogleLogin(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        setGoogleReady(true);
      } catch (err) {
        console.error("Google sign-in setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleReady || !googleBtnRef.current || !window.google?.accounts?.id) return;
    googleBtnRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 350,
      logo_alignment: "left",
    });
  }, [googleReady]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all credentials.");
      return;
    }

    if (isSignUp && !name) {
      setError("Please provide your name.");
      return;
    }

    setLoading(true);
    try {
      const path = isSignUp ? "/api/auth/register" : "/api/auth/login";
      const body = isSignUp
        ? { name, email, password, major: "Student" }
        : { email, password };

      const data = await apiFetch<{ token: string; user: User }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      setAuthSession(data.token, data.user);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: User }>("/api/auth/guest", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setAuthSession(data.token, data.user);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Guest login failed. Is the server connected to MongoDB?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen w-full bg-[#FAF9F6] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      
      <div className="absolute top-0 left-0 w-full h-1.5 bg-black" />
      
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[#F2F0EB]/50 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-[#F2F0EB]/50 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white border border-[#E5E3E1] shadow-xl rounded-xl p-8 relative z-10"
      >
        <div className="text-center space-y-2 mb-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-black flex items-center justify-center text-white mb-3 shadow-md">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-black italic">
            Study Hub
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8C8A88] font-bold">
            Academic Assistant Portal
          </p>
        </div>

        {/* Google / Gmail sign-in — only shown when configured */}
        {googleClientId ? (
          <div className="mb-5 space-y-3">
            {googleReady ? (
              <div className="flex justify-center" ref={googleBtnRef} />
            ) : (
              <p className="text-[10px] text-center text-[#8C8A88]">Loading Google sign-in…</p>
            )}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#E5E3E1]" />
              <span className="text-[10px] uppercase tracking-widest text-[#8C8A88] font-bold">or email</span>
              <div className="h-px flex-1 bg-[#E5E3E1]" />
            </div>
          </div>
        ) : null}

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          
          {isSignUp && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[#6B6967]">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-4 h-4 text-[#8C8A88]" />
                <input
                  type="text"
                  placeholder="e.g., Alex Mercer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="w-full bg-[#FAF9F6] border border-[#E5E3E1] rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-black transition-all text-black"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-[#6B6967]">
              Academic Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-[#8C8A88]" />
              <input
                type="email"
                placeholder="student@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full bg-[#FAF9F6] border border-[#E5E3E1] rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-black transition-all text-black"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-[#6B6967]">
              Security Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-[#8C8A88]" />
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-[#FAF9F6] border border-[#E5E3E1] rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-black transition-all text-black"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 p-2.5 rounded text-center">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-[#33312F] disabled:opacity-60 text-white py-3 rounded-lg text-xs uppercase tracking-widest font-bold transition-all shadow-md mt-6"
          >
            {loading ? "Please wait..." : isSignUp ? "Register Account" : "Access Console"}
          </button>
        </form>

        <div className="text-center mt-6 pt-5 border-t border-[#E5E3E1]/70 space-y-4">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            disabled={loading}
            className="text-xs text-[#6B6967] hover:text-black hover:underline font-semibold"
          >
            {isSignUp ? "Already registered? Sign In" : "Need an academic profile? Create Account"}
          </button>

          <div>
            <span className="text-[10px] text-[#8C8A88] font-bold uppercase tracking-widest block mb-2">— Or —</span>
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full bg-[#FAF9F6] hover:bg-[#F2F0EB] text-black border border-[#E5E3E1] py-2 rounded-lg text-xs uppercase tracking-wider font-bold transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>Quick Demo Guest Login</span>
            </button>
          </div>
        </div>

        <div className="text-center mt-8 text-[9px] text-[#B5B3B0] font-mono tracking-wider">
          EST. 2026 // SECURED CREDENTIAL CONSOLE
        </div>
      </motion.div>
    </div>
  );
}
