import { TeamTournamentRegistration, TeamTournamentPlayerSlot, TournamentParticipant, Tournament, CanonicalInvitationStatus } from '../types';

/**
 * Normalizes any legacy or variant invitation status to the canonical state machine:
 * PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED
 */
export function normalizeInvitationStatus(
  status: string | undefined | null
): CanonicalInvitationStatus {
  if (!status) return 'PENDING';
  const s = status.trim().toUpperCase();
  if (
    s === 'PENDING' ||
    s === 'INVITED' ||
    s === 'INVITATION_SENT' ||
    s === 'SENT'
  ) {
    return 'PENDING';
  }
  if (s === 'ACCEPTED' || s === 'COMPLETED' || s === 'ACCEPTED_INVITATION') {
    return 'ACCEPTED';
  }
  if (s === 'DECLINED' || s === 'REJECTED') {
    return 'DECLINED';
  }
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'REVOKED') {
    return 'CANCELLED';
  }
  if (s === 'EXPIRED') {
    return 'EXPIRED';
  }
  return 'PENDING';
}

export type PublicTeamStatusKey = 'FORMING_TEAM' | 'PENDING_APPROVAL' | 'READY';

export interface ComputedTeamStatus {
  statusKey: PublicTeamStatusKey;
  label: string; // e.g. "👥 FORMING — 3 / 5 PLAYERS", "⏳ COMPLETE — WAITING FOR APPROVAL", "🟢 READY"
  shortBadge: string; // "👥 FORMING", "⏳ PENDING APPROVAL", "🟢 READY"
  publicMessage: string;
  badgeClass: string;
  borderClass: string;
  progressPercent: number;
  playerCount: number;
  requiredPlayerCount: number;
  isAllInfoComplete: boolean;
  isAdminApproved: boolean;
  isOfficial: boolean;
}

export interface SanitizedPublicSlot {
  slotNumber: 1 | 2 | 3 | 4 | 5;
  isCaptain: boolean;
  isEmpty: boolean;
  isWaiting: boolean;
  isJoined: boolean;
  isInformationComplete: boolean;
  gamerTag?: string;
  inGameName?: string;
  inGameRank?: string;
  statusLabel: string;
}

export interface UnifiedTournamentTeam {
  id: string;
  tournamentId: string;
  tournamentName: string;
  gameId: string;
  gameName: string;
  teamName: string;
  teamTag?: string;
  teamLogo?: string;
  captainId: string;
  captainGamerTag: string;
  // Private captain data (only accessible to Admin or Captain)
  captainFullName?: string;
  captainPhone?: string;
  slots: TeamTournamentPlayerSlot[];
  status: ComputedTeamStatus;
  rawRegistrationStatus?: string;
  createdAt: number;
  updatedAt?: number;
  submittedAt?: number;
  adminNotes?: string;
  rejectionReason?: string;
  // Source reference
  sourceRegistration?: TeamTournamentRegistration;
  sourceParticipant?: TournamentParticipant;
}

/**
 * Strict verification of whether an individual player slot has personally accepted their invitation.
 * Rule:
 * - Captain is always accepted (captain initiated registration).
 * - Teammate slot is accepted ONLY after that specific invited player personally clicks
 *   "ACCEPT INVITATION" from their own account.
 * - The captain adding/inviting a player NEVER marks the player as accepted.
 */
export function isPlayerInvitationAccepted(
  slot: TeamTournamentPlayerSlot | undefined | null
): boolean {
  if (!slot) return false;
  if (slot.isCaptain) return true;

  // Reject unoccupied, declined or removed slots
  if (slot.status === 'EMPTY' || slot.playerStatus === 'EMPTY') return false;
  if (slot.status === 'DECLINED' || slot.playerStatus === 'DECLINED') return false;
  if (slot.status === 'REMOVED' || slot.playerStatus === 'REMOVED') return false;
  if (slot.status === 'CANCELLED' || slot.playerStatus === 'CANCELLED' || slot.invitationStatus === 'CANCELLED') return false;

  const uid = (slot.playerId || slot.invitedPlayerId || '').trim();
  if (!uid) return false;

  // A slot is NOT accepted if status is INVITED and invitationStatus !== 'ACCEPTED'
  const normalizedInvStatus = normalizeInvitationStatus(slot.invitationStatus);
  if (normalizedInvStatus === 'ACCEPTED' && slot.acceptedBy && slot.acceptedBy.trim() === uid) {
    return true;
  }

  // Also check if personal acceptance audit matches authenticated player UID
  const isAcceptedStatus =
    slot.status === 'ACCEPTED' ||
    slot.status === 'ACCEPTED_INVITATION' ||
    slot.playerStatus === 'ACCEPTED' ||
    slot.playerStatus === 'ACCEPTED_INVITATION' ||
    slot.status === 'INFORMATION_COMPLETE' ||
    slot.playerStatus === 'INFORMATION_COMPLETE' ||
    slot.status === 'COMPLETED';

  if (isAcceptedStatus && slot.acceptedBy && slot.acceptedBy.trim() === uid) {
    return true;
  }

  return false;
}

