import { Platform, StyleSheet } from 'react-native';

export const C = {
  ink: '#343b2f', green: '#365b37', leaf: '#e6eddb', cream: '#fbf8f0', paper: '#fffdf7',
  muted: '#606c5f', line: '#e8e1d1', orange: '#e97135', pale: '#f3eddf', red: '#a33d30',
};

// Estilos compartidos por varias pantallas. Los propios de una pantalla viven en su fichero.
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.cream },
  brand: { fontFamily: 'Notebook', color: C.green, fontSize: 32, letterSpacing: 2.2 },
  content: { padding: 18, paddingTop: 19, paddingBottom: 24 },
  muted: { color: C.muted, fontSize: 11 },
  errorText: { color: C.red, fontSize: 11, marginTop: 10, lineHeight: 19 },

  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  eyebrow: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  sectionTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 30, marginTop: 3 },

  emptyCard: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 15 },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontFamily: 'Notebook', fontSize: 24, color: C.ink },
  emptyBody: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginTop: 7, marginBottom: 17, maxWidth: 285 },

  shareButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.leaf, alignItems: 'center', justifyContent: 'center' },
  removeGlyph: { color: '#96a197', fontSize: 21, paddingHorizontal: 4 },
  closeGlyph: { color: C.muted, fontSize: 29, lineHeight: 30, paddingHorizontal: 4 },
  addCircle: { backgroundColor: C.green, width: 41, height: 41, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addCircleText: { color: '#fff', fontSize: 25, lineHeight: 28, marginTop: -2 },
  recipeArrow: { fontSize: 18, color: C.green, fontWeight: '700' },
  outlineButton: { minHeight: 43, borderWidth: 1, borderColor: C.green, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  outlineText: { color: C.green, fontSize: 13, fontWeight: '800' },

  modalShade: { flex: 1, backgroundColor: 'rgba(24,45,35,0.38)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22, maxHeight: '92%', flexShrink: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 },
  modalTitle: { fontFamily: 'Notebook', fontSize: 28, color: C.ink, marginTop: 4 },

  fieldLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 11, marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, paddingHorizontal: 13, fontSize: 16, color: C.ink },
  fieldHint: { color: C.muted, fontSize: 11, lineHeight: 20, marginTop: 6 },
  codeInput: { letterSpacing: 3, fontSize: 18, fontWeight: '800' },
});

// Pantallas de acceso (login y casa).
export const authStyles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: C.cream, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 23 },
  logo: { width: 86, height: 86, borderRadius: 22, marginBottom: 13 },
  title: { fontFamily: 'Notebook', color: C.ink, fontSize: 32, marginTop: 3 },
  intro: { color: C.muted, fontSize: 13, marginTop: 6 },
  card: { borderRadius: 20, backgroundColor: C.paper, padding: 18, borderWidth: 1, borderColor: C.line },
  modeLink: { alignItems: 'center', padding: 14 },
  modeLinkText: { color: C.green, fontSize: 11, fontWeight: '700' },
});
