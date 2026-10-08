import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/ui';
import { formatIngredient } from '../../domain/ingredients';
import { useAppState } from '../../state/AppState';
import { C, s } from '../../theme';

// Pestaña Platos: la colección de recetas de la casa.
export default function RecipesScreen() {
  const { data, openRecipe } = useAppState();
  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.sectionHeading}><View><Text style={s.eyebrow}>COLECCIÓN DE CASA</Text><Text style={s.sectionTitle}>Vuestros platos</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Añadir plato" onPress={() => openRecipe()} style={s.addCircle}><Text style={s.addCircleText}>＋</Text></Pressable></View>
      <Text style={styles.recipeIntro}>Cada plato guarda sus ingredientes. Añádelo al menú semanal cuando os apetezca.</Text>
      {data.recipes.length === 0 ? <View style={s.emptyCard}><Text style={s.emptyEmoji}>📖</Text><Text style={s.emptyTitle}>Todavía no hay platos</Text><Text style={s.emptyBody}>Cread vuestra colección una vez y reutilizadla semana tras semana.</Text><PrimaryButton label="Añadir un plato" onPress={() => openRecipe()} /></View> : data.recipes.map(recipe => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={`Editar ${recipe.title}`} onPress={() => openRecipe(recipe)} style={styles.recipeCard}><View style={styles.recipeTop}><Text style={styles.recipeEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeTitle}>{recipe.title}</Text><Text style={styles.recipeSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={s.recipeArrow}>✦</Text></View><View style={styles.ingredientChips}>{recipe.ingredients.slice(0, 5).map((ingredient, i) => <Text key={`${recipe.id}-${i}`} style={styles.ingredientChip}>{formatIngredient(ingredient)}</Text>)}{recipe.ingredients.length > 5 ? <Text style={styles.ingredientChip}>+{recipe.ingredients.length - 5}</Text> : null}</View>{recipe.note ? <Text style={styles.recipeNote}>{recipe.note}</Text> : null}</Pressable>)}
      <View style={{ height: 22 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  recipeIntro: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: -7, marginBottom: 15 },
  recipeCard: { borderRadius: 17, borderColor: C.line, borderWidth: 1, backgroundColor: C.paper, padding: 14, marginBottom: 11 },
  recipeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recipeEmoji: { fontSize: 24 },
  recipeTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 22 },
  recipeSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  ingredientChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.pale, color: C.muted, fontSize: 11 },
  recipeNote: { marginTop: 9, color: C.muted, fontSize: 11 },
});
