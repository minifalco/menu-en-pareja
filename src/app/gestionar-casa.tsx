import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackHeader, ConfirmBox, OutlineButton, PrimaryButton } from '../components/ui';
import { listHouseholdMembers, type HouseholdMember } from '../data/cloud';
import { errorText } from '../lib/errors';
import { useAppState } from '../state/AppState';
import { C, s } from '../theme';

type Confirm = { kind: 'code' } | { kind: 'leave' } | { kind: 'remove'; member: HouseholdMember };

// Miembros, código de invitación y salir de la casa.
export default function ManageHouseholdScreen() {
  const { household, userEmail, rotateInviteCode, removeMember, leaveCurrentHousehold } = useAppState();
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const householdId = household?.id;

  useEffect(() => {
    if (!householdId) return;
    let alive = true;
    listHouseholdMembers(householdId)
      .then(rows => { if (alive) setMembers(rows); })
      .catch(e => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [householdId, reloadKey]);

  if (!household) return null;
  const me = members?.find(member => member.email.toLowerCase() === userEmail?.toLowerCase());
  const isOwner = Boolean(me?.isOwner);
  const alone = members?.length === 1;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setConfirm(null); setMessage(done); setReloadKey(key => key + 1);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <BackHeader title="Tu casa" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>CASA</Text>
        <Text style={s.sectionTitle}>{household.name}</Text>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>CÓDIGO DE INVITACIÓN</Text>
          <Text selectable accessibilityLabel={`Código de invitación ${household.inviteCode}`} style={styles.code}>{household.inviteCode}</Text>
          <Text style={s.fieldHint}>Compártelo solo con quien quieras que vea vuestros platos, menús y compra.</Text>
          <PrimaryButton label="Compartir código" onPress={() => { void Share.share({ message: `Únete a ${household.name} en iHambre con este código: ${household.inviteCode}` }).catch(e => setError(errorText(e))); }} />
          {isOwner && confirm?.kind !== 'code' ? <OutlineButton label="Cambiar código" onPress={() => setConfirm({ kind: 'code' })} /> : null}
          {confirm?.kind === 'code' ? <ConfirmBox text="El código actual dejará de funcionar. Quien ya está en la casa no se ve afectado." confirmLabel="Cambiar código" busy={busy} onConfirm={() => run(rotateInviteCode, 'Código cambiado.')} onCancel={() => setConfirm(null)} /> : null}
        </View>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>MIEMBROS</Text>
          {members === null && !error ? <ActivityIndicator color={C.green} /> : null}
          {members?.map(member => {
            const isMe = member.userId === me?.userId;
            return <View key={member.userId} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberEmail}>{member.email}{isMe ? ' (tú)' : ''}</Text>
                {member.isOwner ? <Text style={styles.memberRole}>Creó la casa</Text> : null}
              </View>
              {isOwner && !isMe ? <Pressable accessibilityRole="button" accessibilityLabel={`Quitar a ${member.email}`} onPress={() => setConfirm({ kind: 'remove', member })} style={styles.removeButton}><Text style={styles.removeText}>Quitar</Text></Pressable> : null}
            </View>;
          })}
          {confirm?.kind === 'remove' ? <ConfirmBox text={`¿Quitar a ${confirm.member.email}? Dejará de ver la casa y el código cambiará para que no pueda volver a entrar.`} confirmLabel="Quitar de la casa" busy={busy} onConfirm={() => run(() => removeMember(confirm.member.userId), `${confirm.member.email} ya no está en la casa. El código ha cambiado.`)} onCancel={() => setConfirm(null)} /> : null}
        </View>

        <View style={styles.card}>
          <Text style={s.fieldLabel}>SALIR DE LA CASA</Text>
          <Text style={s.fieldHint}>{alone
            ? 'Eres la única persona en esta casa: al salir se borrarán sus platos, menús y lista de la compra.'
            : `La casa y sus datos seguirán para las demás personas.${isOwner ? ' Pasará a quien lleve más tiempo en ella.' : ''}`}</Text>
          {confirm?.kind === 'leave'
            ? <ConfirmBox text={alone ? 'Se borrará la casa con todos sus datos. No se puede deshacer.' : '¿Seguro que quieres salir? Para volver necesitarás un código de invitación.'} confirmLabel="Salir de la casa" busy={busy} onConfirm={() => run(async () => { if (await leaveCurrentHousehold()) router.replace('/'); }, '')} onCancel={() => setConfirm(null)} />
            : <OutlineButton danger label="Salir de la casa" onPress={() => setConfirm({ kind: 'leave' })} />}
        </View>

        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text> : null}
        {message ? <Text accessibilityLiveRegion="polite" style={styles.okText}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper },
  code: { fontFamily: 'Notebook', fontSize: 34, letterSpacing: 4, color: C.green },
  memberRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  memberEmail: { color: C.ink, fontSize: 14 },
  memberRole: { color: C.muted, fontSize: 11, marginTop: 2 },
  removeButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.red, justifyContent: 'center' },
  removeText: { color: C.red, fontSize: 12, fontWeight: '700' },
  okText: { color: C.green, fontSize: 13, marginTop: 12, lineHeight: 19 },
});
