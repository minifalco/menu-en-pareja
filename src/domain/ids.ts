import { randomUUID } from 'expo-crypto';

// Expo supplies native secure randomness on Android/iOS as well as Web Crypto.
export const makeId = () => randomUUID();
