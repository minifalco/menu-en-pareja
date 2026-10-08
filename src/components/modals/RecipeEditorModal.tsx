import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { makeId } from '../../domain/ids';
import { emptyIngredientRows, useAppState } from '../../state/AppState';
import { s } from '../../theme';
import { KeyboardForm, KeyboardFrame } from '../KeyboardForm';
import { PrimaryButton } from '../ui';

// Crear o editar un plato con sus ingredientes, una fila por ingrediente.
export function RecipeEditorModal() {
  const { recipeModal, setRecipeModal, editingRecipeId, recipeName, setRecipeName, recipeIngredients, setRecipeIngredients, recipeNote, setRecipeNote, busy, error, saveRecipe } = useAppState();
  return (
    <Modal visible={recipeModal} transparent animationType="slide" onRequestClose={() => setRecipeModal(false)}>
      <KeyboardFrame style={s.modalShade}><View style={s.modalCard}><KeyboardForm><View style={s.modalHeader}><View><Text style={s.eyebrow}>{editingRecipeId ? 'EDITAR RECETA' : 'NUEVA RECETA'}</Text><Text style={s.modalTitle}>Un plato de casa</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar receta" onPress={() => setRecipeModal(false)}><Text style={s.closeGlyph}>×</Text></Pressable></View>
        <Text style={s.fieldLabel}>NOMBRE DEL PLATO</Text><TextInput value={recipeName} onChangeText={setRecipeName} placeholder="p. ej. Tortilla de patata" placeholderTextColor="#9aa49b" style={s.input} maxLength={100} />
        <Text style={s.fieldLabel}>INGREDIENTES</Text>
        {recipeIngredients.map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TextInput accessibilityLabel={`Ingrediente ${index + 1}`} value={row.text} editable={!busy} onChangeText={text => setRecipeIngredients(rows => rows.map(r => r.id === row.id ? { ...r, text } : r))} placeholder="p. ej. Patatas — 500 g" placeholderTextColor="#9aa49b" style={[s.input, { flex: 1 }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ingrediente ${index + 1}`} disabled={busy} onPress={() => setRecipeIngredients(rows => rows.length === 1 ? emptyIngredientRows() : rows.filter(r => r.id !== row.id))} style={s.shareButton}><Text style={s.removeGlyph}>×</Text></Pressable>
        </View>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Añadir ingrediente" disabled={busy} onPress={() => setRecipeIngredients(rows => [...rows, { id: makeId(), text: '' }])} style={s.outlineButton}><Text style={s.outlineText}>＋  Añadir ingrediente</Text></Pressable>
        <Text style={s.fieldHint}>Puedes escribir solo el nombre o añadir cantidad así: «Arroz — 200 g».</Text>
        <Text style={s.fieldLabel}>NOTA (OPCIONAL)</Text><TextInput value={recipeNote} onChangeText={setRecipeNote} placeholder="Algún truco o detalle…" placeholderTextColor="#9aa49b" style={s.input} maxLength={240} />
        {error ? <Text accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text> : null}
        <PrimaryButton label={busy ? 'Guardando…' : editingRecipeId ? 'Guardar cambios' : 'Guardar plato'} disabled={busy} onPress={saveRecipe} />
      </KeyboardForm></View></KeyboardFrame>
    </Modal>
  );
}
