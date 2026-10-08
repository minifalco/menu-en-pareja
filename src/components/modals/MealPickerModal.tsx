import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateLong } from '../../domain/format';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';

// Elegir qué plato va en una comida o cena concreta.
export function MealPickerModal() {
  const { mealTarget, setMealTarget, error, data, planRecipe, openRecipe } = useAppState();
  return (
    <Modal visible={Boolean(mealTarget)} transparent animationType="slide" onRequestClose={() => setMealTarget(null)}>
      <View style={s.modalShade}><View style={s.modalCard}><View style={s.modalHeader}><View><Text style={s.eyebrow}>PLANIFICAR</Text><Text style={s.modalTitle}>{mealTarget ? dateLong(mealTarget.day) : ''}</Text><Text style={styles.modalSub}>{mealTarget?.slot === 'comida' ? 'Comida' : 'Cena'}</Text></View><Pressable onPress={() => setMealTarget(null)}><Text style={s.closeGlyph}>×</Text></Pressable></View>
        {error ? <Text accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text> : null}
        <ScrollView style={{ maxHeight: 390 }}>
          {data.recipes.map(recipe => <Pressable key={recipe.id} onPress={() => planRecipe(recipe)} style={styles.recipeChoice}><Text style={styles.recipeChoiceEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeChoiceTitle}>{recipe.title}</Text><Text style={styles.recipeChoiceSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={s.recipeArrow}>＋</Text></Pressable>)}
          {data.recipes.length === 0 ? <Text style={styles.modalEmpty}>Primero guarda un plato con sus ingredientes.</Text> : null}
        </ScrollView>
        <Pressable onPress={() => { setMealTarget(null); openRecipe(); }} style={s.outlineButton}><Text style={s.outlineText}>＋  Crear un plato nuevo</Text></Pressable>
      </View></View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSub: { fontSize: 13, color: C.muted, marginTop: 3 },
  recipeChoice: { minHeight: 59, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.paper, marginBottom: 8, borderWidth: 1, borderColor: C.line, gap: 10 },
  recipeChoiceEmoji: { fontSize: 22 },
  recipeChoiceTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 21, fontWeight: '700' },
  recipeChoiceSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  modalEmpty: { textAlign: 'center', color: C.muted, fontSize: 13, paddingVertical: 22 },
});
