import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../context/NavigationContext';
import { NexusLogo } from './NexusLogo';
import {
  Bell,
  Coins,
  LogOut,
  LogIn,
  Menu,
  X,
  Shield,
  Briefcase,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onOpenCreateMatch: () => void;
  onOpenWallet?: () => void;
  disputeCount?: number;
  unreadNotificationsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenAuth,
  onOpenWallet,
  unreadNotificationsCount = 0,
}) => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useBackHandler({
    id: 'navbar-mobile-drawer',
    active: mobileMenuOpen,
    onBack: () => setMobileMenuOpen(false),
    priority: 25,
  });

  const playerNavItems = [
    { id: 'dashboard', label: 'Home' },
    { id: 'reservations', label: 'Book a PC' },
    { id: 'play', label: 'Matchmaking' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'match_history', label: 'History' },
    { id: 'leaderboard', label: 'Rankings' },
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'teams', label: 'Squads' },
    { id: 'fidelity_card', label: 'Rewards' },
    { id: 'profile', label: 'Profile' },
  ];

  const visitorNavItems = [
    { id: 'visitor', label: 'Home' },
    { id: 'reservations', label: 'Book a PC' },
  ];

  const activeNavItems = user ? playerNavItems : visitorNavItems;
  const coinsBalance = playerProfile?.nexusCoins ?? (playerProfile as any)?.coins ?? 0;

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => handleNavClick(user ? 'dashboard' : 'visitor')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded py-1 cursor-pointer"
          >
            <NexusLogo size="sm" showWordmark={true} />
          </button>
        </div>

        {/* Desktop Main Navigation */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {activeNavItems.map((item) => {
            const isActive =
              currentTab === item.id ||
              (item.id === 'reservations' && currentTab === 'booking') ||
              (item.id === 'play' && currentTab === 'match_room') ||
              (item.id === 'leaderboard' && (currentTab === 'hall_of_fame' || currentTab === 'ranking_system'));

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`px-2.5 lg:px-3 py-1.5 rounded-md text-[11px] lg:text-xs font-bold font-display uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'text-white border-b-2 border-red-600 font-black bg-red-600/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Section: Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              {/* Nexus Coins Wallet Pill */}
              <button
                onClick={onOpenWallet}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-white/10 hover:border-red-600/50 text-white text-xs font-mono font-bold transition-colors cursor-pointer"
                title="Nexus Coins balance"
              >
                <Coins className="w-3.5 h-3.5 text-red-500" />
                <span>{coinsBalance} NC</span>
              </button>

              {/* Small Notification Icon */}
              <button
                onClick={() => handleNavClick('notifications')}
                className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                  currentTab === 'notifications'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600 ring-2 ring-black" />
                )}
              </button>

              {/* Staff / Admin Switcher */}
              {isStaff && !isAdmin && (
                <button
                  onClick={() => handleNavClick('staff')}
                  className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    currentTab === 'staff'
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 text-neutral-300 hover:text-white border border-white/10'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5 text-red-500" />
                  <span>Staff Desk</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => handleNavClick('admin')}
                  className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    currentTab === 'admin'
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 text-neutral-300 hover:text-white border border-white/10'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-red-500" />
                  <span>{isSuperAdmin ? 'Admin Panel' : 'Admin'}</span>
                </button>
              )}

              {/* GamerTag / Logout */}
              <div className="flex items-center gap-2 pl-1 border-l border-white/10">
                <button
                  onClick={() => handleNavClick('profile')}
                  className="hidden sm:block text-xs font-bold text-white hover:text-red-500 transition-colors truncate max-w-[120px] cursor-pointer"
                >
                  {playerProfile?.gamerTag || 'Player'}
                </button>

                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-neutral-900 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              <button
                id="nav-signin-btn"
                onClick={() => onOpenAuth('login')}
                className="text-neutral-300 hover:text-white transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-neutral-900"
              >
                Sign In
              </button>
              <button
                id="nav-signup-btn"
                onClick={() => onOpenAuth('register')}
                className="bg-red-600 hover:bg-red-500 text-white font-bold transition-colors cursor-pointer px-3 py-1.5 rounded-lg shadow-sm"
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Large Hamburger Menu on Mobile */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2.5 rounded-xl text-white hover:text-red-500 hover:bg-neutral-900 transition-colors cursor-pointer border border-white/10"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6 stroke-[2.2]" /> : <Menu className="w-6 h-6 stroke-[2.2]" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-red-950/60 bg-black/98 px-4 pt-3 pb-6 space-y-1.5 shadow-2xl animate-in slide-in-from-top-2 duration-200">
          {activeNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-bold font-display uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-between ${
                currentTab === item.id
                  ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]'
                  : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
              }`}
            >
              <span>{item.label}</span>
              {currentTab === item.id && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            </button>
          ))}

          {/* Staff / Admin Mobile Links */}
          {user && isStaff && (
            <button
              onClick={() => handleNavClick('staff')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-bold font-display uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer ${
                currentTab === 'staff'
                  ? 'bg-red-600 text-white'
                  : 'text-red-400 hover:bg-neutral-900'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Staff Desk</span>
            </button>
          )}

          {user && isAdmin && (
            <button
              onClick={() => handleNavClick('admin')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-bold font-display uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-red-600 text-white'
                  : 'text-red-400 hover:bg-neutral-900'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Admin Panel</span>
            </button>
          )}

          {!user && (
            <div className="pt-4 mt-2 border-t border-white/10 grid grid-cols-2 gap-3 text-sm font-mono">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('login');
                }}
                className="w-full py-3 rounded-xl bg-neutral-900 text-white font-bold text-center border border-white/15 hover:border-red-500/60 transition-colors cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('register');
                }}
                className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-center hover:bg-red-500 transition-colors cursor-pointer shadow-[0_0_20px_rgba(220,38,38,0.4)]"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
