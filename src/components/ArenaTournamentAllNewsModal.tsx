import React, { useState } from 'react';
import { ArenaNewsItem } from '../types';
import { ArenaTournamentNewsCard } from './ArenaTournamentNewsCard';
import {
  X,
  Search,
  Sparkles,
} from 'lucide-react';

interface ArenaTournamentAllNewsModalProps {
  newsItems?: ArenaNewsItem[];
  news?: ArenaNewsItem[];
  isOpen?: boolean;
  onClose: () => void;
  onSelectNews: (item: ArenaNewsItem) => void;
  onNavigateToTournament: (tournamentId: string) => void;
}

export const ArenaTournamentAllNewsModal: React.FC<ArenaTournamentAllNewsModalProps> = ({
  newsItems,
  news,
  isOpen = true,
  onClose,
  onSelectNews,
  onNavigateToTournament,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  if (!isOpen) return null;

  const rawList = newsItems || news || [];

  const filteredItems = (Array.isArray(rawList) ? rawList : []).filter((item) => {
    if (!item) return false;
    // Category filter
    if (filterType !== 'ALL') {
      if (filterType === 'ANNOUNCEMENTS' && item.eventType !== 'TOURNAMENT_ANNOUNCEMENT') return false;
      if (filterType === 'STAGES' && item.eventType !== 'OFFICIAL_MATCH_STAGES') return false;
      if (filterType === 'LIVE' && item.eventType !== 'MATCH_LIVE' && item.eventType !== 'GRAND_FINAL_LIVE') return false;
      if (filterType === 'QUALIFIED' && item.eventType !== 'QUALIFIED' && item.eventType !== 'THIRD_PLACE_RACE')
        return false;
      if (filterType === 'CHAMPION' && item.eventType !== 'CHAMPION') return false;
      if (filterType === 'UPCOMING' && item.eventType !== 'UPCOMING_MATCH') return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.headline && item.headline.toLowerCase().includes(q)) ||
      (item.tournamentName && item.tournamentName.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.teamA && item.teamA.name && item.teamA.name.toLowerCase().includes(q)) ||
      (item.teamB && item.teamB.name && item.teamB.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#08090d] border border-red-600/40 p-6 sm:p-8 shadow-[0_0_60px_rgba(239,68,68,0.25)] text-slate-200 my-8 flex flex-col max-h-[90vh]">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-neutral-800 shrink-0">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-mono font-bold mb-1">
              <Sparkles className="w-3 h-3 text-red-500" />
              <span>OFFICIAL BROADCAST CHRONOLOGY</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-display text-white">
              ALL TOURNAMENT NEWS & BROADCASTS
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Complete historical and live feed of announcements, bracket stages, results, qualifications, and championships.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-slate-400 hover:text-white border border-neutral-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Updates' },
              { id: 'ANNOUNCEMENTS', label: 'Tournaments' },
              { id: 'STAGES', label: 'Stages' },
              { id: 'LIVE', label: 'Live Now' },
              { id: 'QUALIFIED', label: 'Qualifications' },
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'CHAMPION', label: 'Champions' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                  filterType === f.id
                    ? 'bg-red-600 text-white font-black shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                    : 'bg-neutral-900 text-slate-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teams, tournaments..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/60 border border-neutral-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>
        </div>

        {/* News Feed List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 py-2">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              No tournament news found matching your search.
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <ArenaTournamentNewsCard
                key={item.newsId || idx}
                item={item}
                index={idx}
                onClick={(selected) => {
                  onClose();
                  onSelectNews(selected);
                }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-neutral-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-slate-300 font-mono text-xs uppercase tracking-wider cursor-pointer"
          >
            Close Feed
          </button>
        </div>
      </div>
    </div>
  );
};
