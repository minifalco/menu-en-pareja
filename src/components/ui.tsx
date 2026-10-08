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
});
