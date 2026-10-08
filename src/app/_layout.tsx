import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingScreen } from '../components/ui';
import { cloudEnabled } from '../data/cloud';
import { AppStateProvider, useAppState } from '../state/AppState';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Notebook: require('../../assets/fonts/PatrickHand-Regular.ttf') });
  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return <SafeAreaProvider><AppStateProvider><RootNavigator /></AppStateProvider></SafeAreaProvider>;
}

// Qué pantallas se pueden ver: sin sesión → login; con sesión pero sin casa → casa;
// con casa (o en modo local, sin Supabase) → pestañas. Al cambiar la condición,
// Expo Router lleva al usuario a la primera pantalla permitida en este orden,
// así que las pantallas secundarias (gestionar-casa, cuenta) van al final.
function RootNavigator() {
  const { sessionReady, userEmail, household } = useAppState();
  if (cloudEnabled && !sessionReady) return <LoadingScreen />;
  const signedIn = cloudEnabled && Boolean(userEmail);
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Protected guard={!cloudEnabled || (signedIn && Boolean(household))}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={cloudEnabled && !signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !household}>
        <Stack.Screen name="casa" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && Boolean(household)}>
        <Stack.Screen name="gestionar-casa" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="cuenta" />
      </Stack.Protected>
    </Stack>
  );
}
