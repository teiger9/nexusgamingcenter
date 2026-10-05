import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GamingPost,
  Reservation,
  ReservationSettings,
  ReservationType,
  PostBlock,
} from '../../types';
import {
  createReservationAtomic,
  checkReservationConflict,
  calculateReservationPrice,
  isValidPhoneNumber,
  getAvailablePcCount,
} from '../../services/reservationService';
import {
  getTodayLocalYMD,
  getCalendarDateLabel,
  formatYMDDisplay,
  parseYMDToLocalDate,
} from '../../lib/dateUtils';
import {
  Monitor,
  Gamepad2,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  ArrowLeft,
  Phone,
  User,
  Info,
  PhoneCall,
  Sparkles,
} from 'lucide-react';

interface CreateReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  posts: GamingPost[];
  existingReservations: Reservation[];
  postBlocks: PostBlock[];
  settings: ReservationSettings;
  initialType?: ReservationType;
  initialPostId?: string;
  initialDate?: string; // YYYY-MM-DD
  initialTime?: string; // HH:mm
  onReservationCreated?: (res: Reservation) => void;
}

export const CreateReservationModal: React.FC<CreateReservationModalProps> = ({
  isOpen,
  onClose,
  posts,
  existingReservations,
  postBlocks,
  settings,
  initialType = 'PC',
  initialPostId,
  initialDate,
  initialTime,
  onReservationCreated,
}) => {
  const { user, playerProfile, isAdmin, isStaff } = useAuth();

  // Helper for today's date formatted as YYYY-MM-DD
  const todayStr = getTodayLocalYMD();

  // Helper to get next available future hour
  const getNextFutureTimeSlot = (targetDateStr: string) => {
    const now = new Date();

    if (targetDateStr === todayStr) {
      const nextHour = now.getHours() + 1;
      if (nextHour >= 24) return '10:00'; // rollover
      const safeHour = Math.max(10, nextHour);
      if (safeHour > 23) return '23:00';
      return `${String(safeHour).padStart(2, '0')}:00`;
    }
    return '12:00';
  };

  // Wizard Step: 1 = Type, Time & Quantity, 2 = PS5 Station Selection (PS5 only), 3 = Contact & Confirm
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [resType, setResType] = useState<'PC_GROUP' | 'PS5'>(
    initialType === 'PS5' ? 'PS5' : 'PC_GROUP'
  );
  const [pcQuantity, setPcQuantity] = useState<8 | 9 | 10>(10);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate && initialDate >= todayStr) return initialDate;
    return todayStr;
  });
  const [startTime, setStartTime] = useState<string>(() => {
    if (initialTime) return initialTime;
    return getNextFutureTimeSlot(todayStr);
  });
  const [durationHours, setDurationHours] = useState<number>(1);
  const [selectedPostId, setSelectedPostId] = useState<string>(initialPostId || '');
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [playerPhone, setPlayerPhone] = useState<string>('');
  const [playerFullName, setPlayerFullName] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReservation, setSuccessReservation] = useState<Reservation | null>(null);

  // Dynamic date label for selectedDate
  const dateLabel = useMemo(() => getCalendarDateLabel(selectedDate), [selectedDate]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage(null);
      setSuccessReservation(null);
      setResType(initialType === 'PS5' ? 'PS5' : 'PC_GROUP');
      setPcQuantity(10);
      const validInitialDate = initialDate && initialDate >= todayStr ? initialDate : todayStr;
      setSelectedDate(validInitialDate);
      setStartTime(initialTime || getNextFutureTimeSlot(validInitialDate));
      if (initialPostId) setSelectedPostId(initialPostId);
      if (playerProfile) {
        setPlayerFullName(playerProfile.fullName || playerProfile.gamerTag || '');
        setPlayerPhone(playerProfile.phone || '');
      } else {
        // Retrieve last guest phone/name from localStorage if available
        try {
          const lastPhone = localStorage.getItem('nexus_guest_phone');
          const lastName = localStorage.getItem('nexus_guest_name');
          if (lastPhone) setPlayerPhone(lastPhone);
          if (lastName) setPlayerFullName(lastName);
        } catch {
          // Ignore
        }
      }
    }
  }, [isOpen, initialType, initialPostId, initialDate, initialTime, playerProfile, todayStr]);

  // If date changes to today and current startTime is in the past, auto-adjust to future
  useEffect(() => {
    if (selectedDate === todayStr) {
      const [h, m] = startTime.split(':').map(Number);
      const now = new Date();
      if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) {
        setStartTime(getNextFutureTimeSlot(todayStr));
      }
    }
  }, [selectedDate, todayStr]);

  // Calculate start and end timestamp
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDateObj = parseYMDToLocalDate(selectedDate);
  startDateObj.setHours(hours, minutes, 0, 0);
  const startAt = startDateObj.getTime();
  const endAt = startAt + durationHours * 3600 * 1000;
  const endDateObj = new Date(endAt);
  const endTimeFormatted = endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Separate PC posts and PS5 posts
  const activePcPosts = posts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE');
  const activePs5Posts = posts.filter((p) => p.type === 'PS5' && p.status === 'ACTIVE');

  // Customer-facing PC availability calculation (exclusively PCs, no PS5)
  const pcAvailability = useMemo(() => {
    return getAvailablePcCount(startAt, endAt, posts, existingReservations, postBlocks);
  }, [startAt, endAt, posts, existingReservations, postBlocks]);

  const availablePcCount = pcAvailability.availableCount;

  // Auto-adjust pcQuantity if current choice exceeds available PCs
  useEffect(() => {
    if (resType === 'PC_GROUP') {
      if (availablePcCount >= 10 && pcQuantity < 8) {
        setPcQuantity(10);
      } else if (availablePcCount === 9 && pcQuantity > 9) {
        setPcQuantity(9);
      } else if (availablePcCount === 8 && pcQuantity > 8) {
        setPcQuantity(8);
      }
    }
  }, [availablePcCount, resType, pcQuantity]);

  // Pricing calculations
  const pcBaseHourly = settings.pcHourlyPrice || 150;
  const ps5BaseHourly = settings.ps5HourlyPrice || 400;

  const { totalPrice, hourlyPriceSnapshot } = useMemo(() => {
    if (resType === 'PS5') {
      return calculateReservationPrice('PS5', durationHours, settings, activePcPosts.length, 1);
    }
    return calculateReservationPrice('GROUP_10_PC', durationHours, settings, activePcPosts.length, pcQuantity);
  }, [resType, durationHours, settings, activePcPosts.length, pcQuantity]);

  // Generate selectable time slots based on date (filtering out past hours for TODAY)
  const isSelectedDateToday = selectedDate === todayStr;
  const availableTimeSlots = useMemo(() => {
    const slots: string[] = [];
    const now = new Date();
    const interval = settings.timeIntervalMinutes || 60;

    for (let h = 10; h <= 23; h++) {
      const slot1 = `${String(h).padStart(2, '0')}:00`;
      const slot1Time = parseYMDToLocalDate(selectedDate);
      slot1Time.setHours(h, 0, 0, 0);

      if (!isSelectedDateToday || slot1Time.getTime() > now.getTime()) {
        slots.push(slot1);
      }

      if (interval === 30) {
        const slot2 = `${String(h).padStart(2, '0')}:30`;
        const slot2Time = parseYMDToLocalDate(selectedDate);
        slot2Time.setHours(h, 30, 0, 0);

        if (!isSelectedDateToday || slot2Time.getTime() > now.getTime()) {
          slots.push(slot2);
        }
      }
    }
    return slots;
  }, [selectedDate, isSelectedDateToday, settings.timeIntervalMinutes]);

  // Check availability for individual PS5 stations (PS5 flow only)
  const getPs5PostAvailabilityStatus = (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return { available: false, reason: 'Not found' };
    if (post.status !== 'ACTIVE') {
      return { available: false, reason: `Station ${post.status.toLowerCase()}` };
    }

    const conflict = checkReservationConflict(
      startAt,
      endAt,
      [postId],
      existingReservations,
      postBlocks,
      undefined,
      false
    );

    if (conflict.hasConflict) {
      return { available: false, reason: conflict.conflictReason || 'Occupied' };
    }

    return { available: true, reason: 'Available' };
  };

  const handleNextStep = () => {
    setErrorMessage(null);

    // Rule: No reservations in the past
    const now = Date.now();
    if (startAt <= now || endAt <= now) {
      setErrorMessage('This time has already passed. Please choose a future time.');
      return;
    }

    // Validate opening hours
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const dayOfWeek = dayNames[startDateObj.getDay()];
    const daySchedule = settings.openingHours?.[dayOfWeek];

    if (daySchedule && !daySchedule.isOpen) {
      setErrorMessage(`Nexus Gaming Center is closed on ${dayOfWeek.toUpperCase()}.`);
      return;
    }

    if (step === 1) {
      if (resType === 'PC_GROUP') {
        // Enforce availability for chosen quantity (8, 9, or 10)
        if (availablePcCount < 8) {
          setErrorMessage(
            `PC Group Reservation unavailable: Only ${availablePcCount} PCs are available for this time. A minimum of 8 PCs is required.`
          );
          return;
        }

        if (availablePcCount < pcQuantity) {
          setErrorMessage(
            `Only ${availablePcCount} PCs are available during this time slot. Please select ${availablePcCount === 9 ? '8 or 9 PCs' : '8 PCs'} or choose another time.`
          );
          return;
        }

        // PC Group reservations skip station selection completely! Internal allocation only!
        setStep(3);
      } else {
        // PS5 station selection
        const firstAvailable = activePs5Posts.find(
          (p) => getPs5PostAvailabilityStatus(p.id).available
        );
        if (firstAvailable && (!selectedPostId || !getPs5PostAvailabilityStatus(selectedPostId).available)) {
          setSelectedPostId(firstAvailable.id);
        }
        setStep(2);
      }
    } else if (step === 2) {
      if (resType === 'PS5') {
        if (!selectedPostId) {
          setErrorMessage('Please select an available PS5 station to continue.');
          return;
        }
        const status = getPs5PostAvailabilityStatus(selectedPostId);
        if (!status.available) {
          setErrorMessage(`Selected PS5 station is not available: ${status.reason}`);
          return;
        }
      }
      setStep(3);
    }
  };

  const handleConfirmReservation = async () => {
    // 1. Validate Mandatory Full Name
    const rawFullName = playerFullName.trim();
    if (!rawFullName) {
      setErrorMessage('Full name is required to submit a reservation.');
      return;
    }

    // 2. Validate Mandatory Phone Number
    const rawPhone = playerPhone.trim();
    if (!rawPhone || !isValidPhoneNumber(rawPhone)) {
      setErrorMessage('A valid phone number is mandatory so our staff can call you to confirm your booking.');
      return;
    }

    // 3. Validate future start time
    const now = Date.now();
    if (startAt <= now || endAt <= now) {
      setErrorMessage('This time has already passed. Please choose a future time.');
      return;
    }

    // 4. Validate PC group constraints
    if (resType === 'PC_GROUP') {
      if (pcQuantity < 8 || pcQuantity > 10) {
        setErrorMessage('PC reservations must be made for 8, 9, or 10 PCs.');
        return;
      }
      if (availablePcCount < pcQuantity) {
        setErrorMessage(`Only ${availablePcCount} PCs are available for this time. Cannot reserve ${pcQuantity} PCs.`);
        return;
      }
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const isGuestBooking = !user;
      const effectiveUserId = user ? user.uid : `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const effectiveGamerTag = user
        ? (playerProfile?.gamerTag || rawFullName)
        : rawFullName;

      const result = await createReservationAtomic({
        userId: effectiveUserId,
        gamerTag: effectiveGamerTag,
        fullName: rawFullName,
        phoneNumber: rawPhone,
        phone: rawPhone,
        email: user?.email || undefined,
        reservationType: resType === 'PS5' ? 'PS5' : (pcQuantity === 10 ? 'GROUP_10_PC' : 'PC'),
        requestedPcCount: resType === 'PC_GROUP' ? pcQuantity : undefined,
        selectedPostId: resType === 'PS5' ? selectedPostId : undefined,
        gameId: selectedGame || undefined,
        gameName: selectedGame
          ? selectedGame === 'valorant'
            ? 'Valorant'
            : selectedGame === 'cs2'
            ? 'CS2'
            : selectedGame === 'fc26'
            ? 'FC 26'
            : selectedGame === 'fc27'
            ? 'FC 27'
            : selectedGame
          : undefined,
        startAt,
        durationHours,
        notes: notes.trim() || undefined,
        isAdminBooking: isAdmin || isStaff,
        isGuest: isGuestBooking,
      });

      // Save guest info and reservation ID in local storage for quick access
      try {
        localStorage.setItem('nexus_guest_phone', rawPhone);
        localStorage.setItem('nexus_guest_name', rawFullName);
        const existingStored = JSON.parse(localStorage.getItem('nexus_guest_reservation_ids') || '[]');
        if (!existingStored.includes(result.id)) {
          existingStored.unshift(result.id);
          localStorage.setItem('nexus_guest_reservation_ids', JSON.stringify(existingStored.slice(0, 20)));
        }
      } catch {
        // Ignore local storage errors
      }

      setSuccessReservation(result);
      if (onReservationCreated) onReservationCreated(result);
    } catch (err: any) {
      console.error('Reservation creation failed:', err);
      setErrorMessage(
        err.message ||
          'Failed to submit reservation request. Station availability may have changed. Please try another time slot.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0d0e15] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black font-display text-white uppercase tracking-wider">
                Book Gaming Session
              </h2>
              <p className="text-xs text-neutral-400">
                8–10 PC Group Arena or PS5 Pro Console • No Account Required
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step Progress Indicator */}
        {!successReservation && (
          <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-white/10 bg-black/40">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                  step >= 1 ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                1
              </div>
              <span className={`text-xs font-bold ${step >= 1 ? 'text-white' : 'text-neutral-500'}`}>
                {resType === 'PC_GROUP' ? 'PC Group & Schedule' : 'Category & Schedule'}
              </span>
            </div>

            {resType === 'PS5' && (
              <>
                <div className="w-8 h-0.5 bg-neutral-800" />
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                      step >= 2 ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500'
                    }`}
                  >
                    2
                  </div>
                  <span className={`text-xs font-bold ${step >= 2 ? 'text-white' : 'text-neutral-500'}`}>
                    Select PS5 Station
                  </span>
                </div>
              </>
            )}

            <div className="w-8 h-0.5 bg-neutral-800" />
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                  step === 3 ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                {resType === 'PS5' ? '3' : '2'}
              </div>
              <span className={`text-xs font-bold ${step === 3 ? 'text-white' : 'text-neutral-500'}`}>
                Guest Contact & Confirm
              </span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-start gap-3 animate-shake">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Reservation Notice</div>
                <div>{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Success State */}
          {successReservation ? (
            <div className="text-center py-6 space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                <Clock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {successReservation.status === 'CONFIRMED'
                      ? 'OFFICIALLY CONFIRMED'
                      : 'PENDING ADMIN APPROVAL'}
                  </span>
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-wider pt-2">
                  {successReservation.status === 'CONFIRMED'
                    ? 'Reservation Confirmed!'
                    : 'Reservation Request Submitted'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  {successReservation.status === 'CONFIRMED'
                    ? 'Your booking is confirmed and ready for your arrival.'
                    : `Nexus administration has received your reservation request for ${
                        successReservation.requestedPcCount || successReservation.postIds?.length || 8
                      } PCs. We will call your phone at ${successReservation.phoneNumber || successReservation.phone} shortly to verify and confirm.`}
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-left space-y-3 font-mono text-xs max-w-lg mx-auto">
                <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                  <span>Request ID:</span>
                  <span className="text-cyan-400 font-bold">{successReservation.id}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      successReservation.status === 'CONFIRMED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {successReservation.status}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Customer Name:</span>
                  <span className="font-bold text-white">
                    {successReservation.fullName || successReservation.gamerTag}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Contact Phone:</span>
                  <span className="font-bold text-white flex items-center gap-1">
                    <Phone className="w-3 h-3 text-cyan-400" />
                    <span>{successReservation.phoneNumber || successReservation.phone}</span>
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Reservation Details:</span>
                  <span className="font-bold text-cyan-300">
                    {successReservation.postType === 'PS5'
                      ? 'PS5 Pro Console'
                      : `${successReservation.requestedPcCount || successReservation.postIds.length} PCs Reserved (Group Arena)`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Date & Schedule:</span>
                  <span className="text-white">
                    {formatYMDDisplay(new Date(successReservation.startAt).toISOString().split('T')[0])} (
                    {new Date(successReservation.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    →{' '}
                    {new Date(successReservation.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Duration:</span>
                  <span className="text-white">{successReservation.durationHours} Hour(s)</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                  <span className="text-slate-300">Total Price:</span>
                  <span className="text-emerald-400">{successReservation.totalPrice} DA</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs text-left max-w-lg mx-auto flex items-start gap-3">
                <PhoneCall className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">Next Step: Verification Phone Call</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">
                    Our staff will call you to confirm your group reservation. You do not need to do anything else. You can track this booking at any time in "My Reservations".
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full max-w-lg py-3 bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase tracking-wider text-xs rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* STEP 1: Type, PC Quantity (8, 9, 10), Date, Time & Duration */}
              {step === 1 && (
                <div className="space-y-6">
                  {/* Reservation Type Selector: PC Group vs PS5 */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      1. Select Reservation Category
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* PC Group Reservation (8, 9, or 10 PCs) */}
                      <button
                        type="button"
                        onClick={() => setResType('PC_GROUP')}
                        className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                          resType === 'PC_GROUP'
                            ? 'bg-red-600/15 border-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                            : 'bg-neutral-900 border-white/10 text-neutral-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className={`p-2 rounded-lg ${resType === 'PC_GROUP' ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}>
                            <Users className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-mono font-bold text-red-400">
                            {pcBaseHourly} DA / PC / hr
                          </span>
                        </div>
                        <div>
                          <div className="font-black text-sm text-white uppercase tracking-wider flex items-center gap-1.5 font-display">
                            <span>PC Group Reservation</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-300 font-mono">
                              8, 9, or 10 PCs
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            Esports group booking for scrims, squads &amp; tournaments
                          </div>
                        </div>
                      </button>

                      {/* PS5 Console (Separate reservation type) */}
                      <button
                        type="button"
                        onClick={() => setResType('PS5')}
                        className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                          resType === 'PS5'
                            ? 'bg-neutral-800 border-white/25 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                            : 'bg-neutral-900 border-white/10 text-neutral-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className={`p-2 rounded-lg ${resType === 'PS5' ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}>
                            <Gamepad2 className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-mono font-bold text-white">
                            {ps5BaseHourly} DA / hr
                          </span>
                        </div>
                        <div>
                          <div className="font-black text-sm text-white uppercase tracking-wider flex items-center gap-1.5 font-display">
                            <span>PS5 Pro Station</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-neutral-200 font-mono">
                              1 Console
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            Single station for FC 26/27 &amp; console gaming
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Date, Start Time & Duration */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Date</span>
                        </label>
                        {dateLabel.relativeLabel && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                            {dateLabel.relativeLabel}
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        min={todayStr}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Start Time (Future)</span>
                      </label>
                      <select
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                      >
                        {availableTimeSlots.length > 0 ? (
                          availableTimeSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))
                        ) : (
                          <option value={startTime}>{startTime} (No further slots today)</option>
                        )}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Duration</span>
                      </label>
                      <select
                        value={durationHours}
                        onChange={(e) => setDurationHours(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                          <option key={h} value={h}>
                            {h} {h === 1 ? 'Hour' : 'Hours'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* PC GROUP SPECIFIC: Customer-Facing Availability & Quantity Selector (8, 9, or 10) */}
                  {resType === 'PC_GROUP' && (
                    <div className="space-y-3 bg-slate-950/70 border border-cyan-500/30 rounded-2xl p-4">
                      {/* Customer Availability Banner (No Individual PC details!) */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-cyan-400" />
                          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                            PC Availability ({startTime} → {endTimeFormatted}):
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold border ${
                              availablePcCount >= 8
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-red-500/20 text-red-400 border-red-500/40'
                            }`}
                          >
                            AVAILABLE: {availablePcCount} PCs
                          </span>
                        </div>
                      </div>

                      {/* Quantity Selector: 8, 9, or 10 PCs */}
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            Select Number of PCs (Group Reservation: 8, 9, or 10)
                          </label>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {availablePcCount < 8
                              ? 'Unavailable (< 8 PCs)'
                              : `${availablePcCount} available`}
                          </span>
                        </div>

                        {availablePcCount < 8 ? (
                          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5 font-mono">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-red-200">PC Group Reservation Unavailable</strong>
                              Only {availablePcCount} PCs are currently available for this requested time window. Group reservations require a minimum of 8 PCs. Please choose another date or time slot.
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            {/* 8 PCs */}
                            <button
                              type="button"
                              disabled={availablePcCount < 8}
                              onClick={() => setPcQuantity(8)}
                              className={`p-3 rounded-xl border text-center transition-all ${
                                pcQuantity === 8
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                                  : availablePcCount < 8
                                  ? 'opacity-40 border-slate-800 text-slate-600 cursor-not-allowed bg-slate-900/40'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-sm font-black uppercase tracking-wider">8 PCs</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {8 * pcBaseHourly * durationHours} DA ({8 * pcBaseHourly} DA/h)
                              </div>
                            </button>

                            {/* 9 PCs */}
                            <button
                              type="button"
                              disabled={availablePcCount < 9}
                              onClick={() => setPcQuantity(9)}
                              className={`p-3 rounded-xl border text-center transition-all ${
                                pcQuantity === 9
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                                  : availablePcCount < 9
                                  ? 'opacity-40 border-slate-800 text-slate-600 cursor-not-allowed bg-slate-900/40'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-sm font-black uppercase tracking-wider">9 PCs</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {availablePcCount < 9 ? 'Not enough PCs' : `${9 * pcBaseHourly * durationHours} DA (${9 * pcBaseHourly} DA/h)`}
                              </div>
                            </button>

                            {/* 10 PCs */}
                            <button
                              type="button"
                              disabled={availablePcCount < 10}
                              onClick={() => setPcQuantity(10)}
                              className={`p-3 rounded-xl border text-center transition-all ${
                                pcQuantity === 10
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                                  : availablePcCount < 10
                                  ? 'opacity-40 border-slate-800 text-slate-600 cursor-not-allowed bg-slate-900/40'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-sm font-black uppercase tracking-wider">10 PCs</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {availablePcCount < 10 ? 'Not enough PCs' : `${10 * pcBaseHourly * durationHours} DA (${10 * pcBaseHourly} DA/h)`}
                              </div>
                            </button>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                          * Individual PC stations are allocated internally by Nexus administration upon confirmation.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Real-time Time & Price preview box */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Scheduled Time Window</div>
                      <div className="text-sm font-bold text-white font-mono mt-0.5">
                        {startTime} → {endTimeFormatted} ({durationHours} {durationHours === 1 ? 'Hour' : 'Hours'})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Estimated Total</div>
                      <div className="text-lg font-black text-cyan-400 font-mono">
                        {totalPrice} DA
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Station Selection (PS5 only) */}
              {step === 2 && resType === 'PS5' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      2. Choose PS5 Station ({startTime} → {endTimeFormatted})
                    </label>
                    <div className="text-xs text-slate-400 font-mono">
                      {activePs5Posts.filter((p) => getPs5PostAvailabilityStatus(p.id).available).length} of{' '}
                      {activePs5Posts.length} available
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {activePs5Posts.map((post) => {
                      const avail = getPs5PostAvailabilityStatus(post.id);
                      const isSelected = selectedPostId === post.id;

                      return (
                        <button
                          key={post.id}
                          type="button"
                          disabled={!avail.available}
                          onClick={() => setSelectedPostId(post.id)}
                          className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                            !avail.available
                              ? 'bg-slate-900/30 border-slate-800/60 opacity-50 cursor-not-allowed text-slate-500'
                              : isSelected
                              ? 'bg-blue-950/60 border-blue-400 text-white shadow-[0_0_15px_rgba(96,165,250,0.25)]'
                              : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Gamepad2 className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                              <span className="font-bold text-xs uppercase">{post.name}</span>
                            </div>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                avail.available
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {avail.available ? 'AVAILABLE' : 'OCCUPIED'}
                            </span>
                          </div>

                          {post.specs && (
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {post.specs}
                            </div>
                          )}

                          {!avail.available && (
                            <div className="text-[9px] text-red-400 mt-1 truncate">
                              {avail.reason}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: Summary, Mandatory Full Name & Mandatory Phone Number */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest pb-2 border-b border-slate-800 flex items-center justify-between">
                      <span>Reservation Request Summary</span>
                      <span className="font-mono text-white">Nexus Gaming Center</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Type:</span>
                        <span className="text-white font-bold text-sm">
                          {resType === 'PC_GROUP'
                            ? `PC Group Reservation (${pcQuantity} PCs)`
                            : 'PS5 Pro Station'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Station(s):</span>
                        <span className="text-cyan-400 font-bold text-sm">
                          {resType === 'PC_GROUP'
                            ? `${pcQuantity} PCs (Allocated by Admin)`
                            : posts.find((p) => p.id === selectedPostId)?.name || 'PS5 Station'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Date:</span>
                        <span className="text-white font-bold">
                          {formatYMDDisplay(selectedDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Time Window:</span>
                        <span className="text-white font-bold">
                          {startTime} → {endTimeFormatted} ({durationHours}h)
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 text-xs block">Unit Rate:</span>
                        <span className="text-xs font-mono text-slate-300">
                          {resType === 'PC_GROUP'
                            ? `${pcQuantity} PCs × ${pcBaseHourly} DA = ${hourlyPriceSnapshot} DA / hr`
                            : `${ps5BaseHourly} DA / hr`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 text-xs block">Total Price:</span>
                        <span className="text-xl font-black text-emerald-400 font-mono">
                          {totalPrice} DA
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Customer Info (No Account Required - Guest Booking Friendly!) */}
                  <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                        <User className="w-4 h-4 text-cyan-400" />
                        <span>Customer Contact Information</span>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        {user ? 'Logged in as Player' : 'Guest Booking (No account needed)'}
                      </span>
                    </div>

                    {/* Mandatory Full Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Full Name *</span>
                        <span className="text-[10px] text-amber-400 font-mono font-normal">
                          (* Mandatory)
                        </span>
                      </label>
                      <input
                        type="text"
                        required
                        value={playerFullName}
                        onChange={(e) => setPlayerFullName(e.target.value)}
                        placeholder="e.g. John Doe / Amine Benali"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none transition-colors"
                      />
                    </div>

                    {/* Mandatory Phone Number */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-amber-400" />
                          <span>Phone Number *</span>
                          <span className="text-[10px] text-amber-400 font-mono font-normal">
                            (* Mandatory for admin confirmation call)
                          </span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">e.g. 0555 123 456</span>
                      </div>
                      <input
                        type="tel"
                        required
                        value={playerPhone}
                        onChange={(e) => setPlayerPhone(e.target.value)}
                        placeholder="0555 123 456 (or +213 555 123 456)"
                        className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none transition-colors ${
                          playerPhone && !isValidPhoneNumber(playerPhone)
                            ? 'border-red-500 focus:border-red-400'
                            : 'border-slate-700 focus:border-cyan-400'
                        }`}
                      />
                      {playerPhone && !isValidPhoneNumber(playerPhone) && (
                        <div className="text-[11px] text-red-400">
                          Please enter a valid phone number (minimum 8 digits).
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Primary Game (Optional)
                        </label>
                        <select
                          value={selectedGame}
                          onChange={(e) => setSelectedGame(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                        >
                          <option value="">General Gaming</option>
                          <option value="valorant">Valorant (5v5)</option>
                          <option value="cs2">Counter-Strike 2 (5v5)</option>
                          <option value="fc26">FC 26</option>
                          <option value="fc27">FC 27</option>
                          <option value="league">League of Legends</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Notes / Squad Remarks (Optional)
                        </label>
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Scrim vs Team Alpha"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flow Notice Banner */}
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
                    <PhoneCall className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-white">How Approval Works:</div>
                      <p className="mt-0.5 text-amber-300/80 leading-relaxed text-[11px]">
                        Submitting this request sets the status to <strong className="text-amber-200 font-mono">PENDING_ADMIN_APPROVAL</strong>. Nexus staff will review your requested {resType === 'PC_GROUP' ? `${pcQuantity} PCs` : 'station'}, call your phone number to verify attendance, and approve your booking.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        {!successReservation && (
          <div className="p-6 border-t border-white/10 flex items-center justify-between bg-neutral-900/60">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (resType === 'PC_GROUP' ? 1 : ((s - 1) as any)))}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}

            {step < 3 && !(resType === 'PC_GROUP' && step === 1) ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 px-6 py-2.5 nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : step === 1 && resType === 'PC_GROUP' ? (
              <button
                type="button"
                disabled={availablePcCount < 8}
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 px-6 py-2.5 nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider rounded-xl shadow-md disabled:opacity-40 transition-all cursor-pointer"
              >
                <span>Continue to Guest Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  loading ||
                  !playerFullName.trim() ||
                  !playerPhone ||
                  !isValidPhoneNumber(playerPhone) ||
                  (resType === 'PC_GROUP' && availablePcCount < pcQuantity)
                }
                onClick={handleConfirmReservation}
                className="inline-flex items-center gap-2 px-6 py-2.5 nexus-btn-3d text-white font-black uppercase text-xs tracking-wider rounded-xl shadow-lg shadow-red-950/40 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? (
                  <span>Submitting Request...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>Submit Reservation Request ({totalPrice} DA)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
