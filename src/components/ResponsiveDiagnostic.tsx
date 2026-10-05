import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, AlertTriangle, CheckCircle, Eye, EyeOff, X } from 'lucide-react';

export const ResponsiveDiagnostic: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });
  const [overflowingElements, setOverflowingElements] = useState<string[]>([]);
  const [highlightActive, setHighlightActive] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      detectOverflow();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const detectOverflow = () => {
    if (typeof document === 'undefined') return;
    const docWidth = document.documentElement.clientWidth;
    const overflowing: string[] = [];

    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      // Skip diagnostic elements and script tags
      if (htmlEl.closest('#nexus-responsive-diagnostic') || htmlEl.tagName === 'SCRIPT' || htmlEl.tagName === 'STYLE') {
        return;
      }

      const rect = htmlEl.getBoundingClientRect();
      if (rect.right > docWidth + 1 || htmlEl.scrollWidth > docWidth + 1) {
        const identifier = `${htmlEl.tagName.toLowerCase()}${htmlEl.id ? `#${htmlEl.id}` : ''}${
          htmlEl.className && typeof htmlEl.className === 'string'
            ? `.${htmlEl.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        }`;
        if (!overflowing.includes(identifier) && overflowing.length < 10) {
          overflowing.push(identifier);
        }
      }
    });

    setOverflowingElements(overflowing);
  };

  useEffect(() => {
    if (isOpen) {
      detectOverflow();
    }
  }, [isOpen, dimensions.width]);

  useEffect(() => {
    if (!highlightActive) {
      document.querySelectorAll('.nexus-overflow-highlight').forEach((el) => {
        el.classList.remove('nexus-overflow-highlight');
        (el as HTMLElement).style.outline = '';
      });
      return;
    }

    const docWidth = document.documentElement.clientWidth;
    document.querySelectorAll('*').forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.closest('#nexus-responsive-diagnostic') || htmlEl.tagName === 'SCRIPT' || htmlEl.tagName === 'STYLE') return;

      const rect = htmlEl.getBoundingClientRect();
      if (rect.right > docWidth + 1 || htmlEl.scrollWidth > docWidth + 1) {
        htmlEl.classList.add('nexus-overflow-highlight');
        htmlEl.style.outline = '2px solid #ef4444';
        htmlEl.style.outlineOffset = '-2px';
      }
    });

    return () => {
      document.querySelectorAll('.nexus-overflow-highlight').forEach((el) => {
        el.classList.remove('nexus-overflow-highlight');
        (el as HTMLElement).style.outline = '';
      });
    };
  }, [highlightActive, dimensions.width]);

  const getBreakpointLabel = (w: number) => {
    if (w < 360) return { label: 'Very Small Phone (<360px)', color: 'text-amber-400' };
    if (w < 480) return { label: 'Small Phone (360–479px)', color: 'text-white' };
    if (w < 768) return { label: 'Large Phone (480–767px)', color: 'text-white' };
    if (w < 1024) return { label: 'Tablet (768–1023px)', color: 'text-neutral-300' };
    if (w < 1440) return { label: 'Desktop (1024–1439px)', color: 'text-neutral-300' };
    return { label: 'Large Desktop (1440px+)', color: 'text-neutral-300' };
  };

  const bp = getBreakpointLabel(dimensions.width);
  const hasOverflow = overflowingElements.length > 0;

  // Only show floating helper in development or if specifically queried
  if (!import.meta.env.DEV && !window.location.search.includes('diag=1')) {
    return null;
  }

  return (
    <div id="nexus-responsive-diagnostic" className="fixed bottom-3 right-3 z-50 font-mono select-none">
      {!isOpen ? (
        <button
          onClick={() => {
            setIsOpen(true);
            detectOverflow();
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-2xl border transition-all cursor-pointer ${
            hasOverflow
              ? 'bg-red-950/90 text-red-400 border-red-500 animate-pulse'
              : 'bg-neutral-950/90 text-neutral-300 border-white/10 hover:border-red-500'
          }`}
          title="Open Nexus Responsive Diagnostic"
        >
          {dimensions.width < 768 ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
          <span>{dimensions.width}px</span>
          {hasOverflow && <span className="w-2 h-2 rounded-full bg-red-500" />}
        </button>
      ) : (
        <div className="w-80 p-4 rounded-2xl bg-neutral-950/95 backdrop-blur-md border border-white/15 text-white shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Responsive Diagnostics
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Viewport Info */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center text-neutral-400">
              <span>Current Dimensions:</span>
              <strong className="text-white font-mono">
                {dimensions.width} × {dimensions.height}
              </strong>
            </div>
            <div className="flex justify-between items-center text-neutral-400">
              <span>Breakpoint:</span>
              <strong className={bp.color}>{bp.label}</strong>
            </div>
          </div>

          {/* Overflow Status */}
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
              hasOverflow
                ? 'bg-red-950/40 border-red-500/50 text-red-300'
                : 'bg-neutral-900 border-white/10 text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {hasOverflow ? (
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{hasOverflow ? `${overflowingElements.length} overflow(s) detected` : 'No horizontal overflow'}</span>
            </div>

            <button
              onClick={() => {
                detectOverflow();
                setHighlightActive(!highlightActive);
              }}
              className="text-[11px] font-bold underline cursor-pointer text-white flex items-center gap-1 hover:text-red-400"
            >
              {highlightActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{highlightActive ? 'Clear' : 'Highlight'}</span>
            </button>
          </div>

          {/* List of overflowing elements */}
          {hasOverflow && (
            <div className="space-y-1 text-[11px] max-h-32 overflow-y-auto">
              <span className="text-neutral-500 block uppercase tracking-wider text-[10px]">
                Exceeding Viewport:
              </span>
              {overflowingElements.map((el, i) => (
                <div key={i} className="px-2 py-1 rounded bg-red-950/20 text-red-400 font-mono truncate">
                  {el}
                </div>
              ))}
            </div>
          )}

          {/* Responsive test presets */}
          <div className="pt-2 border-t border-white/10">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
              Test Matrix Target Sizes:
            </span>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-neutral-400">
              <div>• 320x568 (SE 1st)</div>
              <div>• 375x667 (iPhone 8)</div>
              <div>• 768x1024 (iPad)</div>
              <div>• 1920x1080 (FHD)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
