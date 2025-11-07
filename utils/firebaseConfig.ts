// utils/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging"; // Optional if you're using notifications
import Constants from "expo-constants";

const firebaseConfig = {
  apiKey: "AIzaSyAENaXStkbX_9GvDGI7rQl7rxOKweLoLvA",
  authDomain: "youlite-e2dd4.firebaseapp.com",
  projectId: "youlite-e2dd4",
  storageBucket: "youlite-e2dd4.firebasestorage.app",
  messagingSenderId: "80955700657",
  appId: "1:80955700657:android:28d6ce359938c22e96b990",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// (Optional) Get the messaging instance
export const messaging = getMessaging(app);
