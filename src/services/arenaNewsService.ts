import { Tournament, TournamentMatch, ArenaNewsItem, ArenaNewsType } from '../types';
import { subscribeToAllTournaments } from './tournamentService';

/**
 * Format relative time (e.g., "Just now", "2 min ago", "1 hour ago", "15 Sep")
 */
export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'Recent';
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format actual date and time string (e.g., "15 September • 20:00")
 */
export function formatScheduledDateTime(timestamp?: number): { dateStr: string; timeStr: string } {
  if (!timestamp) return { dateStr: 'TBD', timeStr: 'TBD' };
  const d = new Date(timestamp);
  const isToday = new Date().toDateString() === d.toDateString();
  const dateStr = isToday ? 'Today' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { dateStr, timeStr };
}

/**
 * Derive Arena Tournament News as a fully automatic tournament lifecycle broadcast.
 * 
 * Flow:
 * CREATED -> REGISTRATION_OPEN -> MATCH_STAGES_OFFICIAL -> MATCH_IN_PROGRESS -> 
 * MATCH_RESULT_CONFIRMED -> NEXT_MATCH -> FINAL -> CHAMPION_CONFIRMED -> ENDED -> NEW_TOURNAMENT
 * 
 * Rules:
 * 1. Single source of truth: Existing Tournament section and Firebase tournament data.
 * 2. No duplicate collections, no stale cache.
 * 3. Exact IDs and names, no invented matchups.
 * 4. Prioritizes the active tournament lifecycle, while maintaining history.
 */
