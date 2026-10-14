import React from 'react';
import { getRankFromMMR, getRankProgress, normalizeGameId, SupportedGameId, RankTier, RankTierId } from '../lib/ranks';
import { Sparkles } from 'lucide-react';

/* =========================================================================
   1. CHESS RANK EMBLEMS (STRATEGIC & PRESTIGIOUS ROYAL HERALDRY)
   ========================================================================= */

export const ChessUnrankedEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.25)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessUnrankedBase" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2e2b26" />
        <stop offset="100%" stopColor="#141310" />
      </linearGradient>
    </defs>
    {/* Chessboard Diamond Shield */}
    <rect x="22" y="22" width="56" height="56" rx="8" transform="rotate(45 50 50)" fill="url(#chessUnrankedBase)" stroke="#d97706" strokeWidth="2" strokeDasharray="4 2" />
    {/* Chess Grid Pattern */}
    <rect x="36" y="36" width="14" height="14" fill="#d97706" fillOpacity="0.25" />
    <rect x="50" y="50" width="14" height="14" fill="#d97706" fillOpacity="0.25" />
    {/* Chess Pawn Silhouette */}
    <circle cx="50" cy="38" r="6" fill="#fef3c7" />
    <path d="M44 46 C44 43 56 43 56 46 L54 58 L46 58 Z" fill="#fef3c7" />
    <rect x="42" y="58" width="16" height="4" rx="1.5" fill="#fef3c7" />
  </svg>
);

export const ChessBronzeEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_14px_rgba(205,127,50,0.4)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessBronzeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="50%" stopColor="#b45309" />
        <stop offset="100%" stopColor="#451a03" />
      </linearGradient>
    </defs>
    {/* Carved Bronze Pawn Battlement Shield */}
    <path d="M50 8 L80 24 L72 72 L50 92 L28 72 L20 24 Z" fill="#241005" stroke="url(#chessBronzeGrad)" strokeWidth="3" />
    {/* Inner Checker Filigree */}
    <path d="M50 18 L70 30 L64 66 L50 82 L36 66 L30 30 Z" fill="url(#chessBronzeGrad)" fillOpacity="0.3" stroke="#fcd34d" strokeWidth="1" />
    {/* Bronze Chess Pawn Centerpiece */}
    <circle cx="50" cy="36" r="8" fill="#fcd34d" />
    <path d="M42 46 C42 41 58 41 58 46 L55 64 L45 64 Z" fill="#fcd34d" />
    <rect x="38" y="64" width="24" height="6" rx="2" fill="#fcd34d" />
    <circle cx="50" cy="36" r="3" fill="#78350f" />
  </svg>
);

export const ChessSilverEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_16px_rgba(203,213,225,0.45)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessSilverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>
    </defs>
    {/* Heraldic Shield */}
    <path d="M50 6 L84 20 L76 74 L50 96 L24 74 L16 20 Z" fill="#0f172a" stroke="url(#chessSilverGrad)" strokeWidth="3.5" />
    {/* Chess Knight Horse Profile */}
    <path d="M42 30 C42 22 56 18 64 24 C68 28 66 36 60 40 C64 42 66 48 64 54 L62 66 L38 66 L38 52 C38 46 44 42 42 30 Z" fill="url(#chessSilverGrad)" stroke="#fff" strokeWidth="1" />
    <circle cx="52" cy="30" r="2.5" fill="#0f172a" />
    <rect x="34" y="66" width="32" height="6" rx="2" fill="url(#chessSilverGrad)" />
  </svg>
);

export const ChessGoldEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(234,179,8,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="30%" stopColor="#facc15" />
        <stop offset="70%" stopColor="#ca8a04" />
        <stop offset="100%" stopColor="#713f12" />
      </linearGradient>
    </defs>
    {/* Castle Rook & Bishop Golden Turret Crest */}
    <path d="M50 8 L82 22 L74 72 L50 96 L26 72 L18 22 Z" fill="#1c1303" stroke="url(#chessGoldGrad)" strokeWidth="4" />
    {/* Castle Turret Top */}
    <path d="M34 26 L34 34 L40 34 L40 28 L46 28 L46 34 L54 34 L54 28 L60 28 L60 34 L66 34 L66 26 Z" fill="url(#chessGoldGrad)" />
    <path d="M38 34 L62 34 L58 64 L42 64 Z" fill="url(#chessGoldGrad)" stroke="#fff" strokeWidth="1" />
    <polygon points="50,42 56,52 50,62 44,52" fill="#1c1303" stroke="#fef08a" strokeWidth="1" />
    <rect x="32" y="64" width="36" height="7" rx="2" fill="url(#chessGoldGrad)" />
  </svg>
);

export const ChessPlatinumEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(45,212,191,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessPlatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ccfbf1" />
        <stop offset="40%" stopColor="#2dd4bf" />
        <stop offset="100%" stopColor="#0f766e" />
      </linearGradient>
    </defs>
    {/* Queen's Vanguard Platinum Crest */}
    <path d="M50 6 L84 20 L76 74 L50 98 L24 74 L16 20 Z" fill="#042f2e" stroke="url(#chessPlatGrad)" strokeWidth="4" />
    {/* Queen 5-Point Crown */}
    <path d="M30 38 L34 24 L42 34 L50 20 L58 34 L66 24 L70 38 L66 62 L34 62 Z" fill="url(#chessPlatGrad)" stroke="#fff" strokeWidth="1.2" />
    <circle cx="50" cy="20" r="3" fill="#fff" />
    <circle cx="34" cy="24" r="2.5" fill="#fff" />
    <circle cx="66" cy="24" r="2.5" fill="#fff" />
    <polygon points="50,42 58,52 50,62 42,52" fill="#042f2e" stroke="#ccfbf1" strokeWidth="1.5" />
    <rect x="30" y="64" width="40" height="6" rx="2" fill="url(#chessPlatGrad)" />
  </svg>
);

