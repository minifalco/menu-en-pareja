import { getRandomBytes, randomUUID } from 'expo-crypto';

// Expo supplies native secure randomness on Android/iOS as well as Web Crypto.
export const makeId = () => randomUUID();

// 8 characters from a 32-symbol alphabet without 0/O/1/I; 256 is a multiple of 32, so no bias.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeInviteCode = () => Array.from(getRandomBytes(8), byte => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('');
