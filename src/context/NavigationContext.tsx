import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';

export interface ScreenState {
  tab: string;
  selectedMatchId?: string | null;
  selectedPlayerId?: string | null;
  selectedTeamId?: string | null;
  selectedTournamentId?: string | null;
  selectedTournamentInvite?: {
    invitationId?: string;
    teamId?: string;
    tournamentId?: string;
  } | null;
  selectedAdminReservationId?: string | null;
  selectedNotificationId?: string | null;
}

export interface BackHandler {
  id: string;
  onBack: () => boolean | void;
  priority?: number; // Higher number = higher priority (runs first)
}

interface NavigationContextType {
  currentScreen: ScreenState;
  screenHistory: ScreenState[];
  navigate: (
    screenUpdates: Partial<ScreenState>,
    options?: { replace?: boolean; clearHistory?: boolean }
  ) => void;
  goBack: () => boolean;
  canGoBack: boolean;
  registerBackHandler: (handler: BackHandler) => () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

function areScreensEqual(a: ScreenState, b: ScreenState): boolean {
  return (
    a.tab === b.tab &&
    (a.selectedMatchId || null) === (b.selectedMatchId || null) &&
    (a.selectedPlayerId || null) === (b.selectedPlayerId || null) &&
    (a.selectedTeamId || null) === (b.selectedTeamId || null) &&
    (a.selectedTournamentId || null) === (b.selectedTournamentId || null) &&
    (a.selectedAdminReservationId || null) === (b.selectedAdminReservationId || null)
  );
}

interface NavigationProviderProps {
  children: ReactNode;
  initialTab?: string;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialTab = 'visitor',
}) => {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>({
    tab: initialTab,
    selectedMatchId: null,
    selectedPlayerId: null,
    selectedTeamId: null,
    selectedTournamentId: null,
    selectedTournamentInvite: null,
    selectedAdminReservationId: null,
    selectedNotificationId: null,
  });

  const currentScreenRef = useRef<ScreenState>(currentScreen);
  currentScreenRef.current = currentScreen;

  const screenHistoryRef = useRef<ScreenState[]>([]);
  const overlayHandlersRef = useRef<BackHandler[]>([]);
  const ignorePopstateCountRef = useRef<number>(0);
  const poppedHandlerIdRef = useRef<string | null>(null);

  // Register an overlay/modal back handler
  const registerBackHandler = useCallback((handler: BackHandler) => {
    // Remove any existing handler with identical ID
    overlayHandlersRef.current = overlayHandlersRef.current.filter((h) => h.id !== handler.id);
    overlayHandlersRef.current.push(handler);
    // Sort ascending by priority so the highest priority handler is at the end of the array
    overlayHandlersRef.current.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    // Push a browser history entry so Android/browser back button can fire popstate
    try {
      window.history.pushState({ type: 'nexus_overlay', id: handler.id }, '');
    } catch {
      // Ignore if pushState fails in restricted sandbox
    }

    return () => {
      // Unregister
      const index = overlayHandlersRef.current.findIndex((h) => h.id === handler.id);
      if (index !== -1) {
        overlayHandlersRef.current.splice(index, 1);
      }

      // If this modal was closed via in-app UI (X button, backdrop, cancel, submit)
      // rather than the Android back button, we must pop the history entry that was created for it.
      if (poppedHandlerIdRef.current !== handler.id) {
        try {
          ignorePopstateCountRef.current++;
          window.history.back();
        } catch {
          ignorePopstateCountRef.current = Math.max(0, ignorePopstateCountRef.current - 1);
        }
      }
    };
  }, []);

  // Screen navigation
  const navigate = useCallback(
    (
      screenUpdates: Partial<ScreenState>,
      options?: { replace?: boolean; clearHistory?: boolean }
    ) => {
      const nextScreen: ScreenState = {
        tab: screenUpdates.tab ?? currentScreenRef.current.tab,
        selectedMatchId:
          screenUpdates.selectedMatchId !== undefined
            ? screenUpdates.selectedMatchId
            : screenUpdates.tab && screenUpdates.tab !== currentScreenRef.current.tab
            ? null
            : currentScreenRef.current.selectedMatchId,
        selectedPlayerId:
          screenUpdates.selectedPlayerId !== undefined
            ? screenUpdates.selectedPlayerId
            : screenUpdates.tab && screenUpdates.tab !== currentScreenRef.current.tab
            ? null
            : currentScreenRef.current.selectedPlayerId,
        selectedTeamId:
          screenUpdates.selectedTeamId !== undefined
            ? screenUpdates.selectedTeamId
            : screenUpdates.tab && screenUpdates.tab !== currentScreenRef.current.tab
            ? null
            : currentScreenRef.current.selectedTeamId,
        selectedTournamentId:
          screenUpdates.selectedTournamentId !== undefined
            ? screenUpdates.selectedTournamentId
            : screenUpdates.tab && screenUpdates.tab !== currentScreenRef.current.tab
            ? null
            : currentScreenRef.current.selectedTournamentId,
        selectedTournamentInvite:
          screenUpdates.selectedTournamentInvite !== undefined
            ? screenUpdates.selectedTournamentInvite
            : null,
        selectedAdminReservationId:
          screenUpdates.selectedAdminReservationId !== undefined
            ? screenUpdates.selectedAdminReservationId
            : null,
        selectedNotificationId:
          screenUpdates.selectedNotificationId !== undefined
            ? screenUpdates.selectedNotificationId
            : null,
      };

      if (areScreensEqual(currentScreenRef.current, nextScreen)) {
        return;
      }

      if (options?.clearHistory) {
        screenHistoryRef.current = [];
        try {
          window.history.replaceState(
            { type: 'nexus_screen', depth: 0, screen: nextScreen },
            ''
          );
        } catch {}
      } else if (options?.replace) {
        try {
          window.history.replaceState(
            { type: 'nexus_screen', depth: screenHistoryRef.current.length, screen: nextScreen },
            ''
          );
        } catch {}
      } else {
        screenHistoryRef.current.push(currentScreenRef.current);
        try {
          window.history.pushState(
            { type: 'nexus_screen', depth: screenHistoryRef.current.length, screen: nextScreen },
            ''
          );
        } catch {}
      }

      setCurrentScreen(nextScreen);
    },
    []
  );

  // Global back action (can be called by in-app Back button or popstate)
  const goBack = useCallback(() => {
    // If there is an active overlay or modal:
    if (overlayHandlersRef.current.length > 0) {
      try {
        window.history.back();
        return true;
      } catch {
        // Fallback if history.back fails
        const handler = overlayHandlersRef.current.pop();
        if (handler) {
          handler.onBack();
          return true;
        }
      }
    }

    // If there is screen history:
    if (screenHistoryRef.current.length > 0) {
      try {
        window.history.back();
        return true;
      } catch {
        const prev = screenHistoryRef.current.pop();
        if (prev) {
          setCurrentScreen(prev);
          return true;
        }
      }
    }

    return false;
  }, []);

  // Listen to popstate for Android system Back button & browser navigation
  useEffect(() => {
    // Initial state setup if not already set
    try {
      if (!window.history.state || window.history.state.type !== 'nexus_screen') {
        window.history.replaceState(
          { type: 'nexus_screen', depth: 0, screen: currentScreenRef.current },
          ''
        );
      }
    } catch {}

    const handlePopState = () => {
      // Check if this was a programmatic back triggered when closing an overlay via UI
      if (ignorePopstateCountRef.current > 0) {
        ignorePopstateCountRef.current--;
        return;
      }

      // Priority 1: Check active overlay / modal handlers
      if (overlayHandlersRef.current.length > 0) {
        const topHandler = overlayHandlersRef.current.pop()!;
        poppedHandlerIdRef.current = topHandler.id;
        try {
          topHandler.onBack();
        } finally {
          setTimeout(() => {
            if (poppedHandlerIdRef.current === topHandler.id) {
              poppedHandlerIdRef.current = null;
            }
          }, 60);
        }
        return;
      }

      // Priority 2: Universal DOM-level modal fallback (safety net for any modal/drawer in DOM)
      const domModal = document.querySelector(
        '[role="dialog"], .fixed.inset-0.z-50, .fixed.inset-0[class*="z-"]'
      );
      if (domModal) {
        const closeBtn = domModal.querySelector<HTMLButtonElement>(
          'button[aria-label*="close" i], button[title*="close" i], button:has(svg.lucide-x), button:has(svg[class*="lucide-x"])'
        );
        if (closeBtn) {
          closeBtn.click();
          return;
        }
      }

      // Priority 3: Screen navigation back stack
      if (screenHistoryRef.current.length > 0) {
        const prevScreen = screenHistoryRef.current.pop()!;
        setCurrentScreen(prevScreen);
        return;
      }

      // Priority 4: Reached initial root screen with no open modals.
      // Normal Android/browser exit behavior takes place naturally!
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        currentScreen,
        screenHistory: screenHistoryRef.current,
        navigate,
        goBack,
        canGoBack: screenHistoryRef.current.length > 0 || overlayHandlersRef.current.length > 0,
        registerBackHandler,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
};

/**
 * Hook to register an Android/browser back button handler for any modal,
 * dialog, drawer, multi-step form, or sub-view.
 */
export function useBackHandler({
  id,
  active,
  onBack,
  priority = 10,
}: {
  id: string;
  active: boolean;
  onBack: () => void;
  priority?: number;
}) {
  const { registerBackHandler } = useNavigation();
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const unregister = registerBackHandler({
      id,
      priority,
      onBack: () => onBackRef.current(),
    });
    return () => {
      unregister();
    };
  }, [active, id, priority, registerBackHandler]);
}