export const ChessDiamondEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_24px_rgba(56,189,248,0.7)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessDiaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="30%" stopColor="#38bdf8" />
        <stop offset="80%" stopColor="#0369a1" />
        <stop offset="100%" stopColor="#082f49" />
      </linearGradient>
    </defs>
    {/* Grandmaster Queen & King Radiant Diamond Frame */}
    <path d="M50 4 L86 18 L78 76 L50 100 L22 76 L14 18 Z" fill="#031622" stroke="url(#chessDiaGrad)" strokeWidth="4.5" />
    {/* Cross on top of crown */}
    <path d="M48 10 H52 V20 H48 Z M45 13 H55 V17 H45 Z" fill="#e0f2fe" />
    {/* Prismatic Queen/King Crown */}
    <path d="M30 40 L36 24 L44 36 L50 22 L56 36 L64 24 L70 40 L64 66 L36 66 Z" fill="url(#chessDiaGrad)" stroke="#fff" strokeWidth="1.5" />
    {/* Center Brilliant Diamond Cut */}
    <polygon points="50,36 62,48 50,66 38,48" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.5" />
    <polygon points="50,42 56,48 50,58 44,48" fill="#38bdf8" />
  </svg>
);

export const ChessMasterEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_26px_rgba(192,132,252,0.75)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessMastGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f3e8ff" />
        <stop offset="35%" stopColor="#c084fc" />
        <stop offset="80%" stopColor="#6b21a8" />
        <stop offset="100%" stopColor="#2e1065" />
      </linearGradient>
    </defs>
    {/* Double Headed King Arch Shield */}
    <path d="M50 4 L88 18 L80 78 L50 100 L20 78 L12 18 Z" fill="#150529" stroke="url(#chessMastGrad)" strokeWidth="4.5" />
    {/* Grand King Royal Crown */}
    <path d="M47 4 H53 V16 H47 Z M43 8 H57 V12 H43 Z" fill="#f3e8ff" />
    <path d="M28 36 C28 20 40 22 50 16 C60 22 72 20 72 36 L66 66 L34 66 Z" fill="url(#chessMastGrad)" stroke="#fff" strokeWidth="1.5" />
    {/* Royal Amethyst Gem Centerpiece */}
    <polygon points="50,32 64,48 50,68 36,48" fill="#f3e8ff" stroke="#a855f7" strokeWidth="1.5" />
    <polygon points="50,38 58,48 50,60 42,48" fill="#6b21a8" />
  </svg>
);

export const ChessChallengerEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] ${className}`} fill="none">
    <defs>
      <linearGradient id="chessChalGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="25%" stopColor="#fde047" />
        <stop offset="65%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>
    {/* Radiant Celestial Solar Rays */}
    <path d="M50 0 L54 12 L50 8 L46 12 Z M24 6 L32 16 L28 14 Z M76 6 L68 16 L72 14 Z" fill="#fde047" />
    {/* Apex King Shield */}
    <path d="M50 6 L90 20 L80 80 L50 100 L20 80 L10 20 Z" fill="#1c0f04" stroke="url(#chessChalGold)" strokeWidth="5" />
    {/* Apex King Cross */}
    <path d="M47 0 H53 V14 H47 Z M42 4 H58 V8 H42 Z" fill="#ffffff" />
    {/* Grand Golden King Crown */}
    <path d="M26 36 L34 18 L44 32 L50 14 L56 32 L66 18 L74 36 L68 68 L32 68 Z" fill="url(#chessChalGold)" stroke="#fff" strokeWidth="1.8" />
    {/* Starburst Solar Diamond Core */}
    <polygon points="50,30 66,48 50,70 34,48" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
    <polygon points="50,38 58,48 50,58 42,48" fill="#f59e0b" />
  </svg>
);

/* =========================================================================
   2. FC 26 RANK EMBLEMS (FOOTBALL STADIUM & CHAMPIONSHIP TROPHY CRESTS)
   ========================================================================= */

export const FC26UnrankedEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.25)] ${className}`} fill="none">
    <path d="M50 8 L82 22 L74 72 L50 92 L26 72 L18 22 Z" fill="#121820" stroke="#ca8a04" strokeWidth="2" strokeDasharray="4 2" />
    <circle cx="50" cy="50" r="18" fill="#1e293b" stroke="#ca8a04" strokeWidth="1.5" />
    {/* Soccer Pentagon */}
    <polygon points="50,42 58,48 55,58 45,58 42,48" fill="#facc15" />
  </svg>
);

export const FC26BronzeEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_14px_rgba(205,127,50,0.4)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Bronze" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="40%" stopColor="#cd7f32" />
        <stop offset="100%" stopColor="#431e07" />
      </linearGradient>
    </defs>
    {/* Stadium Pitch Shield */}
    <path d="M50 8 L84 22 L76 72 L50 94 L24 72 L16 22 Z" fill="#241005" stroke="url(#fc26Bronze)" strokeWidth="3.5" />
    {/* Pitch Arcs */}
    <path d="M26 30 Q50 44 74 30" stroke="#fcd34d" strokeWidth="1" strokeDasharray="3 3" />
    {/* Bronze Soccer Ball */}
    <circle cx="50" cy="52" r="20" fill="url(#fc26Bronze)" stroke="#fcd34d" strokeWidth="1.5" />
    <polygon points="50,42 60,49 56,61 44,61 40,49" fill="#241005" stroke="#fcd34d" strokeWidth="1" />
  </svg>
);

export const FC26SilverEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_16px_rgba(203,213,225,0.45)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Silver" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>
    </defs>
    {/* Stadium Arch Crest with Laurels */}
    <path d="M50 6 L84 20 L76 74 L50 96 L24 74 L16 20 Z" fill="#0f172a" stroke="url(#fc26Silver)" strokeWidth="3.5" />
    {/* Silver Football Laurels */}
    <path d="M22 50 C22 68 34 80 50 86 C66 80 78 68 78 50" stroke="url(#fc26Silver)" strokeWidth="2.5" fill="none" />
    {/* Polished Chrome Soccer Ball */}
    <circle cx="50" cy="48" r="21" fill="url(#fc26Silver)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,38 60,45 56,57 44,57 40,45" fill="#0f172a" stroke="#ffffff" strokeWidth="1" />
    <line x1="50" y1="38" x2="50" y2="27" stroke="#0f172a" strokeWidth="1" />
  </svg>
);

