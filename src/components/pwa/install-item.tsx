"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

/** "Install app" menu item: native prompt where supported, plain instructions on iPhone/iPad. */
export function InstallItem() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || (!evt && !ios)) return null;
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        onClick={() => (evt ? void evt.prompt() : setHelp((h) => !h))}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
      >
        <Download className="size-4" aria-hidden /> Install app
      </button>
      {help && <p className="px-3 pb-2 text-xs text-muted-foreground">Tap the Share button in Safari, then “Add to Home Screen”.</p>}
    </div>
  );
}
