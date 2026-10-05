import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { Team, TeamMember, Match, Player, LobbyRecruitment, TeamInvitation } from '../types';
import {
  fetchTeamById,
  fetchTeamMatchHistory,
  addMemberToTeam,
  removeMemberFromTeam,
  replaceTeamMember,
  updateSquadName,
  leaveTeam,
  disbandTeam,
  transferCaptaincy,
  sendTeamInvitation,
  cancelTeamInvitation,
  subscribeToTeamInvitations,
} from '../services/teamService';
import {
  subscribeToTeamActiveRecruitment,
  publishTeamRecruitment,
  editTeamRecruitment,
  cancelTeamRecruitment,
} from '../services/recruitmentService';
import { fetchPotentialOpponents } from '../services/playerService';
import { getRankFromMMR } from '../lib/ranks';
import { useToast } from './Toast';
import {
  X,
  Shield,
  Trophy,
  Users,
  Crown,
  Flame,
  Swords,
  UserPlus,
  UserMinus,
  LogOut,
  Trash2,
  Calendar,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  Radio,
  Edit3,
  Send,
  Clock,
  Check,
  RefreshCw,
  History,
  Pencil,
} from 'lucide-react';

interface TeamProfileModalProps {
  teamId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayerProfile?: (playerId: string) => void;
  onCreateLobby?: (team: Team) => void;
  onSelectMatch?: (matchId: string) => void;
  onTeamLeft?: (teamId: string) => void;
  onTeamDisbanded?: (teamId: string) => void;
}

