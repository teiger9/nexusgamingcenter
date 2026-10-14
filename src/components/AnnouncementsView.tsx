import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../context/NavigationContext';
import { Announcement } from '../types';
import {
  subscribeToApprovedAnnouncements,
  fetchApprovedAnnouncementsPaginated,
  subscribeToUserAnnouncements,
  createAnnouncement,
  cancelAnnouncement,
  deleteAnnouncement,
} from '../services/announcementService';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  Megaphone,
  Plus,
  Users,
  Calendar,
  Clock,
  Phone,
  User,
  Gamepad2,
  Trash2,
  XCircle,
  Clock3,
  CheckCircle2,
  AlertCircle,
  X,
  PhoneCall,
  Copy,
  Check,
  Filter,
} from 'lucide-react';
import { useToast } from './Toast';

interface AnnouncementsViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onOpenModeration?: () => void;
}

const SUPPORTED_GAMES = [
  'CS2',
  'Valorant',
  'FC 26 / FC 27',
  'Chess',
  'League of Legends',
  'Other Game',
];

export const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({
  onOpenAuth,
  onOpenModeration,
}) => {
  const { user, playerProfile, isAdmin, isStaff } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'MY_POSTS'>('ACTIVE');
  const [approvedAnnouncements, setApprovedAnnouncements] = useState<Announcement[]>([]);
  const [myAnnouncements, setMyAnnouncements] = useState<Announcement[]>([]);
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('ALL');
  const [hasMoreAnnouncements, setHasMoreAnnouncements] = useState<boolean>(false);
  const [loadingMoreAnnouncements, setLoadingMoreAnnouncements] = useState<boolean>(false);
  const [announcementsCursor, setAnnouncementsCursor] = useState<QueryDocumentSnapshot | null>(null);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [formGame, setFormGame] = useState('CS2');
  const [customGame, setCustomGame] = useState('');
  const [formPlayersNeeded, setFormPlayersNeeded] = useState<number>(5);
  const [formDate, setFormDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [formTime, setFormTime] = useState('20:00');
  const [formPhoneNumber, setFormPhoneNumber] = useState(playerProfile?.phoneNumber || '');
  const [formMessage, setFormMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Android Back Handler for Create Announcement modal
  useBackHandler({
    id: 'announcements-create-modal',
    active: isCreateModalOpen,
    onBack: () => setIsCreateModalOpen(false),
    priority: 20,
  });

  // Android Back Handler for Announcement Details modal
  useBackHandler({
    id: 'announcements-details-modal',
    active: !!selectedAnnouncement,
    onBack: () => setSelectedAnnouncement(null),
    priority: 20,
  });

  // Load initial batch of approved announcements on game filter changes
  useEffect(() => {
    let isCancelled = false;
    const loadInitial = async () => {
      try {
        const res = await fetchApprovedAnnouncementsPaginated({
          pageSize: 18,
          lastDoc: null,
          gameFilter: selectedGameFilter,
        });
        if (!isCancelled) {
          setApprovedAnnouncements(res.announcements);
          setHasMoreAnnouncements(res.hasMore);
          setAnnouncementsCursor(res.lastDoc);
        }
      } catch (err) {
        console.error('Error fetching approved announcements:', err);
      }
    };

    loadInitial();
    return () => {
      isCancelled = true;
    };
  }, [selectedGameFilter]);

  const handleLoadMoreAnnouncements = async () => {
    if (!hasMoreAnnouncements || loadingMoreAnnouncements) return;
    setLoadingMoreAnnouncements(true);
    try {
      const res = await fetchApprovedAnnouncementsPaginated({
        pageSize: 18,
        lastDoc: announcementsCursor,
        gameFilter: selectedGameFilter,
      });
      setApprovedAnnouncements((prev) => [...prev, ...res.announcements]);
      setHasMoreAnnouncements(res.hasMore);
      setAnnouncementsCursor(res.lastDoc);
    } catch (err) {
      console.error('Error loading more announcements:', err);
    } finally {
      setLoadingMoreAnnouncements(false);
    }
  };

  // Subscribe to user's announcements if logged in
  useEffect(() => {
    if (!user) {
      setMyAnnouncements([]);
      return;
    }
    const unsub = subscribeToUserAnnouncements(user.uid, (list) => {
      setMyAnnouncements(list);
    });
    return () => unsub();
  }, [user]);

  // Keep phone prefilled if profile updates
  useEffect(() => {
    if (playerProfile?.phoneNumber && !formPhoneNumber) {
      setFormPhoneNumber(playerProfile.phoneNumber);
    }
  }, [playerProfile]);

  const handleCopyPhone = (annId: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(annId);
    showToast('info', 'Phone Copied', `Copied ${phone} to clipboard.`);
    setTimeout(() => setCopiedPhoneId(null), 2500);
  };

  const handleOpenCreateModal = () => {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    setFormPhoneNumber(playerProfile?.phoneNumber || '');
    setIsCreateModalOpen(true);
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth('login');
      return;
    }

    const finalGame = formGame === 'Other Game' ? (customGame.trim() || 'Other Game') : formGame;

    if (!finalGame.trim()) {
      showToast('error', 'Game Required', 'Please select or enter a game title.');
      return;
    }
    if (!formPlayersNeeded || formPlayersNeeded < 1) {
      showToast('error', 'Players Needed', 'Please specify how many players you need.');
      return;
    }
    if (!formDate.trim() || !formTime.trim()) {
      showToast('error', 'Date/Time Required', 'Please choose the scheduled date and time.');
      return;
    }
    if (!formPhoneNumber.trim()) {
      showToast('error', 'Phone Required', 'Please provide a valid contact phone number.');
      return;
    }
    if (!formMessage.trim()) {
      showToast('error', 'Message Required', 'Please provide an announcement message.');
      return;
    }

    setIsSubmitting(true);
    const creatorGamerTag = playerProfile?.gamerTag || user.displayName || 'Player';

    const res = await createAnnouncement({
      creatorId: user.uid,
      creatorAccountName: creatorGamerTag,
      creatorEmail: user.email || '',
      game: finalGame,
      playersNeeded: Number(formPlayersNeeded),
      date: formDate,
      time: formTime,
      phoneNumber: formPhoneNumber.trim(),
      message: formMessage.trim(),
    });

    setIsSubmitting(false);

    if (res.success) {
      showToast(
        'success',
        'Announcement Submitted',
        'Your announcement was submitted and is pending staff approval before appearing on the public board.'
      );
      setIsCreateModalOpen(false);
      setFormMessage('');
      setActiveTab('MY_POSTS');
    } else {
      showToast('error', 'Submission Failed', res.error || 'Failed to submit announcement.');
    }
  };

  const handleCancelAnnouncement = async (annId: string) => {
    if (!confirm('Are you sure you want to cancel this announcement? It will no longer be visible.')) return;
    const res = await cancelAnnouncement(annId);
    if (res.success) {
      showToast('info', 'Announcement Cancelled', 'Your announcement was closed.');
    } else {
      showToast('error', 'Error', res.error || 'Could not cancel announcement.');
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    if (!confirm('Permanently remove this announcement?')) return;
    const res = await deleteAnnouncement(annId);
    if (res.success) {
      showToast('info', 'Announcement Deleted', 'Announcement has been deleted.');
    } else {
      showToast('error', 'Error', res.error || 'Could not delete announcement.');
    }
  };

  // Filtered approved announcements
  const filteredApproved = approvedAnnouncements.filter((ann) => {
    if (selectedGameFilter === 'ALL') return true;
    return ann.game.toLowerCase().includes(selectedGameFilter.toLowerCase());
  });

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="relative overflow-hidden rounded-3xl bg-neutral-950 border border-neutral-800 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/25">
              <Megaphone className="w-3.5 h-3.5" />
              <span>NEXUS COMMUNITY BOARD</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight font-display">
              ANNOUNCEMENTS
            </h1>

            <p className="text-sm text-neutral-300 leading-relaxed">
              Find players, build a team, and organize your next game at Nexus.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              id="btn-create-announcement"
              onClick={handleOpenCreateModal}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)] active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>CREATE ANNOUNCEMENT</span>
            </button>

            {(isAdmin || isStaff) && onOpenModeration && (
              <button
                onClick={onOpenModeration}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white font-bold uppercase text-xs tracking-wider transition-all cursor-pointer"
                title="Review pending requests in Admin/Staff desk"
              >
                <span>Staff Review Desk</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs & Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'ACTIVE'
                ? 'bg-neutral-800 text-white border border-neutral-700 font-black'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
            }`}
          >
            Approved Active Announcements ({approvedAnnouncements.length})
          </button>

          {user && (
            <button
              onClick={() => setActiveTab('MY_POSTS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'MY_POSTS'
                  ? 'bg-neutral-800 text-white border border-neutral-700 font-black'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
              }`}
            >
              <span>My Announcements</span>
              {myAnnouncements.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-600/30 text-red-300 border border-red-500/30">
                  {myAnnouncements.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Game Filter (Active Tab) */}
        {activeTab === 'ACTIVE' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0 mr-1" />
            {['ALL', 'CS2', 'Valorant', 'FC', 'Chess'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedGameFilter(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                  selectedGameFilter === tab
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================
          TAB 1: APPROVED ACTIVE ANNOUNCEMENTS
          ======================================================== */}
      {activeTab === 'ACTIVE' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>APPROVED ACTIVE ANNOUNCEMENTS</span>
            </h3>
            <span className="text-[11px] font-mono text-neutral-500">
              {filteredApproved.length} game {filteredApproved.length === 1 ? 'request' : 'requests'} live
            </span>
          </div>

          {filteredApproved.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-neutral-950 border border-dashed border-neutral-800 space-y-3">
              <Megaphone className="w-10 h-10 text-neutral-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No active announcements found</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Need teammates or scrim opponents? Be the first to create an announcement!
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="mt-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                + Create Announcement
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredApproved.map((ann) => (
                <div
                  key={ann.id}
                  onClick={() => setSelectedAnnouncement(ann)}
                  className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800/90 hover:border-red-600/50 transition-all flex flex-col justify-between group shadow-sm relative overflow-hidden cursor-pointer"
                >
                  <div className="space-y-4">
                    {/* Header: Game + Players Needed */}
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-900 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase font-display tracking-wider bg-red-600/15 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                          <Gamepad2 className="w-3.5 h-3.5" />
                          <span>{ann.game}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-md">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>{ann.playersNeeded} {ann.playersNeeded === 1 ? 'Player' : 'Players'}</span>
                      </div>
                    </div>

                    {/* Schedule: Date & Time */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-850">
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <Calendar className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="truncate">{ann.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>{ann.time}</span>
                      </div>
                    </div>

                    {/* Account Name */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="text-neutral-400">Account:</span>
                      <span className="text-white font-bold">{ann.creatorAccountName}</span>
                    </div>

                    {/* Message */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        MESSAGE
                      </div>
                      <p className="text-xs text-neutral-200 leading-relaxed line-clamp-4 bg-neutral-900/40 p-3 rounded-xl border border-neutral-900">
                        {ann.message}
                      </p>
                    </div>
                  </div>

                  {/* Bottom: Contact Phone Action */}
                  <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 truncate">
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 font-bold">{ann.phoneNumber}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPhone(ann.id, ann.phoneNumber);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer border border-neutral-800"
                      title="Copy contact phone number"
                    >
                      {copiedPhoneId === ann.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Announcements */}
            {hasMoreAnnouncements && (
              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={handleLoadMoreAnnouncements}
                  disabled={loadingMoreAnnouncements}
                  className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                >
                  {loadingMoreAnnouncements ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      <span>Loading more announcements...</span>
                    </>
                  ) : (
                    <span>Load More Announcements ({approvedAnnouncements.length} loaded)</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {/* ========================================================
          TAB 2: MY ANNOUNCEMENTS (OWNER MANAGEMENT)
          ======================================================== */}
      {activeTab === 'MY_POSTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-red-500" />
              <span>MY ANNOUNCEMENT POSTS</span>
            </h3>
            <span className="text-[11px] font-mono text-neutral-500">
              Track your pending, approved, and rejected submissions
            </span>
          </div>

          {myAnnouncements.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-neutral-950 border border-dashed border-neutral-800 space-y-3">
              <Megaphone className="w-10 h-10 text-neutral-600 mx-auto" />
              <h4 className="text-base font-bold text-white">You have not created any announcements yet</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Need more players for your next match? Post an announcement now!
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="mt-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                + Create Announcement
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myAnnouncements.map((ann) => {
                const isPending = ann.status === 'pending';
                const isApproved = ann.status === 'approved';
                const isRejected = ann.status === 'rejected';
                const isExpired = ann.status === 'expired';
                const isCancelled = ann.status === 'cancelled';

                return (
                  <div
                    key={ann.id}
                    className={`p-5 rounded-2xl bg-neutral-950 border relative flex flex-col justify-between ${
                      isApproved
                        ? 'border-emerald-500/40'
                        : isPending
                        ? 'border-amber-500/40'
                        : isRejected
                        ? 'border-rose-950 opacity-80'
                        : 'border-neutral-850 opacity-70'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Status Banner */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider flex items-center gap-1.5 border">
                          {isApproved && (
                            <span className="text-emerald-400 bg-emerald-950/40 border-emerald-800 px-2 py-0.5 rounded">
                              🟢 APPROVED (LIVE)
                            </span>
                          )}
                          {isPending && (
                            <span className="text-amber-400 bg-amber-950/40 border-amber-800 px-2 py-0.5 rounded animate-pulse">
                              ⏳ PENDING REVIEW
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-rose-400 bg-rose-950/40 border-rose-800 px-2 py-0.5 rounded">
                              🔴 REJECTED
                            </span>
                          )}
                          {isExpired && (
                            <span className="text-neutral-400 bg-neutral-900 border-neutral-700 px-2 py-0.5 rounded">
                              ⚪ EXPIRED
                            </span>
                          )}
                          {isCancelled && (
                            <span className="text-neutral-500 bg-neutral-900 border-neutral-800 px-2 py-0.5 rounded">
                              ⚪ CANCELLED
                            </span>
                          )}
                        </span>

                        <span className="text-[10px] font-mono text-neutral-500">
                          {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Game & Players */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-base font-black text-white uppercase font-display">
                          {ann.game}
                        </span>
                        <span className="text-xs font-mono text-amber-300 font-bold">
                          {ann.playersNeeded} Needed
                        </span>
                      </div>

                      {/* Schedule */}
                      <div className="text-xs font-mono text-neutral-400 flex items-center gap-3">
                        <span>📅 {ann.date}</span>
                        <span>⏰ {ann.time}</span>
                      </div>

                      {/* Message */}
                      <p className="text-xs text-neutral-300 bg-neutral-900/50 p-2.5 rounded-xl border border-neutral-900">
                        {ann.message}
                      </p>

                      {/* Rejection Note if exists */}
                      {isRejected && ann.rejectionReason && (
                        <div className="p-2 rounded-lg bg-red-950/50 border border-red-900/60 text-[11px] text-red-300">
                          <span className="font-bold">Staff note:</span> {ann.rejectionReason}
                        </div>
                      )}
                    </div>

                    {/* Owner Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-neutral-500">
                        Phone: {ann.phoneNumber}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {isApproved && (
                          <button
                            onClick={() => handleCancelAnnouncement(ann.id)}
                            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-mono cursor-pointer transition-colors border border-neutral-800"
                            title="Close announcement"
                          >
                            Close
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="p-1.5 rounded-lg bg-neutral-900 hover:bg-red-950/60 text-neutral-500 hover:text-red-400 cursor-pointer transition-colors border border-neutral-800"
                          title="Delete announcement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          CREATE ANNOUNCEMENT MODAL
          ======================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-500">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-wider text-white font-display">
                    Create Announcement
                  </h3>
                  <p className="text-xs text-neutral-400">Post player recruitment for review</p>
                </div>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              {/* Account Name (Automatic, Read-Only) */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                  Account Name (Verified)
                </label>
                <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white font-bold font-mono flex items-center justify-between">
                  <span>{playerProfile?.gamerTag || user?.displayName || 'Player'}</span>
                  <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-mono">
                    ✓ Authenticated
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 font-mono">
                  Your GamerTag is automatically attached to this announcement.
                </p>
              </div>

              {/* Game Selection */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                  Select Game *
                </label>
                <select
                  value={formGame}
                  onChange={(e) => setFormGame(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 transition-colors"
                >
                  {SUPPORTED_GAMES.map((g) => (
                    <option key={g} value={g} className="bg-neutral-950 text-white">
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {formGame === 'Other Game' && (
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                    Game Title *
                  </label>
                  <input
                    type="text"
                    value={customGame}
                    onChange={(e) => setCustomGame(e.target.value)}
                    placeholder="e.g. Apex Legends, Tekken 8..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
                    required
                  />
                </div>
              )}

              {/* Number of Players Needed */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                  Number of Players Needed *
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => setFormPlayersNeeded(num)}
                      className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        formPlayersNeeded === num
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                    Scheduled Date *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 transition-colors"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                    Scheduled Time *
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                  Contact Phone Number *
                </label>
                <input
                  type="tel"
                  value={formPhoneNumber}
                  onChange={(e) => setFormPhoneNumber(e.target.value)}
                  placeholder="e.g. 05XXXXXXXX / 06XXXXXXXX"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
                  required
                />
                <p className="text-[10px] text-neutral-500 font-mono">
                  This contact number will be visible to other players who wish to join.
                </p>
              </div>

              {/* Announcement Message */}
              <div className="space-y-1">
                <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                  Announcement Message *
                </label>
                <textarea
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="Explain what you are looking for (e.g. 'Looking for 5 players to play against our team at Nexus LAN center on Saturday night.')"
                  rows={4}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
                  required
                />
              </div>

              {/* Notice */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Every newly created announcement starts as <strong>Pending</strong> and must be reviewed and approved by Nexus Staff or Admin before appearing in the public feed.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'SUBMITTING...' : 'SUBMIT FOR APPROVAL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          ANNOUNCEMENT DETAILS MODAL (Android Back: closes modal)
          ======================================================== */}
      {selectedAnnouncement && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto"
        >
          <div className="relative w-full max-w-lg bg-[#07080c] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-md text-xs font-black uppercase font-display tracking-wider bg-red-600/15 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                  <Gamepad2 className="w-4 h-4" />
                  <span>{selectedAnnouncement.game}</span>
                </span>
                <span className="px-3 py-1 rounded-md text-xs font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/25 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{selectedAnnouncement.playersNeeded} {selectedAnnouncement.playersNeeded === 1 ? 'Player' : 'Players'} Needed</span>
                </span>
              </div>
              <h2 className="text-xl font-black font-display text-white mt-3 uppercase tracking-tight">
                Announcement Details
              </h2>
            </div>

            {/* Schedule & Account Info */}
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-neutral-900/80 p-3 rounded-2xl border border-neutral-800 space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase block">Scheduled Date</span>
                <div className="flex items-center gap-1.5 text-neutral-200 font-bold">
                  <Calendar className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{selectedAnnouncement.date}</span>
                </div>
              </div>

              <div className="bg-neutral-900/80 p-3 rounded-2xl border border-neutral-800 space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase block">Scheduled Time</span>
                <div className="flex items-center gap-1.5 text-neutral-200 font-bold">
                  <Clock className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{selectedAnnouncement.time}</span>
                </div>
              </div>

              <div className="bg-neutral-900/80 p-3 rounded-2xl border border-neutral-800 space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase block">Posted By</span>
                <div className="flex items-center gap-1.5 text-neutral-200 font-bold">
                  <User className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="truncate">{selectedAnnouncement.creatorAccountName}</span>
                </div>
              </div>

              <div className="bg-neutral-900/80 p-3 rounded-2xl border border-neutral-800 space-y-1">
                <span className="text-neutral-500 text-[10px] uppercase block">Contact Phone</span>
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{selectedAnnouncement.phoneNumber}</span>
                </div>
              </div>
            </div>

            {/* Full Message */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                FULL MESSAGE
              </span>
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 text-xs text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap">
                {selectedAnnouncement.message}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="flex-1 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Back to Announcements
              </button>
              <button
                type="button"
                onClick={() => handleCopyPhone(selectedAnnouncement.id, selectedAnnouncement.phoneNumber)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {copiedPhoneId === selectedAnnouncement.id ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied Phone</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Phone ({selectedAnnouncement.phoneNumber})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
