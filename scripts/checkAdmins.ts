import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || '(default)');

async function checkAdmins() {
  const snap = await getDocs(collection(db, 'players'));
  console.log(`Found ${snap.size} players:`);
  snap.forEach((d) => {
    const data = d.data();
    if (data.role && data.role !== 'player' && data.role !== 'PLAYER') {
      console.log(`- ADMIN/STAFF: UID: ${d.id}, email: ${data.email}, gamerTag: ${data.gamerTag}, role: ${data.role}`);
    }
  });
  // Also check users collection
  const uSnap = await getDocs(collection(db, 'users'));
  console.log(`Found ${uSnap.size} users:`);
  uSnap.forEach((d) => {
    const data = d.data();
    if (data.role && data.role !== 'player' && data.role !== 'PLAYER') {
      console.log(`- USERS collection ADMIN/STAFF: UID: ${d.id}, email: ${data.email}, role: ${data.role}`);
    }
  });
  process.exit(0);
}

checkAdmins();
