import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardForm, KeyboardFrame } from '../components/KeyboardForm';
import { PrimaryButton } from '../components/ui';
import { useAppState } from '../state/AppState';
import { authStyles, C, s } from '../theme';

// Tras iniciar sesión sin casa: crear una o unirse con un código.
export default function HouseholdScreen() {
  const app = useAppState();
  const busy = app.busy || app.logoutBusy;
  const error = app.logoutError || app.error;
  const [mode, setMode] = useState<'create' | 'join'>('create'); const [name, setName] = useState('Nuestra casa'); const [code, setCode] = useState('');
  return <SafeAreaView style={s.screen}><StatusBar style="dark" /><KeyboardFrame><KeyboardForm contentContainerStyle={authStyles.screen}><View style={authStyles.brand}><Image accessibilityLabel="Logo iHambre" source={require('../../assets/icon.png')} style={authStyles.logo} /><Text style={s.brand}>iHambre</Text><Text style={authStyles.title}>Con quién compartes</Text><Text style={authStyles.intro}>{app.userEmail}</Text></View>
    <View style={authStyles.card}><View style={styles.segment}><Pressable onPress={() => setMode('create')} style={[styles.segmentPart, mode === 'create' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'create' && styles.segmentTextActive]}>Crear casa</Text></Pressable><Pressable onPress={() => setMode('join')} style={[styles.segmentPart, mode === 'join' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'join' && styles.segmentTextActive]}>Unirme</Text></Pressable></View>
      {mode === 'create' ? <><Text style={s.fieldLabel}>NOMBRE DE LA CASA</Text><TextInput value={name} onChangeText={setName} placeholder="Nuestra casa" style={s.input} /><Text style={s.fieldHint}>Después podrás compartir un código para que tu pareja se una.</Text><PrimaryButton label={busy ? 'Creando…' : 'Crear casa compartida'} disabled={busy} onPress={() => app.makeHouse(name)} /></> : <><Text style={s.fieldLabel}>CÓDIGO DE INVITACIÓN</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="8 letras o números" style={[s.input, s.codeInput]} maxLength={8} /><Text style={s.fieldHint}>Pídele el código a quien creó la casa.</Text><PrimaryButton label={busy ? 'Uniéndome…' : 'Unirme a la casa'} disabled={busy || code.trim().length < 8} onPress={() => app.enterHouse(code)} /></>}
      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </View><Pressable onPress={app.signOut} style={authStyles.modeLink}><Text style={authStyles.modeLinkText}>Cerrar sesión</Text></Pressable>
  </KeyboardForm></KeyboardFrame></SafeAreaView>;
}

const styles = StyleSheet.create({
  segment: { padding: 3, backgroundColor: C.pale, borderRadius: 12, flexDirection: 'row', marginBottom: 17 },
  segmentPart: { flex: 1, height: 37, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: C.paper },
  segmentText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  segmentTextActive: { color: C.green },
});