export const FC26GoldEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(234,179,8,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="30%" stopColor="#facc15" />
        <stop offset="70%" stopColor="#ca8a04" />
        <stop offset="100%" stopColor="#713f12" />
      </linearGradient>
    </defs>
    {/* Championship Cup Football Shield */}
    <path d="M50 6 L86 20 L78 76 L50 98 L22 76 L14 20 Z" fill="#1c1303" stroke="url(#fc26Gold)" strokeWidth="4" />
    {/* Golden Laurels */}
    <path d="M18 48 C18 70 32 84 50 90 C68 84 82 70 82 48" stroke="url(#fc26Gold)" strokeWidth="3" fill="none" />
    {/* 24K Golden Football */}
    <circle cx="50" cy="46" r="22" fill="url(#fc26Gold)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,35 62,44 57,58 43,58 38,44" fill="#1c1303" stroke="#fef08a" strokeWidth="1.5" />
    <polygon points="50,18 53,24 60,25 55,30 56,36 50,33 44,36 45,30 40,25 47,24" fill="#fef08a" />
  </svg>
);

export const FC26PlatinumEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(45,212,191,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Plat" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ccfbf1" />
        <stop offset="40%" stopColor="#2dd4bf" />
        <stop offset="100%" stopColor="#0f766e" />
      </linearGradient>
    </defs>
    <path d="M50 6 L86 20 L78 76 L50 98 L22 76 L14 20 Z" fill="#042f2e" stroke="url(#fc26Plat)" strokeWidth="4" />
    {/* Cyber Net Arcs */}
    <path d="M24 36 L76 36 M28 50 L72 50 M34 64 L66 64" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.4" />
    {/* Platinum Football Sphere */}
    <circle cx="50" cy="48" r="22" fill="url(#fc26Plat)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,36 62,45 57,59 43,59 38,45" fill="#042f2e" stroke="#ccfbf1" strokeWidth="1.5" />
  </svg>
);

export const FC26DiamondEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_24px_rgba(56,189,248,0.7)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Dia" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="30%" stopColor="#38bdf8" />
        <stop offset="80%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#082f49" />
      </linearGradient>
    </defs>
    {/* Faceted Diamond Soccer Crest */}
    <path d="M50 4 L88 18 L80 78 L50 100 L20 78 L12 18 Z" fill="#031622" stroke="url(#fc26Dia)" strokeWidth="4.5" />
    {/* Diamond-cut Crystal Soccer Ball */}
    <circle cx="50" cy="46" r="23" fill="url(#fc26Dia)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,34 63,44 58,59 42,59 37,44" fill="#031622" stroke="#e0f2fe" strokeWidth="1.5" />
    {/* Top Star */}
    <polygon points="50,14 54,22 62,23 56,29 58,37 50,33 42,37 44,29 38,23 46,22" fill="#e0f2fe" />
  </svg>
);

export const FC26MasterEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_26px_rgba(192,132,252,0.75)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Mast" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f3e8ff" />
        <stop offset="35%" stopColor="#c084fc" />
        <stop offset="80%" stopColor="#6b21a8" />
        <stop offset="100%" stopColor="#2e1065" />
      </linearGradient>
    </defs>
    {/* Grand Champions Cup Frame */}
    <path d="M50 4 L90 18 L80 80 L50 100 L20 80 L10 18 Z" fill="#150529" stroke="url(#fc26Mast)" strokeWidth="4.5" />
    {/* Ornate Soccer Laurels */}
    <path d="M16 44 C16 70 30 86 50 92 C70 86 84 70 84 44" stroke="url(#fc26Mast)" strokeWidth="3.5" fill="none" />
    {/* Master Amethyst Soccer Ball */}
    <circle cx="50" cy="46" r="23" fill="url(#fc26Mast)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,33 64,44 59,60 41,60 36,44" fill="#150529" stroke="#f3e8ff" strokeWidth="1.5" />
    <circle cx="50" cy="47" r="4" fill="#f3e8ff" />
  </svg>
);

export const FC26ChallengerEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc26Chal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="25%" stopColor="#fde047" />
        <stop offset="65%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>
    {/* Radiant Ballon d'Or Solar Rays */}
    <path d="M50 0 L54 12 L50 8 L46 12 Z M22 6 L30 16 L26 14 Z M78 6 L70 16 L74 14 Z" fill="#fde047" />
    {/* World Champion Shield */}
    <path d="M50 6 L92 20 L82 82 L50 100 L18 82 L8 20 Z" fill="#1c0f04" stroke="url(#fc26Chal)" strokeWidth="5" />
    {/* Golden Victory Laurels */}
    <path d="M14 44 C14 74 30 90 50 96 C70 90 86 74 86 44" stroke="url(#fc26Chal)" strokeWidth="4" fill="none" />
    {/* Golden Sphere Core */}
    <circle cx="50" cy="46" r="24" fill="url(#fc26Chal)" stroke="#ffffff" strokeWidth="2.5" />
    <polygon points="50,33 65,44 60,61 40,61 35,44" fill="#1c0f04" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,14 54,22 62,23 56,29 58,37 50,33 42,37 44,29 38,23 46,22" fill="#ffffff" />
  </svg>
);

/* =========================================================================
   3. FC 27 RANK EMBLEMS (NEXT-GEN VECTOR POLYHEDRONS & APEX WINGS)
   ========================================================================= */

