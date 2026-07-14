import React, { useState, useEffect, useRef } from "react";
import { GraduationCap, Mail, Lock, User as UserIcon } from "lucide-react";
import { motion } from "motion/react";
import { User } from "../types.ts";
import { apiFetch, setAuthSession } from "../lib/api.ts";
import { BloomFlower } from "./BloomFlower.tsx";

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
    const width = Math.min(350, Math.max(240, googleBtnRef.current.parentElement?.clientWidth || 280));
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width,
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

  return (
    <div id="login-container" className="login-shell">
      <BloomFlower className="bloom-flower--tl" delay={0.05} size={260} />
      <BloomFlower className="bloom-flower--br" delay={0.28} size={240} mirror />

      <motion.div
        className="login-stage"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="login-brand">
          <motion.div
            className="login-brand__mark"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            <GraduationCap className="w-6 h-6" />
          </motion.div>
          <motion.h1
            className="login-brand__name"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.14 }}
          >
            Study Hub
          </motion.h1>
          <motion.p
            className="login-brand__tag"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.28 }}
          >
            Your lectures, chat, and quizzes — one place.
          </motion.p>
        </header>

        <div className="login-panel">
          {googleClientId ? (
            <div className="space-y-3">
              {googleReady ? (
                <div className="login-google-slot" ref={googleBtnRef} />
              ) : (
                <p className="login-google-loading">Loading Google sign-in…</p>
              )}
              <div className="login-divider">
                <span>or email</span>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="login-field">
                <label htmlFor="login-name">Full name</label>
                <div className="login-input-wrap">
                  <UserIcon />
                  <input
                    id="login-name"
                    type="text"
                    placeholder="Alex Mercer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <div className="login-input-wrap">
                <Mail />
                <input
                  id="login-email"
                  type="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <Lock />
                <input
                  id="login-password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </div>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="login-switch">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              disabled={loading}
            >
              {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
