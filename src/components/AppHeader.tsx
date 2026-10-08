import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAppState } from '../state/AppState';
import { C, s } from '../theme';

export function AppHeader() {
  const { userEmail, household, accountModal, setAccountModal, setLogoutError } = useAppState();
  return (
    <View style={styles.header}>
      <View style={styles.brandLine}>
        <Image accessibilityLabel="Logo iHambre" source={require('../../assets/icon.png')} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>iHambre</Text>
          <Text style={styles.title}>Menú & compra</Text>
        </View>
        {userEmail ? <Pressable accessibilityRole="button" accessibilityLabel="Opciones de cuenta y casa" aria-expanded={accountModal} accessibilityState={{ expanded: accountModal }} onPress={() => { setLogoutError(''); setAccountModal(true); }} style={styles.optionsButton}><Svg width={24} height={24} viewBox="0 0 24 24"><Circle cx={12} cy={8} r={4} fill="none" stroke={C.green} strokeWidth={1.8} /><Path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" /></Svg><Svg width={12} height={12} viewBox="0 0 12 12"><Path d="m2 4 4 4 4-4" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg></Pressable> : null}
      </View>
      {household ? <Text style={styles.subtitle}>{household.name} · sincronizado</Text> : <Text style={styles.subtitle}>Planead juntos, comprad sin duplicar</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingTop: Platform.OS === 'web' ? 18 : 13, paddingBottom: 13 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 58, height: 58, borderRadius: 16 },
  title: { color: C.muted, fontSize: 14, fontWeight: '600', marginTop: -2 },
  subtitle: { marginTop: 8, color: C.muted, fontSize: 12 },
  optionsButton: { minWidth: 60, minHeight: 44, borderRadius: 22, backgroundColor: C.leaf, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
});