export const FC27UnrankedEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.25)] ${className}`} fill="none">
    {/* Hexagon Calibration */}
    <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" fill="#10141e" stroke="#eab308" strokeWidth="2" strokeDasharray="5 3" />
    <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="#080a0f" stroke="#eab308" strokeWidth="1" />
    <polygon points="50,38 60,45 56,57 44,57 40,45" fill="#eab308" />
  </svg>
);

export const FC27BronzeEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_14px_rgba(205,127,50,0.4)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Bronze" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fb923c" />
        <stop offset="40%" stopColor="#cd7f32" />
        <stop offset="100%" stopColor="#431407" />
      </linearGradient>
    </defs>
    {/* Next-Gen Hexagonal Carbon Shield */}
    <polygon points="50,6 90,28 90,72 50,94 10,72 10,28" fill="#1c0a03" stroke="url(#fc27Bronze)" strokeWidth="3.5" />
    {/* Dual Angular Orange Strike Chevrons */}
    <path d="M26 36 L50 20 L74 36 M26 48 L50 32 L74 48" stroke="#fdba74" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {/* FC27 Geometric Core */}
    <polygon points="50,44 64,54 59,70 41,70 36,54" fill="url(#fc27Bronze)" stroke="#fdba74" strokeWidth="1.5" />
  </svg>
);

export const FC27SilverEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_16px_rgba(203,213,225,0.45)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Silver" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="50%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    {/* Supersonic Aerodynamic Insignia */}
    <polygon points="50,4 92,26 92,74 50,96 8,74 8,26" fill="#0b0f19" stroke="url(#fc27Silver)" strokeWidth="3.5" />
    {/* Twin Supersonic Strike Arrows */}
    <path d="M22 34 L50 16 L78 34 M22 48 L50 30 L78 48" stroke="url(#fc27Silver)" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* Polyhedral Center Core */}
    <polygon points="50,42 66,54 60,72 40,72 34,54" fill="url(#fc27Silver)" stroke="#ffffff" strokeWidth="1.5" />
    <circle cx="50" cy="58" r="4" fill="#0b0f19" />
  </svg>
);

export const FC27GoldEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(234,179,8,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="30%" stopColor="#fde047" />
        <stop offset="70%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#854d0e" />
      </linearGradient>
    </defs>
    {/* Futuristic Gilded Polygon Wings */}
    <path d="M12 24 L2 10 L22 16 L12 40 L26 32 Z M88 24 L98 10 L78 16 L88 40 L74 32 Z" fill="url(#fc27Gold)" />
    {/* Main Shield */}
    <polygon points="50,4 88,24 88,76 50,96 12,76 12,24" fill="#181203" stroke="url(#fc27Gold)" strokeWidth="4" />
    {/* Floating 3D Soccer Polyhedron */}
    <polygon points="50,22 74,38 65,70 35,70 26,38" fill="url(#fc27Gold)" stroke="#ffffff" strokeWidth="1.5" />
    <polygon points="50,36 62,46 58,60 42,60 38,46" fill="#181203" stroke="#fde047" strokeWidth="1.5" />
    <circle cx="50" cy="50" r="3.5" fill="#fde047" />
  </svg>
);

export const FC27PlatinumEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(45,212,191,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Plat" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f0fdfa" />
        <stop offset="35%" stopColor="#2dd4bf" />
        <stop offset="75%" stopColor="#0f766e" />
        <stop offset="100%" stopColor="#134e4a" />
      </linearGradient>
    </defs>
    {/* Quantum Teal Apex Shield */}
    <polygon points="50,4 90,24 90,76 50,98 10,76 10,24" fill="#021d1b" stroke="url(#fc27Plat)" strokeWidth="4" />
    {/* Neon Vector Pitch Grid */}
    <path d="M30 30 L70 30 L50 82 Z" stroke="#2dd4bf" strokeWidth="1.5" strokeDasharray="4 2" fill="none" />
    {/* Holographic Football Star */}
    <polygon points="50,30 64,42 59,58 41,58 36,42" fill="url(#fc27Plat)" stroke="#ffffff" strokeWidth="1.5" />
    <circle cx="50" cy="48" r="4" fill="#021d1b" stroke="#ffffff" strokeWidth="1" />
  </svg>
);

export const FC27DiamondEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_24px_rgba(56,189,248,0.7)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Dia" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f0f9ff" />
        <stop offset="30%" stopColor="#38bdf8" />
        <stop offset="75%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#082f49" />
      </linearGradient>
    </defs>
    {/* Prismatic Cyan Dual Crystal Wings */}
    <path d="M14 26 L2 8 L22 16 L10 44 L28 34 Z M86 26 L98 8 L78 16 L90 44 L72 34 Z" fill="url(#fc27Dia)" />
    <polygon points="50,4 90,24 90,78 50,100 10,78 10,24" fill="#031622" stroke="url(#fc27Dia)" strokeWidth="4.5" />
    {/* Diamond Polygon Soccer Core */}
    <polygon points="50,22 74,40 65,72 35,72 26,40" fill="url(#fc27Dia)" stroke="#ffffff" strokeWidth="1.8" />
    <polygon points="50,36 64,48 58,64 42,64 36,48" fill="#031622" stroke="#ffffff" strokeWidth="1.2" />
  </svg>
);

export const FC27MasterEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_26px_rgba(192,132,252,0.75)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Mast" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#faf5ff" />
        <stop offset="30%" stopColor="#c084fc" />
        <stop offset="75%" stopColor="#7e22ce" />
        <stop offset="100%" stopColor="#3b0764" />
      </linearGradient>
    </defs>
    {/* Ornate Violet Prestige Badge */}
    <polygon points="50,4 92,24 92,78 50,100 8,78 8,24" fill="#130424" stroke="url(#fc27Mast)" strokeWidth="4.5" />
    {/* Crown-tipped Supersonic Shield */}
    <path d="M38 16 L50 4 L62 16 L56 22 L50 18 L44 22 Z" fill="url(#fc27Mast)" stroke="#ffffff" strokeWidth="1" />
    <polygon points="50,26 76,44 66,76 34,76 24,44" fill="url(#fc27Mast)" stroke="#ffffff" strokeWidth="2" />
    <polygon points="50,40 64,52 58,68 42,68 36,52" fill="#130424" stroke="#f3e8ff" strokeWidth="1.5" />
  </svg>
);

export const FC27ChallengerEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] ${className}`} fill="none">
    <defs>
      <linearGradient id="fc27Chal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="25%" stopColor="#fde047" />
        <stop offset="65%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>
    {/* Radiant Dual Golden Auroras */}
    <path d="M50 0 L55 14 L50 10 L45 14 Z M20 4 L30 16 L24 14 Z M80 4 L70 16 L76 14 Z" fill="#fde047" />
    {/* Pinnacle Ultimate Apex Crest */}
    <polygon points="50,6 94,26 94,80 50,100 6,80 6,26" fill="#1c0f04" stroke="url(#fc27Chal)" strokeWidth="5" />
    {/* Floating Golden Apex Core */}
    <polygon points="50,22 78,42 68,76 32,76 22,42" fill="url(#fc27Chal)" stroke="#ffffff" strokeWidth="2.5" />
    <polygon points="50,36 66,50 60,68 40,68 34,50" fill="#1c0f04" stroke="#ffffff" strokeWidth="1.8" />
    <circle cx="50" cy="53" r="4.5" fill="#ffffff" />
  </svg>
);

