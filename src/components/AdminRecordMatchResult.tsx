import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  SUPPORTED_MANUAL_GAMES,
  ManualMatchGameConfig,
  ManualResultParticipant,
  fetchRegisteredPlayersForSelection,
  calculateAuthoritativeMatchReward,
  previewManualMatchRatings,
  recordManualMatchResult,
  correctManualMatchResult,
  subscribeToOfficialMatchResults,
} from '../services/manualMatchResultService';
import { getActiveSeason } from '../services/seasonService';
import { OfficialMatchResult } from '../types';
import {
  Swords,
  Trophy,
  Shield,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Users,
  Coins,
  Clock,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  X,
  Loader2,
  ChevronDown,
  UserCheck,
} from 'lucide-react';

export const AdminRecordMatchResult: React.FC = () => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin } = useAuth();
  const canRecord = Boolean(isStaff || isAdmin || isSuperAdmin);
  const canCorrect = Boolean(isAdmin || isSuperAdmin);

  // Registered players roster for selection
  const [players, setPlayers] = useState<ManualResultParticipant[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  // Active view: 'RECORD' | 'HISTORY'
  const [viewTab, setViewTab] = useState<'RECORD' | 'HISTORY'>('RECORD');

  // Form State
  const [selectedGameId, setSelectedGameId] = useState<string>('chess');
  const activeGame = useMemo(
    () => SUPPORTED_MANUAL_GAMES.find((g) => g.id === selectedGameId) || SUPPORTED_MANUAL_GAMES[0],
    [selectedGameId]
  );

  // 1v1 Participants
  const [playerA, setPlayerA] = useState<ManualResultParticipant | null>(null);
  const [playerB, setPlayerB] = useState<ManualResultParticipant | null>(null);
  const [playerARating, setPlayerARating] = useState<number>(1000);
  const [playerBRating, setPlayerBRating] = useState<number>(1000);
  const [searchPlayerA, setSearchPlayerA] = useState('');
  const [searchPlayerB, setSearchPlayerB] = useState('');
  const [openDropdownA, setOpenDropdownA] = useState(false);
  const [openDropdownB, setOpenDropdownB] = useState(false);

  // Active Season
  const [activeSeason, setActiveSeason] = useState<{ id: string; number: number; name: string } | null>(null);

  // 1v1 Chess Outcome
  const [chessOutcome, setChessOutcome] = useState<'playerA' | 'playerB' | 'draw'>('playerA');

  // 1v1 FC Series Scores (defaults to canonical Example 1: 4 wins / 2 losses = 6 games = 360 NC)
  const [fcPlayerAWins, setFcPlayerAWins] = useState<number>(4);
  const [fcPlayerALosses, setFcPlayerALosses] = useState<number>(2);
  const [fcPlayerBWins, setFcPlayerBWins] = useState<number>(2);
  const [fcPlayerBLosses, setFcPlayerBLosses] = useState<number>(4);

  // 5v5 Team Participants
  const [teamAPlayers, setTeamAPlayers] = useState<ManualResultParticipant[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<ManualResultParticipant[]>([]);
  const [teamAName, setTeamAName] = useState('Team Alpha');
  const [teamATag, setTeamATag] = useState('ALP');
  const [teamBName, setTeamBName] = useState('Team Omega');
  const [teamBTag, setTeamBTag] = useState('OMG');
  const [matchGameCount, setMatchGameCount] = useState<number | string>(1);
  const [teamAPlayerRatings, setTeamAPlayerRatings] = useState<{ uid: string; rating: number; gamerTag?: string }[]>([]);
  const [teamBPlayerRatings, setTeamBPlayerRatings] = useState<{ uid: string; rating: number; gamerTag?: string }[]>([]);
  const [teamOutcome, setTeamOutcome] = useState<'teamA' | 'teamB' | 'draw'>('teamA');
  const [matchHours, setMatchHours] = useState<number>(1);
  const [searchTeamA, setSearchTeamA] = useState('');
  const [searchTeamB, setSearchTeamB] = useState('');

  // Operator Notes & Idempotency
  const [operatorNotes, setOperatorNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<OfficialMatchResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Official Match History
  const [historyResults, setHistoryResults] = useState<OfficialMatchResult[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyGameFilter, setHistoryGameFilter] = useState('ALL');

  // Correction Modal State (Admins / SuperAdmin only)
  const [correctingResult, setCorrectingResult] = useState<OfficialMatchResult | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionOutcome, setCorrectionOutcome] = useState<'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB'>('playerA');
  const [correctingLoading, setCorrectingLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Load registered players
  useEffect(() => {
    fetchRegisteredPlayersForSelection()
      .then((list) => {
        setPlayers(list);
        setLoadingPlayers(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingPlayers(false);
      });
  }, []);

  // Subscribe to official match results
  useEffect(() => {
    const unsub = subscribeToOfficialMatchResults((list) => {
      setHistoryResults(list);
    });
    return () => unsub();
  }, []);

  // Fetch active season
  useEffect(() => {
    getActiveSeason().then((s) => {
      if (s) setActiveSeason({ id: s.id, number: s.number, name: s.name });
    }).catch(console.error);
  }, []);

  // Fetch Player A Current MMR
  useEffect(() => {
    if (!playerA) {
      setPlayerARating(1000);
      return;
    }
    const rRef = doc(db, 'playerGameRatings', `${playerA.uid}_${activeGame.id}`);
    getDoc(rRef).then((snap) => {
      if (snap.exists()) {
        setPlayerARating(snap.data()?.rating ?? 1000);
      } else {
        setPlayerARating(1000);
      }
    }).catch(() => setPlayerARating(1000));
  }, [playerA, activeGame.id]);

  // Fetch Player B Current MMR
  useEffect(() => {
    if (!playerB) {
      setPlayerBRating(1000);
      return;
    }
    const rRef = doc(db, 'playerGameRatings', `${playerB.uid}_${activeGame.id}`);
    getDoc(rRef).then((snap) => {
      if (snap.exists()) {
        setPlayerBRating(snap.data()?.rating ?? 1000);
      } else {
        setPlayerBRating(1000);
      }
    }).catch(() => setPlayerBRating(1000));
  }, [playerB, activeGame.id]);

  // Auto-sync FC opponent score helper
  const handleAutoSyncFcScores = (aWins: number, aLosses: number) => {
    setFcPlayerAWins(aWins);
    setFcPlayerALosses(aLosses);
    setFcPlayerBWins(aLosses);
    setFcPlayerBLosses(aWins);
  };

  // Live reward calculation
  const liveCalculation = useMemo(() => {
    const isFc = activeGame.id === 'fc26' || activeGame.id === 'fc27';

    let effOutcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB' = 'playerA';
    if (activeGame.id === 'chess') {
      effOutcome = chessOutcome;
    } else if (isFc) {
      if (fcPlayerAWins > fcPlayerBWins) effOutcome = 'playerA';
      else if (fcPlayerBWins > fcPlayerAWins) effOutcome = 'playerB';
      else effOutcome = 'draw';
    } else {
      effOutcome = teamOutcome;
    }

    return calculateAuthoritativeMatchReward({
      gameId: activeGame.id,
      outcome: effOutcome,
      playerAWins: isFc ? fcPlayerAWins : undefined,
      playerALosses: isFc ? fcPlayerALosses : undefined,
      playerBWins: isFc ? fcPlayerBWins : undefined,
      playerBLosses: isFc ? fcPlayerBLosses : undefined,
      playerAId: playerA?.uid,
      playerBId: playerB?.uid,
      teamAPlayerIds: teamAPlayers.map((p) => p.uid),
      teamBPlayerIds: teamBPlayers.map((p) => p.uid),
      teamAName: teamAName.trim(),
      teamATag: teamATag.trim(),
      teamBName: teamBName.trim(),
      teamBTag: teamBTag.trim(),
      officialHours: activeGame.format === '5v5' ? matchHours : undefined,
    });
  }, [
    activeGame,
    chessOutcome,
    fcPlayerAWins,
    fcPlayerALosses,
    fcPlayerBWins,
    fcPlayerBLosses,
    teamOutcome,
    matchHours,
    playerA,
    playerB,
    teamAPlayers,
    teamBPlayers,
    teamAName,
    teamATag,
    teamBName,
    teamBTag,
  ]);

  // Live MMR calculation
  const liveMMR = useMemo(() => {
    const isFc = activeGame.id === 'fc26' || activeGame.id === 'fc27';
    let effOutcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB' = 'playerA';
    if (activeGame.id === 'chess') effOutcome = chessOutcome;
    else if (isFc) {
      effOutcome = fcPlayerAWins > fcPlayerBWins ? 'playerA' : fcPlayerBWins > fcPlayerAWins ? 'playerB' : 'draw';
    } else {
      effOutcome = teamOutcome;
    }

    return previewManualMatchRatings({
      gameId: activeGame.id,
      outcome: effOutcome,
      playerARating,
      playerBRating,
      playerAWins: isFc ? fcPlayerAWins : undefined,
      playerALosses: isFc ? fcPlayerALosses : undefined,
      playerBWins: isFc ? fcPlayerBWins : undefined,
      playerBLosses: isFc ? fcPlayerBLosses : undefined,
      teamAPlayerRatings,
      teamBPlayerRatings,
    });
  }, [
    activeGame,
    chessOutcome,
    fcPlayerAWins,
    fcPlayerALosses,
    fcPlayerBWins,
    fcPlayerBLosses,
    teamOutcome,
    playerARating,
    playerBRating,
    teamAPlayerRatings,
    teamBPlayerRatings,
  ]);

  // Filtered player lists for dropdown search
  const filteredPlayersA = useMemo(() => {
    const q = searchPlayerA.toLowerCase().trim();
    return players
      .filter((p) => p.uid !== playerB?.uid)
      .filter((p) => !q || p.gamerTag.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [players, searchPlayerA, playerB]);

  const filteredPlayersB = useMemo(() => {
    const q = searchPlayerB.toLowerCase().trim();
    return players
      .filter((p) => p.uid !== playerA?.uid)
      .filter((p) => !q || p.gamerTag.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [players, searchPlayerB, playerA]);

  // Handle Submit Official Result (Opens Confirmation Modal)
  const handleSubmitResult = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canRecord) return;
    setSubmissionError(null);

    // Validation
    if (activeGame.format === '1v1') {
      if (!playerA || !playerB) {
        setSubmissionError('Please select both Player A and Player B.');
        return;
      }
      if (playerA.uid === playerB.uid) {
        setSubmissionError('Player A and Player B cannot be the same registered player.');
        return;
      }
    } else {
      if (teamAPlayers.length !== 5 || teamBPlayers.length !== 5) {
        setSubmissionError('5v5 matches require exactly 5 players for Team A and exactly 5 players for Team B (10 unique players total).');
        return;
      }
      if (!teamAName.trim() || !teamATag.trim()) {
        setSubmissionError('Team A Name and Team A Tag are required.');
        return;
      }
      if (!teamBName.trim() || !teamBTag.trim()) {
        setSubmissionError('Team B Name and Team B Tag are required.');
        return;
      }
      const setA = new Set(teamAPlayers.map((p) => p.uid));
      for (const p of teamBPlayers) {
        if (setA.has(p.uid)) {
          setSubmissionError(`Player ${p.gamerTag} cannot be on both Team A and Team B simultaneously.`);
          return;
        }
      }
    }

    if (!liveCalculation.valid) {
      setSubmissionError(liveCalculation.error || 'Invalid match result parameters.');
      return;
    }

    setShowConfirmModal(true);
  };

  // Authoritative validation execution
  const handleExecuteValidation = async () => {
    if (!user || !canRecord) return;
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const isFc = activeGame.id === 'fc26' || activeGame.id === 'fc27';
      let effOutcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB' = 'playerA';
      if (activeGame.id === 'chess') effOutcome = chessOutcome;
      else if (isFc) {
        effOutcome = fcPlayerAWins > fcPlayerBWins ? 'playerA' : fcPlayerBWins > fcPlayerAWins ? 'playerB' : 'draw';
      } else {
        effOutcome = teamOutcome;
      }

      const res = await recordManualMatchResult(
        {
          gameId: activeGame.id,
          gameName: activeGame.name,
          matchFormat: activeGame.format,
          playerA: playerA || undefined,
          playerB: playerB || undefined,
          playerAWins: isFc ? fcPlayerAWins : undefined,
          playerALosses: isFc ? fcPlayerALosses : undefined,
          playerBWins: isFc ? fcPlayerBWins : undefined,
          playerBLosses: isFc ? fcPlayerBLosses : undefined,
          outcome: effOutcome,
          teamAPlayers: activeGame.format === '5v5' ? teamAPlayers : undefined,
          teamBPlayers: activeGame.format === '5v5' ? teamBPlayers : undefined,
          teamAName: activeGame.format === '5v5' ? teamAName.trim() : undefined,
          teamATag: activeGame.format === '5v5' ? teamATag.trim() : undefined,
          teamBName: activeGame.format === '5v5' ? teamBName.trim() : undefined,
          teamBTag: activeGame.format === '5v5' ? teamBTag.trim() : undefined,
          gameCount: activeGame.format === '5v5' ? matchGameCount : undefined,
          officialHours: activeGame.format === '5v5' ? matchHours : undefined,
          notes: operatorNotes,
        },
        user.uid
      );

      if (res.success && res.officialResult) {
        setSuccessReceipt(res.officialResult);
        setShowConfirmModal(false);
        // Reset form
        setPlayerA(null);
        setPlayerB(null);
        setTeamAPlayers([]);
        setTeamBPlayers([]);
        setOperatorNotes('');
      } else {
        setSubmissionError(res.error || 'Failed to record official match result.');
      }
    } catch (err: any) {
      console.error(err);
      setSubmissionError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Correction Modal Open
  const handleOpenCorrection = (record: OfficialMatchResult) => {
    if (!canCorrect) return;
    setCorrectingResult(record);
    setCorrectionReason('');
    setCorrectionOutcome(record.outcome || 'playerA');
    setCorrectionError(null);
  };

  // Submit Correction
  const handleSubmitCorrection = async () => {
    if (!user || !canCorrect || !correctingResult) return;
    if (!correctionReason.trim()) {
      setCorrectionError('A detailed correction reason is required for privileged auditing.');
      return;
    }

    setCorrectingLoading(true);
    setCorrectionError(null);

    try {
      const res = await correctManualMatchResult({
        originalResultId: correctingResult.id,
        adminUid: user.uid,
        correctionReason: correctionReason.trim(),
        newOutcome: correctionOutcome,
      });

      if (res.success) {
        setCorrectingResult(null);
      } else {
        setCorrectionError(res.error || 'Failed to submit correction.');
      }
    } catch (err: any) {
      setCorrectionError(err.message || 'An unexpected error occurred during correction.');
    } finally {
      setCorrectingLoading(false);
    }
  };

  // Filtered history list
  const filteredHistory = useMemo(() => {
    return historyResults.filter((item) => {
      if (historyGameFilter !== 'ALL' && item.gameId !== historyGameFilter) return false;
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        item.gameName.toLowerCase().includes(q) ||
        (item.playerAGamerTag && item.playerAGamerTag.toLowerCase().includes(q)) ||
        (item.playerBGamerTag && item.playerBGamerTag.toLowerCase().includes(q)) ||
        (item.winnerGamerTag && item.winnerGamerTag.toLowerCase().includes(q)) ||
        (item.recordedByName && item.recordedByName.toLowerCase().includes(q))
      );
    });
  }, [historyResults, historyGameFilter, historySearch]);

  if (!canRecord) {
    return (
      <div className="p-8 rounded-2xl bg-neutral-900 border border-neutral-800 text-center space-y-3">
        <Shield className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold uppercase text-white">Access Restricted</h2>
        <p className="text-neutral-400 text-sm max-w-md mx-auto">
          Official match result recording is restricted strictly to authorized Nexus Staff, Administrators, and Super Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-500/30">
              Nexus Staff Desk
            </span>
            <span className="text-xs font-mono text-neutral-400">Official Recording Engine</span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white mt-1 flex items-center gap-2.5">
            <Swords className="w-6 h-6 text-red-500" />
            <span>Record Match Result</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Players play in the arena first. Staff enters verified outcomes; canonical rewards are calculated automatically.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-xl border border-neutral-800">
          <button
            onClick={() => setViewTab('RECORD')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewTab === 'RECORD'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Entry Terminal
          </button>
          <button
            onClick={() => setViewTab('HISTORY')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              viewTab === 'HISTORY'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            History &amp; Audits ({historyResults.length})
          </button>
        </div>
      </div>

      {viewTab === 'RECORD' && (
        <form onSubmit={handleSubmitResult} className="space-y-8">
          {/* STEP 1: GAME SELECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black">
                  1
                </span>
                <span>Select Competitive Title</span>
              </label>
              <span className="text-[11px] font-mono text-neutral-500">Supported Titles: {SUPPORTED_MANUAL_GAMES.length}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {SUPPORTED_MANUAL_GAMES.map((game) => {
                const isSelected = selectedGameId === game.id;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      setSelectedGameId(game.id);
                      setSubmissionError(null);
                    }}
                    className={`p-3.5 rounded-xl text-left transition-all border flex flex-col justify-between h-28 relative cursor-pointer ${
                      isSelected
                        ? 'bg-red-950/40 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                        : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{game.icon}</span>
                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800">
                        {game.format}
                      </span>
                    </div>

                    <div>
                      <div className={`text-sm font-black uppercase tracking-tight ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                        {game.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">{game.device}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Game Rule Info Banner */}
            <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-neutral-300">
                  <strong className="text-white uppercase mr-1">{activeGame.name}:</strong>
                  {activeGame.rewardRuleDescription}
                </span>
              </div>
              {!activeGame.hasCanonicalReward && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider shrink-0">
                  Undefined Reward
                </span>
              )}
            </div>
          </div>

          {/* STEP 2: PARTICIPANTS SELECTION */}
          {activeGame.format === '1v1' ? (
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black">
                  2
                </span>
                <span>Select 1v1 Registered Opponents</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* PLAYER A */}
                <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold uppercase text-red-400">Player A</span>
                    {playerA && (
                      <button
                        type="button"
                        onClick={() => setPlayerA(null)}
                        className="text-[10px] text-neutral-400 hover:text-rose-400"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {playerA ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center font-bold text-xs">
                          {playerA.gamerTag[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{playerA.gamerTag}</div>
                          <div className="text-[10px] text-neutral-400 font-mono truncate max-w-[180px]">UID: {playerA.uid}</div>
                        </div>
                      </div>
                      <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search GamerTag or Name..."
                        value={searchPlayerA}
                        onChange={(e) => {
                          setSearchPlayerA(e.target.value);
                          setOpenDropdownA(true);
                        }}
                        onFocus={() => setOpenDropdownA(true)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                      />
                      {openDropdownA && (
                        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-neutral-950 border border-neutral-800 shadow-2xl z-20">
                          {loadingPlayers ? (
                            <div className="p-3 text-xs text-neutral-400 text-center">Loading registered players...</div>
                          ) : filteredPlayersA.length === 0 ? (
                            <div className="p-3 text-xs text-neutral-400 text-center">No matching players found</div>
                          ) : (
                            filteredPlayersA.map((p) => (
                              <button
                                key={p.uid}
                                type="button"
                                onClick={() => {
                                  setPlayerA(p);
                                  setSearchPlayerA('');
                                  setOpenDropdownA(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-neutral-900 flex items-center justify-between text-xs border-b border-neutral-900 last:border-0 cursor-pointer"
                              >
                                <span className="font-bold text-white">{p.gamerTag}</span>
                                <span className="text-[10px] text-neutral-400 font-mono">{p.fullName}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PLAYER B */}
                <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold uppercase text-cyan-400">Player B</span>
                    {playerB && (
                      <button
                        type="button"
                        onClick={() => setPlayerB(null)}
                        className="text-[10px] text-neutral-400 hover:text-rose-400"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {playerB ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs">
                          {playerB.gamerTag[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{playerB.gamerTag}</div>
                          <div className="text-[10px] text-neutral-400 font-mono truncate max-w-[180px]">UID: {playerB.uid}</div>
                        </div>
                      </div>
                      <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search GamerTag or Name..."
                        value={searchPlayerB}
                        onChange={(e) => {
                          setSearchPlayerB(e.target.value);
                          setOpenDropdownB(true);
                        }}
                        onFocus={() => setOpenDropdownB(true)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                      />
                      {openDropdownB && (
                        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-neutral-950 border border-neutral-800 shadow-2xl z-20">
                          {loadingPlayers ? (
                            <div className="p-3 text-xs text-neutral-400 text-center">Loading registered players...</div>
                          ) : filteredPlayersB.length === 0 ? (
                            <div className="p-3 text-xs text-neutral-400 text-center">No matching players found</div>
                          ) : (
                            filteredPlayersB.map((p) => (
                              <button
                                key={p.uid}
                                type="button"
                                onClick={() => {
                                  setPlayerB(p);
                                  setSearchPlayerB('');
                                  setOpenDropdownB(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-neutral-900 flex items-center justify-between text-xs border-b border-neutral-900 last:border-0 cursor-pointer"
                              >
                                <span className="font-bold text-white">{p.gamerTag}</span>
                                <span className="text-[10px] text-neutral-400 font-mono">{p.fullName}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 5v5 TEAM PARTICIPANTS SELECTION */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black">
                    2
                  </span>
                  <span>5v5 Team Rosters (Exactly 5 Players Per Team • 10 Unique Total)</span>
                </label>
                <div className="text-[11px] font-mono text-neutral-400">
                  Total Players: <strong className={teamAPlayers.length + teamBPlayers.length === 10 ? 'text-emerald-400' : 'text-amber-400'}>{teamAPlayers.length + teamBPlayers.length}/10</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* TEAM A */}
                <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-mono font-black uppercase text-red-400 flex items-center gap-1.5">
                      <span>🛡️</span>
                      <span>Team A Configuration</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      teamAPlayers.length === 5
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {teamAPlayers.length}/5 Players
                    </span>
                  </div>

                  {/* Team A Name & Tag Inputs */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono uppercase text-neutral-400 block mb-1">Team A Name *</label>
                      <input
                        type="text"
                        value={teamAName}
                        onChange={(e) => setTeamAName(e.target.value)}
                        placeholder="e.g. Team Alpha"
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-red-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-neutral-400 block mb-1">Tag *</label>
                      <input
                        type="text"
                        value={teamATag}
                        maxLength={5}
                        onChange={(e) => setTeamATag(e.target.value.toUpperCase())}
                        placeholder="ALP"
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-red-500 font-mono font-bold uppercase text-center"
                      />
                    </div>
                  </div>

                  {/* Team A Roster List */}
                  <div className="space-y-1.5 min-h-[140px]">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block">Participating Roster (5 Players)</span>
                    {teamAPlayers.map((p, idx) => (
                      <div key={p.uid} className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-850 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-5 h-5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] font-mono font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate">{p.gamerTag}</span>
                          <span className="text-[10px] text-neutral-500 font-mono truncate">({p.fullName || p.uid.slice(0, 8)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTeamAPlayers(teamAPlayers.filter((tp) => tp.uid !== p.uid))}
                          className="text-neutral-500 hover:text-rose-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {teamAPlayers.length === 0 && (
                      <div className="p-6 text-center text-xs text-neutral-500 italic bg-neutral-950/50 rounded-lg border border-neutral-900">
                        No players added to {teamAName} yet. Select 5 players below.
                      </div>
                    )}
                  </div>

                  {teamAPlayers.length < 5 && (
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder="Search player to add to Team A..."
                        value={searchTeamA}
                        onChange={(e) => setSearchTeamA(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                      />
                      {searchTeamA && (
                        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-neutral-950 border border-neutral-800 text-xs shadow-xl z-10">
                          {players
                            .filter((p) => !teamAPlayers.some((tp) => tp.uid === p.uid) && !teamBPlayers.some((tp) => tp.uid === p.uid))
                            .filter((p) => p.gamerTag.toLowerCase().includes(searchTeamA.toLowerCase()) || (p.fullName && p.fullName.toLowerCase().includes(searchTeamA.toLowerCase())))
                            .slice(0, 6)
                            .map((p) => (
                              <button
                                key={p.uid}
                                type="button"
                                onClick={() => {
                                  setTeamAPlayers([...teamAPlayers, p]);
                                  setSearchTeamA('');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-neutral-900 text-white flex justify-between items-center cursor-pointer border-b border-neutral-900 last:border-0"
                              >
                                <span className="font-bold">{p.gamerTag} <span className="text-[10px] text-neutral-500 font-normal">({p.fullName})</span></span>
                                <span className="text-red-400 font-mono text-[11px] font-bold">+ Add</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* TEAM B */}
                <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-mono font-black uppercase text-cyan-400 flex items-center gap-1.5">
                      <span>⚔️</span>
                      <span>Team B Configuration</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      teamBPlayers.length === 5
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {teamBPlayers.length}/5 Players
                    </span>
                  </div>

                  {/* Team B Name & Tag Inputs */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono uppercase text-neutral-400 block mb-1">Team B Name *</label>
                      <input
                        type="text"
                        value={teamBName}
                        onChange={(e) => setTeamBName(e.target.value)}
                        placeholder="e.g. Team Omega"
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-neutral-400 block mb-1">Tag *</label>
                      <input
                        type="text"
                        value={teamBTag}
                        maxLength={5}
                        onChange={(e) => setTeamBTag(e.target.value.toUpperCase())}
                        placeholder="OMG"
                        className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono font-bold uppercase text-center"
                      />
                    </div>
                  </div>

                  {/* Team B Roster List */}
                  <div className="space-y-1.5 min-h-[140px]">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block">Participating Roster (5 Players)</span>
                    {teamBPlayers.map((p, idx) => (
                      <div key={p.uid} className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-850 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-5 h-5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] font-mono font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white truncate">{p.gamerTag}</span>
                          <span className="text-[10px] text-neutral-500 font-mono truncate">({p.fullName || p.uid.slice(0, 8)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTeamBPlayers(teamBPlayers.filter((tp) => tp.uid !== p.uid))}
                          className="text-neutral-500 hover:text-rose-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {teamBPlayers.length === 0 && (
                      <div className="p-6 text-center text-xs text-neutral-500 italic bg-neutral-950/50 rounded-lg border border-neutral-900">
                        No players added to {teamBName} yet. Select 5 players below.
                      </div>
                    )}
                  </div>

                  {teamBPlayers.length < 5 && (
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder="Search player to add to Team B..."
                        value={searchTeamB}
                        onChange={(e) => setSearchTeamB(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                      {searchTeamB && (
                        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-neutral-950 border border-neutral-800 text-xs shadow-xl z-10">
                          {players
                            .filter((p) => !teamBPlayers.some((tp) => tp.uid === p.uid) && !teamAPlayers.some((tp) => tp.uid === p.uid))
                            .filter((p) => p.gamerTag.toLowerCase().includes(searchTeamB.toLowerCase()) || (p.fullName && p.fullName.toLowerCase().includes(searchTeamB.toLowerCase())))
                            .slice(0, 6)
                            .map((p) => (
                              <button
                                key={p.uid}
                                type="button"
                                onClick={() => {
                                  setTeamBPlayers([...teamBPlayers, p]);
                                  setSearchTeamB('');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-neutral-900 text-white flex justify-between items-center cursor-pointer border-b border-neutral-900 last:border-0"
                              >
                                <span className="font-bold">{p.gamerTag} <span className="text-[10px] text-neutral-500 font-normal">({p.fullName})</span></span>
                                <span className="text-cyan-400 font-mono text-[11px] font-bold">+ Add</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Match/Game Count Input */}
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white uppercase block">Match / Game Count</span>
                  <span className="text-[10px] font-mono text-neutral-400">e.g. Best of 1, Match 1, Map 1</span>
                </div>
                <input
                  type="text"
                  value={matchGameCount}
                  onChange={(e) => setMatchGameCount(e.target.value)}
                  placeholder="1"
                  className="w-24 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white font-mono font-bold text-center"
                />
              </div>
            </div>
          )}

          {/* STEP 3: OUTCOME & SCORE ENTRY */}
          <div className="space-y-4">
            <label className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black">
                3
              </span>
              <span>Outcome &amp; Score Validation</span>
            </label>

            {/* CHESS OUTCOME */}
            {activeGame.id === 'chess' && (
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setChessOutcome('playerA')}
                  className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                    chessOutcome === 'playerA'
                      ? 'bg-red-600 text-white border-red-500 shadow-md font-black'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  <div>{playerA?.gamerTag || 'Player A'} WIN</div>
                  <div className="text-[10px] opacity-80 mt-1 font-mono">+2 NC to Winner</div>
                </button>

                <button
                  type="button"
                  onClick={() => setChessOutcome('draw')}
                  className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                    chessOutcome === 'draw'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md font-black'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  <div>DRAW (STALEMATE)</div>
                  <div className="text-[10px] opacity-80 mt-1 font-mono">+1 NC to EACH</div>
                </button>

                <button
                  type="button"
                  onClick={() => setChessOutcome('playerB')}
                  className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                    chessOutcome === 'playerB'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow-md font-black'
                      : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  <div>{playerB?.gamerTag || 'Player B'} WIN</div>
                  <div className="text-[10px] opacity-80 mt-1 font-mono">+2 NC to Winner</div>
                </button>
              </div>
            )}

            {/* FC 26 / FC 27 SERIES SCORES */}
            {(activeGame.id === 'fc26' || activeGame.id === 'fc27') && (
              <div className="p-5 rounded-2xl bg-neutral-900/70 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white uppercase">FC Series Games Record</span>
                  <button
                    type="button"
                    onClick={() => handleAutoSyncFcScores(fcPlayerAWins, fcPlayerALosses)}
                    className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Auto-Balance Opponent Scores</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Player A Score Inputs */}
                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                    <span className="text-xs font-bold text-red-400 font-mono">{playerA?.gamerTag || 'Player A'} Series Record:</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-mono">Games Won</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={fcPlayerAWins}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFcPlayerAWins(val);
                            setFcPlayerBLosses(val); // mirror
                          }}
                          className="w-full mt-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white font-mono text-base font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-mono">Games Lost</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={fcPlayerALosses}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFcPlayerALosses(val);
                            setFcPlayerBWins(val); // mirror
                          }}
                          className="w-full mt-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white font-mono text-base font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Player B Score Inputs */}
                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                    <span className="text-xs font-bold text-cyan-400 font-mono">{playerB?.gamerTag || 'Player B'} Series Record:</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-mono">Games Won</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={fcPlayerBWins}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFcPlayerBWins(val);
                            setFcPlayerALosses(val); // mirror
                          }}
                          className="w-full mt-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white font-mono text-base font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-mono">Games Lost</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={fcPlayerBLosses}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFcPlayerBLosses(val);
                            setFcPlayerAWins(val); // mirror
                          }}
                          className="w-full mt-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white font-mono text-base font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TEAM OUTCOME (VALORANT / CS2 / LOL) */}
            {activeGame.format === '5v5' && (
              <div className="space-y-4">
                {/* 5v5 Match Duration Input */}
                <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-white uppercase block">
                        ⏱️ Match Duration (Hours)
                      </span>
                      <span className="text-[11px] font-mono text-neutral-400">
                        Rule: Winning Team = 90 NC/hr/player • Losing Team = 30 NC/hr/player
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0.5, 1, 1.5, 2].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setMatchHours(preset)}
                          className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                            matchHours === preset
                              ? 'bg-amber-600 text-white shadow-sm'
                              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {preset}h
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0.25}
                      max={24}
                      step={0.25}
                      value={matchHours}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          setMatchHours(val);
                        }
                      }}
                      className="w-32 px-3 py-2 rounded bg-neutral-950 border border-neutral-800 text-white font-mono text-base font-bold"
                    />
                    <div className="text-xs font-mono text-neutral-300">
                      <span>Rate for {matchHours}h: </span>
                      <span className="text-emerald-400 font-bold">Winner +{Math.round(90 * matchHours)} NC</span>
                      <span className="text-neutral-500"> / </span>
                      <span className="text-amber-400 font-bold">Loser +{Math.round(30 * matchHours)} NC</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(() => {
                    const winNC = Math.round(90 * matchHours);
                    const loseNC = Math.round(30 * matchHours);
                    const drawNC = Math.round(45 * matchHours);
                    const tACount = teamAPlayers.length || 5;
                    const tBCount = teamBPlayers.length || 5;
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setTeamOutcome('teamA')}
                          className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                            teamOutcome === 'teamA'
                              ? 'bg-red-600 text-white border-red-500 shadow-md font-black'
                              : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                          }`}
                        >
                          <div>{teamAName} [{teamATag}] WIN</div>
                          <div className="text-[11px] text-amber-200 mt-1 font-mono font-bold">
                            🏆 {teamAName}: +{winNC} NC each ({winNC * tACount} NC squad)
                          </div>
                          <div className="text-[10px] opacity-80 font-mono">
                            ❌ {teamBName}: +{loseNC} NC each ({loseNC * tBCount} NC squad)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTeamOutcome('draw')}
                          className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                            teamOutcome === 'draw'
                              ? 'bg-amber-600 text-white border-amber-500 shadow-md font-black'
                              : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                          }`}
                        >
                          <div>MATCH DRAW</div>
                          <div className="text-[11px] text-amber-200 mt-1 font-mono font-bold">
                            🤝 Both Teams: +{drawNC} NC each
                          </div>
                          <div className="text-[10px] opacity-80 font-mono">
                            {drawNC * tACount} NC / squad ({matchHours}h @ 45 NC/hr)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTeamOutcome('teamB')}
                          className={`p-4 rounded-xl border text-center font-bold text-xs uppercase transition-all cursor-pointer ${
                            teamOutcome === 'teamB'
                              ? 'bg-cyan-600 text-white border-cyan-500 shadow-md font-black'
                              : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900'
                          }`}
                        >
                          <div>{teamBName} [{teamBTag}] WIN</div>
                          <div className="text-[11px] text-amber-200 mt-1 font-mono font-bold">
                            🏆 {teamBName}: +{winNC} NC each ({winNC * tBCount} NC squad)
                          </div>
                          <div className="text-[10px] opacity-80 font-mono">
                            ❌ {teamAName}: +{loseNC} NC each ({loseNC * tACount} NC squad)
                          </div>
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* STEP 4: AUTHORITATIVE REWARD PREVIEW (READ-ONLY) */}
          <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4" />
                <span>Authoritative Reward Calculation (Immutable System Derivation)</span>
              </span>
              <span className="text-[11px] font-mono text-neutral-500">Operator manual override: BLOCKED</span>
            </div>

            {liveCalculation.valid ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
                  <div className="text-[10px] font-mono uppercase text-neutral-400">Derived Result</div>
                  <div className="text-base font-black text-white uppercase mt-0.5">{liveCalculation.overallWinnerSummary}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
                  <div className="text-[10px] font-mono uppercase text-neutral-400">Total Coins to Award</div>
                  <div className="text-xl font-mono font-black text-amber-400 mt-0.5">🪙 {liveCalculation.totalRewardAwarded} NC</div>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800">
                  <div className="text-[10px] font-mono uppercase text-neutral-400">Recipients</div>
                  <div className="text-sm font-bold text-white mt-0.5 font-mono">{liveCalculation.winnerUids.length} Winner(s)</div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{liveCalculation.error || 'Awaiting valid match configuration.'}</span>
              </div>
            )}

            {liveCalculation.rewardBreakdown && (
              <div className="text-xs font-mono text-neutral-400 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-850">
                Rule Formula: {liveCalculation.rewardBreakdown}
              </div>
            )}

            {/* SPECIALIZED FC SERIES PREVIEW (Matches Section 6 specification) */}
            {(activeGame.id === 'fc26' || activeGame.id === 'fc27') && liveCalculation.valid && (
              <div className="p-4 rounded-xl bg-neutral-900/90 border border-amber-500/30 space-y-3 font-mono">
                <div className="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
                  <span className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚽</span>
                    <span>FC Series Canonical Preview</span>
                  </span>
                  <span className="text-neutral-400 text-[11px]">(Total Games Played × 60 NC)</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-950 p-3 rounded-lg border border-neutral-850">
                  <div>
                    <span className="text-neutral-400 text-[10px] uppercase block">{playerA?.gamerTag || 'Player A'}</span>
                    <span className="font-bold text-white text-sm">{fcPlayerAWins} Wins / {fcPlayerALosses} Losses</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] uppercase block">{playerB?.gamerTag || 'Player B'}</span>
                    <span className="font-bold text-white text-sm">{fcPlayerBWins} Wins / {fcPlayerBLosses} Losses</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Total Games</span>
                    <span className="text-base font-black text-white">{fcPlayerAWins + fcPlayerALosses}</span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Overall Winner</span>
                    <span className="text-sm font-bold text-amber-400 truncate block">
                      {fcPlayerAWins > fcPlayerBWins
                        ? `${playerA?.gamerTag || 'Player A'}`
                        : fcPlayerBWins > fcPlayerAWins
                        ? `${playerB?.gamerTag || 'Player B'}`
                        : 'Series Draw'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">NC Reward</span>
                    <span className="text-base font-black text-amber-400">
                      {liveCalculation.totalRewardAwarded} NC
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Distribution</span>
                    <span className="text-xs font-bold text-emerald-400 truncate block">
                      {liveCalculation.isDraw
                        ? `Each: +${liveCalculation.rewardPerWinner} NC`
                        : `Winner: +${liveCalculation.totalRewardAwarded} NC`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SPECIALIZED 5v5 SQUAD HOURLY PREVIEW */}
            {activeGame.format === '5v5' && liveCalculation.valid && (
              <div className="p-4 rounded-xl bg-neutral-900/90 border border-emerald-500/30 space-y-3 font-mono">
                <div className="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
                  <span className="text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>🎮</span>
                    <span>5v5 Squad Hourly Reward Preview ({matchHours}h Match)</span>
                  </span>
                  <span className="text-neutral-400 text-[11px]">(Win: 90 NC/hr • Loss: 30 NC/hr)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-neutral-950 p-3 rounded-lg border border-neutral-850">
                  <div>
                    <span className="text-neutral-400 text-[10px] uppercase block">Team A Roster ({teamAPlayers.length} players)</span>
                    <span className="font-bold text-white text-sm">
                      {teamOutcome === 'teamA'
                        ? `Winning Team (+${Math.round(90 * matchHours)} NC each)`
                        : teamOutcome === 'teamB'
                        ? `Losing Team (+${Math.round(30 * matchHours)} NC each)`
                        : `Draw (+${Math.round(45 * matchHours)} NC each)`}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] uppercase block">Team B Roster ({teamBPlayers.length} players)</span>
                    <span className="font-bold text-white text-sm">
                      {teamOutcome === 'teamB'
                        ? `Winning Team (+${Math.round(90 * matchHours)} NC each)`
                        : teamOutcome === 'teamA'
                        ? `Losing Team (+${Math.round(30 * matchHours)} NC each)`
                        : `Draw (+${Math.round(45 * matchHours)} NC each)`}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Duration</span>
                    <span className="text-base font-black text-white">{matchHours} Hour(s)</span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Winning Reward</span>
                    <span className="text-sm font-bold text-emerald-400">
                      +{Math.round(90 * matchHours)} NC/player
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Losing Reward</span>
                    <span className="text-sm font-bold text-amber-400">
                      +{Math.round(30 * matchHours)} NC/player
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850">
                    <span className="text-[10px] text-neutral-400 block uppercase">Total Squad NC</span>
                    <span className="text-base font-black text-amber-400">
                      🪙 {liveCalculation.totalRewardAwarded} NC
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Operator Note & Submit */}
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase text-neutral-400">
              Desk Operator Note / Tournament Context (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Saturday Lan Tournament Round 1, Station PC-04"
              value={operatorNotes}
              onChange={(e) => setOperatorNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
            />
          </div>

          {submissionError && (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{submissionError}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !liveCalculation.valid}
              className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating Result...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>[ VALIDATE RESULT ]</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================
          RESULT HISTORY VIEW
          ======================================================== */}
      {viewTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search history by gamerTag or operator..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={historyGameFilter}
                onChange={(e) => setHistoryGameFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 font-mono"
              >
                <option value="ALL">All Games ({historyResults.length})</option>
                {SUPPORTED_MANUAL_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-850 bg-neutral-950">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900/80 border-b border-neutral-800 text-neutral-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">Participants</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">NC Awarded</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Status</th>
                  {canCorrect && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-neutral-500">
                      No official match results recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-900/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-2 whitespace-nowrap">
                        <span>{SUPPORTED_MANUAL_GAMES.find((g) => g.id === item.gameId)?.icon || '🎮'}</span>
                        <span>{item.gameName}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.matchFormat === '1v1' ? (
                          <span className="font-mono">
                            <span className="text-red-400 font-bold">{item.playerAGamerTag}</span> vs{' '}
                            <span className="text-cyan-400 font-bold">{item.playerBGamerTag}</span>
                          </span>
                        ) : (
                          <span className="font-mono text-neutral-400">
                            Team A ({item.teamAPlayerIds?.length || 0}) vs Team B ({item.teamBPlayerIds?.length || 0})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-white">
                          {item.winnerGamerTag ? `Winner: ${item.winnerGamerTag}` : item.isDraw ? 'Draw' : item.outcome}
                        </span>
                        {item.playerAWins !== undefined && (
                          <span className="ml-1.5 text-neutral-500 font-mono text-[10px]">
                            ({item.playerAWins} - {item.playerBWins})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-amber-400">
                        🪙 +{item.totalRewardAwarded} NC
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-neutral-400">
                        {item.recordedByName} ({item.recordedByRole})
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-neutral-500">
                        {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            item.status === 'OFFICIAL'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : item.status === 'CORRECTED'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      {canCorrect && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {item.status === 'OFFICIAL' && (
                            <button
                              type="button"
                              onClick={() => handleOpenCorrection(item)}
                              className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-amber-400 hover:text-amber-300 border border-neutral-800 text-[11px] font-bold cursor-pointer"
                            >
                              Correct
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          CONFIRMATION MODAL (STEP 5: CONFIRM AND VALIDATE)
          ======================================================== */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                      Step 5 • Final Review
                    </span>
                    {activeSeason && (
                      <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-neutral-400">
                        {activeSeason.name} (S{activeSeason.number})
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-black uppercase text-white tracking-wide">
                    Confirm &amp; Validate Match Result
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Match Summary Card */}
            <div className="p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-3 text-xs">
              <div className="flex justify-between items-center text-neutral-400 border-b border-neutral-800 pb-2">
                <span className="font-mono uppercase text-[11px]">Game &amp; Format:</span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span>{activeGame.icon}</span>
                  <span>{activeGame.name}</span>
                  <span className="text-neutral-500 font-mono">({activeGame.format})</span>
                </span>
              </div>

              {/* 1v1 Specific Outcome */}
              {activeGame.format === '1v1' ? (
                <>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className={`p-3 rounded-xl border ${
                      liveCalculation.winnerUids.includes(playerA?.uid || '')
                        ? 'bg-emerald-950/40 border-emerald-500/30'
                        : liveCalculation.isDraw
                        ? 'bg-amber-950/40 border-amber-500/30'
                        : 'bg-neutral-950 border-neutral-850'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">Player 1</span>
                        {liveCalculation.winnerUids.includes(playerA?.uid || '') && (
                          <span className="text-[10px] font-bold text-emerald-400 uppercase">🏆 Winner</span>
                        )}
                        {liveCalculation.isDraw && (
                          <span className="text-[10px] font-bold text-amber-400 uppercase">🤝 Draw</span>
                        )}
                      </div>
                      <div className="font-bold text-white text-sm truncate">{playerA?.gamerTag}</div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-neutral-400">NC Reward:</span>
                          <span className="font-mono font-bold text-amber-400">
                            +{liveCalculation.winnerUids.includes(playerA?.uid || '')
                              ? liveCalculation.rewardPerWinner
                              : liveCalculation.isDraw
                              ? liveCalculation.rewardPerWinner
                              : liveCalculation.rewardPerLoser} NC
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">MMR Change:</span>
                          <span className={`font-mono font-bold ${
                            liveMMR.playerARatingChange > 0 ? 'text-emerald-400' : liveMMR.playerARatingChange < 0 ? 'text-rose-400' : 'text-neutral-400'
                          }`}>
                            {playerARating} → {liveMMR.playerANewRating} ({liveMMR.playerARatingChange >= 0 ? '+' : ''}{liveMMR.playerARatingChange})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                      liveCalculation.winnerUids.includes(playerB?.uid || '')
                        ? 'bg-emerald-950/40 border-emerald-500/30'
                        : liveCalculation.isDraw
                        ? 'bg-amber-950/40 border-amber-500/30'
                        : 'bg-neutral-950 border-neutral-850'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">Player 2</span>
                        {liveCalculation.winnerUids.includes(playerB?.uid || '') && (
                          <span className="text-[10px] font-bold text-emerald-400 uppercase">🏆 Winner</span>
                        )}
                        {liveCalculation.isDraw && (
                          <span className="text-[10px] font-bold text-amber-400 uppercase">🤝 Draw</span>
                        )}
                      </div>
                      <div className="font-bold text-white text-sm truncate">{playerB?.gamerTag}</div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-neutral-400">NC Reward:</span>
                          <span className="font-mono font-bold text-amber-400">
                            +{liveCalculation.winnerUids.includes(playerB?.uid || '')
                              ? liveCalculation.rewardPerWinner
                              : liveCalculation.isDraw
                              ? liveCalculation.rewardPerWinner
                              : liveCalculation.rewardPerLoser} NC
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">MMR Change:</span>
                          <span className={`font-mono font-bold ${
                            liveMMR.playerBRatingChange > 0 ? 'text-emerald-400' : liveMMR.playerBRatingChange < 0 ? 'text-rose-400' : 'text-neutral-400'
                          }`}>
                            {playerBRating} → {liveMMR.playerBNewRating} ({liveMMR.playerBRatingChange >= 0 ? '+' : ''}{liveMMR.playerBRatingChange})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(activeGame.id === 'fc26' || activeGame.id === 'fc27') && (
                    <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] flex justify-between">
                      <span className="text-neutral-400">FC Series Score:</span>
                      <span className="font-mono font-bold text-white">
                        {fcPlayerAWins} Wins — {fcPlayerBWins} Wins ({fcPlayerAWins + fcPlayerBWins} Total Matches × 60 NC = {liveCalculation.totalRewardAwarded} NC)
                      </span>
                    </div>
                  )}
                </>
              ) : (
                /* 5v5 Outcome */
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex justify-between items-center">
                    <div>
                      <span className="text-neutral-400 text-[10px] block uppercase font-mono">Winning Squad:</span>
                      <span className="text-emerald-400 font-black text-sm">
                        {teamOutcome === 'teamA' ? `${teamAName} [${teamATag}]` : teamOutcome === 'teamB' ? `${teamBName} [${teamBTag}]` : 'Match Draw'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-400 text-[10px] block uppercase font-mono">Total Squad Pool:</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">🪙 {liveCalculation.totalRewardAwarded} NC</span>
                    </div>
                  </div>

                  {/* 5v5 Rosters Snapshot Review */}
                  <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850">
                      <span className="text-[10px] uppercase font-bold text-red-400 block mb-1">
                        {teamAName} [{teamATag}] ({teamAPlayers.length} Players)
                      </span>
                      <div className="space-y-0.5 text-neutral-300">
                        {teamAPlayers.map((p) => (
                          <div key={p.uid} className="truncate">• {p.gamerTag}</div>
                        ))}
                      </div>
                      <div className="pt-2 mt-2 border-t border-neutral-900 flex justify-between text-neutral-400">
                        <span>Reward ({matchHours}h):</span>
                        <span className="font-bold text-amber-400">
                          +{teamOutcome === 'teamA' ? Math.round(90 * matchHours) : teamOutcome === 'draw' ? Math.round(45 * matchHours) : Math.round(30 * matchHours)} NC each
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850">
                      <span className="text-[10px] uppercase font-bold text-cyan-400 block mb-1">
                        {teamBName} [{teamBTag}] ({teamBPlayers.length} Players)
                      </span>
                      <div className="space-y-0.5 text-neutral-300">
                        {teamBPlayers.map((p) => (
                          <div key={p.uid} className="truncate">• {p.gamerTag}</div>
                        ))}
                      </div>
                      <div className="pt-2 mt-2 border-t border-neutral-900 flex justify-between text-neutral-400">
                        <span>Reward ({matchHours}h):</span>
                        <span className="font-bold text-amber-400">
                          +{teamOutcome === 'teamB' ? Math.round(90 * matchHours) : teamOutcome === 'draw' ? Math.round(45 * matchHours) : Math.round(30 * matchHours)} NC each
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Team MMR Dynamics Review */}
                  {liveMMR && (liveMMR.teamAChange !== undefined || liveMMR.teamBChange !== undefined) && (
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 space-y-1 text-xs font-mono">
                      <span className="text-[10px] text-neutral-400 uppercase font-black block">Team MMR Adjustment</span>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <span className="text-[10px] text-neutral-400 block">{teamAName}:</span>
                          <span className={`font-bold ${(liveMMR.teamAChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(liveMMR.teamAChange ?? 0) >= 0 ? `+${liveMMR.teamAChange}` : liveMMR.teamAChange} MMR
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-neutral-400 block">{teamBName}:</span>
                          <span className={`font-bold ${(liveMMR.teamBChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(liveMMR.teamBChange ?? 0) >= 0 ? `+${liveMMR.teamBChange}` : liveMMR.teamBChange} MMR
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 space-y-1">
                <div className="flex justify-between text-neutral-400 text-[11px]">
                  <span>Formula Breakdown:</span>
                  <span className="font-mono text-neutral-300">{liveCalculation.rewardBreakdown}</span>
                </div>
                {operatorNotes && (
                  <div className="flex justify-between text-neutral-400 text-[11px]">
                    <span>Desk Note:</span>
                    <span className="italic text-neutral-300 truncate max-w-[200px]">{operatorNotes}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Atomic Single Source of Truth:</strong> Confirming executes an authoritative Firestore transaction that simultaneously credits NC wallets, updates official MMR ratings across all leaderboards, creates the immutable Match History record, and writes the audit log.
              </span>
            </div>

            {submissionError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{submissionError}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold uppercase transition-all cursor-pointer"
              >
                Cancel / Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleExecuteValidation}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Committing Transaction...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>[ CONFIRM &amp; VALIDATE RESULT ]</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUCCESS RECEIPT MODAL
          ======================================================== */}
      {successReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-wide">
                  Official Result Recorded!
                </h3>
                <p className="text-xs text-neutral-400 font-mono">Immutable Audit Event &amp; NC + MMR Committed</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2.5 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Match ID:</span>
                <span className="font-mono text-neutral-300 text-[11px] truncate max-w-[200px]">{successReceipt.resultId || successReceipt.id}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Game:</span>
                <span className="font-bold text-white">{successReceipt.gameName}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Outcome:</span>
                <span className="font-bold text-emerald-400">
                  {successReceipt.winnerGamerTag ? `Winner: ${successReceipt.winnerGamerTag}` : 'Draw'}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Total NC Awarded:</span>
                <span className="font-mono font-bold text-amber-400">🪙 +{successReceipt.totalRewardAwarded} NC</span>
              </div>
              {successReceipt.playerAMMRChange !== undefined && (
                <div className="flex justify-between text-neutral-400 border-t border-neutral-800 pt-1.5">
                  <span>{successReceipt.playerAGamerTag} MMR:</span>
                  <span className={`font-mono font-bold ${
                    (successReceipt.playerAMMRChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {successReceipt.playerAPreviousMMR} → {successReceipt.playerANewMMR} ({(successReceipt.playerAMMRChange || 0) >= 0 ? '+' : ''}{successReceipt.playerAMMRChange})
                  </span>
                </div>
              )}
              {successReceipt.playerBMMRChange !== undefined && (
                <div className="flex justify-between text-neutral-400">
                  <span>{successReceipt.playerBGamerTag} MMR:</span>
                  <span className={`font-mono font-bold ${
                    (successReceipt.playerBMMRChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {successReceipt.playerBPreviousMMR} → {successReceipt.playerBNewMMR} ({(successReceipt.playerBMMRChange || 0) >= 0 ? '+' : ''}{successReceipt.playerBMMRChange})
                  </span>
                </div>
              )}
              <div className="flex justify-between text-neutral-400 pt-1.5 border-t border-neutral-800">
                <span>Leaderboards:</span>
                <span className="text-emerald-400 font-mono text-[11px] font-bold">✓ Synced Authoritatively</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Formula Breakdown:</span>
                <span className="text-neutral-300 font-mono text-[10px]">{successReceipt.rewardBreakdown}</span>
              </div>
              <div className="flex justify-between text-neutral-400 pt-2 border-t border-neutral-800">
                <span>Validated By:</span>
                <span className="font-mono text-neutral-300">{successReceipt.recordedByName} ({successReceipt.recordedByRole})</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSuccessReceipt(null);
                  setViewTab('HISTORY');
                }}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                View in Match History
              </button>
              <button
                type="button"
                onClick={() => setSuccessReceipt(null)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Record Another Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          RESULT CORRECTION MODAL (ADMIN / SUPER ADMIN ONLY)
          ======================================================== */}
      {correctingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-wide">
                  Correct Match Result (Controlled Audit Workflow)
                </h3>
                <p className="text-xs text-neutral-400 font-mono">Reverses prior rewards &amp; applies new outcome</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs space-y-1">
              <div className="text-neutral-400">
                Original Record: <strong className="text-white">{correctingResult.gameName}</strong> (
                {correctingResult.playerAGamerTag} vs {correctingResult.playerBGamerTag})
              </div>
              <div className="text-neutral-400">
                Prior Winner: <strong className="text-amber-400">{correctingResult.winnerGamerTag || 'Draw'}</strong> (
                {correctingResult.totalRewardAwarded} NC will be reversed)
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-mono font-bold uppercase text-neutral-400">Select Corrected Outcome</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectionOutcome('playerA')}
                  className={`p-2.5 rounded-lg border text-xs font-bold uppercase ${
                    correctionOutcome === 'playerA' ? 'bg-red-600 text-white border-red-500' : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  {correctingResult.playerAGamerTag || 'Player A'} Win
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionOutcome('draw')}
                  className={`p-2.5 rounded-lg border text-xs font-bold uppercase ${
                    correctionOutcome === 'draw' ? 'bg-amber-600 text-white border-amber-500' : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionOutcome('playerB')}
                  className={`p-2.5 rounded-lg border text-xs font-bold uppercase ${
                    correctionOutcome === 'playerB' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  {correctingResult.playerBGamerTag || 'Player B'} Win
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono font-bold uppercase text-neutral-400">
                Correction Reason (Mandatory Audit Requirement)
              </label>
              <textarea
                rows={2}
                placeholder="Explain why the result was misreported or corrected..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {correctionError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
                {correctionError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={correctingLoading}
                onClick={() => setCorrectingResult(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold uppercase cursor-pointer"
              >
                ABORT
              </button>
              <button
                type="button"
                disabled={correctingLoading}
                onClick={handleSubmitCorrection}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs uppercase cursor-pointer flex items-center justify-center gap-2"
              >
                {correctingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Reversal...</span>
                  </>
                ) : (
                  <span>CONFIRM CORRECTION</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