export type PlayerSlotState =
  | 'EMPTY'
  | 'INVITATION_PENDING'
  | 'ACCEPTED_INCOMPLETE'
  | 'INFORMATION_COMPLETE'
  | 'DECLINED'
  | 'REMOVED';

/**
 * Returns the exact state of a tournament player slot.
 */
export function getPlayerSlotState(
  slot: TeamTournamentPlayerSlot | undefined | null,
  fallbackCaptainPhone?: string
): PlayerSlotState {
  if (
    !slot ||
    slot.status === 'EMPTY' ||
    slot.playerStatus === 'EMPTY' ||
    slot.status === 'CANCELLED' ||
    slot.playerStatus === 'CANCELLED' ||
    slot.invitationStatus === 'CANCELLED'
  ) {
    return 'EMPTY';
  }
  if (slot.status === 'DECLINED' || slot.playerStatus === 'DECLINED') {
    return 'DECLINED';
  }
  if (slot.status === 'REMOVED' || slot.playerStatus === 'REMOVED') {
    return 'REMOVED';
  }

  // Captain slot is automatically accepted, check if details complete
  if (slot.isCaptain) {
    return isPlayerInformationComplete(slot, fallbackCaptainPhone)
      ? 'INFORMATION_COMPLETE'
      : 'ACCEPTED_INCOMPLETE';
  }

  // STAGE 1: Check invitation acceptance
  const isAccepted = isPlayerInvitationAccepted(slot);
  if (!isAccepted) {
    return 'INVITATION_PENDING';
  }

  // STAGE 2: If accepted, check player details completion
  const isInfoComplete = isPlayerInformationComplete(slot, fallbackCaptainPhone);
  if (isInfoComplete) {
    return 'INFORMATION_COMPLETE';
  }

  return 'ACCEPTED_INCOMPLETE';
}

/**
 * Strict verification of whether an individual slot is completely filled and personally verified.
 * Rule: 5 PLAYERS DOES NOT MEAN 5 / 5 COMPLETE.
 * 5 / 5 COMPLETE ONLY MEANS:
 * - Real player account with Firebase UID (playerId)
 * - Personally accepted invitation (acceptedBy === playerId or isCaptain)
 * - Non-empty Full Name
 * - Non-empty valid contact phone number (at least 8 characters)
 * - Non-empty In-Game Name
 * - Non-empty In-Game Rank
 * - Valid completed status (COMPLETED or INFORMATION_COMPLETE)
 */
export function isPlayerInformationComplete(
  slot: TeamTournamentPlayerSlot | undefined | null,
  fallbackCaptainPhone?: string
): boolean {
  if (!slot) return false;

  // Must pass Stage 1 (Personal Invitation Acceptance)
  if (!isPlayerInvitationAccepted(slot)) return false;

  // Must have 0 missing fields in Stage 2
  return getPlayerMissingInformation(slot, fallbackCaptainPhone).length === 0;
}

// Single Source of Truth Alias
export const isPlayerSlotComplete = isPlayerInformationComplete;

/**
 * Returns a list of specific missing required fields for a slot (useful for warnings and diagnostics)
 * STRICT TWO-STAGE SEPARATION:
 * STAGE 1 — INVITATION: Check invitationStatus === 'ACCEPTED'
 *   If false: Return ONLY ['Invitation Pending Acceptance'] and STOP HERE!
 * STAGE 2 — PLAYER INFORMATION: Only if invitationStatus === 'ACCEPTED'
 *   Check Full Name, Phone Number (minimum 8 digits), In-Game Name, In-Game Rank, etc.
 */
