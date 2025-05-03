// src/lib/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAc3tx7D9zJGNEFcZmvMXqFVQnS9Y7HAz8",
  authDomain: "dandyloyaltyapp.firebaseapp.com",
  projectId: "dandyloyaltyapp",
  storageBucket: "dandyloyaltyapp.firebasestorage.app",
  messagingSenderId: "1013359985976",
  appId: "1:1013359985976:web:f9504952d8883e0b642dcd"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const firestore = getFirestore(app)
