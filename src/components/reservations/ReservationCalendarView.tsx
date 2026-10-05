import React, { useState, useMemo } from 'react';
import {
  GamingPost,
  Reservation,
  PostBlock,
  ReservationSettings,
  ReservationType,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  Monitor,
  Gamepad2,
  Users,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Plus,
  Lock,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  getTodayLocalYMD,
  parseYMDToLocalDate,
  addDaysToYMD,
  getCalendarDateLabel,
} from '../../lib/dateUtils';
import { getAvailablePcCount } from '../../services/reservationService';

interface ReservationCalendarViewProps {
  posts: GamingPost[];
  reservations: Reservation[];
  postBlocks: PostBlock[];
  settings: ReservationSettings;
  onOpenBookingModal: (options?: {
    type?: ReservationType;
    postId?: string;
    date?: string;
    time?: string;
  }) => void;
  onSelectReservation?: (reservation: Reservation) => void;
}

export const ReservationCalendarView: React.FC<ReservationCalendarViewProps> = ({
  posts,
  reservations,
  postBlocks,
  settings,
  onOpenBookingModal,
  onSelectReservation,
}) => {
  const { user, isAdmin, isStaff } = useAuth();
  const isStaffOrAdmin = isAdmin || isStaff;

  // Calendar View Mode: 'day' | 'list'
  const [viewMode, setViewMode] = useState<'day' | 'list'>('day');

  // Single Source of Truth for the Selected Calendar Date (YYYY-MM-DD in local time)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayLocalYMD());

  // Customer sub-tab: 'PC' | 'PS5' (strictly separating PC from PS5)
  const [customerCategory, setCustomerCategory] = useState<'PC' | 'PS5'>('PC');

  // Filter State (Admin view & list view)
  const [filterType, setFilterType] = useState<'ALL' | 'PC' | 'PS5'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterToSelectedDate, setFilterToSelectedDate] = useState<boolean>(true);

  // Dynamic Date Label & Calculation
  const dateInfo = useMemo(() => getCalendarDateLabel(selectedDate), [selectedDate]);

  // Selected date boundary timestamps in local time
  const { dayStartMs, dayEndMs } = useMemo(() => {
    const d = parseYMDToLocalDate(selectedDate);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    return { dayStartMs: start, dayEndMs: end };
  }, [selectedDate]);

  // Navigation handlers
  const handlePrevDate = () => {
    setSelectedDate((prev) => addDaysToYMD(prev, -1));
  };

  const handleNextDate = () => {
    setSelectedDate((prev) => addDaysToYMD(prev, 1));
  };

  const handleToday = () => {
    setSelectedDate(getTodayLocalYMD());
  };

  const handleDateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(e.target.value);
    }
  };

  // Filtered posts based on type filter (Admin matrix)
  const activePosts = useMemo(() => {
    return posts
      .filter((p) => p.status !== 'DISABLED')
      .filter((p) => {
        if (filterType === 'PC') return p.type === 'PC';
        if (filterType === 'PS5') return p.type === 'PS5';
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [posts, filterType]);

  const pcPosts = useMemo(() => posts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE'), [posts]);
  const ps5Posts = useMemo(() => posts.filter((p) => p.type === 'PS5' && p.status === 'ACTIVE'), [posts]);

  // Generate hourly time slots for the day (e.g. 10:00 to 23:00)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    const interval = settings.timeIntervalMinutes || 60;
    for (let h = 10; h <= 23; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (interval === 30) {
        slots.push(`${String(h).padStart(2, '0')}:30`);
      }
    }
    return slots;
  }, [settings.timeIntervalMinutes]);

  // Check admin slot state on a specific date, time, and post
  const getSlotDetails = (dateStr: string, timeSlot: string, post: GamingPost) => {
    const [h, m] = timeSlot.split(':').map(Number);
    const slotStart = parseYMDToLocalDate(dateStr);
    slotStart.setHours(h, m || 0, 0, 0);
    const startMs = slotStart.getTime();
    const intervalMin = settings.timeIntervalMinutes || 60;
    const endMs = startMs + intervalMin * 60 * 1000;

    // Check maintenance blocks
    const block = postBlocks.find(
      (b) => b.postId === post.id && startMs < b.endAt && endMs > b.startAt
    );
    if (block) {
      return {
        status: 'MAINTENANCE' as const,
        block,
        label: `MAINTENANCE: ${block.reason}`,
      };
    }

    if (post.status === 'MAINTENANCE') {
      return {
        status: 'MAINTENANCE' as const,
        label: 'STATION MAINTENANCE',
      };
    }

    // Check active reservations (CONFIRMED and CHECKED_IN)
    const res = reservations.find(
      (r) =>
        ['CONFIRMED', 'CHECKED_IN'].includes(r.status) &&
        r.postIds.includes(post.id) &&
        startMs < r.endAt &&
        endMs > r.startAt
    );

    if (res) {
      const isGroup = res.reservationType === 'GROUP_10_PC' || (res.requestedPcCount && res.requestedPcCount >= 8);
      return {
        status: 'RESERVED' as const,
        reservation: res,
        isGroup,
        label: isGroup
          ? `${res.requestedPcCount || 10}-PC Group`
          : res.gameName
          ? `${res.gameName} Match`
          : `${res.postType} Session`,
      };
    }

    return {
      status: 'AVAILABLE' as const,
      label: 'AVAILABLE',
    };
  };

  // Calculate customer-facing PC availability for an hourly slot
  const getCustomerPcSlotAvailability = (timeSlot: string) => {
    const [h, m] = timeSlot.split(':').map(Number);
    const slotStart = parseYMDToLocalDate(selectedDate);
    slotStart.setHours(h, m || 0, 0, 0);
    const startMs = slotStart.getTime();
    const intervalMin = settings.timeIntervalMinutes || 60;
    const endMs = startMs + intervalMin * 60 * 1000;

    const pcAvail = getAvailablePcCount(startMs, endMs, posts, reservations, postBlocks);
    const now = Date.now();
    const isPast = startMs <= now;

    return {
      startMs,
      endMs,
      availableCount: pcAvail.availableCount,
      totalCount: pcAvail.totalActivePCs,
      isPast,
      canBook8: !isPast && pcAvail.availableCount >= 8,
      canBook9: !isPast && pcAvail.availableCount >= 9,
      canBook10: !isPast && pcAvail.availableCount >= 10,
    };
  };

  // Group 8-10 PC reservations for the selected date
  const dayGroupReservations = useMemo(() => {
    return reservations.filter(
      (r) =>
        (r.reservationType === 'GROUP_10_PC' || (r.requestedPcCount && r.requestedPcCount >= 8)) &&
        ['CONFIRMED', 'CHECKED_IN'].includes(r.status) &&
        r.startAt < dayEndMs &&
        r.endAt > dayStartMs
    );
  }, [reservations, dayStartMs, dayEndMs]);

  // Filtered reservations for the List View
  const listReservations = useMemo(() => {
    return reservations
      .filter((r) => {
        // Non-admin/non-staff customers only see their own reservations if logged in, or public anonymized
        if (!isStaffOrAdmin) {
          if (user && r.userId === user.uid) return true;
          return ['CONFIRMED', 'CHECKED_IN'].includes(r.status);
        }

        // Date filter
        if (filterToSelectedDate) {
          if (r.startAt >= dayEndMs || r.endAt <= dayStartMs) return false;
        }

        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchUser = r.gamerTag?.toLowerCase().includes(q) || r.fullName?.toLowerCase().includes(q);
          const matchPost = r.postNames?.some((p) => p.toLowerCase().includes(q));
          const matchGame = r.gameName?.toLowerCase().includes(q);
          const matchPhone = isStaffOrAdmin && r.phone?.includes(q);
          if (!matchUser && !matchPost && !matchGame && !matchPhone) return false;
        }

        return true;
      })
      .sort((a, b) => b.startAt - a.startAt);
  }, [reservations, filterToSelectedDate, dayStartMs, dayEndMs, searchQuery, isStaffOrAdmin, user]);

  return (
    <div className="space-y-6">
      {/* Calendar Header & Dynamic Date Title Banner */}
      <div className="rounded-2xl nexus-card-3d p-6 space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Dynamic Date Title Display */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Selected Date</span>
              </span>
              {dateInfo.relativeLabel && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-600/15 text-red-400 border border-red-500/30">
                  {dateInfo.relativeLabel}
                </span>
              )}
            </div>

            <h2 className="text-2xl font-black font-display text-white tracking-tight">
              {dateInfo.title}
            </h2>

            <p className="text-xs text-neutral-400 font-mono">
              {isStaffOrAdmin
                ? 'Internal Staff Matrix: Individual PC & Console seat allocations visible'
                : 'Customer View: Real-time PC availability. Group bookings for 8, 9, or 10 PCs.'}
            </p>
          </div>

          {/* Quick Date Stepper & Picker Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-xl bg-neutral-900 p-1 border border-white/10 shadow-inner">
              <button
                type="button"
                onClick={handlePrevDate}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                  dateInfo.isToday
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={handleNextDate}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Native HTML5 Date Input */}
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateSelect}
                className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-red-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
          {/* Customer / Admin Navigation */}
          {!isStaffOrAdmin ? (
            <div className="inline-flex rounded-xl bg-neutral-900 p-1 border border-white/10 text-xs font-mono font-bold">
              <button
                type="button"
                onClick={() => setCustomerCategory('PC')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  customerCategory === 'PC'
                    ? 'bg-red-600 text-white shadow-md font-black'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>PC Group Arena (8, 9, 10 PCs)</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerCategory('PS5')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  customerCategory === 'PS5'
                    ? 'bg-neutral-800 text-white border border-white/15 shadow-md font-black'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-4 h-4 text-red-500" />
                <span>PS5 Consoles ({ps5Posts.length})</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-red-400 bg-red-600/10 px-2.5 py-1 rounded-lg border border-red-500/30 flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>STAFF ALLOCATION MATRIX</span>
              </span>
              <div className="inline-flex rounded-xl bg-neutral-900 p-1 border border-white/10 text-xs font-mono font-bold">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    filterType === 'ALL' ? 'bg-red-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  ALL POSTS
                </button>
                <button
                  onClick={() => setFilterType('PC')}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                    filterType === 'PC' ? 'bg-red-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>PCs ({pcPosts.length})</span>
                </button>
                <button
                  onClick={() => setFilterType('PS5')}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                    filterType === 'PS5' ? 'bg-red-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>PS5s ({ps5Posts.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* View Mode Toggle: Day Grid / List */}
          <div className="inline-flex rounded-xl bg-neutral-900 p-1 border border-white/10 text-xs font-mono font-bold">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'day' ? 'bg-neutral-800 text-white border border-white/10 shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Hourly Timeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-neutral-800 text-white border border-white/10 shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              List View
            </button>
          </div>
        </div>
      </div>

      {/* Group Reservation Alert Banner for Selected Date */}
      {dayGroupReservations.length > 0 && (
        <div className="space-y-2">
          {dayGroupReservations.map((groupRes) => (
            <div
              key={groupRes.id}
              className="p-4 rounded-2xl bg-gradient-to-r from-yellow-950/60 via-amber-900/30 to-yellow-950/60 border border-yellow-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(234,179,8,0.15)]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-yellow-400 text-black font-black">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                      {groupRes.requestedPcCount || 10}-PC GROUP ARENA • {dateInfo.relativeLabel || dateInfo.dayMonthYear}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      {new Date(groupRes.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                      →{' '}
                      {new Date(groupRes.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {groupRes.gameName || 'Esports Group Battle'} ({groupRes.requestedPcCount || 10} PCs Booked)
                  </div>
                </div>
              </div>

              {isStaffOrAdmin && (
                <div className="text-xs font-mono text-yellow-300">
                  Booked by: <span className="font-bold text-white">{groupRes.gamerTag}</span> ({groupRes.totalPrice} DA)
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* VIEW 1: CUSTOMER-FACING DAY VIEW */}
      {!isStaffOrAdmin && viewMode === 'day' && (
        <div className="space-y-6">
          {customerCategory === 'PC' ? (
            /* PC GROUP AVAILABILITY TIMELINE (Customers see number of available PCs, NOT individual PC numbers) */
            <div className="nexus-card-3d rounded-2xl overflow-hidden p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-black font-display text-white uppercase tracking-wider flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-red-500" />
                    <span>PC Esports Arena — Group Booking Availability</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Select an hourly slot with at least 8 available PCs to reserve 8, 9, or 10 PCs.
                  </p>
                </div>
                <div className="text-xs font-mono px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/10 text-white">
                  Rate: <strong className="text-red-400 font-mono-numbers">{settings.pcHourlyPrice || 150} DA</strong> / PC / hr
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {timeSlots.map((slot) => {
                  const avail = getCustomerPcSlotAvailability(slot);
                  const isAvailableForGroup = avail.availableCount >= 8 && !avail.isPast;

                  return (
                    <div
                      key={slot}
                      className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                        avail.isPast
                          ? 'bg-black/40 border-white/5 opacity-50'
                          : isAvailableForGroup
                          ? 'bg-neutral-900/90 border-white/10 hover:border-red-600/50 shadow-md'
                          : 'bg-black/60 border-white/5 opacity-70'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-sm font-black text-white">{slot}</span>
                          <span className="text-xs text-neutral-500">
                            → {slot.split(':')[0]}:59
                          </span>
                        </div>

                        {/* Customer-Facing Availability Output (Rule 1 & 7: Only show count) */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                              avail.isPast
                                ? 'bg-neutral-800 text-neutral-500 border-white/5'
                                : avail.availableCount >= 8
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}
                          >
                            AVAILABLE: {avail.isPast ? '0' : avail.availableCount} PCs
                          </span>
                        </div>

                        <div className="text-[11px] text-neutral-400 font-mono">
                          {avail.isPast ? (
                            'Time slot has passed'
                          ) : avail.canBook10 ? (
                            <span className="text-emerald-400 font-semibold">Can reserve 8, 9, or 10 PCs</span>
                          ) : avail.canBook9 ? (
                            <span className="text-red-400 font-semibold">Can reserve 8 or 9 PCs</span>
                          ) : avail.canBook8 ? (
                            <span className="text-red-400 font-semibold">Can reserve 8 PCs</span>
                          ) : (
                            <span className="text-neutral-500">Unavailable (&lt; 8 PCs available)</span>
                          )}
                        </div>
                      </div>

                      {/* Booking Action */}
                      <button
                        type="button"
                        disabled={!isAvailableForGroup}
                        onClick={() =>
                          onOpenBookingModal({
                            type: 'GROUP_10_PC',
                            date: selectedDate,
                            time: slot,
                          })
                        }
                        className={`px-4 py-2.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                          !isAvailableForGroup
                            ? 'bg-neutral-800 text-neutral-500 border border-white/5 cursor-not-allowed'
                            : 'nexus-btn-3d text-white shadow-md active:scale-95'
                        }`}
                      >
                        {isAvailableForGroup ? 'Reserve PCs' : 'Unavailable'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* PS5 STATIONS (Separate Single-Station Consoles) */
            <div className="nexus-card-3d rounded-2xl overflow-hidden p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-black font-display text-white uppercase tracking-wider flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-red-500" />
                    <span>PS5 Pro Tournament Consoles</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Book an individual PS5 station for FC 26, FC 27 and console gaming.
                  </p>
                </div>
                <div className="text-xs font-mono px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/10 text-white">
                  Rate: <strong className="text-red-400 font-mono-numbers">{settings.ps5HourlyPrice || 400} DA</strong> / hr
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ps5Posts.map((post) => (
                  <div
                    key={post.id}
                    className="p-5 rounded-xl bg-neutral-900 border border-white/10 space-y-4 hover:border-red-600/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-red-600/20 text-red-500">
                          <Gamepad2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-black text-sm text-white uppercase font-display">{post.name}</div>
                          <div className="text-[11px] text-neutral-400 font-mono">{post.specs || 'PS5 Pro Station'}</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-red-400 font-bold">
                        {settings.ps5HourlyPrice || 400} DA/hr
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenBookingModal({
                          type: 'PS5',
                          postId: post.id,
                          date: selectedDate,
                        })
                      }
                      className="w-full py-2.5 rounded-xl nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider transition-all font-mono shadow-md cursor-pointer"
                    >
                      Book This PS5 Station
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ADMIN DAY MATRIX VIEW (Staff sees all individual PC numbers & allocations) */}
      {isStaffOrAdmin && viewMode === 'day' && (
        <div className="nexus-card-3d rounded-2xl overflow-hidden shadow-xl">
          {/* Legend Bar */}
          <div className="px-6 py-3 border-b border-white/10 bg-neutral-950 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-4 text-slate-300">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-emerald-500/20 border border-emerald-500/40" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-red-600/30 border border-red-500" />
                <span>Reserved (PC)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-blue-500/30 border border-blue-400" />
                <span>Reserved (PS5)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-yellow-500/30 border border-yellow-400" />
                <span>8–10 PC Group Arena</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-md bg-amber-500/20 border border-dashed border-amber-400/50" />
                <span>Maintenance</span>
              </div>
            </div>

            <div className="text-red-400 font-bold text-[11px] font-mono">
              * Admin/Staff Only: Internal Station Numbers Visible
            </div>
          </div>

          {/* Scrollable Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              {/* Header: Stations */}
              <thead>
                <tr className="bg-neutral-900 border-b border-white/10">
                  <th className="p-3.5 text-left font-mono font-bold text-neutral-400 sticky left-0 z-20 bg-neutral-900 w-28 border-r border-white/10">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-red-500" />
                        <span>TIME</span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-normal">
                        {dateInfo.relativeLabel || dateInfo.weekday}
                      </span>
                    </div>
                  </th>

                  {activePosts.map((post) => (
                    <th
                      key={post.id}
                      className="p-3 text-center min-w-[130px] border-r border-slate-800/80 font-bold tracking-wider"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          {post.type === 'PC' ? (
                            <Monitor className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Gamepad2 className="w-4 h-4 text-blue-400" />
                          )}
                          <span className="text-white text-xs uppercase font-black">
                            {post.name}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                            post.type === 'PC'
                              ? 'bg-cyan-500/10 text-cyan-400'
                              : 'bg-blue-500/10 text-blue-400'
                          }`}
                        >
                          {post.type === 'PC'
                            ? `${settings.pcHourlyPrice || 150} DA/h`
                            : `${settings.ps5HourlyPrice || 400} DA/h`}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body: Time Rows */}
              <tbody className="divide-y divide-slate-800/50">
                {timeSlots.map((slot) => (
                  <tr key={slot} className="hover:bg-slate-900/30 transition-colors">
                    {/* Time Label (Sticky Left Column) */}
                    <td className="p-3 font-mono font-bold text-slate-300 sticky left-0 z-10 bg-[#0c0d14] border-r border-slate-800 whitespace-nowrap">
                      {slot}
                    </td>

                    {/* Post Cells */}
                    {activePosts.map((post) => {
                      const details = getSlotDetails(selectedDate, slot, post);

                      if (details.status === 'MAINTENANCE') {
                        return (
                          <td
                            key={post.id}
                            className="p-1.5 border-r border-slate-800/60 bg-amber-950/10"
                          >
                            <div className="h-10 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/10 p-2 flex flex-col justify-center items-center text-center">
                              <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>MAINTENANCE</span>
                              </span>
                            </div>
                          </td>
                        );
                      }

                      if (details.status === 'RESERVED') {
                        const isGrp = details.isGroup;
                        const isPs5 = post.type === 'PS5';

                        return (
                          <td
                            key={post.id}
                            className={`p-1.5 border-r border-slate-800/60 ${
                              isGrp
                                ? 'bg-yellow-950/20'
                                : isPs5
                                ? 'bg-blue-950/20'
                                : 'bg-cyan-950/20'
                            }`}
                          >
                            <div
                              onClick={() => {
                                if (onSelectReservation && details.reservation) {
                                  onSelectReservation(details.reservation);
                                }
                              }}
                              className={`h-10 rounded-xl border p-2 flex flex-col justify-center text-center transition-all cursor-pointer ${
                                isGrp
                                  ? 'border-yellow-400/50 bg-yellow-500/20 text-yellow-200 hover:border-yellow-300'
                                  : isPs5
                                  ? 'border-blue-400/50 bg-blue-500/20 text-blue-200 hover:border-blue-300'
                                  : 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200 hover:border-cyan-300'
                              }`}
                            >
                              <div className="text-[10px] font-mono font-bold uppercase truncate">
                                {isGrp
                                  ? `${details.reservation?.requestedPcCount || 10}-PC Group`
                                  : details.reservation?.gamerTag || 'RESERVED'}
                              </div>
                              <div className="text-[9px] text-slate-300/80 truncate">
                                {details.reservation?.gameName || `${post.type} Session`}
                              </div>
                            </div>
                          </td>
                        );
                      }

                      // Available Slot
                      return (
                        <td
                          key={post.id}
                          className="p-1.5 border-r border-slate-800/60"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onOpenBookingModal({
                                type: post.type,
                                postId: post.id,
                                date: selectedDate,
                                time: slot,
                              })
                            }
                            className="w-full h-10 rounded-xl border border-emerald-500/20 bg-emerald-950/10 hover:bg-emerald-500/20 hover:border-emerald-400/60 text-emerald-400 font-mono text-[10px] font-bold flex items-center justify-center gap-1 transition-all group"
                          >
                            <span className="opacity-60 group-hover:opacity-100">AVAILABLE</span>
                            <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: LIST VIEW */}
      {viewMode === 'list' && (
        <div className="nexus-card-3d rounded-2xl overflow-hidden p-6 space-y-4 shadow-xl">
          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reservations..."
                className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <button
                onClick={() => setFilterToSelectedDate(!filterToSelectedDate)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                  filterToSelectedDate
                    ? 'bg-red-600/20 border-red-500/50 text-red-300'
                    : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                {filterToSelectedDate
                  ? `Showing ${dateInfo.relativeLabel || dateInfo.dayMonthYear}`
                  : 'Showing All Dates'}
              </button>

              <div className="text-xs font-mono text-neutral-400">
                {listReservations.length} {listReservations.length === 1 ? 'reservation' : 'reservations'}
              </div>
            </div>
          </div>

          {listReservations.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              No reservations found {filterToSelectedDate ? `for ${dateInfo.title}` : 'for this filter'}.
            </div>
          ) : (
            <div className="space-y-3">
              {listReservations.map((res) => {
                const isGroup = res.reservationType === 'GROUP_10_PC' || (res.requestedPcCount && res.requestedPcCount >= 8);
                const isPs5 = res.postType === 'PS5';

                return (
                  <div
                    key={res.id}
                    className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-3 rounded-2xl border ${
                          isGroup
                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                            : isPs5
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                        }`}
                      >
                        {isGroup ? (
                          <Users className="w-5 h-5" />
                        ) : isPs5 ? (
                          <Gamepad2 className="w-5 h-5" />
                        ) : (
                          <Monitor className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-white">
                            {/* Rule 1: Customer must NOT see individual PC numbers */}
                            {isStaffOrAdmin
                              ? isGroup
                                ? `${res.requestedPcCount || 10}-PC Group (${res.postNames.join(', ')})`
                                : res.postNames.join(', ')
                              : isGroup
                              ? `${res.requestedPcCount || res.postIds.length} PCs Reserved (Group Arena)`
                              : isPs5
                              ? 'PS5 Tournament Console'
                              : `${res.postIds.length} PCs Reserved`}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold ${
                              res.status === 'CONFIRMED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : res.status === 'CHECKED_IN'
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : res.status === 'PENDING' || res.status === 'PENDING_ADMIN_APPROVAL'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {res.status}
                          </span>
                        </div>

                        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                          <span>{new Date(res.startAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>
                            {new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                            →{' '}
                            {new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                            ({res.durationHours}h)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          {res.totalPrice} DA
                        </div>
                        {isStaffOrAdmin && (
                          <div className="text-[10px] font-mono text-slate-400">
                            Booked: {res.gamerTag}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
