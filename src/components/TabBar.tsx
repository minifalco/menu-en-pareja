import { router, usePathname } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppState } from '../state/AppState';
import { C } from '../theme';

const TABS = [
  { href: '/', icon: '▦', label: 'Semana' },
  { href: '/compra', icon: '☑', label: 'Compra' },
  { href: '/platos', icon: '◉', label: 'Platos' },
] as const;

// Barra inferior propia: cambiar de pestaña reemplaza la ruta, así el botón
// "atrás" de Android sale de la app en vez de recorrer las pestañas visitadas.
export function TabBar() {
  const pathname = usePathname();
  const { shopping, doneCount } = useAppState();
  return (
    <View style={styles.tabBar}>
      {TABS.map(tab => <TabButton key={tab.href} active={pathname === tab.href} icon={tab.icon} label={tab.label} badge={tab.href === '/compra' ? shopping.length - doneCount || undefined : undefined} onPress={() => router.replace(tab.href)} />)}
    </View>
  );
}

function TabButton({ active, icon, label, badge, onPress }: { active: boolean; icon: string; label: string; badge?: number; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.tabButton}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Text style={[styles.tabIcon, active && styles.tabIconSelected]}>{icon}</Text>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}</View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  tabBar: { minHeight: 69, paddingBottom: Platform.OS === 'ios' ? 15 : 5, paddingTop: 5, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.paper, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tabButton: { width: '31%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIconWrap: { minWidth: 45, height: 31, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabIconActive: { backgroundColor: C.leaf },
  tabIcon: { color: C.muted, fontSize: 19, fontWeight: '700' },
  tabIconSelected: { color: C.green },
  tabLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  tabLabelActive: { color: C.green, fontWeight: '800' },
  badge: { position: 'absolute', right: 0, top: -3, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 2 },
});
