import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA7Y1XDUeGiU3y-mP3oV4F0zYcqPEmsKkc",
  authDomain: "dse-p2-545de.firebaseapp.com",
  databaseURL: "https://dse-p2-545de-default-rtdb.firebaseio.com",
  projectId: "dse-p2-545de",
  storageBucket: "dse-p2-545de.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);