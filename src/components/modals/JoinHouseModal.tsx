import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useAppState } from '../../state/AppState';
import { s } from '../../theme';
import { KeyboardForm, KeyboardFrame } from '../KeyboardForm';
import { PrimaryButton } from '../ui';

export function JoinHouseModal() {
  const { joinModal, setJoinModal, busy, inviteCode, setInviteCode, error, enterHouse } = useAppState();
  return (
    <Modal visible={joinModal} transparent animationType="slide" onRequestClose={() => { if (!busy) setJoinModal(false); }}>
      <KeyboardFrame style={s.modalShade}><View accessibilityViewIsModal style={s.modalCard}><KeyboardForm>
        <View style={s.modalHeader}><Text style={s.modalTitle}>Unirme a una casa</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancelar unión a casa" disabled={busy} onPress={() => setJoinModal(false)} style={s.shareButton}><Text style={s.closeGlyph}>×</Text></Pressable></View>
        <Text style={s.fieldLabel}>CÓDIGO DE INVITACIÓN</Text><TextInput accessibilityLabel="Código de invitación" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" autoCorrect={false} placeholder="8 letras o números" style={[s.input, s.codeInput]} maxLength={8} editable={!busy} />
        <Text style={s.fieldHint}>Pídele el código a quien creó la casa. Tu casa actual y sus datos se conservan.</Text>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text> : null}
        <PrimaryButton label={busy ? 'Uniéndome…' : 'Unirme a la casa'} disabled={busy || inviteCode.trim().length !== 8} onPress={() => enterHouse(inviteCode)} />
      </KeyboardForm></View></KeyboardFrame>
    </Modal>
  );
}
