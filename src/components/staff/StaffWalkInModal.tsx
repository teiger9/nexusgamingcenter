import React, { useState, useEffect } from 'react';
import { GamingPost, GamingPostType, PaymentMethod, Player, ReservationSettings } from '../../types';
import { createWalkInReservation } from '../../services/reservationService';
import { X, Gamepad2, Monitor, Clock, User, Phone, DollarSign, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface StaffWalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
  posts: GamingPost[];
  settings: ReservationSettings;
  staffPlayer: Player;
  preselectedPostId?: string;
}

export const StaffWalkInModal: React.FC<StaffWalkInModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  posts,
  settings,
  staffPlayer,
  preselectedPostId,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deviceType, setDeviceType] = useState<GamingPostType>('PC');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [durationHours, setDurationHours] = useState<number>(1);
  const [startImmediately, setStartImmediately] = useState<boolean>(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (preselectedPostId) {
        const post = posts.find((p) => p.id === preselectedPostId);
        if (post) {
          setDeviceType(post.type);
          setSelectedPostIds([post.id]);
        }
      } else {
        // Default to first available PC
        const firstPc = posts.find((p) => p.type === 'PC' && p.status === 'ACTIVE');
        if (firstPc) {
          setSelectedPostIds([firstPc.id]);
        }
      }
    }
  }, [isOpen, preselectedPostId, posts]);

  if (!isOpen) return null;

  // Filter posts by selected device type
  const availablePosts = posts.filter((p) => p.type === deviceType && p.status === 'ACTIVE');

  // Authoritative price calculation
  const unitHourly = deviceType === 'PC' ? (settings.pcHourlyPrice || 150) : (settings.ps5HourlyPrice || 400);
  const totalHourly = unitHourly * (selectedPostIds.length || 1);
  const totalPrice = totalHourly * durationHours;

  const handleTogglePost = (postId: string) => {
    if (selectedPostIds.includes(postId)) {
      if (selectedPostIds.length > 1) {
        setSelectedPostIds(selectedPostIds.filter((id) => id !== postId));
      }
    } else {
      setSelectedPostIds([...selectedPostIds, postId]);
    }
  };

  const handleDeviceChange = (newType: GamingPostType) => {
    setDeviceType(newType);
    const matching = posts.filter((p) => p.type === newType && p.status === 'ACTIVE');
    if (matching.length > 0) {
      setSelectedPostIds([matching[0].id]);
    } else {
      setSelectedPostIds([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Please enter customer name or GamerTag.');
      return;
    }
    if (selectedPostIds.length === 0) {
      setError('Please select at least one gaming station.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedPosts = posts.filter((p) => selectedPostIds.includes(p.id));
      const postNames = selectedPosts.map((p) => p.name);

      const resId = await createWalkInReservation({
        customerName: customerName.trim(),
        phone: phoneNumber.trim() || undefined,
        deviceType,
        postIds: selectedPostIds,
        postNames,
        durationHours,
        startImmediately,
        paymentMethod,
        notes: notes.trim() || undefined,
        staffPlayer,
      });

      onSuccess(resId);
      onClose();
    } catch (err: any) {
      console.error('Error creating walk-in reservation:', err);
      setError(err.message || 'Failed to create walk-in session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0b0e14] border border-red-500/40 rounded-2xl w-full max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.25)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#07090e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-display uppercase tracking-wide">
                + New Walk-in Customer
              </h3>
              <p className="text-xs text-slate-400">Direct station assignment & session launch</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Details */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Customer Information
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Customer Name / Tag *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Alex Hunter"
                    className="w-full bg-[#121620] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="05 XX XX XX XX"
                    className="w-full bg-[#121620] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Device Type Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Device Category
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleDeviceChange('PC')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                  deviceType === 'PC'
                    ? 'bg-red-600/20 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    : 'bg-[#121620] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>PC ({settings.pcHourlyPrice || 150} DA/hr)</span>
              </button>

              <button
                type="button"
                onClick={() => handleDeviceChange('PS5')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                  deviceType === 'PS5'
                    ? 'bg-red-600/20 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    : 'bg-[#121620] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                <span>PS5 Pro ({settings.ps5HourlyPrice || 400} DA/hr)</span>
              </button>
            </div>
          </div>

          {/* Station Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Select Station(s)
              </label>
              <span className="text-[11px] text-slate-500">
                {selectedPostIds.length} station{selectedPostIds.length > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1">
              {availablePosts.map((post) => {
                const isSelected = selectedPostIds.includes(post.id);
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handleTogglePost(post.id)}
                    className={`py-2 px-1 text-center rounded-lg border text-xs font-bold font-mono transition-all ${
                      isSelected
                        ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                        : 'bg-[#121620] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {post.name}
                  </button>
                );
              })}
            </div>
            {availablePosts.length === 0 && (
              <p className="text-xs text-amber-400">No active {deviceType} stations found.</p>
            )}
          </div>

          {/* Duration & Start Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Duration (Hours)</label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full bg-[#121620] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours</option>
                  <option value={3}>3 Hours</option>
                  <option value={4}>4 Hours</option>
                  <option value={5}>5 Hours</option>
                  <option value={6}>6 Hours</option>
                  <option value={8}>8 Hours (Full Day)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-[#121620] border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  <option value="CASH">Cash at Counter</option>
                  <option value="CARD">Card / TPE</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Session Launch Mode */}
          <div className="p-3 bg-[#121620] border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Start Session Immediately</p>
              <p className="text-[11px] text-slate-400">Launch live timer right now as ACTIVE</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={startImmediately}
                onChange={(e) => setStartImmediately(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Staff Operational Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VIP guest, paid in 500 DA bills"
              className="w-full bg-[#121620] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 placeholder:text-slate-600"
            />
          </div>

          {/* Price Summary Banner */}
          <div className="p-4 bg-gradient-to-r from-red-950/40 via-slate-900 to-red-950/40 border border-red-500/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wider">Authoritative Total Price</p>
              <p className="text-xs text-slate-500 font-mono">
                {selectedPostIds.length} station(s) × {durationHours}h @ {unitHourly} DA/h
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-display text-white tracking-wide">{totalPrice}</span>
              <span className="text-xs text-red-400 font-bold ml-1">DA</span>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedPostIds.length === 0}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{startImmediately ? 'Start Session Now' : 'Confirm Walk-In'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