export function deriveArenaNewsFromTournaments(tournaments: Tournament[]): ArenaNewsItem[] {
  if (!Array.isArray(tournaments) || tournaments.length === 0) {
    return [];
  }

  const newsItems: ArenaNewsItem[] = [];
  const seenNewsIds = new Set<string>();

  // Sort tournaments so that active ones are prioritized
  // Active priority: LIVE > REGISTRATION_OPEN / UPCOMING > COMPLETED
  for (const t of tournaments) {
    if (!t) continue;
    const matches: TournamentMatch[] = Array.isArray(t.matches) ? t.matches : [];
    const participants = t.participants || [];
    const confirmedCount = participants.length;
    const maxParticipants = t.maxParticipants || 16;
    const isRegistrationOpen = t.status === 'REGISTRATION_OPEN';
    const isCompleted = t.status === 'COMPLETED' || Boolean(t.winnerAnnounced);
    const hasMatches = matches.length > 0;
    const hasLiveMatch = matches.some((m) => m.status === 'LIVE');
    const hasApprovedMatches = matches.some((m) => m.adminApproved || m.status === 'COMPLETED' || m.status === 'CONFIRMED');

    // =========================================================================
    // 1. CHAMPION CROWNED & TOURNAMENT ENDED (Highest Priority: 100)
    // Only after official Admin confirmation (winnerAnnounced with winnerName)
    // =========================================================================
    if (t.winnerAnnounced && t.winnerId && t.winnerName) {
      const champNewsId = `news_champ_${t.id}_${t.winnerId}`;
      if (!seenNewsIds.has(champNewsId)) {
        seenNewsIds.add(champNewsId);

        // Find grand final match to extract exact score and opponent
        const grandFinal = matches.find(
          (m) =>
            (m.roundName?.toLowerCase().includes('final') &&
              !m.roundName?.toLowerCase().includes('semi') &&
              !m.roundName?.toLowerCase().includes('3rd') &&
              !m.id.includes('3rd')) ||
            m.id.endsWith('_m_2_1')
        );

        const opponentName = t.runnerUpName || (
          grandFinal
            ? (grandFinal.participantA?.id === t.winnerId
                ? grandFinal.participantB?.name || grandFinal.participantBName
                : grandFinal.participantA?.name || grandFinal.participantAName)
            : undefined
        ) || 'Finalist';

        const finalScoreStr = grandFinal && grandFinal.scoreA !== undefined && grandFinal.scoreB !== undefined
          ? `${grandFinal.scoreA} — ${grandFinal.scoreB}`
          : undefined;

        // Detect 3rd place team if played
        let thirdPlaceWinnerName = t.thirdPlaceName;
        const thirdPlaceMatch = matches.find(
          (m) => m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd')
        );
        if (!thirdPlaceWinnerName && thirdPlaceMatch && thirdPlaceMatch.winnerId) {
          const tpWinner = thirdPlaceMatch.winnerId === thirdPlaceMatch.participantA?.id
            ? thirdPlaceMatch.participantA?.name
            : thirdPlaceMatch.participantB?.name;
          if (tpWinner) thirdPlaceWinnerName = tpWinner;
        }

        const thirdPlaceInfo = thirdPlaceWinnerName ? ` • 🥉 3rd Place: ${thirdPlaceWinnerName}` : '';

        newsItems.push({
          newsId: champNewsId,
          tournamentId: t.id,
          tournamentName: t.name,
          gameId: t.gameId,
          gameName: t.gameName,
          gameCategory: t.gameCategory,
          eventType: 'CHAMPION',
          title: '🏆 TOURNAMENT WINNER',
          headline: `🥇 ${t.winnerName.toUpperCase()}`,
          description: `${t.winnerName} crowned champion of ${t.name}! Defeated ${opponentName}${finalScoreStr ? ` (${finalScoreStr})` : ''}.${t.prizePool ? ` Prize: ${t.prizePool}.` : ''}${thirdPlaceInfo} Certified by Nexus Esports Arena.`,
          priority: 100,
          winnerTeam: {
            id: t.winnerId,
            name: t.winnerName,
            avatarUrl: t.winnerAvatarUrl,
          },
          loserTeam: t.runnerUpId || opponentName ? {
            id: t.runnerUpId || 'runner-up',
            name: opponentName,
          } : undefined,
          thirdPlaceWinner: thirdPlaceWinnerName ? {
            id: t.thirdPlaceId || '3rd-place',
            name: thirdPlaceWinnerName,
          } : undefined,
          finalScore: grandFinal && grandFinal.scoreA !== undefined && grandFinal.scoreB !== undefined ? {
            scoreA: grandFinal.scoreA,
            scoreB: grandFinal.scoreB,
          } : undefined,
          roundName: 'Grand Finals',
          matchId: grandFinal?.id,
          matchNumber: grandFinal?.matchNumber,
          prizePool: t.prizePool,
          approvedAt: t.announcedAt || t.completedAt || t.updatedAt,
          approvedByName: t.createdByName || 'Admin',
          timestamp: t.announcedAt || t.completedAt || t.updatedAt || Date.now(),
          isChampionship: true,
        });
      }
    }

    // =========================================================================
    // 2. MATCH-BY-MATCH DERIVATION:
    // - GRAND_FINAL_LIVE (Priority: 98)
    // - MATCH_LIVE (Priority: 90)
    // - QUALIFIED (Priority: 80)
    // - THIRD_PLACE_RACE (Priority: 75)
    // - UPCOMING_MATCH / NEXT MATCH (Priority: 70 for Final, 60 for other rounds)
    // - MATCH_ENDED_PENDING (Priority: 50)
    // =========================================================================
    for (const m of matches) {
      if (!m) continue;
      const isFinal =
        (m.roundName?.toLowerCase().includes('final') &&
          !m.roundName?.toLowerCase().includes('semi') &&
          !m.roundName?.toLowerCase().includes('3rd') &&
          !m.id.includes('3rd')) ||
        m.id.endsWith('_m_2_1');
      const isThirdPlaceMatch = m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd');
      const isSemiFinal = m.roundName?.toLowerCase().includes('semi') || m.id.includes('_m_1_');

      const pA = m.participantA;
      const pB = m.participantB;

      // 2A. LIVE MATCH (Priority: 98 for Final, 90 for other matches)
      if (m.status === 'LIVE' && pA && pB) {
        const liveNewsId = `news_live_${t.id}_${m.id}`;
        if (!seenNewsIds.has(liveNewsId)) {
          seenNewsIds.add(liveNewsId);
          const eventType = isFinal ? 'GRAND_FINAL_LIVE' : 'MATCH_LIVE';
          const title = isFinal ? '🔥 GRAND FINAL — LIVE' : '🔴 LIVE NOW';
          const priority = isFinal ? 98 : 90;

          newsItems.push({
            newsId: liveNewsId,
            tournamentId: t.id,
            tournamentName: t.name,
            gameId: t.gameId,
            gameName: t.gameName,
            gameCategory: t.gameCategory,
            matchId: m.id,
            matchNumber: m.matchNumber,
            round: m.round,
            roundName: m.roundName || `Round ${m.round}`,
            eventType,
            title,
            headline: `${pA.name} 🆚 ${pB.name}`,
            description: `${m.roundName || 'Official Match'} of ${t.name} is LIVE in the Arena!${m.station ? ` Station: ${m.station}.` : ''} Scheduled: ${formatScheduledDateTime(m.scheduledTime).timeStr} • Started: ${formatScheduledDateTime(m.actualStartedAt).timeStr}. Follow live scores in real time.`,
            priority,
            teamA: {
              id: pA.id,
              name: pA.name,
              tag: pA.tag,
              avatarUrl: pA.avatarUrl,
              score: m.scoreA ?? 0,
            },
            teamB: {
              id: pB.id,
              name: pB.name,
              tag: pB.tag,
              avatarUrl: pB.avatarUrl,
              score: m.scoreB ?? 0,
            },
            actualStartedAt: m.actualStartedAt || m.updatedAt || Date.now(),
            station: m.station,
            timestamp: m.actualStartedAt || m.updatedAt || Date.now(),
            isChampionship: isFinal,
            isSemiFinal,
          });
        }
      }

      // 2B. RESULT PENDING ADMIN APPROVAL (Priority: 50)
      const isAwaitingApproval =
        m.status === 'AWAITING_CONFIRMATION' ||
        m.status === 'PENDING_ADMIN_APPROVAL' ||
        (m.submittedResult && !m.adminApproved && m.status !== 'COMPLETED' && m.status !== 'CONFIRMED');

      if (isAwaitingApproval && pA && pB) {
        const pendingNewsId = `news_pending_${t.id}_${m.id}`;
        if (!seenNewsIds.has(pendingNewsId)) {
          seenNewsIds.add(pendingNewsId);
          const scoreA = m.submittedResult?.scoreA ?? m.scoreA ?? 0;
          const scoreB = m.submittedResult?.scoreB ?? m.scoreB ?? 0;

          newsItems.push({
            newsId: pendingNewsId,
            tournamentId: t.id,
            tournamentName: t.name,
            gameId: t.gameId,
            gameName: t.gameName,
            gameCategory: t.gameCategory,
            matchId: m.id,
            matchNumber: m.matchNumber,
            round: m.round,
            roundName: m.roundName || `Round ${m.round}`,
            eventType: 'MATCH_ENDED_PENDING',
            title: '⏳ RESULT PENDING ADMIN CONFIRMATION',
            headline: `${pA.name} ${scoreA} — ${scoreB} ${pB.name}`,
            description: `Match finished. Score submitted (${scoreA} - ${scoreB}). Official confirmation pending Admin review.`,
            priority: 50,
            teamA: {
              id: pA.id,
              name: pA.name,
              tag: pA.tag,
              avatarUrl: pA.avatarUrl,
              score: scoreA,
            },
            teamB: {
              id: pB.id,
              name: pB.name,
              tag: pB.tag,
              avatarUrl: pB.avatarUrl,
              score: scoreB,
            },
            actualEndedAt: m.actualEndedAt || m.updatedAt || Date.now(),
            timestamp: m.actualEndedAt || m.updatedAt || Date.now(),
            isChampionship: isFinal,
            isSemiFinal,
          });
        }
      }

      // 2C. OFFICIAL RESULT CONFIRMED & QUALIFICATION (Priority: 80)
      // When Admin confirms result: announce qualification and next match
      const isApprovedResult =
        (m.status === 'COMPLETED' || m.status === 'CONFIRMED' || m.adminApproved) &&
        m.winnerId &&
        pA &&
        pB;

      if (isApprovedResult && !isFinal) {
        const winner = m.winnerId === pA.id ? pA : pB;
        const loser = m.winnerId === pA.id ? pB : pA;
        const scoreWinner = m.winnerId === pA.id ? (m.scoreA ?? 0) : (m.scoreB ?? 0);
        const scoreLoser = m.winnerId === pA.id ? (m.scoreB ?? 0) : (m.scoreA ?? 0);

        let nextRoundLabel = 'the Next Round';
        let targetNextMatch: TournamentMatch | undefined;
        if (m.nextMatchId) {
          targetNextMatch = matches.find((nm) => nm.id === m.nextMatchId);
          if (targetNextMatch?.roundName) {
            nextRoundLabel = targetNextMatch.roundName;
          }
        } else if (isSemiFinal) {
          nextRoundLabel = 'the Grand Finals';
        }

        const qualNewsId = `news_qual_${t.id}_${m.id}_${winner.id}`;
        if (!seenNewsIds.has(qualNewsId)) {
          seenNewsIds.add(qualNewsId);
          newsItems.push({
            newsId: qualNewsId,
            tournamentId: t.id,
            tournamentName: t.name,
            gameId: t.gameId,
            gameName: t.gameName,
            gameCategory: t.gameCategory,
            matchId: m.id,
            matchNumber: m.matchNumber,
            round: m.round,
            roundName: m.roundName || `Round ${m.round}`,
            eventType: 'QUALIFIED',
            title: `🏆 RESULT CONFIRMED: ${winner.name.toUpperCase()} QUALIFIES`,
            headline: `${winner.name} won against ${loser.name} (${scoreWinner} — ${scoreLoser})`,
            description: `Official Result Confirmed: ${winner.name} defeated ${loser.name} with score ${scoreWinner}-${scoreLoser}. ${winner.name} advances directly to ${nextRoundLabel}!`,
            priority: 80,
            winnerTeam: {
              id: winner.id,
              name: winner.name,
              tag: winner.tag,
              avatarUrl: winner.avatarUrl,
            },
            loserTeam: {
              id: loser.id,
              name: loser.name,
              tag: loser.tag,
              avatarUrl: loser.avatarUrl,
            },
            teamA: {
              id: pA.id,
              name: pA.name,
              tag: pA.tag,
              avatarUrl: pA.avatarUrl,
              score: m.scoreA,
            },
            teamB: {
              id: pB.id,
              name: pB.name,
              tag: pB.tag,
              avatarUrl: pB.avatarUrl,
              score: m.scoreB,
            },
            nextRoundName: nextRoundLabel,
            nextMatchId: m.nextMatchId,
            nextMatchScheduledAt: targetNextMatch?.scheduledTime,
            approvedAt: m.adminApprovedAt || m.completedAt || m.updatedAt,
            approvedByName: m.adminApprovedByName || 'Admin',
            actualEndedAt: m.actualEndedAt,
            actualStartedAt: m.actualStartedAt,
            timestamp: m.adminApprovedAt || m.completedAt || m.updatedAt || Date.now(),
            isSemiFinal,
            isChampionship: false,
          });
        }

        // 2D. Third Place Race (Priority: 75)
        if (isSemiFinal && loser.id) {
          const thirdPlaceMatch = matches.find(
            (nm) => nm.id.includes('3rd') || nm.roundName?.toLowerCase().includes('3rd')
          );

          const thirdRaceNewsId = `news_3rd_${t.id}_${m.id}_${loser.id}`;
          if (!seenNewsIds.has(thirdRaceNewsId)) {
            seenNewsIds.add(thirdRaceNewsId);
            newsItems.push({
              newsId: thirdRaceNewsId,
              tournamentId: t.id,
              tournamentName: t.name,
              gameId: t.gameId,
              gameName: t.gameName,
              gameCategory: t.gameCategory,
              matchId: m.id,
              matchNumber: m.matchNumber,
              round: m.round,
              roundName: m.roundName || 'Semifinal',
              eventType: 'THIRD_PLACE_RACE',
              title: '🥉 3RD PLACE MATCH QUALIFICATION',
              headline: `${loser.name} moves to 3rd Place Match`,
              description: `Following the semifinal match against ${winner.name}, ${loser.name} will compete in the official 3rd Place playoff.`,
              priority: 75,
              teamA: {
                id: loser.id,
                name: loser.name,
                tag: loser.tag,
                avatarUrl: loser.avatarUrl,
              },
              nextRoundName: '3rd Place Match',
              nextMatchId: thirdPlaceMatch?.id,
              nextMatchScheduledAt: thirdPlaceMatch?.scheduledTime,
              approvedAt: m.adminApprovedAt || m.completedAt || m.updatedAt,
              timestamp: m.adminApprovedAt || m.completedAt || m.updatedAt || Date.now(),
              isSemiFinal: true,
            });
          }
        }
      }

      // 2E. UPCOMING / NEXT MATCH (Priority: 70 for Final, 65 for 3rd Place, 60 for other rounds)
      const isUpcoming =
        (m.status === 'SCHEDULED' || m.status === 'READY') &&
        pA &&
        pB &&
        !m.winnerId;

      if (isUpcoming) {
        const upcomingNewsId = `news_upcoming_${t.id}_${m.id}`;
        if (!seenNewsIds.has(upcomingNewsId)) {
          seenNewsIds.add(upcomingNewsId);
          const priority = isFinal ? 70 : (isThirdPlaceMatch ? 65 : 60);
          const title = isFinal
            ? '🏆 UPCOMING GRAND FINAL'
            : isThirdPlaceMatch
            ? '🥉 UPCOMING 3RD PLACE MATCH'
            : '⚔️ NEXT MATCH IN THE ARENA';

          newsItems.push({
            newsId: upcomingNewsId,
            tournamentId: t.id,
            tournamentName: t.name,
            gameId: t.gameId,
            gameName: t.gameName,
            gameCategory: t.gameCategory,
            matchId: m.id,
            matchNumber: m.matchNumber,
            round: m.round,
            roundName: m.roundName || `Round ${m.round}`,
            eventType: 'UPCOMING_MATCH',
            title,
            headline: `${pA.name} vs ${pB.name}`,
            description: `${m.roundName || 'Next Match'} in ${t.name}. Countdown active. Both competitors ready for arena combat.`,
            priority,
            teamA: {
              id: pA.id,
              name: pA.name,
              tag: pA.tag,
              avatarUrl: pA.avatarUrl,
            },
            teamB: {
              id: pB.id,
              name: pB.name,
              tag: pB.tag,
              avatarUrl: pB.avatarUrl,
            },
            scheduledAt: m.scheduledTime || t.startDate,
            station: m.station,
            timestamp: m.scheduledTime || t.startDate || t.updatedAt || Date.now(),
            isChampionship: isFinal,
            isSemiFinal,
          });
        }
      }
    }

    // =========================================================================
    // 3. TOURNAMENT STARTED (Requirement #4)
    // When Admin officially starts the tournament, announce:
    // 🔴 TOURNAMENT STARTED
    // Show the existing official teams and their actual matchups.
    // Keep structure visible as it progresses.
    // =========================================================================
    const isTournamentStarted =
      (t.status === 'LIVE' || (t.status as string) === 'IN_PROGRESS' || Boolean(t.startedAt)) &&
      hasMatches &&
      !isCompleted;

    if (isTournamentStarted) {
      const startedNewsId = `news_started_${t.id}`;
      if (!seenNewsIds.has(startedNewsId)) {
        seenNewsIds.add(startedNewsId);

        const minRound = Math.min(...matches.map((m) => m.round || 1));
        const initialMatches = matches.filter((m) => (m.round || 1) === minRound);

        const matchStagesSummary = initialMatches.map((m, idx) => ({
          matchId: m.id,
          roundName: m.roundName || `Match ${idx + 1}`,
          teamAName: m.participantA?.name || m.participantAName || 'TBD',
          teamBName: m.participantB?.name || m.participantBName || (m.isBye ? 'BYE' : 'TBD'),
          scheduledTime: m.scheduledTime,
          station: m.station,
        }));

        newsItems.push({
          newsId: startedNewsId,
          tournamentId: t.id,
          tournamentName: t.name,
          gameId: t.gameId,
          gameName: t.gameName,
          gameCategory: t.gameCategory,
          eventType: 'TOURNAMENT_STARTED',
          title: '🔴 TOURNAMENT STARTED',
          headline: `${t.name.toUpperCase()} IS OFFICIALLY UNDERWAY!`,
          description: `Admin has officially commenced the tournament. Match play has started across the arena with ${participants.length} confirmed ${t.type === 'TEAM' ? 'teams' : 'players'}.`,
          priority: hasLiveMatch ? 72 : 88,
          confirmedCount,
          maxParticipants,
          prizePool: t.prizePool,
          entryFee: t.entryFee,
          location: t.location,
          tournamentDate: t.startDate,
          tournamentType: t.type,
          matchStagesSummary,
          timestamp: t.startedAt || t.updatedAt || Date.now(),
        });
      }
    }

    // =========================================================================
    // 4. OFFICIAL TOURNAMENT MATCH STAGES (Requirement #3)
    // Once registration is closed and Admin performs the official random shuffle/draw:
    // Automatically replace the registration news with:
    // ⚔️ OFFICIAL TOURNAMENT MATCH STAGES
    // Display actual teams randomly paired by Admin's shuffle.
    // Dynamically detect actual number of confirmed teams (4 -> 2 matches, 8 -> 4, 16 -> 8, etc.)
    // Priority: 85 (or 65 if matches in progress)
    // =========================================================================
    if (hasMatches && participants.length >= 2 && !isCompleted) {
      const stagesNewsId = `news_stages_${t.id}`;
      if (!seenNewsIds.has(stagesNewsId)) {
        seenNewsIds.add(stagesNewsId);

        // Detect all first-round matches from Admin's shuffle
        const minRound = Math.min(...matches.map((m) => m.round || 1));
        const initialMatches = matches.filter((m) => (m.round || 1) === minRound);

        const matchStagesSummary = initialMatches.map((m, idx) => ({
          matchId: m.id,
          roundName: m.roundName || `Match ${idx + 1}`,
          teamAName: m.participantA?.name || m.participantAName || 'TBD',
          teamBName: m.participantB?.name || m.participantBName || (m.isBye ? 'BYE' : 'TBD'),
          scheduledTime: m.scheduledTime,
          station: m.station,
        }));

        // If no matches have started yet, prioritize high (85) so players see official bracket pairings
        const priority = hasLiveMatch || hasApprovedMatches || isTournamentStarted ? 65 : 85;

        newsItems.push({
          newsId: stagesNewsId,
          tournamentId: t.id,
          tournamentName: t.name,
          gameId: t.gameId,
          gameName: t.gameName,
          gameCategory: t.gameCategory,
          eventType: 'OFFICIAL_MATCH_STAGES',
          title: '⚔️ OFFICIAL TOURNAMENT MATCH STAGES',
          headline: `Official match stages locked for ${t.name}`,
          description: `Admin has locked the official bracket stages for ${t.name} with ${participants.length} confirmed ${t.type === 'TEAM' ? 'teams' : 'players'}. Review the official drawn matchups below.`,
          priority,
          confirmedCount,
          maxParticipants,
          prizePool: t.prizePool,
          entryFee: t.entryFee,
          location: t.location,
          tournamentDate: t.startDate,
          tournamentType: t.type,
          matchStagesSummary,
          timestamp: t.updatedAt || t.createdAt || Date.now(),
        });
      }
    }

    // =========================================================================
    // 5. TOURNAMENT CREATED / REGISTRATION OPEN / BEFORE THE DRAW (Requirements #1 & #2)
    // As soon as Admin creates a tournament, announce:
    // 🏆 NEW TOURNAMENT
    // Show: Tournament name, Game, Tournament date, Start time, Prize,
    // Confirmed teams count / Max, Registration status, and [ JOIN TOURNAMENT ].
    // When registration is open and bracket is NOT generated yet, this has priority 95!
    // =========================================================================
    const announcementNewsId = `news_announce_${t.id}`;
    if (!seenNewsIds.has(announcementNewsId)) {
      seenNewsIds.add(announcementNewsId);

      const announcePriority = isCompleted
        ? 30
        : isRegistrationOpen && !hasMatches
        ? 95
        : 55;

      const dateStr = t.startDate
        ? new Date(t.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'Date TBD';

      const timeStr = t.startDate
        ? new Date(t.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '18:00';

      const headlineText = `🏆 ${t.name.toUpperCase()}`;

      const descText = `${t.gameName} • 📅 ${dateStr} • ⏰ ${timeStr} • 👥 ${confirmedCount}/${maxParticipants} ${t.type === 'TEAM' ? 'Teams' : 'Players'} Confirmed • 🏆 Prize: ${t.prizePool || 'Official Trophy'}${t.entryFee ? ` • Entry: ${t.entryFee}` : ''}. Registration is ${isRegistrationOpen ? 'Open' : isCompleted ? 'Closed' : 'Upcoming'}.`;

      newsItems.push({
        newsId: announcementNewsId,
        tournamentId: t.id,
        tournamentName: t.name,
        gameId: t.gameId,
        gameName: t.gameName,
        gameCategory: t.gameCategory,
        eventType: 'TOURNAMENT_ANNOUNCEMENT',
        title: isRegistrationOpen ? '🏆 NEW TOURNAMENT' : '📢 OFFICIAL ARENA TOURNAMENT',
        headline: headlineText,
        description: descText,
        priority: announcePriority,
        registrationStatus: isRegistrationOpen ? 'OPEN' : isCompleted ? 'CLOSED' : 'UPCOMING',
        confirmedCount,
        maxParticipants,
        prizePool: t.prizePool,
        entryFee: t.entryFee,
        location: t.location,
        tournamentDate: t.startDate,
        tournamentType: t.type,
        timestamp: t.createdAt || t.updatedAt || Date.now(),
      });
    }
  }

  // =========================================================================
  // SORTING LOGIC:
  // 1. Priority desc:
  //    - CHAMPION (100)
  //    - REGISTRATION OPEN (95, when newly created & open)
  //    - LIVE MATCH (90)
  //    - OFFICIAL MATCH STAGES (85, when drawn & upcoming)
  //    - QUALIFIED RESULT (80)
  //    - 3RD PLACE RACE (75)
  //    - UPCOMING FINAL (70)
  //    - STAGES SUMMARY (65)
  //    - UPCOMING OTHER (60)
  //    - ANNOUNCEMENT ARCHIVE (55)
  //    - RESULT PENDING (50)
  //    - DRAW (40)
  //    - COMPLETED ANNOUNCEMENT (30)
  // 2. Timestamp desc (most recent first)
  // =========================================================================
  return newsItems.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.timestamp - a.timestamp;
  });
}

/**
 * Real-time subscription to Arena Tournament News.
 * Automatically synchronizes with all active tournament collections.
 */
export function subscribeToArenaTournamentNews(callback: (items: ArenaNewsItem[]) => void): () => void {
  return subscribeToAllTournaments((tournaments) => {
    const news = deriveArenaNewsFromTournaments(tournaments);
    callback(news);
  });
}
