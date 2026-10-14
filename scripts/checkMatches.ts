import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || '(default)');

async function checkMatches() {
  try {
    const q = query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(5));
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} recent matches:`);
    snap.forEach((d) => {
      const m = d.data();
      console.log(`- Match ID: ${d.id}, type: ${m.matchType}, status: ${m.status}, game: ${m.gameName}, createdBy: ${m.createdBy}, lobbyOwner: ${m.lobbyOwnerId}`);
      console.log(`  Team A: [${(m.teamAPlayerIds || []).join(', ')}]`);
      console.log(`  Team B: [${(m.teamBPlayerIds || []).join(', ')}]`);
    });
  } catch (err: any) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

checkMatches();
