import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui';
import { formatISODate, getWeekDates, parseLocalDate } from '../../domain/dates';
import { dayMonth } from '../../domain/format';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';

const DAY_NAMES = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

// Pestaña Semana: comida y cena de lunes a domingo.
export default function WeekScreen() {
  const { data, weekStart, openRecipe, deleteMeal, setMealTarget } = useAppState();
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const today = formatISODate(new Date());
  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.sectionHeading}><View><Text style={s.eyebrow}>VUESTRA SEMANA</Text><Text style={s.sectionTitle}>¿Qué comemos?</Text></View><Text style={styles.countPill}>{data.meals.length} platos</Text></View>
      {!data.recipes.length ? <View style={s.emptyCard}><Text style={s.emptyEmoji}>🥗</Text><Text style={s.emptyTitle}>Empezad con un plato</Text><Text style={s.emptyBody}>Guardad una receta con sus ingredientes y luego colocadla en el día que queráis.</Text><PrimaryButton label="Crear primer plato" onPress={() => openRecipe()} /></View> : null}
      {weekDates.map((day, index) => {
        const meals = data.meals.filter(item => item.day === day);
        const isToday = day === today;
        return <View key={day} style={[styles.dayCard, isToday && styles.dayToday]}>
          <View style={styles.dayHeader}><Text style={styles.dayName}>{DAY_NAMES[index]}</Text><Text style={[styles.dayNumber, isToday && styles.todayNumber]}>{parseLocalDate(day).getDate()}</Text><Text style={styles.dayDate}>{dayMonth(day)}</Text>{isToday ? <Text style={styles.todayTag}>HOY</Text> : null}</View>
          <View style={styles.dayMeals}>
            {(['comida', 'cena'] as const).map(slot => {
              const planned = meals.find(item => item.slot === slot);
              return <View key={slot} style={styles.mealRow}>
                <Text style={styles.mealSlot}>{slot === 'comida' ? '☀  Comida' : '☾  Cena'}</Text>
                {planned ? <View style={styles.plannedPill}><Text style={styles.plannedText} numberOfLines={1}>{planned.title}</Text><Pressable accessibilityLabel={`Quitar ${planned.title}`} onPress={() => deleteMeal(planned)} hitSlop={8}><Text style={s.removeGlyph}>×</Text></Pressable></View> : <Pressable onPress={() => setMealTarget({ day, slot })} style={styles.addMealButton}><Text style={styles.addMealGlyph}>＋</Text><Text style={styles.addMealText}>Añadir menú</Text></Pressable>}
              </View>;
            })}
          </View>
        </View>;
      })}
      <View style={{ height: 22 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  countPill: { color: C.green, backgroundColor: C.leaf, overflow: 'hidden', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  dayCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 18, marginBottom: 11, padding: 13, flexDirection: 'row', gap: 12 },
  dayToday: { borderColor: '#9cb991', backgroundColor: '#fefff9' },
  dayHeader: { width: 43, alignItems: 'center', paddingTop: 4 },
  dayName: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 1 },
  dayNumber: { fontFamily: 'Notebook', fontSize: 30, color: C.ink, lineHeight: 34 },
  todayNumber: { color: C.green },
  dayDate: { fontSize: 11, color: C.muted },
  todayTag: { marginTop: 6, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: C.leaf, color: C.green, fontSize: 11, fontWeight: '900', overflow: 'hidden', borderRadius: 5 },
  dayMeals: { flex: 1, gap: 8, borderLeftWidth: 1, borderColor: '#e6bbaa', paddingLeft: 11 },
  mealRow: { minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealSlot: { width: 80, color: C.muted, fontSize: 13, fontWeight: '600' },
  addMealButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 6 },
  addMealGlyph: { fontSize: 15, color: C.green, fontWeight: '700' },
  addMealText: { fontSize: 11, color: C.muted },
  plannedPill: { flex: 1, minHeight: 44, paddingLeft: 10, paddingRight: 6, borderRadius: 10, backgroundColor: '#eef3e8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  plannedText: { flex: 1, color: C.green, fontSize: 11, fontWeight: '700' },
});
