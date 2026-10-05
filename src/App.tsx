import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { FirstAdminSetupModal } from './components/FirstAdminSetupModal';
import { CreateMatchModal } from './components/CreateMatchModal';
import { Create5v5LobbyModal } from './components/Create5v5LobbyModal';
import { PlayHubView } from './components/PlayHubView';
import { TeamProfileModal } from './components/TeamProfileModal';
import { PlayerDashboard } from './components/PlayerDashboard';
import { VisitorHomeView } from './components/VisitorHomeView';
import { LiveMatchRoom } from './components/LiveMatchRoom';
import { LeaderboardView } from './components/LeaderboardView';
import { HowRankingWorksView } from './components/HowRankingWorksView';
import { HallOfFameView } from './components/HallOfFameView';
import { PlayerProfileView } from './components/PlayerProfileView';
import { MatchHistoryView } from './components/MatchHistoryView';
import { TeamsHubView } from './components/TeamsHubView';
import { AdminDashboard } from './components/AdminDashboard';
import { NotificationsView } from './components/NotificationsView';
import { NexusFidelityCardView } from './components/NexusFidelityCardView';
import { NexusWalletModal } from './components/NexusWalletModal';
import { ReservationsHubView } from './components/reservations/ReservationsHubView';
import { AdminReservationDetailsModal } from './components/reservations/AdminReservationDetailsModal';
import { TournamentsHubView } from './components/TournamentsHubView';
import { TeamTournamentInvitationModal } from './components/TeamTournamentInvitationModal';
import { subscribeToDisputedMatches } from './services/matchService';
import { subscribeToUserNotifications } from './services/notificationService';
import { subscribeToUserInvitations } from './services/teamService';
import { AppNotification, TeamInvitation } from './types';
import { NexusLogo } from './components/NexusLogo';
import { ProfileRecoveryView } from './components/ProfileRecoveryView';
import { AccountSuspendedView } from './components/AccountSuspendedView';
import { PasswordResetActionModal } from './components/PasswordResetActionModal';
import { ResponsiveDiagnostic } from './components/ResponsiveDiagnostic';

