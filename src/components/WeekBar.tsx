import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, getMonday } from '../domain/dates';
import { weekLabel } from '../domain/format';
import { useAppState } from '../state/AppState';
import { C } from '../theme';

export function WeekBar() {
  const { weekStart, setWeekStart } = useAppState();
  return (
    <View style={styles.weekBar}>
      <Pressable accessibilityLabel="Semana anterior" onPress={() => setWeekStart(addDays(weekStart, -7))} style={styles.arrowButton}><Text style={styles.arrow}>‹</Text></Pressable>
      <Pressable style={styles.weekCenter} onPress={() => setWeekStart(getMonday(new Date()))}>
        <Text style={styles.weekTitle}>{weekLabel(weekStart)}</Text>
        <Text style={styles.weekCaption}>{weekStart === getMonday(new Date()) ? 'ESTA SEMANA' : 'TOCA PARA VOLVER A HOY'}</Text>
      </Pressable>
      <Pressable accessibilityLabel="Semana siguiente" onPress={() => setWeekStart(addDays(weekStart, 7))} style={styles.arrowButton}><Text style={styles.arrow}>›</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  weekBar: { marginHorizontal: 18, paddingVertical: 7, paddingHorizontal: 7, borderRadius: 17, backgroundColor: C.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line },
  arrowButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 32, color: C.green, marginTop: -5 },
  weekCenter: { alignItems: 'center' },
  weekTitle: { fontFamily: 'Notebook', fontSize: 22, color: C.ink },
  weekCaption: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
});
