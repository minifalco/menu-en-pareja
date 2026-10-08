import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useAppState } from '../../state/AppState';
import { s } from '../../theme';
import { KeyboardForm, KeyboardFrame } from '../KeyboardForm';
import { PrimaryButton } from '../ui';

// Añadir a la compra algo que no sale de ningún plato.
export function ManualItemModal() {
  const { manualModal, setManualModal, manualName, setManualName, manualAmount, setManualAmount, busy, error, addManualShopping } = useAppState();
  return (
    <Modal visible={manualModal} transparent animationType="slide" onRequestClose={() => setManualModal(false)}>
      <KeyboardFrame style={s.modalShade}><View style={s.modalCard}><KeyboardForm><View style={s.modalHeader}><View><Text style={s.eyebrow}>AÑADIR A LA LISTA</Text><Text style={s.modalTitle}>Algo más para comprar</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar artículo" onPress={() => setManualModal(false)}><Text style={s.closeGlyph}>×</Text></Pressable></View>
        <Text style={s.fieldLabel}>ARTÍCULO</Text><TextInput value={manualName} onChangeText={setManualName} placeholder="p. ej. detergente" placeholderTextColor="#9aa49b" style={s.input} autoFocus />
        <Text style={s.fieldLabel}>CANTIDAD (OPCIONAL)</Text><TextInput value={manualAmount} onChangeText={setManualAmount} placeholder="p. ej. 2 botellas" placeholderTextColor="#9aa49b" style={s.input} />
        {error ? <Text accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text> : null}
        <PrimaryButton label="Añadir a la compra" disabled={busy} onPress={addManualShopping} />
      </KeyboardForm></View></KeyboardFrame>
    </Modal>
  );
}
