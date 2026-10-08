import { Linking } from 'react-native';

export const PRIVACY_URL = 'https://ihambre.top/privacidad.html';

export const openPrivacyPolicy = () => { void Linking.openURL(PRIVACY_URL); };
