import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardForm, KeyboardFrame } from '../components/KeyboardForm';
import { PrimaryButton } from '../components/ui';
import { openPrivacyPolicy } from '../lib/links';
import { useAppState } from '../state/AppState';
import { authStyles, C, s } from '../theme';

type Mode = 'login' | 'signup' | 'reset';

export default function LoginScreen() {
  const { authBusy: busy, authError: error, authNotice: notice, doAuth, requestReset, confirmReset } = useAppState();
  const [mode, setMode] = useState<Mode>('login');
  const [resetStep, setResetStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const busyText = mode === 'signup' ? 'Creando tu cuenta… Espera a la confirmación del servicio.' : mode === 'reset' ? 'Un momento…' : 'Iniciando sesión…';
  const goTo = (next: Mode) => { setMode(next); setResetStep('email'); setCode(''); setPassword(''); };
  return <SafeAreaView style={s.screen}><StatusBar style="dark" /><KeyboardFrame>
    {busy || error || notice ? <View testID="auth-feedback" accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined} style={[styles.feedback, error ? styles.feedbackError : null]}><Text style={[styles.feedbackText, error ? { color: C.red } : null]}>{busy ? busyText : error || notice}</Text></View> : null}
    <KeyboardForm contentContainerStyle={authStyles.screen}><View style={authStyles.brand}><Image accessibilityLabel="Logo iHambre" source={require('../../assets/icon.png')} style={authStyles.logo} /><Text style={s.brand}>iHambre</Text><Text style={authStyles.title}>Menú & compra</Text><Text style={authStyles.intro}>Una semana más sencilla, entre los dos.</Text></View>
    {mode === 'reset' ? <View style={authStyles.card}><Text style={s.eyebrow}>RECUPERAR CONTRASEÑA</Text><Text style={s.sectionTitle}>Nueva contraseña</Text>
      <Text style={s.fieldLabel}>CORREO ELECTRÓNICO</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vosotros@correo.com" style={s.input} editable={resetStep === 'email'} />
      {resetStep === 'email' ? <>
        <Text style={s.fieldHint}>Te enviaremos un código por correo para elegir una contraseña nueva.</Text>
        <PrimaryButton label="Enviar código" disabled={busy || !email} onPress={async () => { if (await requestReset(email)) setResetStep('code'); }} />
      </> : <>
        <Text style={s.fieldLabel}>CÓDIGO DEL CORREO</Text><TextInput accessibilityLabel="Código del correo" keyboardType="number-pad" autoComplete="one-time-code" value={code} onChangeText={text => setCode(text.replace(/\D/g, ''))} placeholder="123456" maxLength={10} style={[s.input, s.codeInput]} />
        <Text style={s.fieldLabel}>CONTRASEÑA NUEVA</Text><TextInput accessibilityLabel="Contraseña nueva" secureTextEntry value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" style={s.input} />
        <PrimaryButton label="Guardar y entrar" disabled={busy || code.length < 6 || password.length < 6} onPress={() => confirmReset(email, code, password)} />
        <Pressable disabled={busy} onPress={() => requestReset(email)} style={authStyles.modeLink}><Text style={authStyles.modeLinkText}>Enviar otro código</Text></Pressable>
      </>}
      <Pressable disabled={busy} onPress={() => goTo('login')} style={authStyles.modeLink}><Text style={authStyles.modeLinkText}>Volver a iniciar sesión</Text></Pressable>
    </View> : <View style={authStyles.card}><Text style={s.eyebrow}>{mode === 'login' ? 'QUÉ BUENO VERTE' : 'EMPEZAR JUNTOS'}</Text><Text style={s.sectionTitle}>{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</Text>
      <Text style={s.fieldLabel}>CORREO ELECTRÓNICO</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vosotros@correo.com" style={s.input} />
      <Text style={s.fieldLabel}>CONTRASEÑA</Text><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" style={s.input} />
      <PrimaryButton label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} disabled={busy || !email || password.length < 6} onPress={() => doAuth(mode, email, password)} />
      {mode === 'login' ? <Pressable disabled={busy} onPress={() => goTo('reset')} style={styles.forgotLink}><Text style={authStyles.modeLinkText}>¿Has olvidado tu contraseña?</Text></Pressable> : null}
      <Pressable disabled={busy} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={authStyles.modeLink}><Text style={authStyles.modeLinkText}>{mode === 'login' ? '¿Primera vez? Crea una cuenta' : 'Ya tengo cuenta · Iniciar sesión'}</Text></Pressable>
    </View>}
    <Text style={styles.foot}>Cuenta privada para compartir recetas y compra solo con quien invites.</Text>
    <Pressable accessibilityRole="link" onPress={openPrivacyPolicy} style={styles.privacyLink}><Text style={styles.privacyText}>Política de privacidad</Text></Pressable>
  </KeyboardForm></KeyboardFrame></SafeAreaView>;
}

const styles = StyleSheet.create({
  feedback: { flexShrink: 0, marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: C.green, backgroundColor: '#e7f0e3' },
  feedbackError: { borderColor: C.red, backgroundColor: '#f8e7e2' },
  feedbackText: { color: C.green, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  foot: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 11 },
  forgotLink: { alignItems: 'center', paddingTop: 12 },
  privacyLink: { alignItems: 'center', padding: 10 },
  privacyText: { color: C.muted, fontSize: 11, textDecorationLine: 'underline' },
});
