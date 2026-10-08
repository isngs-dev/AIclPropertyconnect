import { cn } from "@/lib/utils";

/* Custom SVG illustrations in the brand palette (violet / green / orange) for empty states + onboarding. */
type P = { className?: string };
const V = "#22236B", VL = "#4DB8E8", G = "#059669", GL = "#34D399", O = "#EC4899", OL = "#F472B6";

export function ShopIllustration({ className }: P) {
  return (
    <svg viewBox="0 0 240 180" className={cn("h-40 w-auto", className)} role="img" aria-label="Shop front illustration">
      <ellipse cx="120" cy="160" rx="92" ry="10" fill={VL} opacity=".25" />
      <rect x="40" y="70" width="160" height="88" rx="6" fill="var(--card)" stroke={V} strokeWidth="3" />
      <path d="M32 70 L48 36 H192 L208 70Z" fill={V} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${40 + i * 32} 70 q16 18 32 0Z`} fill={i % 2 ? O : OL} />
      ))}
      <rect x="62" y="96" width="52" height="38" rx="4" fill={VL} opacity=".35" stroke={V} strokeWidth="2" />
      <rect x="132" y="96" width="42" height="62" rx="4" fill={G} />
      <circle cx="142" cy="130" r="3" fill="#fff" />
      <path d="M80 50 h80" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

export function ReceiptIllustration({ className }: P) {
  return (
    <svg viewBox="0 0 240 180" className={cn("h-40 w-auto", className)} role="img" aria-label="Receipt illustration">
      <ellipse cx="120" cy="162" rx="80" ry="9" fill={VL} opacity=".25" />
      <path d="M70 18 h100 v130 l-12 -8 -12 8 -12 -8 -12 8 -12 -8 -12 8 -12 -8 -12 8Z" fill="var(--card)" stroke={V} strokeWidth="3" strokeLinejoin="round" />
      <rect x="86" y="40" width="68" height="8" rx="4" fill={VL} />
      <rect x="86" y="60" width="50" height="6" rx="3" fill={VL} opacity=".5" />
      <rect x="86" y="76" width="58" height="6" rx="3" fill={VL} opacity=".5" />
      <circle cx="150" cy="112" r="20" fill={G} />
      <path d="M140 112 l8 8 14 -16" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="56" cy="40" r="6" fill={O} /><circle cx="190" cy="70" r="5" fill={GL} />
    </svg>
  );
}

export function ChatIllustration({ className }: P) {
  return (
    <svg viewBox="0 0 240 180" className={cn("h-40 w-auto", className)} role="img" aria-label="Conversation illustration">
      <ellipse cx="120" cy="162" rx="84" ry="9" fill={VL} opacity=".25" />
      <path d="M48 40 h104 a12 12 0 0 1 12 12 v44 a12 12 0 0 1 -12 12 h-60 l-26 20 v-20 h-18 a12 12 0 0 1 -12 -12 v-44 a12 12 0 0 1 12 -12Z" fill={V} />
      <rect x="62" y="58" width="76" height="7" rx="3.5" fill="#fff" opacity=".9" /><rect x="62" y="74" width="52" height="7" rx="3.5" fill="#fff" opacity=".6" />
      <path d="M176 84 h20 a10 10 0 0 1 10 10 v28 a10 10 0 0 1 -10 10 h-6 v16 l-20 -16 h-34 a10 10 0 0 1 -10 -10 v-4" fill="none" />
      <rect x="112" y="100" width="94" height="42" rx="10" fill={O} />
      <rect x="124" y="114" width="56" height="6" rx="3" fill="#080A24" opacity=".8" /><rect x="124" y="126" width="38" height="6" rx="3" fill="#080A24" opacity=".5" />
    </svg>
  );
}

export function FolderIllustration({ className }: P) {
  return (
    <svg viewBox="0 0 240 180" className={cn("h-40 w-auto", className)} role="img" aria-label="Documents illustration">
      <ellipse cx="120" cy="162" rx="86" ry="9" fill={VL} opacity=".25" />
      <path d="M36 54 a8 8 0 0 1 8 -8 h46 l14 14 h92 a8 8 0 0 1 8 8 v78 a8 8 0 0 1 -8 8 H44 a8 8 0 0 1 -8 -8Z" fill={V} />
      <rect x="62" y="48" width="70" height="86" rx="6" fill="#fff" transform="rotate(-6 97 91)" stroke={VL} strokeWidth="2" />
      <rect x="92" y="44" width="70" height="86" rx="6" fill="var(--card)" transform="rotate(4 127 87)" stroke={VL} strokeWidth="2" />
      <path d="M36 80 h168 v62 a8 8 0 0 1 -8 8 H44 a8 8 0 0 1 -8 -8Z" fill={VL} />
      <circle cx="180" cy="116" r="16" fill={G} /><path d="M172 116 l6 6 11 -12" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ art = "shop", title, text, action }: { art?: "shop" | "receipt" | "chat" | "folder"; title: string; text?: string; action?: React.ReactNode }) {
  const Art = { shop: ShopIllustration, receipt: ReceiptIllustration, chat: ChatIllustration, folder: FolderIllustration }[art];
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Art />
      <h3 className="mt-4 font-heading text-lg font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
