import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { RoleInvitation } from '../types';
import { acceptRoleInvitation, declineRoleInvitation, isRoleInvitationExpired } from '../services/roleService';
import { Shield, Users, CheckCircle2, XCircle, AlertTriangle, Clock, X, ArrowRight, UserCheck } from 'lucide-react';

interface AcceptRoleInvitationModalProps {
  invitation: RoleInvitation | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
}

export const AcceptRoleInvitationModal: React.FC<AcceptRoleInvitationModalProps> = ({
  invitation,
  isOpen,
  onClose,
  onActionComplete,
}) => {
  const { user, playerProfile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !invitation) return null;

  const currentEmail = user?.email?.toLowerCase().trim() || '';
  const recipientEmail = invitation.recipientEmail.toLowerCase().trim();
  const isEmailMatch = currentEmail === recipientEmail;
  const isExpired = isRoleInvitationExpired(invitation);

  const handleAccept = async () => {
    if (!isEmailMatch) {
      setError(`Identity mismatch: You must be logged in as ${invitation.recipientEmail} to accept.`);
      return;
    }

    if (!user || !playerProfile) {
      setError('You must be signed in to accept this invitation.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await acceptRoleInvitation({
        invitationId: invitation.invitationId,
        currentUser: {
          uid: user.uid,
          email: user.email || '',
          gamerTag: playerProfile.gamerTag,
          fullName: playerProfile.fullName,
        },
      });

      if (res.success) {
        showToast(
          'success',
          'Role Granted Successfully',
          `You are now active as ${res.newRole} at Nexus Gaming Center!`
        );
        if (onActionComplete) onActionComplete();
        onClose();
      } else {
        setError(res.error || 'Failed to accept invitation.');
      }
    } catch (err: any) {
      setError(err.message || 'Error processing acceptance.');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user || !playerProfile) return;
    setLoading(true);
    setError(null);

    try {
      const res = await declineRoleInvitation({
        invitationId: invitation.invitationId,
        currentUser: {
          uid: user.uid,
          email: user.email || '',
          gamerTag: playerProfile.gamerTag,
        },
      });

      if (res.success) {
        showToast('info', 'Invitation Declined', 'The role invitation was declined.');
        if (onActionComplete) onActionComplete();
        onClose();
      } else {
        setError(res.error || 'Failed to decline invitation.');
      }
    } catch (err: any) {
      setError(err.message || 'Error declining invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d0d14] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
              invitation.invitedRole === 'ADMIN'
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {invitation.invitedRole === 'ADMIN' ? (
              <Shield className="w-6 h-6" />
            ) : (
              <Users className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-black font-display text-white tracking-wide">
              {invitation.invitedRole} INVITATION
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Invited by <span className="text-purple-300 font-bold">{invitation.invitedByName}</span>
            </p>
          </div>
        </div>

        {/* Identity Mismatch Warning */}
        {!isEmailMatch && (
          <div className="mb-5 p-4 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Identity Verification Notice:</span>
              <p className="leading-relaxed">
                This invitation is addressed to <strong className="text-white">{invitation.recipientEmail}</strong>.
                You are currently signed in as <strong className="text-white">{user?.email}</strong>.
              </p>
              <p className="text-[11px] text-amber-300/80">
                Please switch to the matching account to accept this leadership invitation.
              </p>
            </div>
          </div>
        )}

        {/* Expired Alert */}
        {isExpired && (
          <div className="mb-5 p-4 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-3">
            <Clock className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Invitation Expired</span>
              <p className="leading-relaxed mt-0.5">
                This invitation reached its 7-day expiration deadline. Please request a new invitation from a Super Administrator.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Invitation Details Card */}
        <div className="p-4 rounded-2xl bg-[#14141e] border border-slate-800 space-y-3 mb-6">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Position / Tier:</span>
            <span
              className={`font-black uppercase tracking-wider ${
                invitation.invitedRole === 'ADMIN' ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {invitation.invitedRole}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Expires:</span>
            <span className="text-slate-300">
              {new Date(invitation.expiresAt).toLocaleDateString()}{' '}
              ({Math.max(0, Math.ceil((invitation.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))} days left)
            </span>
          </div>

          {invitation.note && (
            <div className="pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400 font-mono text-[11px] block mb-1">Invitation Note:</span>
              <p className="text-slate-300 italic bg-black/30 p-2.5 rounded-xl border border-slate-800">
                "{invitation.note}"
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDecline}
            disabled={loading || !isEmailMatch || isExpired}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold font-mono uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
          >
            Decline
          </button>

          <button
            type="button"
            onClick={handleAccept}
            disabled={loading || !isEmailMatch || isExpired}
            className={`flex-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              invitation.invitedRole === 'ADMIN'
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-950/50'
            }`}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Accept {invitation.invitedRole} Role</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
