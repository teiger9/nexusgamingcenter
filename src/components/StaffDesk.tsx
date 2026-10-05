import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  Reservation,
  GamingPost,
  PostBlock,
  Match,
  Tournament,
  TeamTournamentRegistration,
  RewardRedemption,
  Player,
  AppNotification,
  ReservationSettings,
} from '../types';
import {
  DEFAULT_POSTS,
  DEFAULT_SETTINGS,
} from '../services/reservationService';

// Tabs
import { StaffDashboardTab } from './staff/StaffDashboardTab';
import { StaffReservationsTab } from './staff/StaffReservationsTab';
import { StaffStationsTab } from './staff/StaffStationsTab';
import { StaffActiveMatchesTab } from './staff/StaffActiveMatchesTab';
import { StaffPlayersTab } from './staff/StaffPlayersTab';
import { StaffTournamentsTab } from './staff/StaffTournamentsTab';
import { StaffRewardsTab } from './staff/StaffRewardsTab';
import { StaffNotificationsTab } from './staff/StaffNotificationsTab';
import { StaffReportsTab } from './staff/StaffReportsTab';

// Modals
import { StaffWalkInModal } from './staff/StaffWalkInModal';
import { StaffReportIssueModal } from './staff/StaffReportIssueModal';
import { AdminReservationDetailsModal } from './reservations/AdminReservationDetailsModal';

import {
  LayoutDashboard,
  Calendar,
  Monitor,
  Swords,
  Users,
  Trophy,
  Gift,
  Bell,
  FileText,
  ShieldAlert,
  ShieldCheck,
  User,
  Plus,
  KeyRound,
  ExternalLink,
  ChevronDown,
  X,
  CheckCircle2,
} from 'lucide-react';

interface StaffDeskProps {
  onSwitchToAdmin?: () => void;
  onSelectMatch?: (matchId: string) => void;
  onSelectPlayerProfile?: (playerId: string) => void;
}

