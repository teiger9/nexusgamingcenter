import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Game } from '../types';

export const INITIAL_GAMES: (Omit<Game, 'id'> & { customId?: string })[] = [
  // 1v1 CHESS
  {
    customId: 'chess',
    name: 'Chess',
    category: 'CHESS',
    description: 'Competitive 1v1 over-the-board strategy game with tournament clock timer.',
    active: true,
    createdAt: Date.now(),
  },
  // 1v1 FC (Unified FC 26 & FC 27)
  {
    customId: 'fc',
    name: 'FC',
    category: 'FC',
    description: 'Premier competitive 1v1 football tournament standard. Unified ranking for FC26 & FC27.',
    active: true,
    createdAt: Date.now(),
  },
  // 5v5 VALORANT
  {
    customId: 'valorant',
    name: 'Valorant',
    category: 'VALORANT',
    description: 'Character-based 5v5 tactical shooter with ability economy and site control.',
    active: true,
    createdAt: Date.now(),
  },
  // 5v5 CS2
  {
    customId: 'cs2',
    name: 'CS2',
    category: 'CS2',
    description: 'Competitive 5v5 tactical FPS with sub-tick precision gunplay and utility.',
    active: true,
    createdAt: Date.now(),
  },
  // 5v5 LEAGUE OF LEGENDS
  {
    customId: 'lol',
    name: 'League of Legends',
    category: 'LEAGUE_OF_LEGENDS',
    description: 'Competitive 5v5 multiplayer online battle arena with macro strategy and team coordination.',
    active: true,
    createdAt: Date.now(),
  },
];

export async function ensureInitialGamesSeeded(): Promise<void> {
  try {
    const gamesRef = collection(db, 'games');
    const snapshot = await getDocs(gamesRef);

    const existingDocs = new Set(snapshot.docs.map((d) => d.id));

    // Only attempt seed writes if any games are missing and current user is authorized
    const missingGames = INITIAL_GAMES.filter((g) => {
      const docId = g.customId || g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return !existingDocs.has(docId);
    });

    if (missingGames.length === 0) {
      return; // All games already seeded
    }

    for (const gameData of missingGames) {
      const docId = gameData.customId || gameData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const gameDocRef = doc(db, 'games', docId);
      const { customId, ...rest } = gameData;
      await setDoc(gameDocRef, {
        ...rest,
        id: docId,
      }, { merge: true }).catch(() => {});
    }
  } catch (error) {
    console.warn('Initial games seed check encountered an issue:', error);
  }
}

