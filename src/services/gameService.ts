import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Game, GameCategory } from '../types';

export const INITIAL_GAMES: Omit<Game, 'createdAt'>[] = [
  { id: 'chess', name: 'Chess', category: 'CHESS', description: 'Official physical and digital board clock matches', active: true },
  { id: 'fc', name: 'FC', category: 'FC', description: 'Unified EA Sports FC tournament rig (FC26 & FC27)', active: true },
  { id: 'valorant', name: 'Valorant', category: 'VALORANT', description: 'Character-based 5v5 tactical shooter', active: true },
  { id: 'cs2', name: 'CS2', category: 'CS2', description: 'Counter-Strike 2 competitive 5v5 FPS', active: true },
  { id: 'lol', name: 'League of Legends', category: 'LEAGUE_OF_LEGENDS', description: 'Competitive 5v5 tactical MOBA arena', active: true },
];

export async function seedDefaultGamesIfNeeded(): Promise<Game[]> {
  try {
    const gamesRef = collection(db, 'games');
    const snapshot = await getDocs(gamesRef);
    if (snapshot.empty) {
      const seeded: Game[] = [];
      for (const g of INITIAL_GAMES) {
        const fullGame: Game = {
          ...g,
          createdAt: Date.now(),
        };
        await setDoc(doc(db, 'games', g.id), fullGame);
        seeded.push(fullGame);
      }
      return seeded;
    }
    return snapshot.docs.map((d) => d.data() as Game);
  } catch (err) {
    console.error('Failed to seed default games:', err);
    return INITIAL_GAMES.map(g => ({ ...g, createdAt: Date.now() }));
  }
}

export async function fetchGames(onlyActive: boolean = false): Promise<Game[]> {
  try {
    const gamesRef = collection(db, 'games');
    let q = query(gamesRef, orderBy('name', 'asc'));
    if (onlyActive) {
      q = query(gamesRef, where('active', '==', true), orderBy('name', 'asc'));
    }
    const snapshot = await getDocs(q);
    const REMOVED_GAME_IDS = ['tekken', 'rocket-league', 'mortal-kombat', 'fortnite', 'call-of-duty', 'fc26', 'fc27', 'ea-fc'];
    if (snapshot.empty) {
      const seeded = await seedDefaultGamesIfNeeded();
      return (onlyActive ? seeded.filter(g => g.active) : seeded).filter(g => !REMOVED_GAME_IDS.includes(g.id.toLowerCase()));
    }
    const allGames = snapshot.docs.map((d) => d.data() as Game);
    return allGames.filter(g => !REMOVED_GAME_IDS.includes(g.id.toLowerCase()));
  } catch (err) {
    console.error('Failed to fetch games:', err);
    return INITIAL_GAMES.map(g => ({ ...g, createdAt: Date.now() }));
  }
}

export async function addCustomGame(game: {
  name: string;
  category: GameCategory;
  description?: string;
}): Promise<Game> {
  const id = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const newGame: Game = {
    id,
    name: game.name.trim(),
    category: game.category,
    description: game.description?.trim() || '',
    active: true,
    createdAt: Date.now(),
  };

  await setDoc(doc(db, 'games', id), newGame);
  return newGame;
}

export async function toggleGameActive(gameId: string, currentStatus: boolean): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), {
    active: !currentStatus,
  });
}
