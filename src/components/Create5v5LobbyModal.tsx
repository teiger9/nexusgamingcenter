import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Team, Station, STATIONS, Match } from '../types';
import { fetchPlayerTeams } from '../services/teamService';
import { create5v5Lobby, getCaptainActive5v5Lobby } from '../services/matchService';
import { useToast } from './Toast';
import { X, Swords, Copy, Check, Shield, Users, Crown, Play, ShieldAlert } from 'lucide-react';

interface Create5v5LobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLobbyCreated: (match: Match) => void;
  preselectedTeam?: Team | null;
}

export const Create5v5LobbyModal: React.FC<Create5v5LobbyModalProps> = ({
  isOpen,
  onClose,
  onLobbyCreated,
  preselectedTeam,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [captainTeams, setCaptainTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [station, setStation] = useState<Station>('PC-01');
  const [pcCount, setPcCount] = useState<8 | 9 | 10>(10);
  const [announceRecruitment, setAnnounceRecruitment] = useState(true);
  const [recruitmentMessage, setRecruitmentMessage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Success state after lobby created
  const [createdMatch, setCreatedMatch] = useState<Match | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<Match | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setCreatedMatch(null);
      setDuplicateMatch(null);
      setPcCount(10);
      loadTeams();
    }
  }, [isOpen, user, preselectedTeam]);

  const loadTeams = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Enforce: Check whether authenticated captain already owns an active lobby
      const existingLobby = await getCaptainActive5v5Lobby(user.uid);
      if (existingLobby) {
        setDuplicateMatch(existingLobby);
        setLoading(false);
        return;
      }

      const teams = await fetchPlayerTeams(user.uid);
      const cap = teams.filter(
        (t) =>
          t.captainId === user.uid ||
          (t as any).creatorUid === user.uid ||
          t.members?.some((m) => m.id === user.uid && m.role === 'captain')
      );

      // If preselectedTeam is passed and user is captain, ensure it is in the list
      if (
        preselectedTeam &&
        (preselectedTeam.captainId === user.uid ||
          (preselectedTeam as any).creatorUid === user.uid ||
          preselectedTeam.members?.some((m) => m.id === user.uid && m.role === 'captain'))
      ) {
        if (!cap.some((t) => t.teamId === preselectedTeam.teamId)) {
          cap.unshift(preselectedTeam);
        }
      }

      setCaptainTeams(cap);
      if (preselectedTeam && cap.some((t) => t.teamId === preselectedTeam.teamId)) {
        setSelectedTeamId(preselectedTeam.teamId);
      } else if (cap.length > 0) {
        setSelectedTeamId(cap[0].teamId);
      }
    } catch (err) {
      console.error('Error loading captain teams:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedTeam = captainTeams.find((t) => t.teamId === selectedTeamId);
  const memberCount = selectedTeam ? (selectedTeam.members?.length || selectedTeam.memberIds?.length || 1) : 0;
  const isRosterComplete = memberCount === 5;
  const playersNeeded = Math.max(0, 5 - memberCount);

  const handleCreate = async () => {
    if (!selectedTeam || !user) return;
    if (memberCount < 1) {
      showToast('error', 'Empty Squad', 'Your team must have at least 1 player.');
      return;
    }

    setCreating(true);
    setDuplicateMatch(null);
    try {
      const res = await create5v5Lobby({
        teamId: selectedTeam.teamId,
        captainId: user.uid,
        gameId: selectedTeam.gameId,
        station,
        pcCount,
        isPrivate,
        announceRecruitment: playersNeeded > 0 ? announceRecruitment : false,
        recruitmentMessage: recruitmentMessage.trim() || undefined,
      });

      if (res.success && res.match) {
        setCreatedMatch(res.match);
        showToast(
          'success',
          '5v5 Lobby Created!',
          playersNeeded > 0 && announceRecruitment
            ? `Lobby Code: ${res.lobbyCode}. Recruitment announcement is live on Arena!`
            : `Lobby Code: ${res.lobbyCode}. Share this with the opposing captain!`
        );
      } else if (res.existingMatch || res.error === 'YOU ALREADY HAVE AN ACTIVE LOBBY') {
        const existing = res.existingMatch || (await getCaptainActive5v5Lobby(user.uid));
        if (existing) {
          setDuplicateMatch(existing);
        }
        showToast('warning', 'Active Lobby Exists', 'YOU ALREADY HAVE AN ACTIVE LOBBY');
      } else {
        showToast('error', 'Could not create lobby', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = () => {
    if (!createdMatch?.lobbyCode) return;
    navigator.clipboard.writeText(createdMatch.lobbyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('info', 'Code Copied', 'Lobby code copied to clipboard.');
  };

  const handleEnterRoom = () => {
    if (createdMatch) {
      onLobbyCreated(createdMatch);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {createdMatch ? (
          /* Lobby Created Success State */
          <div className="space-y-6 text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-400 flex items-center justify-center mx-auto shadow-lg">
              <Swords className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-black font-display text-white">5v5 LOBBY OPEN</h2>
              <p className="text-xs text-slate-400 mt-1">
                Give this Lobby Code to the opposing team captain to join:
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#121218] border border-cyan-500/30 flex items-center justify-between gap-3">
              <div className="text-left">
                <div className="text-[10px] font-mono text-cyan-400 uppercase font-bold">Lobby Code</div>
                <div className="text-2xl font-mono font-black text-white tracking-widest">
                  {createdMatch.lobbyCode}
                </div>
              </div>
              <button
                onClick={handleCopyCode}
                className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800 text-left text-xs font-mono space-y-1.5">
              <div className="text-slate-400 flex justify-between">
                <span>Team:</span>
                <span className="text-white font-bold">{createdMatch.teamAName} [{createdMatch.teamATag}]</span>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>Game:</span>
                <span className="text-cyan-400 font-bold uppercase">{createdMatch.gameName} 5v5</span>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>Station:</span>
                <span className="text-white">{createdMatch.station}</span>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>PCs:</span>
                <span className="text-cyan-400 font-bold">💻 {createdMatch.pcCount || 10} PCs</span>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>Status:</span>
                <span className="text-yellow-400 font-bold">WAITING FOR OPPONENT</span>
              </div>
            </div>

            <button
              onClick={handleEnterRoom}
              className="w-full py-3 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-display font-black text-sm uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>Enter Match Room</span>
            </button>
          </div>
        ) : duplicateMatch ? (
          /* BLOCKED CREATION: Captain Already Owns An Active Lobby */
          <div className="space-y-6 text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-2">
                ACTIVE 5v5 LOBBY DETECTED
              </span>
              <h2 className="text-2xl font-black font-display text-white">
                YOU ALREADY HAVE AN ACTIVE LOBBY
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                A captain cannot create two active lobbies at the same time. You must finish, cancel, or close your current lobby before creating a new one.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#121218] border border-amber-500/30 text-left text-xs font-mono space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Lobby Code:</span>
                <span className="text-base font-bold text-white tracking-widest">{duplicateMatch.lobbyCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Team:</span>
                <span className="text-cyan-400 font-bold">{duplicateMatch.teamAName} [{duplicateMatch.teamATag}]</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Game / Station:</span>
                <span className="text-white">{duplicateMatch.gameName} • {duplicateMatch.station}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">PCs:</span>
                <span className="text-cyan-400 font-bold">💻 {duplicateMatch.pcCount || 10} PCs</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="text-amber-400 font-bold uppercase">{duplicateMatch.status}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onLobbyCreated(duplicateMatch);
                onClose();
              }}
              className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-display font-black text-sm uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>OPEN MY LOBBY</span>
            </button>
          </div>
        ) : (
          /* Lobby Creation Form */
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Swords className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black font-display text-white">CREATE 5v5 LOBBY</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Official Captain-Hosted Ranked Match
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-400 font-mono">
                Checking your active lobbies & teams...
              </div>
            ) : captainTeams.length === 0 ? (
              <div className="py-8 text-center bg-[#121218] border border-slate-800 rounded-2xl p-6 space-y-3">
                <Crown className="w-8 h-8 text-yellow-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">No Captain Teams Found</h3>
                <p className="text-xs text-slate-400">
                  You must be the captain of a team to create a 5v5 ranked lobby.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Team Selection */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
                    Select Your Squad (Captain Only)
                  </label>
                  <div className="space-y-2">
                    {captainTeams.map((t) => (
                      <div
                        key={t.teamId}
                        onClick={() => setSelectedTeamId(t.teamId)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                          selectedTeamId === t.teamId
                            ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-md'
                            : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{t.teamLogo || '🛡️'}</span>
                          <div>
                            <div className="font-bold text-xs font-display text-white flex items-center gap-1.5">
                              <span>{t.teamName}</span>
                              <span className="text-cyan-400 font-mono font-bold">[{t.teamTag}]</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {t.gameName} 5v5 • {t.teamRating || 1000} ELO
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs">
                          <span
                            className={`font-bold ${
                              t.members.length === 5 ? 'text-emerald-400' : 'text-yellow-400'
                            }`}
                          >
                            {t.members.length}/5 Players
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HOW MANY PCs ARE YOU TAKING? */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
                    HOW MANY PCs ARE YOU TAKING?
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {([8, 9, 10] as const).map((count) => {
                      const isSelected = pcCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setPcCount(count)}
                          className={`py-2.5 px-3 rounded-2xl border text-xs font-mono font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                              : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                          }`}
                        >
                          <span className="text-sm font-bold">💻 {count} PCs</span>
                          {count === 10 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-bold uppercase">
                              Default
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-1.5">
                    Informational only. Attached to the lobby document. Teams still support 5v5 (10 players max).
                  </p>
                </div>

                {/* Roster & Recruitment Announcement Configuration */}
                {selectedTeam && (
                  <div className="p-4 rounded-2xl bg-[#121218] border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-white font-display">Squad Roster:</span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            isRosterComplete ? 'text-emerald-400' : 'text-yellow-400'
                          }`}
                        >
                          {memberCount}/5 Players
                        </span>
                      </div>
                      {!isRosterComplete && (
                        <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          NEED {playersNeeded} PLAYER{playersNeeded > 1 ? 'S' : ''}
                        </span>
                      )}
                    </div>

                    {!isRosterComplete && (
                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={announceRecruitment}
                            onChange={(e) => setAnnounceRecruitment(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-black/40 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0"
                          />
                          <div className="text-xs">
                            <span className="text-white font-bold block">
                              📢 Announce need for {playersNeeded} player{playersNeeded > 1 ? 's' : ''} on Arena
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Publishes a live recruitment card on the Main & Arena pages so solo players can join your 5v5 squad.
                            </span>
                          </div>
                        </label>

                        {announceRecruitment && (
                          <div className="pt-1.5">
                            <input
                              type="text"
                              value={recruitmentMessage}
                              onChange={(e) => setRecruitmentMessage(e.target.value)}
                              placeholder={`Optional note (e.g. Need ${playersNeeded} fraggers, microphone required)`}
                              maxLength={80}
                              className="w-full px-3 py-2 bg-[#09090d] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Lobby Privacy (Open vs Private) */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
                    Lobby Access & Privacy
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPrivate(false)}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold transition-all text-left flex items-center justify-between ${
                        !isPrivate
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                          : 'bg-[#121218] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>[ OPEN LOBBY ]</span>
                      <span className="text-[10px] text-slate-400">Direct Join</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPrivate(true)}
                      className={`p-2.5 rounded-xl border text-xs font-mono font-bold transition-all text-left flex items-center justify-between ${
                        isPrivate
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                          : 'bg-[#121218] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>[ PRIVATE LOBBY ]</span>
                      <span className="text-[10px] text-slate-400">Invite Only</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    {isPrivate
                      ? 'Private Lobby: No non-member can join directly. Entry requires an invitation from Lobby Owner or Team B Captain.'
                      : 'Open Lobby: Any non-member can join directly into available slots or enter through an invitation.'}
                  </p>
                </div>

                {/* Station Selection */}
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
                    Designated Station (Gaming Center PC Zone)
                  </label>
                  <select
                    value={station}
                    onChange={(e) => setStation(e.target.value as Station)}
                    className="w-full px-3.5 py-2.5 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  >
                    {STATIONS.filter((s) => s.category === 'PC').map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating || memberCount < 1}
                    className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{creating ? 'Generating Lobby...' : 'Create 5v5 Lobby'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
