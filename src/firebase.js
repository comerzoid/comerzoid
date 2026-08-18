import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

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
// experimentalAutoDetectLongPolling evita que la conexión se quede "colgada"
// en redes o navegadores que bloquean el método de conexión normal de Firestore.
// persistentLocalCache guarda una copia local de los datos: si la próxima
// visita tiene mala conexión, la tienda puede mostrar la última versión
// guardada en vez de fallar por completo.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
