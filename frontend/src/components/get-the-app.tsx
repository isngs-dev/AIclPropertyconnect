"use client";
import { MoreVertical, PlusSquare, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Modal } from "./ui/misc";

// Set these once the native apps are published (frontend/.env.local). Until then the badges open the
// "install from your browser" guide, because the portal is an installable web app (PWA).
const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || "";
const APPSTORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "";

type Platform = "android" | "ios";

function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden fill="currentColor">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5a1.5 1.5 0 0 0 3 0V19h2v3.5a1.5 1.5 0 0 0 3 0V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8A1.5 1.5 0 0 0 2 9.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 3.5 8zm17 0A1.5 1.5 0 0 0 19 9.5v7a1.5 1.5 0 0 0 3 0v-7A1.5 1.5 0 0 0 20.5 8zM15.53 2.16l1.3-1.3a.5.5 0 0 0-.7-.7l-1.48 1.48A5.97 5.97 0 0 0 12 1c-.96 0-1.86.23-2.66.64L7.85.16a.5.5 0 0 0-.7.7l1.3 1.3A5.98 5.98 0 0 0 6 7h12a5.98 5.98 0 0 0-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  );
}
function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden fill="currentColor">
      <path d="M16.37 12.6c-.03-2.57 2.1-3.8 2.2-3.87-1.2-1.75-3.07-1.99-3.73-2.02-1.58-.16-3.1.94-3.9.94-.8 0-2.04-.92-3.35-.9-1.72.03-3.31 1-4.2 2.54-1.8 3.1-.46 7.7 1.28 10.22.85 1.23 1.87 2.62 3.2 2.57 1.28-.05 1.77-.83 3.32-.83 1.55 0 1.99.83 3.35.8 1.38-.02 2.26-1.25 3.1-2.49.98-1.43 1.38-2.82 1.4-2.89-.03-.01-2.67-1.02-2.7-4.07zM13.9 4.98c.7-.85 1.18-2.03 1.05-3.2-1.01.04-2.24.67-2.97 1.52-.65.75-1.22 1.95-1.07 3.1 1.13.09 2.28-.57 2.99-1.42z" />
    </svg>
  );
}

function StoreBadge({ platform, onClick }: { platform: Platform; onClick: () => void }) {
  const play = platform === "android";
  return (
    <button type="button" onClick={onClick} aria-label={play ? "Get the AICL app for Android" : "Get the AICL app for iPhone and iPad"}
      className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[#080A24] px-4 py-2.5 text-left text-white shadow-sm transition hover:bg-[#14154A] dark:border-line dark:bg-card dark:hover:bg-soft">
      {play ? <AndroidGlyph /> : <AppleGlyph />}
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-white/70">{play ? "Get it for" : "Download for"}</span>
        <span className="block text-sm font-semibold">{play ? "Android" : "iPhone & iPad"}</span>
      </span>
    </button>
  );
}

/** "Download the app" block for Android and iOS. Installs the portal as an app (PWA); store links via env when published. */
export function GetTheApp() {
  const [open, setOpen] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); toast.success("AICL installed on this device"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;

  function choose(p: Platform) {
    const url = p === "android" ? PLAY_URL : APPSTORE_URL;
    if (url) window.open(url, "_blank", "noopener");
    else setOpen(p);
  }

  async function installNow() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    setPrompt(null);
    setOpen(null);
  }

  return (
    <div className="mt-6 border-t border-line pt-5 text-left">
      <p className="text-center text-sm font-semibold text-fg">Download the AICL app</p>
      <p className="mt-0.5 text-center text-xs text-muted">Pay dues and track grievances from your phone.</p>
      <div className="mt-3 flex gap-3">
        <StoreBadge platform="android" onClick={() => choose("android")} />
        <StoreBadge platform="ios" onClick={() => choose("ios")} />
      </div>

      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open === "android" ? "Install AICL on Android" : "Install AICL on iPhone / iPad"}
        description="The store listings are coming soon. Until then you can add AICL to your home screen straight from your browser — it opens full-screen like an app.">
        {open === "android" ? (
          <div className="space-y-4 text-sm">
            {prompt && <Button variant="cta" className="w-full" onClick={installNow}>Install now</Button>}
            <ol className="space-y-3">
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">1</span><span>Open this page in <b>Chrome</b> on your Android phone.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">2</span><span>Tap the menu <MoreVertical className="inline h-4 w-4" aria-label="three dots" /> at the top right.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">3</span><span>Choose <b>Install app</b> (or <b>Add to Home screen</b>) and confirm.</span></li>
            </ol>
          </div>
        ) : (
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">1</span><span>Open this page in <b>Safari</b> on your iPhone or iPad.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">2</span><span>Tap the <b>Share</b> button <Share className="inline h-4 w-4" aria-label="share" /> at the bottom of the screen.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-brand">3</span><span>Scroll down and tap <b>Add to Home Screen</b> <PlusSquare className="inline h-4 w-4" aria-label="plus" />, then <b>Add</b>.</span></li>
          </ol>
        )}
        <p className="mt-4 rounded-xl bg-soft px-3 py-2 text-xs text-muted">Tip: open <b>{typeof window !== "undefined" ? window.location.host : "this site"}</b> on your phone to follow these steps. On a computer, you can install from Chrome or Edge using the install icon in the address bar.</p>
      </Modal>
    </div>
  );
}
