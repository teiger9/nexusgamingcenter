import React from 'react';
import nexusOfficialLogo from '../assets/images/nexus_official_logo_1787070908024.jpg';

interface NexusLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  className?: string;
  glow?: boolean;
}

export const NexusLogo: React.FC<NexusLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
  glow = true,
}) => {
  const sizeMap = {
    xs: { icon: 'w-6 h-6', text: 'text-sm', sub: 'text-[9px]' },
    sm: { icon: 'w-8 h-8', text: 'text-base', sub: 'text-[10px]' },
    md: { icon: 'w-10 h-10', text: 'text-xl', sub: 'text-xs' },
    lg: { icon: 'w-14 h-14', text: 'text-2xl', sub: 'text-sm' },
    xl: { icon: 'w-20 h-20', text: 'text-4xl', sub: 'text-base' },
  };

  const dim = sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {/* Official Nexus Emblem Badge */}
      <div className={`relative ${dim.icon} shrink-0 select-none`}>
        {glow && (
          <div className="absolute inset-0 bg-red-600/30 rounded-xl blur-md -z-10 animate-pulse pointer-events-none" />
        )}
        <img
          src={nexusOfficialLogo}
          alt="Nexus Gaming Center Logo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain rounded-lg drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]"
        />
      </div>

      {/* Official Wordmark */}
      {showWordmark && (
        <div className="flex flex-col leading-none select-none">
          <div className={`font-display font-black tracking-widest text-white flex items-center ${dim.text}`}>
            <span>NE</span>
            <span className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">X</span>
            <span>US</span>
          </div>
          <span className={`font-display font-bold uppercase tracking-[0.28em] text-slate-300 ${dim.sub} mt-0.5`}>
            GAMING
          </span>
        </div>
      )}
    </div>
  );
};