/* =========================================================================
   4. VALORANT RANK EMBLEMS (RADIANITE CRYSTALS & ESPORTS TACTICAL BLADES)
   ========================================================================= */

export const ValUnrankedEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.25)] ${className}`} fill="none">
    <polygon points="50,10 88,86 12,86" fill="#15171e" stroke="#eab308" strokeWidth="2.5" strokeDasharray="5 3" />
    <polygon points="50,30 72,74 28,74" fill="#0b0c10" stroke="#94a3b8" strokeWidth="1.5" />
    <circle cx="50" cy="58" r="4" fill="#eab308" />
  </svg>
);

export const ValBronzeEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_14px_rgba(205,127,50,0.4)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valBronze" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="40%" stopColor="#cd7f32" />
        <stop offset="100%" stopColor="#451a03" />
      </linearGradient>
    </defs>
    {/* Heavy Bronze Combat Triangle */}
    <polygon points="50,8 90,84 10,84" fill="#241005" stroke="url(#valBronze)" strokeWidth="3.5" />
    {/* Dual Radianite Vents */}
    <path d="M36 50 L50 26 L64 50 L50 42 Z" fill="url(#valBronze)" stroke="#fcd34d" strokeWidth="1" />
    <polygon points="50,56 64,74 36,74" fill="#241005" stroke="#fcd34d" strokeWidth="1.5" />
  </svg>
);

export const ValSilverEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_16px_rgba(203,213,225,0.45)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valSilver" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    {/* Sharp Silver Radianite Shard */}
    <polygon points="50,6 88,86 12,86" fill="#0f172a" stroke="url(#valSilver)" strokeWidth="3.5" />
    {/* Inner Dual Strike Radianite Shards */}
    <polygon points="50,22 74,68 50,58" fill="url(#valSilver)" />
    <polygon points="50,22 26,68 50,58" fill="#334155" />
    <polygon points="50,62 66,78 34,78" fill="url(#valSilver)" stroke="#fff" strokeWidth="1" />
  </svg>
);

export const ValGoldEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(234,179,8,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="30%" stopColor="#facc15" />
        <stop offset="70%" stopColor="#ca8a04" />
        <stop offset="100%" stopColor="#713f12" />
      </linearGradient>
    </defs>
    {/* Radiant Tactical Gold Combat Shield */}
    <polygon points="50,6 90,86 10,86" fill="#1c1303" stroke="url(#valGold)" strokeWidth="4" />
    {/* Triple Tactical Wings */}
    <polygon points="50,18 76,64 50,52" fill="url(#valGold)" stroke="#fff" strokeWidth="1" />
    <polygon points="50,18 24,64 50,52" fill="#713f12" stroke="#facc15" strokeWidth="1" />
    <polygon points="50,58 72,80 28,80" fill="url(#valGold)" />
  </svg>
);

export const ValPlatinumEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(45,212,191,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valPlat" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ccfbf1" />
        <stop offset="30%" stopColor="#2dd4bf" />
        <stop offset="100%" stopColor="#0f766e" />
      </linearGradient>
    </defs>
    {/* Hyper-Speed Apex Wings */}
    <path d="M16 34 L4 12 L24 22 L14 50 L28 42 Z M84 34 L96 12 L76 22 L86 50 L72 42 Z" fill="url(#valPlat)" />
    <polygon points="50,4 88,86 12,86" fill="#042f2e" stroke="url(#valPlat)" strokeWidth="4" />
    {/* Platinum Radianite Core */}
    <polygon points="50,18 74,62 50,50" fill="url(#valPlat)" stroke="#fff" strokeWidth="1" />
    <polygon points="50,18 26,62 50,50" fill="#0f766e" />
    <polygon points="50,56 70,80 30,80" fill="url(#valPlat)" />
  </svg>
);

export const ValDiamondEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_24px_rgba(56,189,248,0.7)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valDia" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="30%" stopColor="#38bdf8" />
        <stop offset="75%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#082f49" />
      </linearGradient>
    </defs>
    {/* Prismatic Radianite Shard Blades */}
    <polygon points="50,4 92,88 8,88" fill="#031622" stroke="url(#valDia)" strokeWidth="4.5" />
    <polygon points="50,16 78,64 50,50" fill="url(#valDia)" stroke="#fff" strokeWidth="1.2" />
    <polygon points="50,16 22,64 50,50" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.2" />
    <polygon points="50,58 74,82 26,82" fill="url(#valDia)" />
    <circle cx="50" cy="50" r="3.5" fill="#fff" />
  </svg>
);

export const ValMasterEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_26px_rgba(192,132,252,0.75)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valMast" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f3e8ff" />
        <stop offset="30%" stopColor="#c084fc" />
        <stop offset="75%" stopColor="#7e22ce" />
        <stop offset="100%" stopColor="#2e1065" />
      </linearGradient>
    </defs>
    {/* Immortal Sweeping Energy Blades */}
    <path d="M16 28 L2 6 L22 16 L10 46 L28 36 Z M84 28 L98 6 L78 16 L90 46 L72 36 Z" fill="url(#valMast)" />
    <polygon points="50,4 92,88 8,88" fill="#150529" stroke="url(#valMast)" strokeWidth="4.5" />
    <polygon points="50,14 80,64 50,48" fill="url(#valMast)" stroke="#fff" strokeWidth="1.5" />
    <polygon points="50,14 20,64 50,48" fill="#581c87" />
    <polygon points="50,56 76,82 24,82" fill="url(#valMast)" />
  </svg>
);

export const ValChallengerEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] ${className}`} fill="none">
    <defs>
      <linearGradient id="valChal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="25%" stopColor="#fde047" />
        <stop offset="65%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>
    {/* Radiant Radiant Apex Starburst */}
    <path d="M50 0 L54 12 L50 8 L46 12 Z M20 6 L28 16 L24 14 Z M80 6 L72 16 L76 14 Z" fill="#fde047" />
    <polygon points="50,6 94,90 6,90" fill="#1c0f04" stroke="url(#valChal)" strokeWidth="5" />
    <polygon points="50,14 82,66 50,48" fill="url(#valChal)" stroke="#fff" strokeWidth="2" />
    <polygon points="50,14 18,66 50,48" fill="#78350f" />
    <polygon points="50,56 78,84 22,84" fill="url(#valChal)" />
    <circle cx="50" cy="48" r="4.5" fill="#ffffff" />
  </svg>
);