export function getPlayerMissingInformation(
  slot: TeamTournamentPlayerSlot | undefined | null,
  fallbackCaptainPhone?: string
): string[] {
  if (!slot) return ['Empty Slot'];

  if (slot.status === 'EMPTY' || slot.playerStatus === 'EMPTY') {
    return ['Slot Unoccupied'];
  }
  if (slot.status === 'DECLINED' || slot.playerStatus === 'DECLINED') {
    return ['Invitation Declined'];
  }
  if (slot.status === 'REMOVED' || slot.playerStatus === 'REMOVED') {
    return ['Slot Removed'];
  }

  const uid = (slot.playerId || slot.invitedPlayerId || '').trim();
  if (!uid) {
    return ['Missing Player UID'];
  }

  // STAGE 1 — INVITATION
  const isAccepted = isPlayerInvitationAccepted(slot);
  if (!isAccepted) {
    // STOP HERE for player-detail validation! Do NOT report phone number or rank while invitation is still pending.
    return ['Invitation Pending Acceptance'];
  }

  // STAGE 2 — PLAYER INFORMATION (Only evaluated after invitation is accepted)
  const missing: string[] = [];

  const fullName = (slot.fullName || slot.gamerTag || '').trim();
  if (!fullName) {
    missing.push('Full Name');
  }

  const phone = (slot.phoneNumber || (slot.isCaptain ? fallbackCaptainPhone : '') || '').trim();
  if (!phone || phone.length < 8) {
    missing.push('Phone Number (minimum 8 digits)');
  }

  const inGameName = (slot.inGameName || '').trim();
  if (!inGameName) {
    missing.push('In-Game Name');
  }

  const inGameRank = (slot.inGameRank || '').trim();
  if (!inGameRank) {
    missing.push('In-Game Rank');
  }

  const isStatusComplete =
    slot.status === 'INFORMATION_COMPLETE' ||
    slot.playerStatus === 'INFORMATION_COMPLETE' ||
    slot.status === 'COMPLETED';
  if (!isStatusComplete) {
    missing.push('Registration Status Incomplete');
  }

  if (!slot.isCaptain) {
    if (!slot.acceptedBy || slot.acceptedBy.trim() !== uid) {
      missing.push('Invitation Acceptance Audit');
    }
    if (slot.informationCompletedBy && slot.informationCompletedBy.trim() !== uid) {
      missing.push('Information Audit');
    }
  }

  return missing;
}

/**
 * Counts the number of completed players with unique Firebase UIDs.
 * Rejects duplicate players across slots.
 */
export function countCompletedDistinctPlayers(
  slots: TeamTournamentPlayerSlot[] = [],
  fallbackCaptainPhone?: string
): number {
  const seenPlayerIds = new Set<string>();
  let count = 0;

  for (const s of slots) {
    if (isPlayerInformationComplete(s, s.isCaptain ? fallbackCaptainPhone : undefined) && s.playerId && !seenPlayerIds.has(s.playerId)) {
      seenPlayerIds.add(s.playerId);
      count++;
    }
  }

  return count;
}

/**
 * Calculates the exact public status of a team according to strict 5v5 rules:
 *
 * 5 / 5 COMPLETE ONLY MEANS:
 * FIVE REAL PLAYER ACCOUNTS + FIVE PERSONAL INVITATION ACCEPTANCES + FIVE COMPLETED INFORMATION FORMS
 *
 * IF completedPlayers < requiredPlayerCount (5):
 *    PUBLIC STATUS = FORMING_TEAM
 *    Label: 👥 FORMING — X / 5 PLAYERS
 *    Message: "Looking for players / Team registration in progress."
 *
 * IF completedPlayers == requiredPlayerCount (5)
 * AND adminApproval != CONFIRMED:
 *    PUBLIC STATUS = PENDING_APPROVAL
 *    Label: ⏳ WAITING FOR ADMIN APPROVAL
 *    Message: "All 5 players completed. Waiting for Admin approval."
 *
 * IF completedPlayers == requiredPlayerCount (5)
 * AND adminApproval == CONFIRMED:
 *    PUBLIC STATUS = READY
 *    Label: 🟢 CONFIRMED PARTICIPANT
 *    Message: "Official Tournament Participant (5/5 Confirmed)"
 */
