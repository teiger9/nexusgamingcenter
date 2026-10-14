import React, { useState } from 'react';
import { AppNotification, Player } from '../../types';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationService';
import {
  Bell,
  CheckCircle2,
  Calendar,
  Wrench,
  Trophy,
  Gift,
  Swords,
  AlertTriangle,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface StaffNotificationsTabProps {
  notifications: AppNotification[];
  staffPlayer: Player;
  onNavigateTab: (tab: string) => void;
}

export const StaffNotificationsTab: React.FC<StaffNotificationsTabProps> = ({
  notifications,
  staffPlayer,
  onNavigateTab,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Filter notifications
  const filteredNotifications = notifications.filter((notif) => {
    if (onlyUnread && notif.read) return false;

    if (filterType !== 'ALL') {
      if (filterType === 'RESERVATIONS' && !notif.type.includes('RESERVATION')) return false;
      if (filterType === 'TOURNAMENTS' && !notif.type.includes('TOURNAMENT')) return false;
      if (filterType === 'REWARDS' && !notif.type.includes('REWARD') && !notif.type.includes('COIN')) return false;
      if (filterType === 'MATCHES' && !notif.type.includes('MATCH') && !notif.type.includes('LOBBY')) return false;
    }

    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(staffPlayer.uid);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      try {
        await markNotificationAsRead(notif.id || notif.notificationId || '');
      } catch (err) {
        console.error('Error marking as read:', err);
      }
    }

    // Deep link routing to relevant tab
    if (notif.type.includes('RESERVATION')) {
      onNavigateTab('reservations');
    } else if (notif.type.includes('TOURNAMENT')) {
      onNavigateTab('tournaments');
    } else if (notif.type.includes('REWARD') || notif.type.includes('COIN')) {
      onNavigateTab('rewards');
    } else if (notif.type.includes('MATCH') || notif.type.includes('LOBBY')) {
      onNavigateTab('active_matches');
    } else if (notif.type.includes('POST') || notif.type.includes('MAINTENANCE')) {
      onNavigateTab('stations');
    }
  };

  const getNotifIcon = (type: string) => {
    if (type.includes('RESERVATION')) {
      return <Calendar className="w-4 h-4 text-emerald-400" />;
    }
    if (type.includes('TOURNAMENT')) {
      return <Trophy className="w-4 h-4 text-amber-400" />;
    }
    if (type.includes('REWARD') || type.includes('COIN')) {
      return <Gift className="w-4 h-4 text-purple-400" />;
    }
    if (type.includes('MATCH') || type.includes('LOBBY')) {
      return <Swords className="w-4 h-4 text-cyan-400" />;
    }
    return <Bell className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Bell className="w-5 h-5 text-red-500" />
            <span>Operational Staff Notifications</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time center alerts, booking notifications, and participant updates
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Mark All as Read ({unreadCount})</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterType === 'ALL' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Alerts
            </button>
            <button
              onClick={() => setFilterType('RESERVATIONS')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterType === 'RESERVATIONS' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reservations
            </button>
            <button
              onClick={() => setFilterType('TOURNAMENTS')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterType === 'TOURNAMENTS' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tournaments
            </button>
            <button
              onClick={() => setFilterType('REWARDS')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterType === 'REWARDS' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Rewards
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => setOnlyUnread(e.target.checked)}
              className="rounded border-slate-700 text-red-600 focus:ring-0"
            />
            <span>Unread Only</span>
          </label>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Notifications List */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {filteredNotifications.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Bell className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 text-slate-600">No operational alerts matching this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredNotifications.map((notif) => {
              const isUnread = !notif.read;
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer transition-colors ${
                    isUnread
                      ? 'bg-red-950/10 hover:bg-red-950/20'
                      : 'hover:bg-[#121620]/50'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#121620] border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      {getNotifIcon(notif.type)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-display">
                          {notif.title}
                        </span>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300">
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {new Date(notif.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-slate-500 hover:text-white transition-colors">
                    <span className="text-[11px] font-bold hidden sm:inline">Open</span>
                    <ArrowRight className="w-4 h-4" />
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
