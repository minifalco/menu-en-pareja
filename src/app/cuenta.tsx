import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackHeader, ConfirmBox, OutlineButton, PrimaryButton } from '../components/ui';
import { authErrorText, errorText } from '../lib/errors';
import { openPrivacyPolicy } from '../lib/links';
import { useAppState } from '../state/AppState';
import { C, s } from '../theme';

// Contraseña, privacidad y borrado de la cuenta (obligatorio en App Store y Google Play).
export default function AccountScreen() {
  const { userEmail, changePassword, deleteAccount } = useAppState();
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function savePassword() {
    setPasswordBusy(true); setPasswordError(''); setPasswordMessage('');
    try {
      await changePassword(password);
      setPassword(''); setPasswordMessage('Contraseña cambiada.');
    } catch (e) { setPasswordError(authErrorText(e)); }
    finally { setPasswordBusy(false); }
  }

  async function removeAccount() {
    setDeleteBusy(true); setDeleteError('');
    try { await deleteAccount(); }
    catch (e) { setDeleteError(`No se pudo borrar la cuenta. ${errorText(e)}`); setDeleteBusy(false); }
  }

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <BackHeader title="Tu cuenta" />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CORREO</Text>
        <Text selectable style={styles.email}>{userEmail}</Text>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>CAMBIAR CONTRASEÑA</Text>
          <TextInput accessibilityLabel="Contraseña nueva" secureTextEntry value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" style={s.input} editable={!passwordBusy} />
          <PrimaryButton label={passwordBusy ? 'Guardando…' : 'Guardar contraseña'} disabled={passwordBusy || password.length < 6} onPress={savePassword} />
          {passwordError ? <Text accessibilityRole="alert" style={s.errorText}>{passwordError}</Text> : null}
          {passwordMessage ? <Text accessibilityLiveRegion="polite" style={styles.okText}>{passwordMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>PRIVACIDAD</Text>
          <Text style={s.fieldHint}>Qué datos guarda iHambre, para qué y cómo ejercer tus derechos.</Text>
          <Pressable accessibilityRole="link" onPress={openPrivacyPolicy} style={styles.link}><Text style={styles.linkText}>Política de privacidad</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>BORRAR CUENTA</Text>
          <Text style={s.fieldHint}>Se borran tu cuenta y tu acceso. Las casas en las que seas la única persona se borran con sus platos, menús y compra; las compartidas siguen para los demás.</Text>
          {confirmDelete
            ? <ConfirmBox text="Esto no se puede deshacer." confirmLabel="Borrar mi cuenta para siempre" busy={deleteBusy} onConfirm={removeAccount} onCancel={() => setConfirmDelete(false)} />
            : <OutlineButton danger label="Borrar mi cuenta" onPress={() => setConfirmDelete(true)} />}
          {deleteError ? <Text accessibilityRole="alert" style={s.errorText}>{deleteError}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  email: { color: C.ink, fontSize: 16, marginTop: 4 },
  card: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper },
  link: { paddingVertical: 10 },
  linkText: { color: C.green, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  okText: { color: C.green, fontSize: 13, marginTop: 10, lineHeight: 19 },
});