export function computeTeamStatus(params: {
  slots: TeamTournamentPlayerSlot[];
  registrationStatus?: string;
  isConfirmedInTournament?: boolean;
  requiredPlayerCount?: number;
  fallbackCaptainPhone?: string;
}): ComputedTeamStatus {
  const {
    slots = [],
    registrationStatus = 'WAITING_FOR_PLAYERS',
    isConfirmedInTournament = false,
    requiredPlayerCount = 5,
    fallbackCaptainPhone,
  } = params;

  // Count strictly completed distinct players
  const completedPlayers = countCompletedDistinctPlayers(slots, fallbackCaptainPhone);
  const isAllInfoComplete = completedPlayers >= requiredPlayerCount;

  // Check if admin has officially approved
  const isAdminApproved = Boolean(
    registrationStatus === 'CONFIRMED' || isConfirmedInTournament
  );

  // 1. INCOMPLETE TEAM: Fewer than 5 verified players
  if (completedPlayers < requiredPlayerCount) {
    const progressPercent = Math.round((completedPlayers / requiredPlayerCount) * 100);

    // Determine specific bottleneck among the slots
    const slotStates = slots.map((s) => getPlayerSlotState(s, fallbackCaptainPhone));
    const hasEmptySlots =
      slotStates.some((st) => st === 'EMPTY' || st === 'DECLINED') ||
      slots.length < requiredPlayerCount;
    const hasPendingInvitations = slotStates.some((st) => st === 'INVITATION_PENDING');
    const hasIncompleteDetails = slotStates.some((st) => st === 'ACCEPTED_INCOMPLETE');

    let label = `👥 FORMING TEAM — ${completedPlayers} / ${requiredPlayerCount} PLAYERS`;
    let shortBadge = `👥 FORMING TEAM (${completedPlayers}/${requiredPlayerCount})`;
    let publicMessage = 'Looking for players / Team registration in progress.';
    let badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    let borderClass = 'border-indigo-500/40';

    if (!hasEmptySlots && hasPendingInvitations) {
      label = `⏳ WAITING FOR PLAYER ACCEPTANCE (${completedPlayers}/${requiredPlayerCount})`;
      shortBadge = `⏳ WAITING FOR ACCEPTANCE (${completedPlayers}/${requiredPlayerCount})`;
      publicMessage = 'Invitations sent. Waiting for invited players to personally accept.';
      badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      borderClass = 'border-blue-500/40';
    } else if (!hasEmptySlots && !hasPendingInvitations && hasIncompleteDetails) {
      label = `⚠️ PLAYER DETAILS INCOMPLETE (${completedPlayers}/${requiredPlayerCount})`;
      shortBadge = `⚠️ DETAILS INCOMPLETE (${completedPlayers}/${requiredPlayerCount})`;
      publicMessage = 'All players accepted. Waiting for players to complete mandatory details.';
      badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      borderClass = 'border-amber-500/40';
    }

    return {
      statusKey: 'FORMING_TEAM',
      label,
      shortBadge,
      publicMessage,
      badgeClass,
      borderClass,
      progressPercent,
      playerCount: completedPlayers,
      requiredPlayerCount,
      isAllInfoComplete: false,
      isAdminApproved: false,
      isOfficial: false,
    };
  }

  // 2. 5 / 5 PLAYERS COMPLETE — AWAITING ADMIN APPROVAL
  if (!isAdminApproved) {
    return {
      statusKey: 'PENDING_APPROVAL',
      label: '5/5 🟢 COMPLETE — WAITING FOR ADMIN APPROVAL',
      shortBadge: '⏳ WAITING FOR ADMIN APPROVAL',
      publicMessage: 'All 5 players completed. Waiting for Admin approval.',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      borderClass: 'border-emerald-500/40',
      progressPercent: 100,
      playerCount: requiredPlayerCount,
      requiredPlayerCount,
      isAllInfoComplete: true,
      isAdminApproved: false,
      isOfficial: false,
    };
  }

  // 3. BOTH CONDITIONS MET: 5/5 complete AND Admin CONFIRMED
  return {
    statusKey: 'READY',
    label: '🟢 CONFIRMED PARTICIPANT',
    shortBadge: '🟢 CONFIRMED',
    publicMessage: 'Official Tournament Participant (5/5 Confirmed)',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    borderClass: 'border-emerald-500/50',
    progressPercent: 100,
    playerCount: requiredPlayerCount,
    requiredPlayerCount,
    isAllInfoComplete: true,
    isAdminApproved: true,
    isOfficial: true,
  };
}

