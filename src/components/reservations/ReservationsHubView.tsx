import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GamingPost,
  Reservation,
  PostBlock,
  ReservationSettings,
  ReservationType,
} from '../../types';
import {
  subscribeToGamingPosts,
  subscribeToReservations,
  subscribeToPlayerReservations,
  subscribeToPostBlocks,
  subscribeToReservationSettings,
  DEFAULT_SETTINGS,
  DEFAULT_POSTS,
} from '../../services/reservationService';
import { ReservationCalendarView } from './ReservationCalendarView';
import { MyReservationsView } from './MyReservationsView';
import { CreateReservationModal } from './CreateReservationModal';
import {
  Calendar,
  Monitor,
  Gamepad2,
  Users,
  Plus,
  Clock,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ReservationsHubViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  defaultSubTab?: 'calendar' | 'my_bookings';
}

export const ReservationsHubView: React.FC<ReservationsHubViewProps> = ({
  onOpenAuth,
  defaultSubTab = 'calendar',
}) => {
  const { user, playerProfile, isAdmin } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'calendar' | 'my_bookings'>(defaultSubTab);

  // Firestore Data State
  const [posts, setPosts] = useState<GamingPost[]>(DEFAULT_POSTS);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [playerReservations, setPlayerReservations] = useState<Reservation[]>([]);
  const [postBlocks, setPostBlocks] = useState<PostBlock[]>([]);
  const [settings, setSettings] = useState<ReservationSettings>(DEFAULT_SETTINGS);

  // Booking Modal State
  const [isBookingModalOpen, setIsBookingModalOpen] = useState<boolean>(false);
  const [bookingModalOptions, setBookingModalOptions] = useState<{
    type?: ReservationType;
    postId?: string;
    date?: string;
    time?: string;
  }>({});

  // Subscriptions
  useEffect(() => {
    const unsubPosts = subscribeToGamingPosts(setPosts);
    const unsubRes = subscribeToReservations(setAllReservations);
    const unsubBlocks = subscribeToPostBlocks(setPostBlocks);
    const unsubSettings = subscribeToReservationSettings(setSettings);

    let unsubPlayerRes = () => {};
    if (user) {
      unsubPlayerRes = subscribeToPlayerReservations(user.uid, setPlayerReservations);
    }

    return () => {
      unsubPosts();
      unsubRes();
      unsubBlocks();
      unsubSettings();
      unsubPlayerRes();
    };
  }, [user]);

  const activePcCount = posts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE').length;
  const activePs5Count = posts.filter((p) => p.type === 'PS5' && p.status === 'ACTIVE').length;

  const handleOpenBooking = (options?: {
    type?: ReservationType;
    postId?: string;
    date?: string;
    time?: string;
  }) => {
    setBookingModalOptions(options || {});
    setIsBookingModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner & Hub Header */}
      <div className="relative rounded-2xl overflow-hidden nexus-card-3d p-6 sm:p-8 border-red-600/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/15 border border-red-500/30 text-red-400 text-xs font-mono font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>NEXUS ESPORTS ARENA BOOKINGS</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight uppercase">
              Station &amp; <span className="text-red-500">Group Reservations</span>
            </h1>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              Book high-performance PC esports rigs as a group (8, 9, or 10 PCs for scrims and tournaments), or reserve next-gen PS5 consoles for competitive console gaming. Real-time conflict protection guarantees your time slot.
            </p>

            {/* Quick Pricing Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/10 text-white flex items-center gap-1.5 font-bold">
                <Users className="w-3.5 h-3.5 text-red-500" />
                <span>PC Group (8, 9, 10 PCs): <strong className="text-red-400 font-mono-numbers">{settings.pcHourlyPrice || 150} DA</strong> / PC / hr</span>
              </span>

              <span className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/10 text-white flex items-center gap-1.5 font-bold">
                <Gamepad2 className="w-3.5 h-3.5 text-red-500" />
                <span>PS5 Station: <strong className="text-red-400 font-mono-numbers">{settings.ps5HourlyPrice || 400} DA</strong> / hr</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto shrink-0">
            <button
              onClick={() => handleOpenBooking({ type: 'GROUP_10_PC' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider cursor-pointer shadow-lg shadow-red-950/40"
            >
              <Users className="w-4 h-4 stroke-[2.5]" />
              <span>Reserve 8–10 PCs (Group)</span>
            </button>

            <button
              onClick={() => handleOpenBooking({ type: 'PS5' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/15 text-white font-bold uppercase text-xs tracking-wider transition-all cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4 stroke-[2.5] text-red-500" />
              <span>Reserve PS5 Console</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('calendar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === 'calendar'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Availability Timeline</span>
          </button>

          <button
            onClick={() => setActiveSubTab('my_bookings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === 'my_bookings'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>My Bookings &amp; Status</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 bg-neutral-900 px-3 py-1.5 rounded-lg border border-white/5">
          <span>Active Rigs: <strong className="text-white font-mono-numbers">{activePcCount}</strong> PCs • <strong className="text-white font-mono-numbers">{activePs5Count}</strong> PS5s</span>
        </div>
      </div>

      {/* Tab Content */}
      {activeSubTab === 'calendar' ? (
        <ReservationCalendarView
          posts={posts}
          reservations={allReservations}
          postBlocks={postBlocks}
          settings={settings}
          onOpenBookingModal={handleOpenBooking}
        />
      ) : (
        <MyReservationsView
          reservations={user ? playerReservations : allReservations}
          allReservations={allReservations}
          settings={settings}
          onOpenBookingModal={handleOpenBooking}
        />
      )}

      {/* Booking Modal */}
      <CreateReservationModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onOpenAuth={onOpenAuth}
        posts={posts}
        existingReservations={allReservations}
        postBlocks={postBlocks}
        settings={settings}
        initialType={bookingModalOptions.type}
        initialPostId={bookingModalOptions.postId}
        initialDate={bookingModalOptions.date}
        initialTime={bookingModalOptions.time}
        onReservationCreated={() => {
          // If in player mode, refresh will happen automatically via onSnapshot
        }}
      />
    </div>
  );
};
