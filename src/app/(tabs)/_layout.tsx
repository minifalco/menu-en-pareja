import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { AccountMenu } from '../../components/modals/AccountMenu';
import { JoinHouseModal } from '../../components/modals/JoinHouseModal';
import { ManualItemModal } from '../../components/modals/ManualItemModal';
import { MealPickerModal } from '../../components/modals/MealPickerModal';
import { RecipeEditorModal } from '../../components/modals/RecipeEditorModal';
import { TabBar } from '../../components/TabBar';
import { Notice } from '../../components/ui';
import { WeekBar } from '../../components/WeekBar';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';

// Marco común de las tres pestañas: cabecera, avisos, semana, la pestaña activa
// (<Slot />), barra inferior y las ventanas emergentes.
export default function TabsLayout() {
  const { localMode, error, setError, notice, setNotice, recipeModal, manualModal, mealTarget, loaded, dataCurrent } = useAppState();
  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <AppHeader />
      {localMode ? <View style={styles.localBanner}><Text style={styles.bannerIcon}>☁</Text><Text style={styles.bannerText}>Modo en este móvil · la sincronización compartida se activa al conectar el servicio gratuito.</Text></View> : null}
      {error && !recipeModal && !manualModal && !mealTarget ? <Notice text={error} type="error" onClose={() => setError('')} /> : null}
      {notice ? <Notice text={notice} type="ok" onClose={() => setNotice('')} /> : null}
      <WeekBar />
      {!loaded || !dataCurrent ? <View style={styles.loadingInline}><ActivityIndicator color={C.green} /><Text style={s.muted}>Cargando vuestra semana…</Text></View> : null}
      <View style={styles.slot}><Slot /></View>
      <TabBar />
      <AccountMenu />
      <JoinHouseModal />
      <MealPickerModal />
      <RecipeEditorModal />
      <ManualItemModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  localBanner: { marginHorizontal: 18, marginBottom: 8, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff0d8', flexDirection: 'row', gap: 9, alignItems: 'center' },
  bannerIcon: { fontSize: 15, color: '#8d602d' },
  bannerText: { color: '#785b3a', fontSize: 11, lineHeight: 19, flex: 1 },
  loadingInline: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
});
