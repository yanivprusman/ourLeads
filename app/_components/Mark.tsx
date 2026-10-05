import { useId } from "react";

/** The ourLeads mark — the same drawing as the launcher icon and the favicon:
 *  a partner's message (blue, behind) that became a lead card, taken care of (amber). */
export default function Mark({ className = "size-8" }: { className?: string }) {
  const u = useId().replace(/:/g, "");
  return (
    <svg viewBox="18 18 72 72" className={className} aria-hidden>
      <defs>
        <linearGradient id={`bg${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f74a3" />
          <stop offset=".55" stopColor="#14466b" />
          <stop offset="1" stopColor="#0b2236" />
        </linearGradient>
        <linearGradient id={`bk${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd3f4" />
          <stop offset="1" stopColor="#4fa6d6" />
        </linearGradient>
        <linearGradient id={`cd${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e6eef5" />
        </linearGradient>
        <linearGradient id={`am${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd67e" />
          <stop offset="1" stopColor="#ef8a24" />
        </linearGradient>
        <clipPath id={`r${u}`}>
          <rect x="18" y="18" width="72" height="72" rx="17" />
        </clipPath>
      </defs>
      <g clipPath={`url(#r${u})`}>
        <rect width="108" height="108" fill={`url(#bg${u})`} />
        <path d="M45 33a7 7 0 0 1 7-7h20a7 7 0 0 1 7 7v15a7 7 0 0 1-7 7h-1l1 7-8-7H52a7 7 0 0 1-7-7z" fill={`url(#bk${u})`} />
        <path d="M29 48a8 8 0 0 1 8-8h27a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H48l-10 8 .8-8H37a8 8 0 0 1-8-8z" fill="#04121f" opacity=".25" />
        <path d="M29 46a8 8 0 0 1 8-8h27a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H48l-10 8 .8-8H37a8 8 0 0 1-8-8z" fill={`url(#cd${u})`} />
        <rect x="36" y="46" width="22" height="5" rx="2.5" fill="#0d2a43" />
        <rect x="36" y="55.5" width="13" height="4" rx="2" fill="#97adc0" />
        <circle cx="62.5" cy="64" r="8.5" fill={`url(#am${u})`} />
        <path d="M58.6 64.2l2.7 2.8 5-5.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