/* =========================================================================
   5. CS2 RANK EMBLEMS (INDUSTRIAL STENCIL INSIGNIAS & MAJOR CHAMPIONSHIP STARS)
   ========================================================================= */

export const CS2UnrankedEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.25)] ${className}`} fill="none">
    <rect x="14" y="24" width="72" height="52" rx="6" fill="#14181f" stroke="#ca8a04" strokeWidth="2" strokeDasharray="5 3" />
    <path d="M30 40 L50 60 L70 40" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round" />
    <circle cx="50" cy="50" r="4" fill="#eab308" />
  </svg>
);

export const CS2BronzeEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_14px_rgba(205,127,50,0.4)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Bronze" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="40%" stopColor="#cd7f32" />
        <stop offset="100%" stopColor="#451a03" />
      </linearGradient>
    </defs>
    {/* Industrial Kevlar Plate */}
    <polygon points="20,16 80,16 88,50 50,88 12,50" fill="#241005" stroke="url(#cs2Bronze)" strokeWidth="3.5" />
    {/* Dual Wing Stencils */}
    <path d="M22 34 L38 34 L30 50 Z M78 34 L62 34 L70 50 Z" fill="url(#cs2Bronze)" stroke="#fcd34d" strokeWidth="1" />
    {/* 1-Star Chevron */}
    <polygon points="50,30 53,38 61,39 55,45 57,53 50,49 43,53 45,45 39,39 47,38" fill="#fcd34d" />
  </svg>
);

export const CS2SilverEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_16px_rgba(203,213,225,0.45)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Silver" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    {/* Polished Steel CT Insignia */}
    <polygon points="18,14 82,14 90,48 50,90 10,48" fill="#0f172a" stroke="url(#cs2Silver)" strokeWidth="3.5" />
    {/* Dual Silver Wing Bars */}
    <path d="M20 30 L40 30 L32 48 Z M80 30 L60 30 L68 48 Z" fill="url(#cs2Silver)" stroke="#fff" strokeWidth="1" />
    {/* 2-Star Chevron */}
    <polygon points="42,32 44,38 50,39 45,44 47,50 42,47 37,50 39,44 34,39 40,38" fill="#ffffff" />
    <polygon points="58,32 60,38 66,39 61,44 63,50 58,47 53,50 55,44 50,39 56,38" fill="#ffffff" />
  </svg>
);

export const CS2GoldEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(234,179,8,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="30%" stopColor="#facc15" />
        <stop offset="70%" stopColor="#ca8a04" />
        <stop offset="100%" stopColor="#713f12" />
      </linearGradient>
    </defs>
    {/* Gilded Military Officer Star Crest */}
    <polygon points="16,12 84,12 92,48 50,92 8,48" fill="#1c1303" stroke="url(#cs2Gold)" strokeWidth="4" />
    {/* Laurel Ring */}
    <path d="M24 40 C24 58 36 72 50 78 C64 72 76 58 76 40" stroke="url(#cs2Gold)" strokeWidth="2.5" fill="none" />
    {/* 3-Star Cluster */}
    <polygon points="50,22 53,30 61,31 55,37 57,45 50,41 43,45 45,37 39,31 47,30" fill="#ffffff" />
    <polygon points="34,36 37,42 43,43 39,48 40,54 34,51 28,54 29,48 25,43 31,42" fill="url(#cs2Gold)" />
    <polygon points="66,36 69,42 75,43 71,48 72,54 66,51 60,54 61,48 57,43 63,42" fill="url(#cs2Gold)" />
  </svg>
);

export const CS2PlatinumEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_20px_rgba(45,212,191,0.55)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Plat" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ccfbf1" />
        <stop offset="35%" stopColor="#2dd4bf" />
        <stop offset="100%" stopColor="#0f766e" />
      </linearGradient>
    </defs>
    {/* Titanium Strike Shield */}
    <polygon points="14,10 86,10 94,46 50,94 6,46" fill="#042f2e" stroke="url(#cs2Plat)" strokeWidth="4" />
    <polygon points="50,20 54,30 64,32 57,39 59,49 50,44 41,49 43,39 36,32 46,30" fill="#ffffff" stroke="#2dd4bf" strokeWidth="1" />
    <path d="M22 50 L50 68 L78 50" stroke="url(#cs2Plat)" strokeWidth="3" fill="none" />
  </svg>
);

export const CS2DiamondEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_24px_rgba(56,189,248,0.7)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Dia" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="30%" stopColor="#38bdf8" />
        <stop offset="75%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#082f49" />
      </linearGradient>
    </defs>
    {/* High-Grade Sapphire Eagle Wing Badge */}
    <polygon points="14,8 86,8 96,46 50,96 4,46" fill="#031622" stroke="url(#cs2Dia)" strokeWidth="4.5" />
    <path d="M18 24 L34 24 L26 44 Z M82 24 L66 24 L74 44 Z" fill="url(#cs2Dia)" stroke="#fff" strokeWidth="1" />
    <polygon points="50,22 55,34 67,36 58,45 61,57 50,51 39,57 42,45 33,36 45,34" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />
    <path d="M20 54 L50 74 L80 54" stroke="url(#cs2Dia)" strokeWidth="3.5" fill="none" />
  </svg>
);

export const CS2MasterEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_26px_rgba(192,132,252,0.75)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Mast" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f3e8ff" />
        <stop offset="30%" stopColor="#c084fc" />
        <stop offset="75%" stopColor="#7e22ce" />
        <stop offset="100%" stopColor="#2e1065" />
      </linearGradient>
    </defs>
    {/* Global Elite Royal Insignia */}
    <polygon points="12,6 88,6 98,46 50,98 2,46" fill="#150529" stroke="url(#cs2Mast)" strokeWidth="4.5" />
    {/* Crossed Lightning Blades */}
    <path d="M22 20 L78 68 M78 20 L22 68" stroke="url(#cs2Mast)" strokeWidth="3" strokeLinecap="round" />
    <polygon points="50,20 56,33 70,35 60,45 63,59 50,52 37,59 40,45 30,35 44,33" fill="#ffffff" stroke="#c084fc" strokeWidth="1.5" />
  </svg>
);

export const CS2ChallengerEmblem: React.FC<{ sizeClass?: string; className?: string }> = ({
  sizeClass = 'w-16 h-16',
  className = '',
}) => (
  <svg viewBox="0 0 100 100" className={`${sizeClass} shrink-0 select-none drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] ${className}`} fill="none">
    <defs>
      <linearGradient id="cs2Chal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="25%" stopColor="#fde047" />
        <stop offset="65%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>
    {/* Pinnacle CS2 Apex Major Champions Star Badge */}
    <path d="M50 0 L54 12 L50 8 L46 12 Z M20 4 L28 14 L24 12 Z M80 4 L72 14 L76 12 Z" fill="#fde047" />
    <polygon points="10,6 90,6 100,46 50,100 0,46" fill="#1c0f04" stroke="url(#cs2Chal)" strokeWidth="5" />
    {/* Gilded Champion Wreath */}
    <path d="M16 40 C16 68 30 84 50 90 C70 84 84 68 84 40" stroke="url(#cs2Chal)" strokeWidth="4" fill="none" />
    {/* Grand Central Gold Star */}
    <polygon points="50,18 57,33 73,35 62,47 65,63 50,55 35,63 38,47 27,35 43,33" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
    <circle cx="50" cy="42" r="4.5" fill="#f59e0b" />
  </svg>
);

/* =========================================================================
   UNIVERSAL RANK EMBLEM SWITCHER (GAME-AWARE)
   ========================================================================= */

interface RankEmblemProps {
  tier?: RankTier | RankTierId | string;
  gameId?: string;
  sizeClass?: string;
  className?: string;
  isUnranked?: boolean;
}

export const RankEmblem: React.FC<RankEmblemProps> = ({
  tier,
  gameId,
  sizeClass = 'w-16 h-16',
  className = '',
  isUnranked = false,
}) => {
  const normGame = normalizeGameId(gameId);

  if (isUnranked) {
    switch (normGame) {
      case 'chess':
        return <ChessUnrankedEmblem sizeClass={sizeClass} className={className} />;
      case 'fc':
        return <FC26UnrankedEmblem sizeClass={sizeClass} className={className} />;
      case 'valorant':
        return <ValUnrankedEmblem sizeClass={sizeClass} className={className} />;
      case 'cs2':
        return <CS2UnrankedEmblem sizeClass={sizeClass} className={className} />;
      case 'lol':
        return <CS2UnrankedEmblem sizeClass={sizeClass} className={className} />;
      default:
        return <ChessUnrankedEmblem sizeClass={sizeClass} className={className} />;
    }
  }

  const tierId: string = typeof tier === 'object' && tier !== null ? tier.id : (tier || 'bronze');
  const lower = tierId.toLowerCase();

  if (normGame === 'chess') {
    switch (lower) {
      case 'bronze':
      case 'beginner':
        return <ChessBronzeEmblem sizeClass={sizeClass} className={className} />;
      case 'silver':
      case 'normal':
        return <ChessSilverEmblem sizeClass={sizeClass} className={className} />;
      case 'gold':
      case 'skilled':
        return <ChessGoldEmblem sizeClass={sizeClass} className={className} />;
      case 'platinum':
      case 'advanced':
        return <ChessPlatinumEmblem sizeClass={sizeClass} className={className} />;
      case 'diamond':
      case 'elite':
        return <ChessDiamondEmblem sizeClass={sizeClass} className={className} />;
      case 'master':
        return <ChessMasterEmblem sizeClass={sizeClass} className={className} />;
      case 'challenger':
      case 'legend':
        return <ChessChallengerEmblem sizeClass={sizeClass} className={className} />;
      default:
        return <ChessSilverEmblem sizeClass={sizeClass} className={className} />;
    }
  }

  if (normGame === 'fc') {
    switch (lower) {
      case 'bronze':
      case 'beginner':
        return <FC26BronzeEmblem sizeClass={sizeClass} className={className} />;
      case 'silver':
      case 'normal':
        return <FC26SilverEmblem sizeClass={sizeClass} className={className} />;
      case 'gold':
      case 'skilled':
        return <FC26GoldEmblem sizeClass={sizeClass} className={className} />;
      case 'platinum':
      case 'advanced':
        return <FC26PlatinumEmblem sizeClass={sizeClass} className={className} />;
      case 'diamond':
      case 'elite':
        return <FC26DiamondEmblem sizeClass={sizeClass} className={className} />;
      case 'master':
        return <FC26MasterEmblem sizeClass={sizeClass} className={className} />;
      case 'challenger':
      case 'legend':
        return <FC26ChallengerEmblem sizeClass={sizeClass} className={className} />;
      default:
        return <FC26SilverEmblem sizeClass={sizeClass} className={className} />;
    }
  }

  if (normGame === 'valorant') {
    switch (lower) {
      case 'bronze':
      case 'beginner':
        return <ValBronzeEmblem sizeClass={sizeClass} className={className} />;
      case 'silver':
      case 'normal':
        return <ValSilverEmblem sizeClass={sizeClass} className={className} />;
      case 'gold':
      case 'skilled':
        return <ValGoldEmblem sizeClass={sizeClass} className={className} />;
      case 'platinum':
      case 'advanced':
        return <ValPlatinumEmblem sizeClass={sizeClass} className={className} />;
      case 'diamond':
      case 'elite':
        return <ValDiamondEmblem sizeClass={sizeClass} className={className} />;
      case 'master':
        return <ValMasterEmblem sizeClass={sizeClass} className={className} />;
      case 'challenger':
      case 'legend':
        return <ValChallengerEmblem sizeClass={sizeClass} className={className} />;
      default:
        return <ValSilverEmblem sizeClass={sizeClass} className={className} />;
    }
  }

  if (normGame === 'cs2') {
    switch (lower) {
      case 'bronze':
      case 'beginner':
        return <CS2BronzeEmblem sizeClass={sizeClass} className={className} />;
      case 'silver':
      case 'normal':
        return <CS2SilverEmblem sizeClass={sizeClass} className={className} />;
      case 'gold':
      case 'skilled':
        return <CS2GoldEmblem sizeClass={sizeClass} className={className} />;
      case 'platinum':
      case 'advanced':
        return <CS2PlatinumEmblem sizeClass={sizeClass} className={className} />;
      case 'diamond':
      case 'elite':
        return <CS2DiamondEmblem sizeClass={sizeClass} className={className} />;
      case 'master':
        return <CS2MasterEmblem sizeClass={sizeClass} className={className} />;
      case 'challenger':
      case 'legend':
        return <CS2ChallengerEmblem sizeClass={sizeClass} className={className} />;
      default:
        return <CS2SilverEmblem sizeClass={sizeClass} className={className} />;
    }
  }

  return <ChessSilverEmblem sizeClass={sizeClass} className={className} />;
};

// Aliases for compatibility
export const UnrankedEmblem = ChessUnrankedEmblem;
export const BronzeRankEmblem = ChessBronzeEmblem;
export const SilverRankEmblem = ChessSilverEmblem;
export const GoldRankEmblem = ChessGoldEmblem;
export const PlatinumRankEmblem = ChessPlatinumEmblem;
export const DiamondRankEmblem = ChessDiamondEmblem;
export const MasterRankEmblem = ChessMasterEmblem;
export const ChallengerRankEmblem = ChessChallengerEmblem;

/* =========================================================================
   NEXUS RANK BADGE COMPONENT
   ========================================================================= */

interface NexusRankBadgeProps {
  rating?: number;
  tier?: RankTier;
  gameId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showProgress?: boolean;
  showDetails?: boolean;
  isProvisional?: boolean;
  placementGames?: number;
  gamesPlayed?: number;
  className?: string;
}

export const NexusRankBadge: React.FC<NexusRankBadgeProps> = ({
  rating = 1000,
  tier: passedTier,
  gameId = 'chess',
  size = 'md',
  showProgress = false,
  showDetails = true,
  isProvisional: passedIsProvisional,
  placementGames = 0,
  gamesPlayed = 0,
  className = '',
}) => {
  const confirmedMatches = Math.max(placementGames || 0, gamesPlayed || 0);
  const isProvisional = confirmedMatches >= 10 ? false : (passedIsProvisional ?? (confirmedMatches < 10));
  const tier = passedTier || getRankFromMMR(rating);
  const progress = getRankProgress(rating);
  const normGame = normalizeGameId(gameId);

  const sizeMap = {
    sm: {
      emblem: 'w-10 h-10',
      title: 'text-xs',
      div: 'text-[9px]',
      padding: 'p-2',
      mmr: 'text-xs',
    },
    md: {
      emblem: 'w-16 h-16',
      title: 'text-sm',
      div: 'text-[10px]',
      padding: 'p-3.5',
      mmr: 'text-base',
    },
    lg: {
      emblem: 'w-24 h-24',
      title: 'text-lg',
      div: 'text-xs',
      padding: 'p-5',
      mmr: 'text-xl',
    },
    xl: {
      emblem: 'w-32 h-32',
      title: 'text-2xl',
      div: 'text-sm',
      padding: 'p-6',
      mmr: 'text-3xl',
    },
  };

  const dim = sizeMap[size];
  const customTitle = tier.gameCustomTitles?.[normGame] || tier.name;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-[#0e0e14] border ${
        isProvisional ? 'border-yellow-500/40' : tier.borderColorClass
      } ${dim.padding} transition-all shadow-xl ${className}`}
    >
      {/* Background Tier Color Ambient Glow */}
      <div
        className={`absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-b ${
          isProvisional ? 'from-yellow-500/20 to-transparent' : tier.bgGlowClass
        } rounded-full blur-3xl pointer-events-none`}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Tier Emblem or Unranked Emblem */}
        <div className="relative shrink-0">
          <div
            className="absolute inset-0 rounded-2xl blur-md opacity-50 pointer-events-none"
            style={{ backgroundColor: isProvisional ? '#eab308' : tier.colorHex }}
          />
          <RankEmblem tier={tier} gameId={normGame} sizeClass={dim.emblem} isUnranked={isProvisional} />
        </div>

        {/* Rank Details */}
        {showDetails && (
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono font-black ${dim.div} uppercase tracking-widest ${
                  isProvisional
                    ? 'bg-yellow-500/15 border border-yellow-500/40 text-yellow-400'
                    : `${tier.badgeBgClass} border ${tier.borderColorClass} ${tier.textColorClass}`
                }`}
              >
                {isProvisional ? 'UNRANKED' : tier.name}
              </span>

              {isProvisional ? (
                <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 text-[9px] font-bold font-mono tracking-wider">
                  CALIBRATION • {placementGames}/10
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold font-mono tracking-wider">
                  RANKED
                </span>
              )}

              {!isProvisional && tier.id === 'challenger' && (
                <span className="flex items-center gap-1 text-[10px] text-amber-300 font-bold font-mono animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  <span>PINNACLE</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <h3 className={`font-black font-display text-white tracking-tight truncate ${dim.title}`}>
                {isProvisional ? 'Placement Calibration' : customTitle}
              </h3>
              <span className="text-slate-400 font-mono text-xs">
                {isProvisional ? (
                  <span className="text-yellow-400">{placementGames}/10 Placements</span>
                ) : (
                  <span className="font-bold text-white font-mono-numbers">
                    {rating} <span className="text-[10px] text-slate-400 font-normal">MMR</span>
                  </span>
                )}
              </span>
            </div>

            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {isProvisional ? '10 placement matches required' : tier.rangeDisplay}
            </div>
          </div>
        )}
      </div>

      {/* Optional Progress Bar to Next Tier */}
      {showProgress && !isProvisional && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 relative z-10">
          <div className="flex justify-between items-center text-[10px] font-mono mb-1">
            <span className="text-slate-400">
              {progress.nextTier ? `Progress to ${progress.nextTier.name}` : 'Pinnacle Tier'}
            </span>
            <span className="text-slate-200 font-bold">
              {progress.nextTier ? `${progress.pointsToNext} MMR to rank up` : 'MAX RANK'}
            </span>
          </div>

          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full ${tier.accentBg} transition-all duration-500 rounded-full`}
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
