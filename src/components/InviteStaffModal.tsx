import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { createRoleInvitation } from '../services/roleService';
import { RoleInvitation } from '../types';
import { Shield, Users, Mail, UserCheck, AlertCircle, X, ArrowRight, Clock, Lock } from 'lucide-react';

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: 'ADMIN' | 'STAFF';
  onInvitationCreated?: () => void;
}

export const InviteStaffModal: React.FC<InviteStaffModalProps> = ({
  isOpen,
  onClose,
  defaultRole = 'STAFF',
  onInvitationCreated,
}) => {
  const { user, playerProfile, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const [invitedRole, setInvitedRole] = useState<'ADMIN' | 'STAFF'>(defaultRole);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientFullName, setRecipientFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<RoleInvitation | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDuplicateWarning(null);

    if (!isSuperAdmin) {
      setError('Only Super Administrators are authorized to invite new staff or administrators.');
      return;
    }

    const emailTrimmed = recipientEmail.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      setError('Please provide a valid recipient email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await createRoleInvitation({
        invitedRole,
        recipientEmail: emailTrimmed,
        recipientFullName: recipientFullName.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        note: note.trim() || undefined,
        invitedByUid: user?.uid || '',
        invitedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        invitedByEmail: user?.email || '',
      });

      if (res.success) {
        showToast(
          'success',
          'Role Invitation Dispatched',
          `An official invitation for ${invitedRole} was securely issued to ${emailTrimmed}.`
        );
        if (onInvitationCreated) onInvitationCreated();
        onClose();
      } else if (res.duplicateExists && res.existingInvitation) {
        setDuplicateWarning(res.existingInvitation);
        setError(res.error || 'An active invitation already exists for this email address.');
      } else {
        setError(res.error || 'Failed to issue invitation.');
      }
    } catch (err: any) {
      setError(err.message || 'Error creating invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d0d14] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Decorative corner glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-red-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black font-display text-white tracking-wide">
              INVITE NEXUS LEADERSHIP
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Issue tokenized invitation with atomic role binding
            </p>
          </div>
        </div>

        {/* Error / Duplicate Warning Alert */}
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Authorization Notice:</span>
              <p className="text-red-300/90 leading-relaxed">{error}</p>
              {duplicateWarning && (
                <div className="mt-2 pt-2 border-t border-red-500/20 text-[11px] font-mono text-red-300">
                  Existing invite token ID: <span className="text-white font-bold">{duplicateWarning.invitationId}</span>
                  <br />
                  Issued to: <span className="text-white">{duplicateWarning.recipientEmail}</span> ({duplicateWarning.invitedRole})
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role Selection Tabs */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-2">
              Select Delegated Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInvitedRole('ADMIN')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  invitedRole === 'ADMIN'
                    ? 'bg-red-500/15 border-red-500/60 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                    : 'bg-[#14141e] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-black uppercase font-display tracking-wider">
                    ADMINISTRATOR
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Tournaments, catalog, squads, match dispute authority.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setInvitedRole('STAFF')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  invitedRole === 'STAFF'
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-white shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                    : 'bg-[#14141e] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black uppercase font-display tracking-wider">
                    STAFF MEMBER
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Check-ins, bookings, customer assistance, redemption codes.
                </p>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono mt-2">
              🔒 Super Administrator role is restricted to system ownership and cannot be invited.
            </p>
          </div>

          {/* Recipient Email Input */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Recipient Email Address <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="staff.member@domain.com"
                className="w-full pl-10 pr-4 py-3 bg-[#14141e] border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl text-white text-xs font-mono outline-none transition"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">
              The invited person must sign into Nexus with this exact email to accept.
            </span>
          </div>

          {/* Full Name & Phone in 2 Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Full Name (Optional)
              </label>
              <div className="relative">
                <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={recipientFullName}
                  onChange={(e) => setRecipientFullName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#14141e] border border-slate-800 focus:border-purple-500 rounded-xl text-white text-xs outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555-0192"
                className="w-full px-4 py-2.5 bg-[#14141e] border border-slate-800 focus:border-purple-500 rounded-xl text-white text-xs font-mono outline-none transition"
              />
            </div>
          </div>

          {/* Onboarding Note / Assignment Reason */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Internal Note / Governance Reason (Optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Front desk weekend tournament supervisor"
              className="w-full px-4 py-2 bg-[#14141e] border border-slate-800 focus:border-purple-500 rounded-xl text-white text-xs outline-none transition resize-none"
            />
          </div>

          {/* Expiration Note */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono">
            <Clock className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Invitation auto-expires in 7 days. Can be revoked at any time.</span>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-bold uppercase font-mono tracking-wider transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className={`flex-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                invitedRole === 'ADMIN'
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-950/40'
              }`}
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Send {invitedRole} Invitation</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
