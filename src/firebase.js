import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUDXI_ftVJRLxFzsXDgm3xOB00b1PkA64",
  authDomain: "comerzoid-efd7f.firebaseapp.com",
  projectId: "comerzoid-efd7f",
  storageBucket: "comerzoid-efd7f.firebasestorage.app",
  messagingSenderId: "560982722367",
  appId: "1:560982722367:web:705b7011697c74f3c1358a",
  measurementId: "G-5WWSG330NH",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
