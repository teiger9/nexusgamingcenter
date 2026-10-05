import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId || '(default)');

async function checkUser() {
  console.log('Checking database:', firebaseConfig.firestoreDatabaseId);
  try {
    const q = query(collection(db, 'players'), where('email', '==', 'babystore153@gmail.com'));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log('No player found with email babystore153@gmail.com');
      // check all players
      const allP = await getDocs(collection(db, 'players'));
      console.log(`Found ${allP.size} total players in database:`);
      allP.forEach((doc) => {
        const d = doc.data();
        console.log(`- UID: ${doc.id}, email: ${d.email}, gamerTag: ${d.gamerTag}, role: ${d.role}`);
      });
    } else {
      snap.forEach((doc) => {
        const d = doc.data();
        console.log('Found player:', { id: doc.id, email: d.email, gamerTag: d.gamerTag, role: d.role });
      });
    }
  } catch (err: any) {
    console.error('Error querying Firestore:', err.message);
  }
  process.exit(0);
}

checkUser();