/**
 * Sanitizes team slots for public exposure.
 * Strips all sensitive data: Phone numbers, real full names, email addresses, and private account IDs.
 */
export function sanitizeSlotsForPublic(slots: TeamTournamentPlayerSlot[]): SanitizedPublicSlot[] {
  // Ensure we represent all 5 slots 1 through 5
  const result: SanitizedPublicSlot[] = [];

  for (let slotNum = 1; slotNum <= 5; slotNum++) {
    const slot = slots.find((s) => s.slotNumber === slotNum);
    const isCaptain = slotNum === 1 || Boolean(slot?.isCaptain);

    if (!slot || slot.status === 'EMPTY' || slot.status === 'REMOVED') {
      result.push({
        slotNumber: slotNum as 1 | 2 | 3 | 4 | 5,
        isCaptain,
        isEmpty: true,
        isWaiting: true,
        isJoined: false,
        isInformationComplete: false,
        statusLabel: 'EMPTY SLOT',
      });
      continue;
    }

    if (slot.status === 'DECLINED') {
      result.push({
        slotNumber: slotNum as 1 | 2 | 3 | 4 | 5,
        isCaptain,
        isEmpty: true,
        isWaiting: true,
        isJoined: false,
        isInformationComplete: false,
        statusLabel: 'INVITATION DECLINED',
      });
      continue;
    }

    const slotState = getPlayerSlotState(slot);

    if (slotState === 'INVITATION_PENDING') {
      result.push({
        slotNumber: slotNum as 1 | 2 | 3 | 4 | 5,
        isCaptain,
        isEmpty: false,
        isWaiting: true,
        isJoined: false,
        isInformationComplete: false,
        gamerTag: slot.invitedGamerTag || slot.gamerTag || 'Invited Player',
        statusLabel: '⏳ INVITATION PENDING ACCEPTANCE',
      });
      continue;
    }

    if (slotState === 'ACCEPTED_INCOMPLETE') {
      result.push({
        slotNumber: slotNum as 1 | 2 | 3 | 4 | 5,
        isCaptain,
        isEmpty: false,
        isWaiting: false,
        isJoined: true,
        isInformationComplete: false,
        gamerTag: slot.gamerTag || slot.invitedGamerTag || (isCaptain ? 'Team Captain' : `Player ${slotNum}`),
        inGameName: slot.inGameName || undefined,
        inGameRank: slot.inGameRank || undefined,
        statusLabel: '⚠️ REGISTRATION STATUS INCOMPLETE',
      });
      continue;
    }

    // INFORMATION_COMPLETE
    result.push({
      slotNumber: slotNum as 1 | 2 | 3 | 4 | 5,
      isCaptain,
      isEmpty: false,
      isWaiting: false,
      isJoined: true,
      isInformationComplete: true,
      gamerTag: slot.gamerTag || (isCaptain ? 'Team Captain' : `Player ${slotNum}`),
      inGameName: slot.inGameName || undefined,
      inGameRank: slot.inGameRank || undefined,
      statusLabel: '🟢 PLAYER COMPLETE',
    });
  }

  return result;
}

/**
 * Merge TeamTournamentRegistrations and Tournament.participants into a unified list
 * with deduplication and accurate status calculation.
 */
