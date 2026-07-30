import { useEffect, useRef, useState } from "react";
import { Download, Share } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** In-app install button — browsers hide the system install UI. */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setVisible(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const install = async () => {
    const deferred = deferredRef.current;
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        deferredRef.current = null;
        setVisible(false);
      }
      return;
    }
    setHint(true);
  };

  return (
    <div className={`install-app ${className}`}>
      <button type="button" className="install-app__btn" onClick={() => void install()}>
        {isIos() ? <Share className="w-4 h-4 shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
        <span>Install NoteLab</span>
      </button>
      {hint && (
        <p className="install-app__hint">
          {isIos() ? (
            <>
              Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              Open the browser menu (⋮) and choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>. On desktop Chrome/Edge, use the install icon in
              the address bar.
            </>
          )}
        </p>
      )}
    </div>
  );
}
