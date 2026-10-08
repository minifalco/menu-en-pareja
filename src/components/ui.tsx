import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, s } from '../theme';

export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}

export function Notice({ text, type, onClose }: { text: string; type: 'error' | 'ok'; onClose: () => void }) {
  return <Pressable onPress={onClose} style={[styles.notice, type === 'error' ? styles.noticeError : styles.noticeOk]}><Text style={[styles.noticeText, type === 'error' ? styles.noticeErrorText : styles.noticeOkText]}>{text}</Text><Text style={styles.noticeClose}>×</Text></Pressable>;
}

export function LoadingScreen() {
  return <View style={styles.centerScreen}><ActivityIndicator size="large" color={C.green} /><Text style={s.muted}>Preparando vuestra casa…</Text></View>;
}

export function OutlineButton({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.outlineButton, danger && styles.dangerOutline, disabled && styles.disabledButton]}><Text style={[s.outlineText, danger && styles.dangerText]}>{label}</Text></Pressable>;
}

// Second step for irreversible actions. In-screen instead of Alert, which does nothing on web.
export function ConfirmBox({ text, confirmLabel, busy, onConfirm, onCancel }: { text: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.confirmBox}>
      <Text style={styles.confirmText}>{text}</Text>
      <Pressable accessibilityRole="button" onPress={onConfirm} disabled={busy} style={[styles.dangerButton, busy && styles.disabledButton]}><Text style={styles.primaryText}>{busy ? 'Un momento…' : confirmLabel}</Text></Pressable>
      <OutlineButton label="Cancelar" onPress={onCancel} disabled={busy} />
    </View>
  );
}

// Header for screens opened on top of the tabs.
export function BackHeader({ title }: { title: string }) {
  return (
    <View style={styles.backHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={8} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.shareButton}><Text style={styles.backGlyph}>‹</Text></Pressable>
      <Text style={styles.backTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8, width: '100%' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  notice: { marginHorizontal: 18, marginBottom: 8, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeError: { backgroundColor: '#f8e7e2' },
  noticeOk: { backgroundColor: '#e7f0e3' },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  noticeErrorText: { color: C.red },
  noticeOkText: { color: C.green },
  noticeClose: { fontSize: 19, color: C.muted },
  centerScreen: { flex: 1, backgroundColor: C.cream, justifyContent: 'center', alignItems: 'center', gap: 12 },
  dangerOutline: { borderColor: C.red },
  dangerText: { color: C.red },
  dangerButton: { minHeight: 48, borderRadius: 13, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 12, width: '100%' },
  confirmBox: { marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#e3b5aa', backgroundColor: '#fbefeb' },
  confirmText: { color: C.ink, fontSize: 13, lineHeight: 20 },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 },
  backGlyph: { fontSize: 30, color: C.green, marginTop: -4 },
  backTitle: { fontFamily: 'Notebook', fontSize: 28, color: C.ink },
});
