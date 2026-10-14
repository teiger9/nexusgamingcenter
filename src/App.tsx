import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './components/Toast';
import { NavigationProvider, useNavigation, useBackHandler } from './context/NavigationContext';
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
import { AnnouncementsView } from './components/AnnouncementsView';
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
  const { currentScreen, navigate, goBack } = useNavigation();
  const { showToast } = useToast();

  const currentTab = currentScreen.tab;
  const selectedMatchId = currentScreen.selectedMatchId || null;
  const selectedPlayerId = currentScreen.selectedPlayerId || null;
  const selectedTeamId = currentScreen.selectedTeamId || null;
  const selectedTournamentId = currentScreen.selectedTournamentId || null;
  const selectedTournamentInvite = currentScreen.selectedTournamentInvite || null;
  const selectedAdminReservationId = currentScreen.selectedAdminReservationId || null;
  const selectedNotificationId = currentScreen.selectedNotificationId || null;

  const handleNavigateToTournaments = (tournamentId?: string) => {
    navigate({
      tab: 'tournaments',
      selectedTournamentId: tournamentId || null,
    });
  };

  // Modal states
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot_password'>('login');
  const [authModalPrefillEmail, setAuthModalPrefillEmail] = useState('');
  const [authNoticeMessage, setAuthNoticeMessage] = useState<string | null>(null);
  const [returnDestination, setReturnDestination] = useState<string | null>(null);
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [selected1v1GameId, setSelected1v1GameId] = useState<string | undefined>(undefined);
  const [create5v5ModalOpen, setCreate5v5ModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [adminSetupOpen, setAdminSetupOpen] = useState(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);

  // Android Back handlers for App-level modals
  useBackHandler({
    id: 'app-auth-modal',
    active: authModalOpen,
    onBack: () => {
      setAuthModalOpen(false);
      setAuthModalPrefillEmail('');
    },
    priority: 30,
  });

  useBackHandler({
    id: 'app-create-match-modal',
    active: createMatchOpen,
    onBack: () => {
      setCreateMatchOpen(false);
      setSelected1v1GameId(undefined);
    },
    priority: 30,
  });

  useBackHandler({
    id: 'app-create-5v5-modal',
    active: create5v5ModalOpen,
    onBack: () => setCreate5v5ModalOpen(false),
    priority: 30,
  });

  useBackHandler({
    id: 'app-wallet-modal',
    active: walletModalOpen,
    onBack: () => setWalletModalOpen(false),
    priority: 30,
  });

  useBackHandler({
    id: 'app-admin-setup-modal',
    active: adminSetupOpen,
    onBack: () => setAdminSetupOpen(false),
    priority: 30,
  });

  useBackHandler({
    id: 'app-team-profile-modal',
    active: !!selectedTeamId,
    onBack: () => navigate({ selectedTeamId: null }),
    priority: 30,
  });

  useBackHandler({
    id: 'app-tournament-invite-modal',
    active: !!selectedTournamentInvite,
    onBack: () => navigate({ selectedTournamentInvite: null }),
    priority: 30,
  });

  useBackHandler({
    id: 'app-admin-reservation-modal',
    active: !!selectedAdminReservationId,
    onBack: () => navigate({ selectedAdminReservationId: null, selectedNotificationId: null }),
    priority: 30,
  });

  // Disputes & Notifications count for navbar badge
  const [disputeCount, setDisputeCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);

  // Update initial tab based on authentication and enforce route guards
  useEffect(() => {
    if (!loading) {
      if (user) {
        if (currentTab === 'visitor') {
          navigate({ tab: 'dashboard' }, { clearHistory: true });
        }
      } else {
        // Enforce route-level protection for Play Match
        if (['play', 'match_room'].includes(currentTab)) {
          showToast('info', 'Login Required', 'Please log in to access Play Match.');
          setAuthNoticeMessage('Please log in to access Play Match.');
          setReturnDestination('play');
          setAuthModalMode('login');
          setAuthModalOpen(true);
          navigate({ tab: 'visitor' }, { clearHistory: true });
        } else if (['leaderboard', 'hall_of_fame'].includes(currentTab)) {
          // Enforce route-level protection for Rankings
          showToast('info', 'Login Required', 'Please log in to view Rankings.');
          setAuthNoticeMessage('Please log in to view Rankings.');
          setReturnDestination(currentTab);
          setAuthModalMode('login');
          setAuthModalOpen(true);
          navigate({ tab: 'visitor' }, { clearHistory: true });
        } else if (
          ['dashboard', 'matches', 'profile', 'notifications', 'admin', 'staff', 'announcements'].includes(currentTab)
        ) {
          navigate({ tab: 'visitor' }, { clearHistory: true });
        }
      }
    }
  }, [user, loading, currentTab, navigate, showToast]);

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
    setSelectedInvitationId(invitationId || null);
    navigate({
      tab: 'match_room',
      selectedMatchId: matchId,
      selectedNotificationId: invitationId || null,
    });
  };

  const handleSelectMatchInvite = (data: { invitationId?: string; lobbyId: string; teamId?: string }) => {
    setSelectedInvitationId(data.invitationId || null);
    navigate({
      tab: 'match_room',
      selectedMatchId: data.lobbyId,
      selectedNotificationId: data.invitationId || null,
    });
  };

  const handleSelectPlayerProfile = (playerId: string) => {
    navigate({
      tab: 'player_dossier',
      selectedPlayerId: playerId,
    });
  };

  const handleSelectTeamProfile = (teamId: string) => {
    navigate({ selectedTeamId: teamId });
  };

  const handleOpenAuth = (
    mode: 'login' | 'register' = 'login',
    notice?: string,
    returnTo?: string
  ) => {
    setAuthModalMode(mode);
    setAuthNoticeMessage(notice || null);
    if (returnTo) {
      setReturnDestination(returnTo);
    }
    setAuthModalOpen(true);
  };

  const handleRequirePlayMatch = () => {
    showToast('info', 'Login Required', 'Please log in to access Play Match.');
    handleOpenAuth('login', 'Please log in to access Play Match.', 'play');
  };

  const handleRequireRankings = (targetTab: string = 'leaderboard') => {
    showToast('info', 'Login Required', 'Please log in to view Rankings.');
    handleOpenAuth('login', 'Please log in to view Rankings.', targetTab);
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
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mt-6 mb-2" />
        <p className="text-xs text-neutral-400 font-mono">Connecting to Nexus competitive match network...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-[#e2e8f0] flex flex-col selection:bg-red-600 selection:text-white">
      {/* Navigation Top Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          navigate({ tab, selectedMatchId: null, selectedPlayerId: null });
        }}
        onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
        onOpenCreateMatch={handleOpenCreateMatch}
        onOpenWallet={() => setWalletModalOpen(true)}
        disputeCount={disputeCount}
        unreadNotificationsCount={unreadNotifsCount}
      />

      {/* Main Content Area */}
      <main className={`flex-1 w-full ${currentTab === 'visitor' && !user ? 'flex flex-col' : 'pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6'}`}>
        {/* ACCOUNT SUSPENDED RESTRICTION */}
        {user && isAccountSuspended ? (
          <AccountSuspendedView />
        ) : user && profileMissing ? (
          /* MISSING PROFILE RECOVERY */
          <ProfileRecoveryView />
        ) : (
          <>
            {/* VISITOR INTERFACE - PUBLIC LANDING SCREEN */}
            {currentTab === 'visitor' && (
              <VisitorHomeView
                onOpenAuth={handleOpenAuth}
                onNavigateToMatchmaking={handleRequirePlayMatch}
                onNavigateToReservations={() => navigate({ tab: 'reservations' })}
                onSelectPlayerProfile={handleSelectPlayerProfile}
                onSelectTeamProfile={handleSelectTeamProfile}
                onOpenRankingGuide={() => navigate({ tab: 'ranking_system' })}
                onNavigateToTournaments={handleNavigateToTournaments}
                onSelectMatch={handleSelectMatch}
                onNavigateToMatchHistory={() => navigate({ tab: 'match_history' })}
                onNavigateToLeaderboard={() => handleRequireRankings('leaderboard')}
                onNavigateToHallOfFame={() => handleRequireRankings('hall_of_fame')}
              />
            )}

            {/* 🎮 PLAY PAGE (GAME SELECTION & LOBBIES) - LOGIN REQUIRED */}
            {user && currentTab === 'play' && (
              <PlayHubView
                onSelect1v1Game={(gameId) => {
                  if (!user) {
                    handleOpenAuth('login');
                    return;
                  }
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
                onNavigateToHistory={() => navigate({ tab: 'match_history' })}
              />
            )}

        {/* PLAYER INTERFACE: DASHBOARD */}
        {user && currentTab === 'dashboard' && (
          <PlayerDashboard
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectTab={(tab) => navigate({ tab })}
            onSelectMatch={handleSelectMatch}
            onOpenAdminSetup={() => setAdminSetupOpen(true)}
            onOpenRankingGuide={() => navigate({ tab: 'ranking_system' })}
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
            onSelectTournamentInvite={(inviteData) => navigate({ selectedTournamentInvite: inviteData })}
            onSelectReservation={(reservationId, notifId) => {
              if (isAdmin || isStaff) {
                navigate({
                  selectedAdminReservationId: reservationId,
                  selectedNotificationId: notifId || null,
                });
              } else {
                navigate({ tab: 'reservations' });
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

        {/* 📢 COMMUNITY ANNOUNCEMENTS */}
        {user && currentTab === 'announcements' && (
          <AnnouncementsView
            onOpenAuth={handleOpenAuth}
            onOpenModeration={() => {
              if (isAdmin || isStaff) {
                navigate({ tab: 'admin' });
              }
            }}
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

        {/* ACTIVE MATCH ROOM - LOGIN REQUIRED */}
        {user && currentTab === 'match_room' && selectedMatchId && (
          <LiveMatchRoom
            matchId={selectedMatchId}
            invitationId={selectedInvitationId || undefined}
            onBack={() => {
              goBack();
            }}
            onViewLeaderboard={() => {
              navigate({ tab: 'leaderboard', selectedMatchId: null });
            }}
          />
        )}

        {/* PUBLIC / PLAYER LEADERBOARDS - LOGIN REQUIRED */}
        {user && currentTab === 'leaderboard' && (
          <LeaderboardView
            onSelectPlayerProfile={handleSelectPlayerProfile}
            onOpenRankingGuide={() => navigate({ tab: 'ranking_system' })}
            onNavigateToHallOfFame={() => navigate({ tab: 'hall_of_fame' })}
          />
        )}

        {/* HALL OF FAME - LOGIN REQUIRED */}
        {user && currentTab === 'hall_of_fame' && (
          <HallOfFameView
            onSelectPlayer={handleSelectPlayerProfile}
            onNavigateToActiveSeason={() => navigate({ tab: 'leaderboard' })}
          />
        )}

        {/* RANKING SYSTEM GUIDE */}
        {currentTab === 'ranking_system' && (
          <HowRankingWorksView
            onOpenAuth={(mode) => handleOpenAuth(mode || 'login')}
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectGameLeaderboard={() => navigate({ tab: 'leaderboard' })}
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
            onNavigateToHallOfFame={() => navigate({ tab: 'hall_of_fame' })}
          />
        )}

        {/* PLAYER PUBLIC DOSSIER */}
        {currentTab === 'player_dossier' && selectedPlayerId && (
          <PlayerProfileView
            playerId={selectedPlayerId}
            onOpenCreateMatch={handleOpenCreateMatch}
            onSelectMatch={handleSelectMatch}
            onNavigateToHallOfFame={() => navigate({ tab: 'hall_of_fame' })}
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
        noticeMessage={authNoticeMessage}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthModalPrefillEmail('');
          setAuthNoticeMessage(null);
        }}
        onSuccess={() => {
          setAuthModalOpen(false);
          setAuthModalPrefillEmail('');
          setAuthNoticeMessage(null);
          if (returnDestination) {
            const dest = returnDestination;
            setReturnDestination(null);
            navigate({ tab: dest }, { clearHistory: true });
          } else {
            navigate({ tab: 'dashboard' }, { clearHistory: true });
          }
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
          navigate({ tab: 'fidelity_card' });
        }}
        onOpenFidelityCard={() => {
          setWalletModalOpen(false);
          navigate({ tab: 'fidelity_card' });
        }}
      />

      {/* Team Profile Modal */}
      {selectedTeamId && (
        <TeamProfileModal
          teamId={selectedTeamId}
          isOpen={true}
          onClose={() => navigate({ selectedTeamId: null })}
          onSelectPlayerProfile={handleSelectPlayerProfile}
          onSelectMatch={handleSelectMatch}
        />
      )}

      {/* Team Tournament Invitation Modal */}
      {selectedTournamentInvite && (
        <TeamTournamentInvitationModal
          isOpen={true}
          onClose={() => navigate({ selectedTournamentInvite: null })}
          currentUser={playerProfile || undefined}
          invitationId={selectedTournamentInvite.invitationId}
          teamId={selectedTournamentInvite.teamId}
          tournamentId={selectedTournamentInvite.tournamentId}
          onInvitationAccepted={() => {
            navigate({ selectedTournamentInvite: null });
          }}
          onInvitationDeclined={() => {
            navigate({ selectedTournamentInvite: null });
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
            navigate({ selectedAdminReservationId: null, selectedNotificationId: null });
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
        <NavigationProvider>
          <NexusAppContent />
        </NavigationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
