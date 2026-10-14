import React, { useState } from 'react';
import { Player, Reservation } from '../../types';
import {
  Users,
  Search,
  Shield,
  Coins,
  Calendar,
  Monitor,
  Phone,
  Mail,
  UserCheck,
  UserX,
  ExternalLink,
} from 'lucide-react';

interface StaffPlayersTabProps {
  players: Player[];
  reservations: Reservation[];
  onSelectPlayerProfile?: (playerId: string) => void;
}

export const StaffPlayersTab: React.FC<StaffPlayersTabProps> = ({
  players,
  reservations,
  onSelectPlayerProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const filteredPlayers = players.filter((p) => {
    if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const tag = (p.gamerTag || '').toLowerCase();
      const name = (p.fullName || '').toLowerCase();
      const email = (p.email || '').toLowerCase();
      const phone = (p.phoneNumber || p.phone || '').toLowerCase();
      if (!tag.includes(q) && !name.includes(q) && !email.includes(q) && !phone.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40">
            SUPER ADMIN
          </span>
        );
      case 'ADMIN':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-red-500/20 text-red-300 border border-red-500/40">
            ADMIN
          </span>
        );
      case 'STAFF':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            STAFF
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700">
            PLAYER
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Users className="w-5 h-5 text-red-500" />
            <span>Players Directory & Operational Dossier</span>
          </h3>
          <p className="text-xs text-slate-400">
            Operational search for reservations, active sessions, and customer service
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>Operational View • Coin & MMR modifications are Admin-restricted</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              roleFilter === 'ALL' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Accounts ({players.length})
          </button>
          <button
            onClick={() => setRoleFilter('PLAYER')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              roleFilter === 'PLAYER' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Players
          </button>
          <button
            onClick={() => setRoleFilter('STAFF')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              roleFilter === 'STAFF' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Staff
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search GamerTag, name, phone, email..."
            className="w-full bg-[#121620] border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Players List */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Showing {filteredPlayers.length} Player{filteredPlayers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredPlayers.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 text-slate-600">No players match the search criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredPlayers.map((p) => {
              // Find active session
              const activeSession = reservations.find(
                (r) => r.userId === p.uid && r.status === 'ACTIVE'
              );

              // Find today's upcoming reservation
              const todayStart = new Date().setHours(0, 0, 0, 0);
              const todayEnd = new Date().setHours(23, 59, 59, 999);
              const todayReservation = reservations.find(
                (r) =>
                  r.userId === p.uid &&
                  r.status === 'CONFIRMED' &&
                  r.startAt >= todayStart &&
                  r.startAt <= todayEnd
              );

              return (
                <div
                  key={p.uid}
                  className="p-4 sm:p-5 hover:bg-[#0e121a] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold font-display text-white overflow-hidden shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt={p.gamerTag} className="w-full h-full object-cover" />
                      ) : (
                        p.gamerTag?.substring(0, 2).toUpperCase() || 'NX'
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white font-display">{p.gamerTag}</span>
                        {p.fullName && (
                          <span className="text-xs text-slate-400">({p.fullName})</span>
                        )}
                        {getRoleBadge(p.role || 'PLAYER')}
                        {p.isSuspended ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-red-950/40 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <UserX className="w-3 h-3" />
                            SUSPENDED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                        {p.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            {p.email}
                          </span>
                        )}
                        {(p.phoneNumber || p.phone) && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            {p.phoneNumber || p.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-amber-400 font-bold">
                          <Coins className="w-3.5 h-3.5" />
                          {p.nexusCoins || 0} Coins (Read-only)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badges & Quick View */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {activeSession && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                        <Monitor className="w-3 h-3" />
                        Gaming on {activeSession.postNames?.join(', ')}
                      </span>
                    )}

                    {todayReservation && !activeSession && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Booked at {new Date(todayReservation.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}

                    {onSelectPlayerProfile && (
                      <button
                        onClick={() => onSelectPlayerProfile(p.uid)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Profile</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