export const StaffDesk: React.FC<StaffDeskProps> = ({
  onSwitchToAdmin,
  onSelectMatch,
  onSelectPlayerProfile,
}) => {
  const { playerProfile, isAdmin, isSuperAdmin, sendPasswordReset } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Real-time Collections State
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [posts, setPosts] = useState<GamingPost[]>(DEFAULT_POSTS);
  const [postBlocks, setPostBlocks] = useState<PostBlock[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teamRegistrations, setTeamRegistrations] = useState<TeamTournamentRegistration[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<ReservationSettings>(DEFAULT_SETTINGS);

  // Modals
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [preselectedPostId, setPreselectedPostId] = useState<string | undefined>(undefined);
  const [reportIssuePost, setReportIssuePost] = useState<GamingPost | null>(null);
  const [detailsReservationId, setDetailsReservationId] = useState<string | null>(null);
  const [isStaffProfileModalOpen, setIsStaffProfileModalOpen] = useState(false);

  // Password reset feedback in staff profile
  const [pwdResetStatus, setPwdResetStatus] = useState<string | null>(null);
  const [pwdResetLoading, setPwdResetLoading] = useState(false);

  // 1. Real-time Subscriptions
  useEffect(() => {
    // A. Reservations
    const unsubRes = onSnapshot(
      query(collection(db, 'reservations'), orderBy('startAt', 'desc'), limit(200)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Reservation));
        setReservations(list);
      },
      (err) => console.warn('StaffDesk reservations sync error:', err)
    );

    // B. Gaming Posts
    const unsubPosts = onSnapshot(
      collection(db, 'gamingPosts'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as GamingPost));
          list.sort((a, b) => a.order - b.order);
          setPosts(list);
        }
      },
      (err) => console.warn('StaffDesk gamingPosts sync error:', err)
    );

    // C. Post Blocks
    const unsubBlocks = onSnapshot(
      collection(db, 'postBlocks'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as PostBlock));
        setPostBlocks(list);
      },
      (err) => console.warn('StaffDesk postBlocks sync error:', err)
    );

    // D. Matches
    const unsubMatches = onSnapshot(
      query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Match));
        setMatches(list);
      },
      (err) => console.warn('StaffDesk matches sync error:', err)
    );

    // E. Tournaments
    const unsubTourneys = onSnapshot(
      collection(db, 'tournaments'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Tournament));
        setTournaments(list);
      },
      (err) => console.warn('StaffDesk tournaments sync error:', err)
    );

    // F. Team Tournament Registrations
    const unsubTeamRegs = onSnapshot(
      collection(db, 'tournamentTeamRegistrations'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as TeamTournamentRegistration));
        setTeamRegistrations(list);
      },
      (err) => console.warn('StaffDesk teamRegistrations sync error:', err)
    );

    // G. Reward Redemptions
    const unsubRedemptions = onSnapshot(
      query(collection(db, 'rewardRedemptions'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as RewardRedemption));
        setRedemptions(list);
      },
      (err) => console.warn('StaffDesk rewardRedemptions sync error:', err)
    );

    // H. Players
    const unsubPlayers = onSnapshot(
      query(collection(db, 'players'), limit(200)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), uid: d.id } as Player));
        setPlayers(list);
      },
      (err) => console.warn('StaffDesk players sync error:', err)
    );

    // I. Operational Notifications
    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(80)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as AppNotification));
        setNotifications(list);
      },
      (err) => console.warn('StaffDesk notifications sync error:', err)
    );

    // J. Reservation Business Settings
    const unsubSettings = onSnapshot(
      doc(db, 'reservationSettings', 'global_settings'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as ReservationSettings);
        }
      },
      (err) => console.warn('StaffDesk reservationSettings sync error:', err)
    );

    return () => {
      unsubRes();
      unsubPosts();
      unsubBlocks();
      unsubMatches();
      unsubTourneys();
      unsubTeamRegs();
      unsubRedemptions();
      unsubPlayers();
      unsubNotifs();
      unsubSettings();
    };
  }, []);

  const handleOpenWalkIn = (postId?: string) => {
    setPreselectedPostId(postId);
    setIsWalkInModalOpen(true);
  };

  const handlePasswordReset = async () => {
    if (!playerProfile?.email) return;
    setPwdResetLoading(true);
    setPwdResetStatus(null);
    try {
      const res = await sendPasswordReset(playerProfile.email);
      if (res.success) {
        setPwdResetStatus('Password reset email dispatched to ' + playerProfile.email);
      } else {
        setPwdResetStatus(res.message || 'Failed to dispatch reset email.');
      }
    } catch (e: any) {
      setPwdResetStatus(e.message || 'Error sending reset email');
    } finally {
      setPwdResetLoading(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'reservations', label: 'Reservations', icon: Calendar, badge: reservations.filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING').length },
    { id: 'stations', label: 'Stations', icon: Monitor, badge: reservations.filter((r) => r.status === 'ACTIVE').length },
    { id: 'active_matches', label: 'Matches', icon: Swords, badge: matches.filter((m) => m.status === 'IN_PROGRESS').length },
    { id: 'tournaments', label: 'Tournaments', icon: Trophy, badge: tournaments.filter((t) => t.status === 'LIVE' || t.status === 'UPCOMING').length },
    { id: 'rewards', label: 'Rewards', icon: Gift },
    { id: 'players', label: 'Players', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter((n) => !n.read).length },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  if (!playerProfile) {
    return (
      <div className="min-h-screen bg-[#07090e] text-slate-300 flex items-center justify-center p-4">
        <p className="text-sm font-medium">Please authenticate to access the Nexus StaffDesk.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-200">
      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-[#0b0e14]/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Operational Badge */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white font-display tracking-wider">
                  NEXUS STAFFDESK
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-600/20 text-red-400 border border-red-500/30">
                  STAFF OPS
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                Gaming Center Operations & Session Management
              </p>
            </div>
          </div>

          {/* Right Header: Switch to Admin + Profile & Walk-in */}
          <div className="flex items-center gap-3">
            {/* If user is Admin, allow quick switch to AdminDesk */}
            {(isAdmin || isSuperAdmin) && onSwitchToAdmin && (
              <button
                onClick={onSwitchToAdmin}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Switch to AdminDesk</span>
              </button>
            )}

            {/* Quick Walk-In Button */}
            <button
              onClick={() => handleOpenWalkIn()}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all flex items-center gap-1.5 cursor-pointer font-display"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">+ Walk-In</span>
            </button>

            {/* Staff Profile Quick Trigger */}
            <button
              onClick={() => setIsStaffProfileModalOpen(true)}
              className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-[#121620] hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-xs">
                {playerProfile.gamerTag?.substring(0, 2).toUpperCase() || 'ST'}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-bold text-white leading-tight">{playerProfile.gamerTag}</p>
                <p className="text-[10px] text-slate-500 font-mono">STAFF</p>
              </div>
            </button>
          </div>
        </div>

        {/* HORIZONTAL TAB NAVIGATION */}
        <div className="border-t border-slate-800/80 bg-[#07090e]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 overflow-x-auto py-2 no-scrollbar">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                        : 'text-slate-400 hover:text-white hover:bg-[#121620]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        isActive ? 'bg-white text-red-600' : 'bg-[#1a2130] text-red-400 border border-red-500/30'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN BODY VIEW */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 1. DASHBOARD */}
        {activeTab === 'dashboard' && (
          <StaffDashboardTab
            reservations={reservations}
            posts={posts}
            postBlocks={postBlocks}
            matches={matches}
            tournaments={tournaments}
            redemptions={redemptions}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenWalkInModal={() => handleOpenWalkIn()}
            onCheckInReservation={(res) => {
              setActiveTab('reservations');
              setDetailsReservationId(res.id);
            }}
            onStartSession={(res) => {
              setActiveTab('reservations');
              setDetailsReservationId(res.id);
            }}
            onSelectMatch={onSelectMatch}
          />
        )}

        {/* 2. RESERVATIONS */}
        {activeTab === 'reservations' && (
          <StaffReservationsTab
            reservations={reservations}
            staffPlayer={playerProfile}
            settings={settings}
            onOpenWalkInModal={() => handleOpenWalkIn()}
            onSelectReservationDetails={(res) => setDetailsReservationId(res.id)}
          />
        )}

        {/* 3. GAMING STATIONS */}
        {activeTab === 'stations' && (
          <StaffStationsTab
            posts={posts}
            postBlocks={postBlocks}
            reservations={reservations}
            staffPlayer={playerProfile}
            settings={settings}
            onOpenWalkInModal={(postId) => handleOpenWalkIn(postId)}
            onOpenReportIssueModal={(post) => setReportIssuePost(post)}
            onSelectReservationDetails={(res) => setDetailsReservationId(res.id)}
          />
        )}

        {/* 4. ACTIVE MATCHES */}
        {activeTab === 'active_matches' && (
          <StaffActiveMatchesTab
            matches={matches}
            staffPlayer={playerProfile}
            onSelectMatch={onSelectMatch}
          />
        )}

        {/* 5. PLAYERS */}
        {activeTab === 'players' && (
          <StaffPlayersTab
            players={players}
            reservations={reservations}
            onSelectPlayerProfile={onSelectPlayerProfile}
          />
        )}

        {/* 6. TOURNAMENTS */}
        {activeTab === 'tournaments' && (
          <StaffTournamentsTab
            tournaments={tournaments}
            teamRegistrations={teamRegistrations}
            staffPlayer={playerProfile}
          />
        )}

        {/* 7. REWARDS */}
        {activeTab === 'rewards' && (
          <StaffRewardsTab
            redemptions={redemptions}
            staffPlayer={playerProfile}
          />
        )}

        {/* 8. NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <StaffNotificationsTab
            notifications={notifications}
            staffPlayer={playerProfile}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* 9. REPORTS */}
        {activeTab === 'reports' && (
          <StaffReportsTab
            reservations={reservations}
            posts={posts}
            redemptions={redemptions}
            tournaments={tournaments}
            staffPlayer={playerProfile}
          />
        )}
      </main>

      {/* WALK-IN MODAL */}
      <StaffWalkInModal
        isOpen={isWalkInModalOpen}
        onClose={() => setIsWalkInModalOpen(false)}
        onSuccess={() => {
          setActiveTab('reservations');
        }}
        posts={posts}
        settings={settings}
        staffPlayer={playerProfile}
        preselectedPostId={preselectedPostId}
      />

      {/* REPORT STATION TECHNICAL ISSUE MODAL */}
      <StaffReportIssueModal
        isOpen={!!reportIssuePost}
        onClose={() => setReportIssuePost(null)}
        onSuccess={() => {
          setActiveTab('stations');
        }}
        post={reportIssuePost}
        staffPlayer={playerProfile}
      />

      {/* RESERVATION DETAILS MODAL */}
      <AdminReservationDetailsModal
        isOpen={!!detailsReservationId}
        reservationId={detailsReservationId}
        adminPlayer={playerProfile}
        onClose={() => setDetailsReservationId(null)}
        onSuccess={() => setDetailsReservationId(null)}
      />

      {/* STAFF PROFILE MODAL */}
      {isStaffProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b0e14] border border-red-500/40 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold">
                  {playerProfile.gamerTag?.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    {playerProfile.gamerTag}
                  </h3>
                  <p className="text-xs text-red-400 font-mono font-bold">
                    Operational Role: STAFF
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStaffProfileModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono bg-[#121620] border border-slate-800 p-4 rounded-xl text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="font-bold text-white">{playerProfile.fullName || 'Operational Employee'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="text-white">{playerProfile.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="text-white">{playerProfile.phoneNumber || playerProfile.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="text-emerald-400 font-bold">ACTIVE EMPLOYEE</span>
              </div>
            </div>

            {pwdResetStatus && (
              <div className="p-3 bg-[#121620] border border-slate-700 rounded-xl text-xs text-cyan-300">
                {pwdResetStatus}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={pwdResetLoading}
                onClick={handlePasswordReset}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Change / Reset My Password</span>
              </button>

              <button
                type="button"
                onClick={() => setIsStaffProfileModalOpen(false)}
                className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
