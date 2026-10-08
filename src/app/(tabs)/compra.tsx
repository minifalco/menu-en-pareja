import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui';
import { numberText } from '../../domain/format';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';

// Pestaña Compra: ingredientes de la semana agrupados más lo añadido a mano.
export default function ShoppingScreen() {
  const { shopping, doneCount, setManualModal, isCheckPending, toggleCheck, data, deleteManual } = useAppState();
  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.sectionHeading}><View><Text style={s.eyebrow}>LISTA COMPARTIDA</Text><Text style={s.sectionTitle}>A comprar</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Añadir artículo a la lista" onPress={() => setManualModal(true)} style={s.addCircle}><Text style={s.addCircleText}>＋</Text></Pressable></View>
      <View style={styles.progressCard}><View style={styles.progressInfo}><Text style={styles.progressTitle}>{doneCount === shopping.length && shopping.length > 0 ? '¡Compra lista!' : 'Progreso de la compra'}</Text><Text style={styles.progressValue}>{doneCount} de {shopping.length} comprados</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${shopping.length ? doneCount / shopping.length * 100 : 0}%` }]} /></View></View>
      {shopping.length === 0 ? <View style={s.emptyCard}><Text style={s.emptyEmoji}>🧺</Text><Text style={s.emptyTitle}>La lista está vacía</Text><Text style={s.emptyBody}>Al poner platos en el menú, sus ingredientes aparecerán aquí automáticamente.</Text><PrimaryButton label="Añadir algo a mano" onPress={() => setManualModal(true)} /></View> : null}
      <View style={styles.shoppingCard}>
        {shopping.map((item, index) => {
          const pending = isCheckPending(item.key);
          return <View key={item.key} style={[styles.shoppingRow, index === shopping.length - 1 && styles.lastRow]}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name} aria-checked={item.checked} accessibilityState={{ checked: item.checked, disabled: pending }} disabled={pending} onPress={() => toggleCheck(item)} style={{ flex: 1, minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={[styles.checkbox, item.checked && styles.checkboxDone]}>{item.checked ? <Text style={styles.tick}>✓</Text> : null}</View>
              <View style={styles.shoppingInfo}><Text style={[styles.shoppingName, item.checked && styles.crossed]}>{item.name}</Text><Text style={styles.shoppingMeta}>{item.quantity !== undefined ? `${numberText(item.quantity)}${item.unit ? ` ${item.unit}` : ''} · ` : ''}{item.manual && !item.sources.length ? 'Añadido a mano' : item.sources.join(' · ')}</Text></View>
              {item.quantity !== undefined ? <Text style={styles.amount}>{numberText(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</Text> : null}
            </Pressable>
            {item.manualIds.length ? <Pressable accessibilityRole="button" accessibilityLabel="Eliminar añadido a mano" onPress={() => { const row = data.manualItems.find(manual => item.manualIds.includes(manual.id)); if (row) deleteManual(row); }} style={s.shareButton}><Text style={s.removeGlyph}>×</Text></Pressable> : null}
          </View>;
        })}
      </View>
      <Text style={styles.listHint}>Los ingredientes se agrupan automáticamente. Si cambia el menú, la lista se actualiza.</Text>
      <View style={{ height: 22 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  progressCard: { backgroundColor: C.green, borderRadius: 18, padding: 16, marginBottom: 13 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressTitle: { color: '#fff', fontWeight: '700', fontSize: 13 },
  progressValue: { color: '#d9e7d5', fontSize: 11 },
  progressTrack: { height: 6, borderRadius: 10, backgroundColor: '#537c67', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 10, backgroundColor: '#f2bd87' },
  shoppingCard: { borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.paper, paddingHorizontal: 13 },
  shoppingRow: { minHeight: 61, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 11 },
  lastRow: { borderBottomWidth: 0 },
  checkbox: { width: 23, height: 23, borderRadius: 8, borderWidth: 1.5, borderColor: '#b9c4b9', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: C.green, borderColor: C.green },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 19 },
  shoppingInfo: { flex: 1 },
  shoppingName: { fontFamily: 'Notebook', fontSize: 22, color: C.ink, fontWeight: '700' },
  crossed: { textDecorationLine: 'line-through', color: '#99a299' },
  shoppingMeta: { marginTop: 3, color: C.muted, fontSize: 11 },
  amount: { color: C.green, fontSize: 11, fontWeight: '800' },
  listHint: { color: C.muted, fontSize: 11, lineHeight: 19, marginTop: 12, marginHorizontal: 3 },
});