export function buildUnifiedTournamentTeams(
  tournament: Tournament,
  registrations: TeamTournamentRegistration[]
): UnifiedTournamentTeam[] {
  const teamsMap = new Map<string, UnifiedTournamentTeam>();

  // 1. Process all active registrations
  for (const reg of registrations) {
    if (reg.status === 'CANCELLED' || reg.status === 'REJECTED') {
      continue;
    }

    const isConfirmedInTournament = Boolean(
      tournament.participants?.some(
        (p) => p.id === reg.id || p.name.toLowerCase() === reg.teamName.toLowerCase()
      )
    );

    const computed = computeTeamStatus({
      slots: reg.slots || [],
      registrationStatus: reg.status,
      isConfirmedInTournament,
      requiredPlayerCount: 5,
    });

    teamsMap.set(reg.id, {
      id: reg.id,
      tournamentId: reg.tournamentId,
      tournamentName: reg.tournamentName || tournament.name,
      gameId: reg.gameId || tournament.gameId,
      gameName: reg.gameName || tournament.gameName,
      teamName: reg.teamName,
      teamTag: reg.teamTag,
      teamLogo: reg.teamLogo,
      captainId: reg.captainId,
      captainGamerTag: reg.captainGamerTag,
      captainFullName: reg.captainFullName,
      captainPhone: reg.captainPhone,
      slots: reg.slots || [],
      status: computed,
      rawRegistrationStatus: reg.status,
      createdAt: reg.createdAt || Date.now(),
      updatedAt: reg.updatedAt,
      submittedAt: reg.submittedAt,
      adminNotes: reg.adminNotes,
      rejectionReason: reg.rejectionReason,
      sourceRegistration: reg,
    });
  }

  // 2. Process tournament.participants (teams confirmed directly or seeded)
  if (tournament.participants) {
    for (const p of tournament.participants) {
      if (tournament.type === 'TEAM' || p.type === 'TEAM' || (p.teamMembers && p.teamMembers.length > 0)) {
        // Check if already covered by an existing registration
        const existingKey = Array.from(teamsMap.keys()).find(
          (k) => k === p.id || teamsMap.get(k)?.teamName.toLowerCase() === p.name.toLowerCase()
        );

        if (existingKey) {
          // If already in map, ensure it is marked as officially confirmed
          const existing = teamsMap.get(existingKey)!;
          if (!existing.status.isOfficial) {
            existing.status = computeTeamStatus({
              slots: existing.slots,
              registrationStatus: 'CONFIRMED',
              isConfirmedInTournament: true,
              requiredPlayerCount: 5,
            });
            existing.sourceParticipant = p;
          }
          continue;
        }

        // Participant without separate registration doc
        const slots: TeamTournamentPlayerSlot[] = (p.teamMembers || []).map((m, idx) => ({
          slotNumber: (idx + 1) as 1 | 2 | 3 | 4 | 5,
          isCaptain: idx === 0 || Boolean(m.isCaptain),
          status: 'COMPLETED',
          playerStatus: 'INFORMATION_COMPLETE',
          playerId: m.uid,
          gamerTag: m.gamerTag || 'Player',
          fullName: m.fullName,
          inGameName: m.inGameName || m.gamerTag,
          inGameRank: m.inGameRank,
          phoneNumber: m.phoneNumber,
          informationConfirmed: true,
        }));

        // Fill remaining slots up to 5 if needed
        while (slots.length < 5) {
          slots.push({
            slotNumber: (slots.length + 1) as 1 | 2 | 3 | 4 | 5,
            isCaptain: false,
            status: 'EMPTY',
          });
        }

        const computed = computeTeamStatus({
          slots,
          registrationStatus: 'CONFIRMED',
          isConfirmedInTournament: true,
          requiredPlayerCount: 5,
        });

        teamsMap.set(p.id, {
          id: p.id,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          gameId: tournament.gameId,
          gameName: tournament.gameName,
          teamName: p.name,
          teamTag: p.tag || p.teamTag,
          captainId: p.teamMemberIds?.[0] || p.id,
          captainGamerTag: p.captainName || p.teamMembers?.[0]?.gamerTag || p.name,
          captainFullName: p.fullName || p.teamMembers?.[0]?.fullName,
          captainPhone: p.phoneNumber || p.captainPhone || p.teamMembers?.[0]?.phoneNumber,
          slots,
          status: computed,
          rawRegistrationStatus: 'CONFIRMED',
          createdAt: p.registeredAt || Date.now(),
          sourceParticipant: p,
        });
      }
    }
  }

  // Sort: Official Ready teams first, then Pending Approval, then Forming teams
  return Array.from(teamsMap.values()).sort((a, b) => {
    const statusOrder: Record<PublicTeamStatusKey, number> = {
      READY: 1,
      PENDING_APPROVAL: 2,
      FORMING_TEAM: 3,
    };

    if (statusOrder[a.status.statusKey] !== statusOrder[b.status.statusKey]) {
      return statusOrder[a.status.statusKey] - statusOrder[b.status.statusKey];
    }

    // Secondary: More players first
    if (b.status.playerCount !== a.status.playerCount) {
      return b.status.playerCount - a.status.playerCount;
    }

    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}
