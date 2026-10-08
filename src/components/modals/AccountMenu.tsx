import React from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { errorText } from '../../lib/errors';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';
import { PrimaryButton } from '../ui';

export function AccountMenu() {
  const insets = useSafeAreaInsets();
  const { accountModal, setAccountModal, logoutBusy, logoutError, signOut, userEmail, household, busy, setError, setInviteCode, setJoinModal } = useAppState();
  return (
    <Modal visible={accountModal} transparent animationType="fade" onRequestClose={() => { if (!logoutBusy) setAccountModal(false); }}>
      <View style={[styles.optionsShade, { paddingTop: insets.top + 84 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones" disabled={logoutBusy} onPress={() => setAccountModal(false)} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.optionsMenu}>
          <View style={s.modalHeader}><Text style={s.modalTitle}>Opciones</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" disabled={logoutBusy} onPress={() => setAccountModal(false)} style={s.shareButton}><Text style={s.closeGlyph}>×</Text></Pressable></View>
          <Text selectable style={styles.accountEmail}>{userEmail}</Text>
          <Text style={s.fieldHint}>Casa actual: {household?.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Compartir casa" disabled={logoutBusy} onPress={() => { if (household) void Share.share({ message: `Únete a ${household.name} en iHambre con este código: ${household.inviteCode}` }).catch(e => setError(errorText(e))); }} style={styles.optionsRow}><Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M8 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-3M12 15V2m-4 4 4-4 4 4" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={styles.optionsText}>Compartir casa</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Unirme a una casa" disabled={busy || logoutBusy} onPress={() => { setAccountModal(false); setError(''); setInviteCode(''); setJoinModal(true); }} style={styles.optionsRow}><Svg width={24} height={24} viewBox="0 0 24 24"><Path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={styles.optionsText}>Unirme a una casa</Text></Pressable>
          {logoutError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorText}>{logoutError}</Text> : null}
          <PrimaryButton label={logoutBusy ? 'Cerrando sesión…' : 'Cerrar sesión'} disabled={logoutBusy} onPress={signOut} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  optionsShade: { flex: 1, backgroundColor: 'rgba(24,45,35,0.22)', alignItems: 'flex-end', paddingHorizontal: 18 },
  optionsMenu: { width: '100%', maxWidth: 320, padding: 18, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  optionsRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  optionsText: { fontSize: 15, color: C.green, fontWeight: '600' },
  accountEmail: { fontSize: 16, color: C.ink, marginBottom: 12 },
});