export const TeamProfileModal: React.FC<TeamProfileModalProps> = ({
  teamId,
  isOpen,
  onClose,
  onSelectPlayerProfile,
  onCreateLobby,
  onSelectMatch,
  onTeamLeft,
  onTeamDisbanded,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [team, setTeam] = useState<Team | null>(null);
  const [matchHistory, setMatchHistory] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'roster' | 'history' | 'squad_history'>('roster');

  // Squad Edit & Member Replacement
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [memberToReplace, setMemberToReplace] = useState<TeamMember | null>(null);
  const [showEditSquadModal, setShowEditSquadModal] = useState(false);
  const [editSquadNameInput, setEditSquadNameInput] = useState('');
  const [editSquadTagInput, setEditSquadTagInput] = useState('');
  const [editSquadLogoInput, setEditSquadLogoInput] = useState('');

  // Recruitment & Invitations
  const [activeRecruitment, setActiveRecruitment] = useState<LobbyRecruitment | null>(null);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [showRecruitmentModal, setShowRecruitmentModal] = useState(false);
  const [recruitmentNote, setRecruitmentNote] = useState('');
  const [recruitmentRole, setRecruitmentRole] = useState('Any');
  const [publishingRec, setPublishingRec] = useState(false);

  // Invite player modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviting, setInviting] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // Leave Squad & Captain Transfer modals
  const [showLeaveSquadModal, setShowLeaveSquadModal] = useState(false);
  const [showCaptainLeaveModal, setShowCaptainLeaveModal] = useState(false);
  const [selectedNewCaptainId, setSelectedNewCaptainId] = useState('');
  const [showDisbandModal, setShowDisbandModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [showTransferCaptaincyModal, setShowTransferCaptaincyModal] = useState(false);
  const [memberToTransferCaptaincy, setMemberToTransferCaptaincy] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (!isOpen || !teamId) return;

    loadTeamData();

    // Subscribe to active recruitment for this team
    const unsubRec = subscribeToTeamActiveRecruitment(teamId, (rec) => {
      setActiveRecruitment(rec);
      if (rec) {
        setRecruitmentNote(rec.recruitmentMessage || '');
        setRecruitmentRole(rec.preferredRole || 'Any');
      }
    });

    // Subscribe to pending/all team invitations
    const unsubInvs = subscribeToTeamInvitations(teamId, (invs) => {
      setTeamInvitations(invs);
    });

    return () => {
      unsubRec();
      unsubInvs();
    };
  }, [isOpen, teamId]);

  const loadTeamData = async () => {
    setLoading(true);
    try {
      const [teamData, history] = await Promise.all([
        fetchTeamById(teamId),
        fetchTeamMatchHistory(teamId),
      ]);
      setTeam(teamData);
      setMatchHistory(history);
    } catch (err) {
      console.error('Error loading team data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInvite = async () => {
    if (!user) return;
    try {
      const authUid = (auth.currentUser?.uid || user.uid || '').trim();
      const opps = await fetchPotentialOpponents(authUid);
      // Filter out players already in this team as well as self
      const currentMemberIds = team?.memberIds || [];
      setAvailablePlayers(opps.filter((p) => !currentMemberIds.includes(p.uid) && p.uid !== authUid));
      setShowInviteModal(true);
    } catch (err) {
      console.error('Error fetching players to invite:', err);
    }
  };

  const handleOpenRecruitmentModal = () => {
    if (activeRecruitment) {
      setRecruitmentNote(activeRecruitment.recruitmentMessage || '');
      setRecruitmentRole(activeRecruitment.preferredRole || 'Any');
    } else {
      setRecruitmentNote('');
      setRecruitmentRole('Any');
    }
    setShowRecruitmentModal(true);
  };

  const handleSaveRecruitment = async () => {
    if (!team || !user) return;
    setPublishingRec(true);
    try {
      if (activeRecruitment) {
        const res = await editTeamRecruitment({
          recruitmentId: activeRecruitment.id,
          captainId: user.uid,
          note: recruitmentNote.trim(),
          preferredRole: recruitmentRole.trim(),
        });
        if (res.success) {
          showToast('success', 'Announcement Updated', 'Your recruitment announcement on the Main Page has been updated.');
          setShowRecruitmentModal(false);
        } else {
          showToast('error', 'Update Failed', res.error);
        }
      } else {
        const res = await publishTeamRecruitment({
          team,
          captain: user,
          note: recruitmentNote.trim(),
          preferredRole: recruitmentRole.trim(),
        });
        if (res.success) {
          showToast('success', 'Announcement Live! 📢', 'Your recruitment announcement is now active on the Main Page.');
          setShowRecruitmentModal(false);
        } else {
          showToast('error', 'Publish Failed', res.error);
        }
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setPublishingRec(false);
    }
  };

  const handleCancelRecruitment = async () => {
    if (!activeRecruitment || !user) return;
    if (!confirm('Are you sure you want to remove this recruitment announcement from the Main Page?')) return;

    setActionLoading(true);
    try {
      const res = await cancelTeamRecruitment(activeRecruitment.id, user.uid);
      if (res.success) {
        showToast('info', 'Announcement Removed', 'Your team is no longer recruiting on the Main Page.');
        setActiveRecruitment(null);
      } else {
        showToast('error', 'Could not remove', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendInvite = async (player: Player) => {
    if (!team || !user) return;
    const authUid = (auth.currentUser?.uid || user.uid || '').trim();
    if (player.uid === authUid || player.uid === user.uid) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent or invite yourself.');
      return;
    }
    setSendingInviteId(player.uid);
    try {
      const res = await sendTeamInvitation({
        teamId: team.teamId,
        captainId: user.uid,
        captainGamerTag: team.captainGamerTag,
        invitedPlayer: player,
      });

      if (res.success) {
        showToast('success', 'Invitation Dispatched! 🎮', `An invitation notification has been sent to ${player.gamerTag}.`);
      } else {
        showToast('error', 'Could not send invitation', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error sending invite', err.message);
    } finally {
      setSendingInviteId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string, gamerTag: string) => {
    if (!user) return;
    try {
      const res = await cancelTeamInvitation({
        invitationId,
        captainId: user.uid,
      });

      if (res.success) {
        showToast('info', 'Invitation Withdrawn', `Pending invitation for ${gamerTag} has been cancelled.`);
      } else {
        showToast('error', 'Error', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    }
  };

  const handleDirectAddPlayer = async (player: Player) => {
    if (!team || !user) return;
    const authUid = (auth.currentUser?.uid || user.uid || '').trim();
    if (player.uid === authUid || player.uid === user.uid) {
      showToast('error', 'Invalid Action', 'You cannot add yourself to your squad.');
      return;
    }
    setInviting(true);
    try {
      const res = await addMemberToTeam({
        teamId: team.teamId,
        captainId: user.uid,
        player,
      });

      if (res.success) {
        showToast('success', 'Player Added!', `${player.gamerTag} has been added to ${team.teamName}.`);
        setShowInviteModal(false);
        await loadTeamData();
      } else {
        showToast('error', 'Could not add player', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error adding player', err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = (member: TeamMember) => {
    setMemberToRemove(member);
  };

  const handleConfirmRemoveMember = async () => {
    if (!team || !user || !memberToRemove) return;
    setActionLoading(true);
    try {
      const res = await removeMemberFromTeam({
        teamId: team.teamId,
        captainId: user.uid,
        memberIdToRemove: memberToRemove.id,
      });

      if (res.success) {
        showToast('warning', 'Member Removed', `${memberToRemove.gamerTag} was removed from the squad. Member history is preserved.`);
        setMemberToRemove(null);
        await loadTeamData();
      } else {
        showToast('error', 'Could not remove member', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReplace = async (member: TeamMember) => {
    if (!user || !team) return;
    setMemberToReplace(member);
    try {
      const authUid = (auth.currentUser?.uid || user.uid || '').trim();
      const opps = await fetchPotentialOpponents(authUid);
      const currentMemberIds = team.memberIds || [];
      setAvailablePlayers(opps.filter((p) => !currentMemberIds.includes(p.uid) && p.uid !== authUid));
      setShowReplaceModal(true);
    } catch (err) {
      console.error('Error fetching players to replace:', err);
    }
  };

  const handleExecuteReplace = async (newPlayer: Player) => {
    if (!team || !user || !memberToReplace) return;
    setActionLoading(true);
    try {
      const res = await replaceTeamMember({
        teamId: team.teamId,
        captainId: user.uid,
        memberIdToReplace: memberToReplace.id,
        newPlayer,
      });

      if (res.success) {
        showToast('success', 'Roster Updated', `${memberToReplace.gamerTag} was replaced by ${newPlayer.gamerTag}. History recorded.`);
        setShowReplaceModal(false);
        setMemberToReplace(null);
        await loadTeamData();
      } else {
        showToast('error', 'Could not replace member', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error replacing member', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEditSquad = () => {
    if (!team) return;
    setEditSquadNameInput(team.teamName);
    setEditSquadTagInput(team.teamTag);
    setEditSquadLogoInput(team.teamLogo || '🛡️');
    setShowEditSquadModal(true);
  };

  const handleSaveSquadDetails = async () => {
    if (!team || !user) return;
    if (!editSquadNameInput.trim() || !editSquadTagInput.trim()) {
      showToast('error', 'Validation Error', 'Team name and tag are required.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await updateSquadName({
        teamId: team.teamId,
        captainId: user.uid,
        newTeamName: editSquadNameInput.trim(),
        newTeamTag: editSquadTagInput.trim().toUpperCase(),
        newTeamLogo: editSquadLogoInput.trim() || undefined,
      });

      if (res.success) {
        showToast('success', 'Squad Renamed', 'Squad details updated successfully. Permanent roster & history preserved.');
        setShowEditSquadModal(false);
        await loadTeamData();
      } else {
        showToast('error', 'Update Failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error updating squad', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleLeaveTeamClick = () => {
    if (!team || !user) return;
    const isCap = team.captainId === user.uid;
    if (isCap) {
      // Find other members
      const otherMembers = (team.members || []).filter((m) => m.id !== user.uid);
      if (otherMembers.length > 0) {
        setSelectedNewCaptainId(otherMembers[0].id);
      }
      setShowCaptainLeaveModal(true);
    } else {
      setShowLeaveSquadModal(true);
    }
  };

  const handleConfirmLeaveTeam = async () => {
    if (!team || !user) return;
    setActionLoading(true);
    try {
      const res = await leaveTeam({
        teamId: team.teamId,
        playerId: user.uid,
      });

      if (res.success) {
        showToast('info', 'Left Squad', 'YOU LEFT THE SQUAD.');
        setShowLeaveSquadModal(false);
        onTeamLeft?.(team.teamId);
        onClose();
      } else {
        showToast('error', 'Could not leave squad', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCaptainTransferAndLeave = async () => {
    if (!team || !user || !selectedNewCaptainId) {
      showToast('error', 'Selection Required', 'Please select a squad member to become the new Captain.');
      return;
    }
    setActionLoading(true);
    try {
      const transRes = await transferCaptaincy({
        teamId: team.teamId,
        captainId: user.uid,
        newCaptainId: selectedNewCaptainId,
      });

      if (!transRes.success) {
        showToast('error', 'Transfer Failed', transRes.error || 'Failed to transfer captaincy.');
        setActionLoading(false);
        return;
      }

      const leaveRes = await leaveTeam({
        teamId: team.teamId,
        playerId: user.uid,
      });

      if (leaveRes.success) {
        showToast('info', 'Left Squad', 'YOU LEFT THE SQUAD.');
        setShowCaptainLeaveModal(false);
        onTeamLeft?.(team.teamId);
        onClose();
      } else {
        showToast('error', 'Error leaving squad', leaveRes.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoleCaptainDisband = async () => {
    if (!team || !user) return;
    setActionLoading(true);
    try {
      const res = await disbandTeam({
        teamId: team.teamId,
        captainId: user.uid,
      });
      if (res.success) {
        showToast('info', 'Squad Disbanded', `${team.teamName} has been disbanded.`);
        setShowCaptainLeaveModal(false);
        onTeamDisbanded?.(team.teamId);
        onTeamLeft?.(team.teamId);
        onClose();
      } else {
        showToast('error', 'Could not disband squad', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDisband = async () => {
    if (!team || !user) return;
    setActionLoading(true);
    try {
      const res = await disbandTeam({
        teamId: team.teamId,
        captainId: user.uid,
      });

      if (res.success) {
        showToast('info', 'Squad Disbanded', `${team.teamName} has been disbanded.`);
        setShowDisbandModal(false);
        onClose();
      } else {
        showToast('error', 'Could not disband squad', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteTransferCaptaincy = async (newCapId: string) => {
    if (!team || !user || !newCapId) return;
    setActionLoading(true);
    try {
      const res = await transferCaptaincy({
        teamId: team.teamId,
        captainId: user.uid,
        newCaptainId: newCapId,
      });
      if (res.success) {
        showToast('success', 'Captaincy Transferred', 'Squad captaincy has been successfully transferred.');
        setShowTransferCaptaincyModal(false);
        setMemberToTransferCaptaincy(null);
        await loadTeamData();
      } else {
        showToast('error', 'Transfer Failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const isCaptain = user && team && team.captainId === user.uid;
  const isMember = user && team && team.memberIds.includes(user.uid);
  const isRosterFull = team && team.members.length >= 5;
  const playersNeeded = team ? Math.max(0, 5 - team.members.length) : 0;
  const pendingInvitations = teamInvitations.filter((inv) => (inv.status || '').toUpperCase() === 'PENDING');

  const filteredInvitePlayers = availablePlayers.filter((p) => {
    const q = inviteSearch.toLowerCase();
    return (
      p.gamerTag.toLowerCase().includes(q) ||
      (p.fullName && p.fullName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-slate-400 text-xs font-mono">Loading Team Dossier...</p>
          </div>
        ) : !team ? (
          <div className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white">Team Not Found</h3>
            <p className="text-xs text-slate-400 mt-1">This team may have been disbanded.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header / Team Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#15151b] border border-slate-700 flex items-center justify-center text-3xl shadow-lg shrink-0">
                  {team.teamLogo || '🛡️'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black font-display text-white">
                      {team.teamName}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-black text-xs">
                      [{team.teamTag}]
                    </span>
                    {isCaptain && (
                      <button
                        onClick={handleOpenEditSquad}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                        title="Edit Squad Name, Tag & Logo"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                    <span className="text-cyan-400 font-bold uppercase tracking-wider">{team.gameName} 5v5</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <Crown className="w-3.5 h-3.5 text-yellow-400" /> Captain: {team.captainGamerTag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {isCaptain && (
                  <button
                    onClick={() => {
                      if (onCreateLobby) onCreateLobby(team);
                      onClose();
                    }}
                    disabled={!isRosterFull}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${
                      isRosterFull
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black hover:brightness-110'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                    title={!isRosterFull ? 'Roster must have 5 players to create a 5v5 lobby' : 'Create 5v5 Ranked Lobby'}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Create 5v5 Lobby</span>
                  </button>
                )}
                {isMember && (
                  <button
                    onClick={handleLeaveTeamClick}
                    disabled={actionLoading}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold font-mono transition-colors flex items-center gap-1 cursor-pointer"
                    title="Leave Squad"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave Squad</span>
                  </button>
                )}
                {isCaptain && (
                  <button
                    onClick={() => setShowDisbandModal(true)}
                    disabled={actionLoading}
                    className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
                    title="Disband Squad"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Team Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400">Team MMR</div>
                <div className="text-xl font-bold font-display text-cyan-400 mt-0.5">
                  {team.teamRating || 1000} <span className="text-[10px] font-normal text-slate-500 font-mono">MMR</span>
                </div>
                {(() => {
                  const tier = getRankFromMMR(team.teamRating || 1000);
                  return (
                    <div className={`text-[10px] font-mono font-bold mt-1 uppercase ${tier.textColorClass}`}>
                      {tier.gameCustomTitles?.[team.gameId] || `${tier.icon} ${tier.name}`}
                    </div>
                  );
                })()}
              </div>

              <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400">Record (W-L-D)</div>
                <div className="text-xl font-bold font-display text-white mt-0.5 font-mono">
                  <span className="text-emerald-400">{team.wins}</span>-
                  <span className="text-rose-400">{team.losses}</span>-
                  <span className="text-slate-400">{team.draws}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400">Win Rate</div>
                <div className="text-xl font-bold font-display text-white mt-0.5">
                  {team.winRate || 0}%
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-400">Streak</div>
                <div className="text-xl font-bold font-display text-white mt-0.5 flex items-center gap-1">
                  {(team.currentWinStreak || 0) > 0 ? (
                    <>
                      <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                      <span className="text-orange-400">{team.currentWinStreak}W</span>
                    </>
                  ) : (
                    <span className="text-slate-500 font-mono text-sm">None</span>
                  )}
                </div>
              </div>
            </div>

            {/* 📢 5v5 SQUAD RECRUITMENT STATUS PANEL */}
            <div className="p-4 rounded-2xl bg-[#121218] border border-slate-800">
              {activeRecruitment ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-xs font-mono font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5" />
                        <span>RECRUITING FREE AGENTS (ACTIVE ON MAIN PAGE)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                        NEED {playersNeeded} PLAYER{playersNeeded > 1 ? 'S' : ''}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 font-mono flex flex-wrap items-center gap-2">
                      {activeRecruitment.preferredRole && activeRecruitment.preferredRole !== 'Any' && (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold">
                          Role: {activeRecruitment.preferredRole}
                        </span>
                      )}
                      {activeRecruitment.recruitmentMessage ? (
                        <span className="italic text-slate-400">"{activeRecruitment.recruitmentMessage}"</span>
                      ) : (
                        <span className="text-slate-500">Listed on Arena 5v5 Recruitment Dispatch</span>
                      )}
                    </div>
                  </div>

                  {isCaptain && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleOpenRecruitmentModal}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={handleCancelRecruitment}
                        disabled={actionLoading}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-mono font-bold transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : isRosterFull ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Full 5v5 Squad (5/5)</strong> — Roster is complete and ready to queue in ranked 5v5 matches!
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <Radio className="w-3.5 h-3.5 text-slate-500" />
                      <span>Arena Recruitment: <strong className="text-slate-300">Inactive</strong></span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Your team needs <strong className="text-cyan-400">{playersNeeded}</strong> more player{playersNeeded > 1 ? 's' : ''} to reach full 5v5 competitive capacity.
                    </p>
                  </div>

                  {isCaptain && (
                    <button
                      onClick={handleOpenRecruitmentModal}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-black text-xs font-mono font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                    >
                      <Radio className="w-3.5 h-3.5 text-black" />
                      <span>Publish Recruitment to Main Page</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 gap-4 text-xs font-bold font-mono uppercase">
              <button
                onClick={() => setActiveTab('roster')}
                className={`pb-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'roster'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Active Roster ({team.members.length}/5)</span>
              </button>
              <button
                onClick={() => setActiveTab('squad_history')}
                className={`pb-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'squad_history'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Squad History & Past Roster ({ (team.pastMembers?.length || 0) + (team.squadHistory?.length || 0) })</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`pb-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Match History ({matchHistory.length})</span>
              </button>
            </div>

            {/* Roster Tab */}
            {activeTab === 'roster' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">
                    {team.members.length === 5
                      ? '✓ Complete 5-player competitive lineup'
                      : `Requires ${5 - team.members.length} more player(s) to enter ranked 5v5`}
                  </span>
                  {isCaptain && !isRosterFull && (
                    <button
                      onClick={handleOpenInvite}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold font-mono flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite / Add Player ({team.members.length}/5)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {team.members.map((member, idx) => (
                    <div
                      key={member.id}
                      className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between"
                    >
                      <div
                        onClick={() => {
                          if (onSelectPlayerProfile) {
                            onSelectPlayerProfile(member.id);
                            onClose();
                          }
                        }}
                        className="flex items-center gap-3 cursor-pointer min-w-0"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white hover:text-cyan-400 transition-colors truncate">
                              {member.gamerTag}
                            </span>
                            {member.role === 'captain' && (
                              <Crown className="w-3 h-3 text-yellow-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {member.fullName || 'Nexus Player'}
                            {member.joinedAt ? (
                              <span className="text-slate-500"> • Joined {formatDate(member.joinedAt)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          {member.rating || 1000} <span className="text-[9px] text-slate-500">MMR</span>
                        </span>
                        {isCaptain && member.id !== team.captainId && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setMemberToTransferCaptaincy(member);
                                setShowTransferCaptaincyModal(true);
                              }}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                              title="Transfer Captaincy to this Player"
                            >
                              <Crown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenReplace(member)}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                              title="Replace Member with Another Player"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveMember(member)}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Remove Member from Active Roster"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Empty Slots */}
                  {Array.from({ length: Math.max(0, 5 - team.members.length) }).map((_, i) => (
                    <div
                      key={`empty_${i}`}
                      onClick={isCaptain ? handleOpenInvite : undefined}
                      className={`p-3.5 rounded-2xl border border-dashed border-slate-800 flex items-center justify-center gap-2 text-xs font-mono ${
                        isCaptain
                          ? 'cursor-pointer hover:border-cyan-500/40 text-slate-500 hover:text-cyan-400 bg-cyan-500/5'
                          : 'text-slate-600 bg-[#0a0a0f]/40'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isCaptain ? `+ Invite Player (Slot ${team.members.length + i + 1})` : `Slot ${team.members.length + i + 1} Open`}</span>
                    </div>
                  ))}
                </div>

                {/* Pending Sent Invitations Subsection */}
                {pendingInvitations.length > 0 && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending Squad Invitations ({pendingInvitations.length})</span>
                      </span>
                      <span className="text-slate-500 text-[10px]">Awaiting player acceptance</span>
                    </div>

                    <div className="space-y-2">
                      {pendingInvitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="p-2.5 rounded-xl bg-[#15151f] border border-amber-500/20 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 font-mono text-xs flex items-center justify-center font-bold">
                              ✉️
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>{inv.invitedGamerTag || inv.invitedPlayerGamerTag || 'Player'}</span>
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono uppercase">
                                  Pending
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Sent {new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>

                          {isCaptain && (
                            <button
                              onClick={() => handleCancelInvitation(inv.id, inv.invitedGamerTag)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs font-mono transition-colors"
                            >
                              Cancel Invite
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Match History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {matchHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs font-mono">
                    No 5v5 matches recorded yet for {team.teamName}.
                  </div>
                ) : (
                  matchHistory.map((m) => {
                    const isTeamA = m.teamAId === team.teamId;
                    const opponentName = isTeamA ? m.teamBName || 'Opponent' : m.teamAName || 'Opponent';
                    const opponentTag = isTeamA ? m.teamBTag : m.teamATag;
                    const isWin =
                      (isTeamA && m.officialTeamWinner === 'teamA') ||
                      (!isTeamA && m.officialTeamWinner === 'teamB');
                    const isLoss =
                      (isTeamA && m.officialTeamWinner === 'teamB') ||
                      (!isTeamA && m.officialTeamWinner === 'teamA');
                    const isDraw = m.officialTeamWinner === 'draw';

                    const ratingChange = isTeamA ? m.teamARatingChange : m.teamBRatingChange;

                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          if (onSelectMatch) {
                            onSelectMatch(m.id);
                            onClose();
                          }
                        }}
                        className="p-3 rounded-2xl bg-[#121218] border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-7 h-7 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center ${
                              isWin
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : isLoss
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : isDraw
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isWin ? 'W' : isLoss ? 'L' : isDraw ? 'D' : m.status.slice(0, 3)}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>vs {opponentName}</span>
                              {opponentTag && (
                                <span className="text-slate-400 font-mono text-[10px]">[{opponentTag}]</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {new Date(m.createdAt).toLocaleDateString()} • {m.station}
                            </div>
                          </div>
                        </div>

                        {ratingChange !== undefined && (
                          <div
                            className={`text-xs font-mono font-bold ${
                              ratingChange > 0
                                ? 'text-emerald-400'
                                : ratingChange < 0
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {ratingChange > 0 ? `+${ratingChange}` : ratingChange} MMR
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Squad History & Past Roster Tab */}
            {activeTab === 'squad_history' && (
              <div className="space-y-6">
                {/* Overview box */}
                <div className="p-4 rounded-2xl bg-[#121218] border border-slate-800 text-xs font-mono space-y-1">
                  <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <History className="w-4 h-4" />
                    <span>Squad Audit & Membership History</span>
                  </div>
                  <p className="text-slate-400">
                    Created on <strong className="text-slate-200">{formatDate(team.createdAt)}</strong> by Captain{' '}
                    <strong className="text-yellow-400">{team.captainGamerTag}</strong>. All roster modifications and events are permanently logged.
                  </p>
                </div>

                {/* Past Members Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase text-slate-400">
                    <span>Past Squad Members ({team.pastMembers?.length || 0})</span>
                    <span className="text-[10px] text-slate-500 font-normal">Archived historical records</span>
                  </div>

                  {(!team.pastMembers || team.pastMembers.length === 0) ? (
                    <div className="p-6 rounded-2xl bg-[#121218]/60 border border-slate-800/80 text-center text-xs font-mono text-slate-500">
                      No past roster changes. The active roster has remained intact since squad creation.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {team.pastMembers.map((pm, idx) => (
                        <div
                          key={`pm_${pm.id}_${idx}`}
                          className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800/80 flex items-center justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-200 truncate">{pm.gamerTag}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
                                {pm.reason === 'replaced'
                                  ? 'Replaced'
                                  : pm.reason === 'removed'
                                  ? 'Removed'
                                  : 'Left'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {pm.joinedAt ? `Joined ${formatDate(pm.joinedAt)} • ` : ''}
                              {pm.leftAt ? `Left ${formatDate(pm.leftAt)}` : ''}
                            </div>
                            {pm.replacedByGamerTag && (
                              <div className="text-[10px] text-cyan-400/80 font-mono mt-0.5">
                                ↳ Replaced by {pm.replacedByGamerTag}
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0 font-mono">
                            <div className="text-xs font-bold text-slate-400">{pm.rating || 1000} MMR</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chronological History Log */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono font-bold uppercase text-slate-400">
                    <span>Squad Event Log ({team.squadHistory?.length || 0})</span>
                    <span className="text-[10px] text-slate-500 font-normal">Immutable chronological history</span>
                  </div>

                  {(!team.squadHistory || team.squadHistory.length === 0) ? (
                    <div className="p-6 rounded-2xl bg-[#121218]/60 border border-slate-800/80 text-center text-xs font-mono text-slate-500">
                      Squad founded on {formatDate(team.createdAt)}.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...team.squadHistory].reverse().map((ev) => (
                        <div
                          key={ev.id}
                          className="p-3 rounded-xl bg-[#121218] border border-slate-800/60 flex items-start justify-between gap-3 text-xs font-mono"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                {ev.action.replace('_', ' ')}
                              </span>
                              <span className="text-slate-300 font-medium">{ev.details}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              By {ev.actorName}
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">
                            {formatDate(ev.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite Member Sub-Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0e0e14] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-base font-bold font-display text-white">Invite / Add Player to Squad</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Search registered players to invite to <strong className="text-cyan-400">{team?.teamName}</strong>.
              </p>
            </div>

            <input
              type="text"
              placeholder="Search gamer tag or name..."
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />

            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredInvitePlayers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 font-mono">
                  No available players found.
                </div>
              ) : (
                filteredInvitePlayers.slice(0, 15).map((player) => {
                  const existingPendingInvite = pendingInvitations.find(
                    (inv) => inv.invitedPlayerId === player.uid
                  );

                  return (
                    <div
                      key={player.uid}
                      className="p-2.5 rounded-xl bg-[#15151f] border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between transition-colors gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{player.gamerTag}</span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            {player.rating || 1000} MMR
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {player.fullName || 'Registered Player'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {existingPendingInvite ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Pending</span>
                            </span>
                            <button
                              onClick={() => handleCancelInvitation(existingPendingInvite.id, player.gamerTag)}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Cancel Invite"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSendInvite(player)}
                              disabled={sendingInviteId === player.uid}
                              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-black text-xs font-bold font-mono transition-colors flex items-center gap-1"
                              title="Send formal team invitation notification"
                            >
                              <Send className="w-3 h-3" />
                              <span>{sendingInviteId === player.uid ? 'Sending...' : 'Invite'}</span>
                            </button>
                            <button
                              onClick={() => handleDirectAddPlayer(player)}
                              disabled={inviting}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-mono transition-colors"
                              title="Directly add to roster without waiting"
                            >
                              Direct Add
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recruitment Announcement Modal */}
      {showRecruitmentModal && team && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#0e0e14] border border-cyan-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setShowRecruitmentModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider mb-1">
                <Radio className="w-4 h-4 animate-pulse" />
                <span>{activeRecruitment ? 'Edit Active Announcement' : 'Publish 5v5 Recruitment'}</span>
              </div>
              <h3 className="text-lg font-bold font-display text-white">
                {activeRecruitment ? 'Update Main Page Announcement' : `Recruit Free Agents for ${team.teamName}`}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Announce that <strong className="text-white">{team.teamName}</strong> is looking for{' '}
                <strong className="text-cyan-400">{playersNeeded} player{playersNeeded > 1 ? 's' : ''}</strong> to complete your 5v5 lineup.
              </p>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1.5">
                  Preferred Role / Specialist
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {['Any', 'Duelist', 'Initiator', 'Controller', 'Sentinel', 'Entry Fragger', 'Support', 'AWPer', 'IGL'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRecruitmentRole(role)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                        recruitmentRole === role
                          ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                          : 'bg-[#15151f] text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 uppercase mb-1.5">
                  Recruitment Note / Message (Optional)
                </label>
                <textarea
                  value={recruitmentNote}
                  onChange={(e) => setRecruitmentNote(e.target.value)}
                  placeholder="e.g., Grinding ranked 5v5 tonight. Mic required, looking for chill comms and consistent team play."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono resize-none"
                />
              </div>

              {/* Policy note */}
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] text-cyan-300 font-mono space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                  <span>One Active Announcement Per Team</span>
                </div>
                <p className="text-slate-400">
                  This announcement appears instantly on the Arena Main Page. When players join and your squad reaches 5/5, the announcement closes automatically.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRecruitmentModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRecruitment}
                disabled={publishingRec}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-black text-xs font-mono font-black uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2"
              >
                {publishingRec ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-black" />
                    <span>{activeRecruitment ? 'Save Changes' : 'Publish to Main Page'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace Member Sub-Modal */}
      {showReplaceModal && memberToReplace && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0e0e14] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              onClick={() => {
                setShowReplaceModal(false);
                setMemberToReplace(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider mb-1">
                <RefreshCw className="w-4 h-4" />
                <span>Replace Squad Member</span>
              </div>
              <h3 className="text-base font-bold font-display text-white">
                Replace {memberToReplace.gamerTag}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a replacement player. <strong className="text-slate-200">{memberToReplace.gamerTag}</strong> will be moved to past members history and their account/stats remain intact.
              </p>
            </div>

            <input
              type="text"
              placeholder="Search replacement player..."
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#121218] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {availablePlayers
                .filter((p) =>
                  p.gamerTag.toLowerCase().includes(inviteSearch.toLowerCase()) ||
                  p.fullName?.toLowerCase().includes(inviteSearch.toLowerCase())
                )
                .map((player) => (
                  <div
                    key={player.uid}
                    className="p-3 rounded-xl bg-[#15151f] border border-slate-800 hover:border-slate-700 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{player.gamerTag}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {player.fullName} • {player.rating || 1000} MMR
                      </div>
                    </div>
                    <button
                      onClick={() => handleExecuteReplace(player)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-bold font-mono transition-all flex items-center gap-1 shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace</span>
                    </button>
                  </div>
                ))}

              {availablePlayers.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-500 font-mono">
                  No registered free players available to replace.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Squad Details Sub-Modal */}
      {showEditSquadModal && team && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0e0e14] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setShowEditSquadModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider mb-1">
                <Pencil className="w-4 h-4" />
                <span>Squad Identity</span>
              </div>
              <h3 className="text-base font-bold font-display text-white">Edit Squad Details</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Update squad name, tag, or emblem. Existing squad ID, members, match records, and history are strictly preserved.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Squad Name</label>
                <input
                  type="text"
                  value={editSquadNameInput}
                  onChange={(e) => setEditSquadNameInput(e.target.value)}
                  maxLength={32}
                  className="w-full px-3.5 py-2.5 bg-[#121218] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Squad Tag (2-5 letters)</label>
                <input
                  type="text"
                  value={editSquadTagInput}
                  onChange={(e) => setEditSquadTagInput(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="w-full px-3.5 py-2.5 bg-[#121218] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold uppercase mb-1">Squad Emblem / Emoji</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['🛡️', '⚡', '🦅', '🔥', '👑', '🐉', '🎯', '⚔️', '🐺', '💀'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setEditSquadLogoInput(emoji)}
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center text-lg transition-all ${
                        editSquadLogoInput === emoji
                          ? 'border-cyan-400 bg-cyan-500/20 shadow-md shadow-cyan-500/20'
                          : 'border-slate-800 bg-[#121218] hover:border-slate-700'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowEditSquadModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSquadDetails}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md"
              >
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Leave Squad Modal (Regular Member) */}
      {showLeaveSquadModal && team && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">LEAVE SQUAD?</h3>
                <p className="text-xs text-slate-400 font-mono">Voluntary roster departure</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
              Are you sure you want to leave <strong className="text-white">{team.teamName}</strong>? Your match records and statistics with this squad will be archived in the squad history.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveSquadModal(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveTeam}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                {actionLoading ? 'Leaving...' : 'LEAVE SQUAD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Captain Leave Modal (Enforce Captain transfer or Sole Member Disband) */}
      {showCaptainLeaveModal && team && user && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-amber-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">YOU ARE THE SQUAD CAPTAIN</h3>
                <p className="text-xs text-amber-400 font-mono">Captaincy transfer required</p>
              </div>
            </div>

            {team.members.filter((m) => m.id !== user.uid).length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  You must transfer captaincy to another member before leaving. Select the member who will succeed you as Squad Captain:
                </p>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {team.members
                    .filter((m) => m.id !== user.uid)
                    .map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedNewCaptainId === m.id
                            ? 'bg-amber-500/10 border-amber-500 text-white'
                            : 'bg-[#15151b] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="newCaptain"
                            value={m.id}
                            checked={selectedNewCaptainId === m.id}
                            onChange={() => setSelectedNewCaptainId(m.id)}
                            className="text-amber-500 focus:ring-amber-500"
                          />
                          <span className="text-xs font-bold font-mono text-white">{m.gamerTag}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{m.rating || 1000} MMR</span>
                      </label>
                    ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCaptainLeaveModal(false)}
                    disabled={actionLoading}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptainTransferAndLeave}
                    disabled={actionLoading || !selectedNewCaptainId}
                    className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                      selectedNewCaptainId
                        ? 'bg-amber-400 hover:bg-amber-300 text-black'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {actionLoading ? 'Processing...' : 'TRANSFER CAPTAINCY & LEAVE'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  You are the sole member of this squad. To leave, you can disband the squad or invite other members first.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCaptainLeaveModal(false)}
                    disabled={actionLoading}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={handleSoleCaptainDisband}
                    disabled={actionLoading}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  >
                    {actionLoading ? 'Disbanding...' : 'DISBAND SQUAD'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove Member Modal */}
      {memberToRemove && team && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <UserMinus className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">REMOVE SQUAD MEMBER</h3>
                <p className="text-xs text-slate-400 font-mono">Captain authorization</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
              Are you sure you want to remove <strong className="text-white">{memberToRemove.gamerTag}</strong> from <strong className="text-white">{team.teamName}</strong>? Member history will be preserved.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveMember}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                {actionLoading ? 'Removing...' : 'REMOVE MEMBER'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disband Squad Modal */}
      {showDisbandModal && team && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">DISBAND SQUAD</h3>
                <p className="text-xs text-rose-400 font-mono">Permanent destruction</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
              Are you sure you want to DISBAND <strong className="text-white">{team.teamName}</strong> [{team.teamTag}]? This will remove all roster assignments, cancel any pending recruitments, and permanently archive the squad. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisbandModal(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmDisband}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                {actionLoading ? 'Disbanding...' : 'DISBAND SQUAD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Captaincy Modal (Direct action via roster Crown icon) */}
      {showTransferCaptaincyModal && memberToTransferCaptaincy && team && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-amber-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">TRANSFER CAPTAINCY</h3>
                <p className="text-xs text-amber-400 font-mono">Leadership transition</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
              Transfer full squad captaincy of <strong className="text-white">{team.teamName}</strong> to <strong className="text-cyan-400">{memberToTransferCaptaincy.gamerTag}</strong>? They will gain full authority to manage roster members, recruitments, and host 5v5 lobbies.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowTransferCaptaincyModal(false);
                  setMemberToTransferCaptaincy(null);
                }}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransferCaptaincy(memberToTransferCaptaincy.id)}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                {actionLoading ? 'Transferring...' : 'TRANSFER CAPTAINCY'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