function NexusAppContent() {
  const { user, playerProfile, isAdmin, isStaff, loading, profileMissing, isAccountSuspended } = useAuth();

  const [currentTab, setCurrentTab] = useState<string>('visitor');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTournamentInvite, setSelectedTournamentInvite] = useState<{
    invitationId?: string;
    teamId?: string;
    tournamentId?: string;
  } | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  const handleNavigateToTournaments = (tournamentId?: string) => {
    if (tournamentId) {
      setSelectedTournamentId(tournamentId);
    }
    setCurrentTab('tournaments');
  };

  // Modal states
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot_password'>('login');
  const [authModalPrefillEmail, setAuthModalPrefillEmail] = useState('');
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [selected1v1GameId, setSelected1v1GameId] = useState<string | undefined>(undefined);
  const [create5v5ModalOpen, setCreate5v5ModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [adminSetupOpen, setAdminSetupOpen] = useState(false);
  const [selectedAdminReservationId, setSelectedAdminReservationId] = useState<string | null>(null);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);

  // Disputes & Notifications count for navbar badge
  const [disputeCount, setDisputeCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);

  // Update initial tab based on authentication
  useEffect(() => {
    if (!loading) {
      if (user) {
        if (currentTab === 'visitor') {
          setCurrentTab('dashboard');
        }
      } else {
        if (['dashboard', 'matches', 'profile', 'notifications', 'admin'].includes(currentTab)) {
          setCurrentTab('visitor');
        }
      }
    }
  }, [user, loading]);

  // Subscribe to Admin Disputes
  useEffect(() => {
    if (isAdmin) {
      const unsub = subscribeToDisputedMatches((disputes) => {
        setDisputeCount(disputes.length);
      });
      return () => unsub();
    }
  }, [isAdmin]);

  // Subscribe to Player Notifications & Team Invitations
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setInvitations([]);
      return;
    }

    const unsubNotifs = subscribeToUserNotifications(user.uid, (data) => {
      setNotifications(data);
    });

    const unsubInvites = subscribeToUserInvitations(user.uid, (invs) => {
      setInvitations(invs);
    });

    return () => {
      unsubNotifs();
      unsubInvites();
    };
  }, [user]);

  const unreadNotifsCount = (notifications || []).filter((n) => n && !n.read).length + (invitations || []).length;

  const handleSelectMatch = (matchId: string, invitationId?: string) => {
    setSelectedMatchId(matchId);
    setSelectedInvitationId(invitationId || null);
    setCurrentTab('match_room');
  };

  const handleSelectMatchInvite = (data: { invitationId?: string; lobbyId: string; teamId?: string }) => {
    setSelectedMatchId(data.lobbyId);
    setSelectedInvitationId(data.invitationId || null);
    setCurrentTab('match_room');
  };

  const handleSelectPlayerProfile = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setCurrentTab('player_dossier');
  };

  const handleSelectTeamProfile = (teamId: string) => {
    setSelectedTeamId(teamId);
  };

  const handleOpenAuth = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleOpenCreateMatch = () => {
    if (!user) {
      handleOpenAuth('register');
      return;
    }
    setCreateMatchOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center text-slate-100 p-4">
        <NexusLogo size="xl" showWordmark={true} />
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mt-6 mb-2" />
        <p className="text-xs text-slate-500 font-mono">Connecting to Nexus competitive match network...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-[#e2e8f0] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Navigation Top Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setSelectedMatchId(null);
          setSelectedPlayerId(null);
          setCurrentTab(tab);
        }}
        onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
        onOpenCreateMatch={handleOpenCreateMatch}
        onOpenWallet={() => setWalletModalOpen(true)}
        disputeCount={disputeCount}
        unreadNotificationsCount={unreadNotifsCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full">
        {/* ACCOUNT SUSPENDED RESTRICTION */}
        {user && isAccountSuspended ? (
          <AccountSuspendedView />
        ) : user && profileMissing ? (
          /* MISSING PROFILE RECOVERY */
          <ProfileRecoveryView />
        ) : (
          <>
            {/* VISITOR INTERFACE */}
            {currentTab === 'visitor' && (
              <VisitorHomeView
                onOpenAuth={handleOpenAuth}
                onSelectPlayerProfile={handleSelectPlayerProfile}
                onSelectTeamProfile={handleSelectTeamProfile}
                onOpenRankingGuide={() => setCurrentTab('ranking_system')}
                onNavigateToReservations={() => setCurrentTab('reservations')}
                onNavigateToTournaments={handleNavigateToTournaments}
                onSelectMatch={handleSelectMatch}
                onNavigateToMatchHistory={() => setCurrentTab('match_history')}
                onNavigateToLeaderboard={() => setCurrentTab('leaderboard')}
                onNavigateToHallOfFame={() => setCurrentTab('hall_of_fame')}
              />
            )}

            {/* 🎮 PLAY PAGE (GAME SELECTION & LOBBIES) */}
            {currentTab === 'play' && (
              <PlayHubView
                onSelect1v1Game={(gameId) => {
                  setSelected1v1GameId(gameId);
                  setCreateMatchOpen(true);
                }}
                onOpenCreate5v5Lobby={() => {
                  if (!user) {
                    handleOpenAuth('register');
                  } else {
                    setCreate5v5ModalOpen(true);
                  }
                }}
                onSelectMatch={handleSelectMatch}
                onOpenAuth={handleOpenAuth}
                onNavigateToHistory={() => setCurrentTab('match_history')}
              />
            )}

        {/* PLAYER INTERFACE: DASHBOARD */}
        {user && currentTab === 'dashboard' && (
          <PlayerDashboard
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectTab={setCurrentTab}
            onSelectMatch={handleSelectMatch}
            onOpenAdminSetup={() => setAdminSetupOpen(true)}
            onOpenRankingGuide={() => setCurrentTab('ranking_system')}
            onNavigateToTournaments={handleNavigateToTournaments}
          />
        )}

        {/* NOTIFICATIONS & INVITES */}
        {user && currentTab === 'notifications' && (
          <NotificationsView
            notifications={notifications}
            invitations={invitations}
            onSelectMatch={handleSelectMatch}
            onSelectMatchInvite={handleSelectMatchInvite}
            onSelectTeam={handleSelectTeamProfile}
            onSelectTournamentInvite={(inviteData) => setSelectedTournamentInvite(inviteData)}
            onSelectReservation={(reservationId, notifId) => {
              if (isAdmin || isStaff) {
                setSelectedAdminReservationId(reservationId);
                setSelectedNotificationId(notifId || null);
              } else {
                setCurrentTab('reservations');
              }
            }}
          />
        )}

        {/* RESERVATIONS & BOOKING SYSTEM */}
        {(currentTab === 'reservations' || currentTab === 'booking') && (
          <ReservationsHubView
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
          />
        )}

        {/* 🏆 TOURNAMENTS SYSTEM HUB */}
        {currentTab === 'tournaments' && (
          <TournamentsHubView
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
            onSelectPlayerProfile={handleSelectPlayerProfile}
            onSelectTeamProfile={handleSelectTeamProfile}
            initialTournamentId={selectedTournamentId || undefined}
          />
        )}

        {/* 🪙 NEXUS FIDELITY CARD & REWARDS CATALOG */}
        {currentTab === 'fidelity_card' && (
          <NexusFidelityCardView
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
            onOpenWallet={() => setWalletModalOpen(true)}
          />
        )}

        {/* ACTIVE MATCH ROOM */}
        {currentTab === 'match_room' && selectedMatchId && (
          <LiveMatchRoom
            matchId={selectedMatchId}
            invitationId={selectedInvitationId || undefined}
            onBack={() => {
              setSelectedMatchId(null);
              setSelectedInvitationId(null);
              setCurrentTab(user ? 'dashboard' : 'visitor');
            }}
            onViewLeaderboard={() => {
              setSelectedMatchId(null);
              setSelectedInvitationId(null);
              setCurrentTab('leaderboard');
            }}
          />
        )}

        {/* PUBLIC / PLAYER LEADERBOARDS */}
        {currentTab === 'leaderboard' && (
          <LeaderboardView
            onSelectPlayerProfile={handleSelectPlayerProfile}
            onOpenRankingGuide={() => setCurrentTab('ranking_system')}
            onNavigateToHallOfFame={() => setCurrentTab('hall_of_fame')}
          />
        )}

        {/* HALL OF FAME */}
        {currentTab === 'hall_of_fame' && (
          <HallOfFameView
            onSelectPlayer={handleSelectPlayerProfile}
            onNavigateToActiveSeason={() => setCurrentTab('leaderboard')}
          />
        )}

        {/* RANKING SYSTEM GUIDE */}
        {currentTab === 'ranking_system' && (
          <HowRankingWorksView
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectGameLeaderboard={() => setCurrentTab('leaderboard')}
          />
        )}

        {/* MATCH HISTORY (Accessible to all registered users and visitors) */}
        {(currentTab === 'match_history' || currentTab === 'matches' || currentTab === 'history') && (
          <MatchHistoryView
            onSelectPlayerProfile={handleSelectPlayerProfile}
          />
        )}

        {/* 5v5 SQUADS & LOBBIES */}
        {currentTab === 'teams' && (
          <TeamsHubView
            onSelectMatch={handleSelectMatch}
            onSelectPlayerProfile={handleSelectPlayerProfile}
            onOpenAuth={() => handleOpenAuth('login')}
          />
        )}

        {/* PLAYER PROFILE */}
        {user && currentTab === 'profile' && (
          <PlayerProfileView
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectMatch={handleSelectMatch}
            onNavigateToHallOfFame={() => setCurrentTab('hall_of_fame')}
          />
        )}

        {/* PLAYER PUBLIC DOSSIER */}
        {currentTab === 'player_dossier' && selectedPlayerId && (
          <PlayerProfileView
            playerId={selectedPlayerId}
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectMatch={handleSelectMatch}
            onNavigateToHallOfFame={() => setCurrentTab('hall_of_fame')}
          />
        )}

        {/* ADMIN & STAFF CONTROL CENTER (SAME ORIGINAL SUPER ADMIN DASHBOARD STRUCTURE) */}
        {(isAdmin || isStaff) && (currentTab === 'admin' || currentTab === 'staff') && (
          <AdminDashboard
            onSelectMatch={handleSelectMatch}
            onSelectPlayerProfile={handleSelectPlayerProfile}
            onSelectTeamProfile={handleSelectTeamProfile}
          />
        )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-6 px-4 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-red-500 font-black font-display tracking-wider">NEXUS GAMING CENTER</span>
            <span>• Competitive Match Network</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-neutral-400 font-mono">
            <span>MMR Engine: Elo K=32</span>
            <span>•</span>
            <span>PC • PS5 Pro • Chess</span>
            <span>•</span>
            <button
              onClick={() => setAdminSetupOpen(true)}
              className="text-neutral-400 hover:text-red-500 transition-colors underline"
            >
              Staff Access
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        prefilledEmail={authModalPrefillEmail}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthModalPrefillEmail('');
        }}
        onSuccess={() => {
          setCurrentTab('dashboard');
        }}
      />

      {/* Official Password Reset Link Action Handler Modal */}
      <PasswordResetActionModal
        onRequestNewLink={() => {
          setAuthModalMode('forgot_password');
          setAuthModalOpen(true);
        }}
        onOpenLogin={(prefilledEmail) => {
          if (prefilledEmail) {
            setAuthModalPrefillEmail(prefilledEmail);
          }
          setAuthModalMode('login');
          setAuthModalOpen(true);
        }}
      />

      <CreateMatchModal
        isOpen={createMatchOpen}
        initialGameId={selected1v1GameId}
        onClose={() => {
          setCreateMatchOpen(false);
          setSelected1v1GameId(undefined);
        }}
        onMatchCreated={(matchId) => {
          handleSelectMatch(matchId);
        }}
      />

      <Create5v5LobbyModal
        isOpen={create5v5ModalOpen}
        onClose={() => setCreate5v5ModalOpen(false)}
        onLobbyCreated={(match) => {
          setCreate5v5ModalOpen(false);
          handleSelectMatch(match.id);
        }}
      />

      <FirstAdminSetupModal
        isOpen={adminSetupOpen}
        onClose={() => setAdminSetupOpen(false)}
      />

      {/* Nexus Coin Wallet Modal */}
      <NexusWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        onNavigateToFidelityCard={() => {
          setWalletModalOpen(false);
          setCurrentTab('fidelity_card');
        }}
        onOpenFidelityCard={() => {
          setWalletModalOpen(false);
          setCurrentTab('fidelity_card');
        }}
      />

      {/* Team Profile Modal */}
      {selectedTeamId && (
        <TeamProfileModal
          teamId={selectedTeamId}
          isOpen={true}
          onClose={() => setSelectedTeamId(null)}
          onSelectPlayerProfile={handleSelectPlayerProfile}
          onSelectMatch={handleSelectMatch}
        />
      )}

      {/* Team Tournament Invitation Modal */}
      {selectedTournamentInvite && (
        <TeamTournamentInvitationModal
          isOpen={true}
          onClose={() => setSelectedTournamentInvite(null)}
          currentUser={playerProfile || undefined}
          invitationId={selectedTournamentInvite.invitationId}
          teamId={selectedTournamentInvite.teamId}
          tournamentId={selectedTournamentInvite.tournamentId}
          onInvitationAccepted={() => {
            setSelectedTournamentInvite(null);
          }}
          onInvitationDeclined={() => {
            setSelectedTournamentInvite(null);
          }}
        />
      )}

      {/* Staff / Admin Reservation Details Modal */}
      {selectedAdminReservationId && (
        <AdminReservationDetailsModal
          isOpen={Boolean(selectedAdminReservationId)}
          reservationId={selectedAdminReservationId}
          notificationId={selectedNotificationId}
          adminPlayer={playerProfile}
          onClose={() => {
            setSelectedAdminReservationId(null);
            setSelectedNotificationId(null);
          }}
        />
      )}

      {/* Dev Responsive Diagnostic Tool */}
      <ResponsiveDiagnostic />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NexusAppContent />
      </AuthProvider>
    </ToastProvider>
  );
}
