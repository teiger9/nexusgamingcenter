import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Announcement } from '../../types';
import {
  subscribeToAllAnnouncements,
  approveAnnouncement,
  rejectAnnouncement,
  deleteAnnouncement,
} from '../../services/announcementService';
import {
  Megaphone,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Phone,
  User,
  Users,
  Gamepad2,
  AlertCircle,
  Trash2,
  Filter,
} from 'lucide-react';
import { useToast } from '../Toast';

export const AdminAnnouncementRequestsView: React.FC = () => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Subscribe to all announcements
  useEffect(() => {
    const unsub = subscribeToAllAnnouncements((list) => {
      setAnnouncements(list);
    });
    return () => unsub();
  }, []);

  const reviewerId = user?.uid || '';
  const reviewerName = playerProfile?.gamerTag || user?.displayName || (isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Staff');

  const handleApprove = async (ann: Announcement) => {
    if (!reviewerId) return;
    setProcessingId(ann.id);

    const res = await approveAnnouncement(ann.id, reviewerId, reviewerName);
    setProcessingId(null);

    if (res.success) {
      showToast('success', 'Announcement Approved', `Announcement by ${ann.creatorAccountName} is now live.`);
    } else {
      showToast('error', 'Error', res.error || 'Failed to approve announcement.');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingId || !reviewerId) return;
    setProcessingId(rejectingId);

    const res = await rejectAnnouncement(
      rejectingId,
      reviewerId,
      reviewerName,
      rejectionReason.trim() || 'Declined by staff'
    );
    setProcessingId(null);
    setRejectingId(null);
    setRejectionReason('');

    if (res.success) {
      showToast('info', 'Announcement Rejected', 'Announcement has been marked rejected.');
    } else {
      showToast('error', 'Error', res.error || 'Failed to reject announcement.');
    }
  };

  const handleDelete = async (annId: string) => {
    if (!confirm('Permanently delete this announcement record?')) return;
    const res = await deleteAnnouncement(annId);
    if (res.success) {
      showToast('info', 'Announcement Removed', 'Record has been deleted.');
    } else {
      showToast('error', 'Error', res.error || 'Failed to delete record.');
    }
  };

  // Filtered announcements
  const pendingCount = announcements.filter((a) => a.status === 'pending').length;
  const filteredList = announcements.filter((a) => {
    if (filterStatus === 'all') return true;
    return a.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-neutral-950 border border-neutral-800">
        <div>
          <h2 className="text-xl font-bold font-display uppercase tracking-wide text-white flex items-center gap-2.5">
            <Megaphone className="w-5 h-5 text-red-500" />
            <span>Announcement Requests &amp; Moderation</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Review community player recruitment posts before they appear on the public board.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs font-mono">
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'pending'
                ? 'bg-amber-500 text-neutral-950'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-950 text-amber-300 font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilterStatus('approved')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              filterStatus === 'approved'
                ? 'bg-emerald-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Approved
          </button>

          <button
            onClick={() => setFilterStatus('rejected')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              filterStatus === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Rejected
          </button>

          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            All ({announcements.length})
          </button>
        </div>
      </div>

      {/* List */}
      {filteredList.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-neutral-950 border border-dashed border-neutral-800 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-neutral-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">No {filterStatus} announcement requests</h4>
          <p className="text-xs text-neutral-500">
            {filterStatus === 'pending'
              ? 'All community announcements have been processed.'
              : 'No records matching this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((ann) => {
            const isPending = ann.status === 'pending';
            const isApproved = ann.status === 'approved';
            const isRejected = ann.status === 'rejected';

            return (
              <div
                key={ann.id}
                className={`p-5 rounded-2xl bg-neutral-950 border transition-all ${
                  isPending
                    ? 'border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                    : isApproved
                    ? 'border-emerald-500/30'
                    : 'border-neutral-850 opacity-75'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Details */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status */}
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider ${
                          isPending
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                            : isApproved
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {ann.status.toUpperCase()}
                      </span>

                      {/* Game */}
                      <span className="px-2.5 py-0.5 rounded text-xs font-black uppercase font-display bg-red-600/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                        <Gamepad2 className="w-3 h-3" />
                        <span>{ann.game}</span>
                      </span>

                      {/* Players Needed */}
                      <span className="px-2 py-0.5 rounded text-xs font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/25 flex items-center gap-1">
                        <Users className="w-3 h-3 text-amber-400" />
                        <span>{ann.playersNeeded} Players Needed</span>
                      </span>

                      {/* Submission Timestamp */}
                      <span className="text-[10px] font-mono text-neutral-500">
                        Submitted: {new Date(ann.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-850">
                      <div className="flex items-center gap-1.5 text-neutral-300 truncate">
                        <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="text-neutral-400">Account:</span>
                        <strong className="text-white">{ann.creatorAccountName}</strong>
                      </div>

                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <Calendar className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>{ann.date} @ {ann.time}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-neutral-400">Phone:</span>
                        <strong className="text-emerald-400">{ann.phoneNumber}</strong>
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                        FULL MESSAGE:
                      </span>
                      <p className="text-xs text-neutral-200 bg-neutral-900/40 p-3 rounded-xl border border-neutral-900 leading-relaxed">
                        {ann.message}
                      </p>
                    </div>

                    {/* Review Info if reviewed */}
                    {(ann.approvedByName || ann.rejectedByName) && (
                      <div className="text-[11px] font-mono text-neutral-400">
                        {ann.approvedByName && (
                          <span>Approved by <strong className="text-emerald-400">{ann.approvedByName}</strong> on {ann.approvedAt ? new Date(ann.approvedAt).toLocaleDateString() : ''}</span>
                        )}
                        {ann.rejectedByName && (
                          <span>Rejected by <strong className="text-rose-400">{ann.rejectedByName}</strong>: {ann.rejectionReason}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex sm:flex-row lg:flex-col items-stretch gap-2 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-900 pt-3 lg:pt-0 lg:pl-4">
                    {isPending ? (
                      <>
                        <button
                          disabled={processingId === ann.id}
                          onClick={() => handleApprove(ann)}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve</span>
                        </button>

                        <button
                          disabled={processingId === ann.id}
                          onClick={() => {
                            setRejectingId(ann.id);
                            setRejectionReason('');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDelete(ann.id)}
                        className="p-2.5 rounded-xl bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 border border-neutral-800 text-xs font-mono flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Delete announcement record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Record</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold uppercase text-white font-display">
              Reject Announcement
            </h3>
            <p className="text-xs text-neutral-400">
              Provide an optional note to explain why this announcement was declined.
            </p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Inappropriate language, incomplete contact info, outside center rules..."
              rows={3}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRejectingId(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
