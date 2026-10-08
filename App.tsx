import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ingredient, ManualShoppingItem, PlannedMeal, ShoppingItem } from './src/domain/types';
import { KeyboardForm, KeyboardFrame } from './src/components/KeyboardForm';
import { makeId } from './src/domain/ids';
import { createAsyncBoundary, mergeById } from './src/domain/cloudState';
import { syncPlannedRecipes } from './src/domain/recipes';
import { aggregateShopping } from './src/domain/shopping';
import { formatIngredient, parseIngredients } from './src/domain/ingredients';
import { addDays, formatISODate, getMonday, getWeekDates, parseLocalDate } from './src/domain/dates';
import {
  addManualItem, addMeal, addRecipe, cloudEnabled, createHousehold, emptyWeek,
  joinHousehold, listMyHouseholds, loadLocal, loadWeek, removeManualItem,
  removeMeal, updateRecipe, updateLocalRecipePlans, saveLocal, setManualChecked, setShoppingChecked, subscribeHouseholdChanges, supabase,
  type Household, type Recipe, type WeekData,
} from './src/data/cloud';

const C = {
  ink: '#343b2f', green: '#365b37', leaf: '#e6eddb', cream: '#fbf8f0', paper: '#fffdf7',
  muted: '#606c5f', line: '#e8e1d1', orange: '#e97135', pale: '#f3eddf', red: '#a33d30',
};
void SplashScreen.preventAutoHideAsync();
const ACTIVE_HOUSEHOLD = 'menu-pareja:active-household';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeInviteCode = () => Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

type IngredientRow = { id: string; text: string; original?: Ingredient };
const ingredientText = (i: Ingredient) => i.quantity === undefined ? i.name : `${i.name} — ${i.quantity}${i.unit ? ` ${i.unit}` : ''}`;
const emptyIngredientRows = (): IngredientRow[] => [{ id: makeId(), text: '' }];

type Tab = 'semana' | 'compra' | 'platos';

function dateLong(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseLocalDate(iso));
}
function weekLabel(start: string) {
  const end = addDays(start, 6);
  const a = parseLocalDate(start); const b = parseLocalDate(end);
  const monthA = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(a).replace('.', '');
  const monthB = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(b).replace('.', '');
  return monthA === monthB ? `${a.getDate()}–${b.getDate()} ${monthB}` : `${a.getDate()} ${monthA} – ${b.getDate()} ${monthB}`;
}
function numberText(n?: number) { return n === undefined ? '' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n); }

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Notebook: require('./assets/fonts/PatrickHand-Regular.ttf') });
  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [sessionReady, setSessionReady] = useState(!cloudEnabled);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [rawData, setData] = useState<WeekData>(emptyWeek());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('semana');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Auth feedback must not be cleared by household/week loads or auth notifications.
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [mealTarget, setMealTarget] = useState<{ day: string; slot: 'comida' | 'cena' } | null>(null);
  const [recipeModal, setRecipeModal] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [manualModal, setManualModal] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<IngredientRow[]>(emptyIngredientRows);
  const [recipeNote, setRecipeNote] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [accountModal, setAccountModal] = useState(false);
  const [joinModal, setJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const scope = useMemo(() => createAsyncBoundary(), [household, weekStart, userEmail]);
  // Each async scope owns its pending keys; a slow checkbox never locks other rows.
  const checkWrites = useMemo(() => ({ values: new Map<string, boolean>(), running: 0, version: 0 }), [scope]);
  const [checkOverlay, setCheckOverlay] = useState<{ owner: typeof scope; values: Record<string, boolean> } | null>(null);
  const [dataScope, setDataScope] = useState<typeof scope | null>(null);
  const authOwner = useRef<string | null>(null);
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const data = useMemo(() => dataScope === scope ? { ...rawData, meals: syncPlannedRecipes(rawData.meals, rawData.recipes) } : emptyWeek(), [dataScope, scope, rawData]);
  useLayoutEffect(() => () => scope.close(), [scope]);

  useEffect(() => {
    if (!supabase) return;
    function applySession(email: string | null) {
      if (authOwner.current !== email) {
        currentScope.current.close();
        setHousehold(null); setData(emptyWeek()); setDataScope(null);
        setAccountModal(false); setJoinModal(false); setInviteCode(''); setMealTarget(null); setRecipeModal(false); setManualModal(false);
        setRecipeName(''); setRecipeIngredients(emptyIngredientRows()); setRecipeNote(''); setManualName(''); setManualAmount('');
        setNotice(''); setError('');
        authOwner.current = email;
      }
      setUserEmail(email);
      setSessionReady(true);
    }
    let notified = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      notified = true;
      applySession(session?.user.email ?? null);
    });
    supabase.auth.getSession().then(({ data: result }) => {
      if (!notified) applySession(result.session?.user.email ?? null);
    }).catch(() => setSessionReady(true));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!cloudEnabled || !userEmail) return;
    let alive = true;
    // External lookup lifecycle: show loading before this asynchronous request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    listMyHouseholds().then(async houses => {
      if (!alive) return;
      const savedId = await AsyncStorage.getItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`);
      if (!alive) return;
      const active = houses.find(h => h.id === savedId) ?? houses[0] ?? null;
      setHousehold(active);
      if (active && alive) await AsyncStorage.setItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`, active.id);
    }).catch(e => { if (alive) setError(errorText(e)); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [userEmail]);

  useEffect(() => {
    let alive = true;
    const isCurrent = scope.beginRead();
    // The selected remote/cache key changed; reset its asynchronous load state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    setMealTarget(null); setRecipeModal(false); setManualModal(false);
    setError('');
    const localKey = household ? `menu-pareja:account:${userEmail}:${household.id}:${weekStart}` : `menu-pareja:local:${weekStart}`;
    const fetchData = async () => {
      try {
        const next = household ? await loadWeek(household.id, weekStart) : cloudEnabled ? emptyWeek() : await loadLocal<WeekData>(localKey) ?? emptyWeek();
        if (!household && !cloudEnabled) next.recipes = await loadLocal<Recipe[]>('menu-pareja:local:recipes') ?? next.recipes;
        if (alive && isCurrent()) { setData(next); setDataScope(scope); }
      } catch (e) {
        const cached = household || !cloudEnabled ? await loadLocal<WeekData>(localKey) : null;
        if (alive && isCurrent()) {
          setData(cached ?? emptyWeek());
          setDataScope(scope);
          setError(`No se pudo conectar. ${errorText(e)}${cached ? ' Mostrando lo guardado en este móvil.' : ''}`);
        }
      } finally {
        if (alive && isCurrent()) { setLoaded(true); setBusy(false); }
      }
    };
    fetchData();
    return () => { alive = false; };
  }, [household, weekStart, userEmail, scope]);

  useEffect(() => {
    if (!household || !supabase || !userEmail) return;
    const client = supabase;
    const channel = subscribeHouseholdChanges(client, household.id, () => reload());
    function reload() {
      const isCurrent = scope.beginRead();
      loadWeek(household!.id, weekStart).then(next => {
        if (!isCurrent()) return;
        setData(next); setDataScope(scope); setLoaded(true); setError('');
      }).catch(e => { if (isCurrent()) setError(errorText(e)); });
    }
    return () => { void client.removeChannel(channel); };
  }, [household, weekStart, userEmail, scope]);

  useEffect(() => {
    if (!loaded || dataScope !== scope || !scope.active() || (cloudEnabled && !household)) return;
    const key = household ? `menu-pareja:account:${userEmail}:${household.id}:${weekStart}` : `menu-pareja:local:${weekStart}`;
    void saveLocal(key, data);
    if (!household && !cloudEnabled) void saveLocal('menu-pareja:local:recipes', data.recipes);
  }, [data, household, weekStart, userEmail, loaded, dataScope, scope]);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const shopping = useMemo(() => aggregateShopping(data.meals, data.checks, data.manualItems).map(item => ({ ...item, checked: checkOverlay?.owner === scope ? checkOverlay.values[item.key] ?? item.checked : item.checked })), [data.meals, data.checks, data.manualItems, checkOverlay, scope]);
  const doneCount = shopping.filter(item => item.checked).length;
  const today = formatISODate(new Date());
  const localMode = !cloudEnabled;

  async function doAuth(mode: 'login' | 'signup', email: string, password: string) {
    if (!supabase || authBusy) return;
    setAuthBusy(true); setAuthError(''); setAuthNotice('');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: 'https://ihambre.top/' } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) setAuthNotice(result.data.user?.identities?.length === 0
        ? 'Solicitud de registro aceptada. Revisa tu correo y Spam; activa tu cuenta antes de iniciar sesión. Si ya tienes cuenta, inicia sesión. Por privacidad, el servicio no confirma si ha enviado otro correo.'
        : '¡Correo de verificación enviado!\n\nEntra en tu correo y verifícalo. No olvides comprobar la carpeta de spam o correo no deseado.');
    } catch (e) { setAuthError(authErrorText(e)); }
    finally { setAuthBusy(false); }
  }

  async function makeHouse(name: string) {
    setBusy(true); setError('');
    try {
      const created = await createHousehold(name.trim() || 'Nuestra casa', makeInviteCode());
      if (!scope.active()) return;
      await AsyncStorage.setItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`, created.id);
      if (!scope.active()) return;
      setHousehold(created);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function enterHouse(code: string) {
    if (busy || logoutBusy) return;
    setBusy(true); setError('');
    try {
      const joined = await joinHousehold(code);
      if (!scope.active()) return;
      await AsyncStorage.setItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`, joined.id);
      if (!scope.active()) return;
      scope.close();
      setHousehold(joined); setJoinModal(false); setInviteCode('');
      setRecipeName(''); setRecipeIngredients(emptyIngredientRows()); setRecipeNote(''); setManualName(''); setManualAmount('');
      setNotice(`Ahora estás en ${joined.name}. Tu otra casa se conserva.`);
    } catch (e) { if (scope.active()) setError(errorText(e)); }
    finally { if (authOwner.current === userEmail) setBusy(false); }
  }

  function openRecipe(recipe?: Recipe) {
    setEditingRecipeId(recipe?.id ?? null);
    setRecipeName(recipe?.title ?? '');
    setRecipeIngredients(recipe?.ingredients.length ? recipe.ingredients.map(original => ({ id: makeId(), text: ingredientText(original), original })) : emptyIngredientRows());
    setRecipeNote(recipe?.note ?? ''); setError(''); setRecipeModal(true);
  }

  async function saveRecipe() {
    if (dataScope !== scope || busy) return;
    if (!recipeName.trim()) { setError('Ponle un nombre al plato.'); return; }
    const recipe = { title: recipeName.trim(), ingredients: recipeIngredients.flatMap(row => row.original && row.text === ingredientText(row.original) ? [row.original] : parseIngredients(row.text)), note: recipeNote.trim() };
    setBusy(true); setError('');
    try {
      const saved = household
        ? editingRecipeId ? await updateRecipe(household.id, editingRecipeId, recipe) : await addRecipe(household.id, recipe)
        : { ...recipe, id: editingRecipeId ?? makeId() };
      if (!scope.active()) return;
      if (!household) await updateLocalRecipePlans(saved, data.recipes);
      if (!scope.active()) return;
      scope.invalidateReads();
      setData(current => {
        if (!scope.active()) return current;
        const recipes = (editingRecipeId ? current.recipes.map(row => row.id === saved.id ? saved : row) : mergeById(current.recipes, saved)).sort((a,b) => a.title.localeCompare(b.title, 'es'));
        return { ...current, recipes, meals: syncPlannedRecipes(syncPlannedRecipes(current.meals, current.recipes), recipes) };
      });
      setRecipeName(''); setRecipeIngredients(emptyIngredientRows()); setRecipeNote(''); setRecipeModal(false);
      setNotice('Plato guardado en vuestra colección.');
    } catch (e) { if (scope.active()) setError(errorText(e)); }
    finally { if (scope.active()) setBusy(false); }
  }

  async function planRecipe(recipe: Recipe) {
    if (dataScope !== scope || busy) return;
    if (!mealTarget) return;
    const meal: PlannedMeal = {
      id: makeId(), recipeId: recipe.id, title: recipe.title, day: mealTarget.day, slot: mealTarget.slot,
      ingredients: recipe.ingredients,
    };
    setBusy(true); setError('');
    try {
      if (household) await addMeal(household.id, weekStart, meal);
      if (!scope.active()) return;
      scope.invalidateReads();
      setData(current => scope.active() ? ({ ...current, meals: mergeById(current.meals, meal) }) : current);
      setMealTarget(null); setNotice('Menú añadido; la compra se ha actualizado.');
    } catch (e) { if (scope.active()) setError(errorText(e)); }
    finally { if (scope.active()) setBusy(false); }
  }

  async function deleteMeal(meal: PlannedMeal) {
    if (dataScope !== scope || busy) return;
    setBusy(true); setError('');
    try {
      if (household) await removeMeal(household.id, meal.id);
      if (!scope.active()) return;
      scope.invalidateReads();
      setData(current => scope.active() ? ({ ...current, meals: current.meals.filter(item => item.id !== meal.id) }) : current);
    } catch (e) { if (scope.active()) setError(errorText(e)); }
    finally { if (scope.active()) setBusy(false); }
  }

  async function toggleCheck(item: ShoppingItem) {
    if (dataScope !== scope || busy || checkWrites.values.has(item.key)) return;
    const checked = !item.checked;
    const manualOnly = !item.sources.length && item.manualIds.length > 0;
    if (!household) {
      setData(current => manualOnly
        ? { ...current, manualItems: current.manualItems.map(row => item.manualIds.includes(row.id) ? { ...row, checked } : row) }
        : { ...current, checks: { ...current.checks, [item.key]: checked } });
      return;
    }
    checkWrites.values.set(item.key, checked); checkWrites.running++; checkWrites.version++;
    setCheckOverlay({ owner: scope, values: Object.fromEntries(checkWrites.values) });
    const results = await Promise.allSettled(manualOnly
      ? item.manualIds.map(id => setManualChecked(household.id, id, checked))
      : [setShoppingChecked(household.id, weekStart, item.key, checked)]);
    checkWrites.running--;
    if (!scope.active()) return;
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') setError(`No se pudo sincronizar esta casilla: ${errorText(failed.reason)}`);
    if (checkWrites.running) return;
    // Read after all overlapping writes, including partial failures. Broadcasts
    // cannot flicker the pending values; a newer tap owns its own reconciliation.
    const version = checkWrites.version;
    try {
      while (scope.active() && version === checkWrites.version) {
        const isCurrent = scope.beginRead();
        const next = await loadWeek(household.id, weekStart);
        if (!scope.active() || version !== checkWrites.version) return;
        if (!isCurrent()) continue;
        setData(next); setDataScope(scope);
        checkWrites.values.clear(); setCheckOverlay(null);
        return;
      }
    } catch (e) {
      if (scope.active() && version === checkWrites.version) {
        checkWrites.values.clear(); setCheckOverlay(null);
        setError(`No se pudo sincronizar esta casilla: ${errorText(e)}`);
      }
    }
  }

  async function addManualShopping() {
    if (dataScope !== scope || busy) return;
    if (!manualName.trim()) { setError('Escribe qué necesitas comprar.'); return; }
    const parsed = parseIngredients(`Artículo${manualAmount.trim() ? ` — ${manualAmount.trim()}` : ''}`)[0];
    const item: ManualShoppingItem = { ...parsed, name: manualName.trim(), id: makeId(), checked: false };
    setBusy(true); setError('');
    try {
      if (household) await addManualItem(household.id, weekStart, item);
      if (!scope.active()) return;
      scope.invalidateReads();
      setData(current => scope.active() ? ({ ...current, manualItems: mergeById(current.manualItems, item) }) : current);
      setManualName(''); setManualAmount(''); setManualModal(false);
    } catch (e) { if (scope.active()) setError(errorText(e)); }
    finally { if (scope.active()) setBusy(false); }
  }

  async function deleteManual(item: ManualShoppingItem) {
    if (dataScope !== scope) return;
    try {
      if (household) await removeManualItem(household.id, item.id);
      if (!scope.active()) return;
      scope.invalidateReads();
      setData(current => scope.active() ? ({ ...current, manualItems: current.manualItems.filter(row => row.id !== item.id) }) : current);
    } catch (e) { if (scope.active()) setError(errorText(e)); }
  }

  async function signOut() {
    if (!supabase || logoutBusy) return;
    setLogoutBusy(true); setLogoutError('');
    try {
      const result = await supabase.auth.signOut({ scope: 'local' });
      // This SDK also removes the local session on a server/network error.
      // Never pretend the user is still authenticated after SIGNED_OUT.
      if (result.error && (await supabase.auth.getSession()).data.session) throw result.error;
      const logoutWarning = result.error ? `Sesión cerrada en este móvil. No se pudo confirmar la desconexión con el servidor: ${errorText(result.error)}` : '';
      scope.close();
      setUserEmail(null); setHousehold(null); setData(emptyWeek()); setDataScope(null);
      setAccountModal(false); setJoinModal(false); setInviteCode(''); setMealTarget(null); setRecipeModal(false); setManualModal(false);
      setRecipeName(''); setRecipeIngredients(emptyIngredientRows()); setRecipeNote(''); setManualName(''); setManualAmount('');
      setNotice(''); setError(''); setAuthError(logoutWarning); setAuthNotice(''); setBusy(false);
      setTab('semana'); setWeekStart(getMonday(new Date()));
      // Remove only this account's on-device cache, never remote/shared data.
      try {
        const keys = await AsyncStorage.getAllKeys();
        await AsyncStorage.multiRemove(keys.filter(key => key.startsWith(`menu-pareja:account:${userEmail}:`) || key === `${ACTIVE_HOUSEHOLD}:${userEmail}`));
      } catch { setAuthNotice('Sesión cerrada. No se pudo limpiar la copia local; sigue aislada de otras cuentas.'); }
    } catch (e) { setLogoutError(`No se pudo cerrar la sesión. ${errorText(e)}`); }
    finally { setLogoutBusy(false); }
  }

  if (cloudEnabled && !sessionReady) return <LoadingScreen />;
  if (cloudEnabled && !userEmail) return <AuthScreen busy={authBusy} error={authError} notice={authNotice} onAuth={doAuth} />;
  if (cloudEnabled && userEmail && !household) return <HouseholdScreen busy={busy || logoutBusy} error={logoutError || error} email={userEmail} onCreate={makeHouse} onJoin={enterHouse} onSignOut={signOut} />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brandLine}>
          <Image accessibilityLabel="Logo iHambre" source={require('./assets/icon.png')} style={styles.logo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>iHambre</Text>
            <Text style={styles.title}>Menú & compra</Text>
          </View>
          {userEmail ? <Pressable accessibilityRole="button" accessibilityLabel="Opciones de cuenta y casa" aria-expanded={accountModal} accessibilityState={{ expanded: accountModal }} onPress={() => { setLogoutError(''); setAccountModal(true); }} style={styles.optionsButton}><Svg width={24} height={24} viewBox="0 0 24 24"><Circle cx={12} cy={8} r={4} fill="none" stroke={C.green} strokeWidth={1.8} /><Path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" /></Svg><Svg width={12} height={12} viewBox="0 0 12 12"><Path d="m2 4 4 4 4-4" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg></Pressable> : null}
        </View>
        {household ? <Text style={styles.subtitle}>{household.name} · sincronizado</Text> : <Text style={styles.subtitle}>Planead juntos, comprad sin duplicar</Text>}
      </View>

      {localMode ? <View style={styles.localBanner}><Text style={styles.bannerIcon}>☁</Text><Text style={styles.bannerText}>Modo en este móvil · la sincronización compartida se activa al conectar el servicio gratuito.</Text></View> : null}
      {error && !recipeModal && !manualModal && !mealTarget ? <Notice text={error} type="error" onClose={() => setError('')} /> : null}
      {notice ? <Notice text={notice} type="ok" onClose={() => setNotice('')} /> : null}

      <View style={styles.weekBar}>
        <Pressable accessibilityLabel="Semana anterior" onPress={() => setWeekStart(addDays(weekStart, -7))} style={styles.arrowButton}><Text style={styles.arrow}>‹</Text></Pressable>
        <Pressable style={styles.weekCenter} onPress={() => setWeekStart(getMonday(new Date()))}>
          <Text style={styles.weekTitle}>{weekLabel(weekStart)}</Text>
          <Text style={styles.weekCaption}>{weekStart === getMonday(new Date()) ? 'ESTA SEMANA' : 'TOCA PARA VOLVER A HOY'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Semana siguiente" onPress={() => setWeekStart(addDays(weekStart, 7))} style={styles.arrowButton}><Text style={styles.arrow}>›</Text></Pressable>
      </View>

      {!loaded || dataScope !== scope ? <View style={styles.loadingInline}><ActivityIndicator color={C.green} /><Text style={styles.muted}>Cargando vuestra semana…</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'semana' ? <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>VUESTRA SEMANA</Text><Text style={styles.sectionTitle}>¿Qué comemos?</Text></View><Text style={styles.countPill}>{data.meals.length} platos</Text></View>
          {!data.recipes.length ? <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>🥗</Text><Text style={styles.emptyTitle}>Empezad con un plato</Text><Text style={styles.emptyBody}>Guardad una receta con sus ingredientes y luego colocadla en el día que queráis.</Text><PrimaryButton label="Crear primer plato" onPress={() => openRecipe()} /></View> : null}
          {weekDates.map((day, index) => {
            const meals = data.meals.filter(item => item.day === day);
            const isToday = day === today;
            return <View key={day} style={[styles.dayCard, isToday && styles.dayToday]}>
              <View style={styles.dayHeader}><Text style={styles.dayName}>{['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'][index]}</Text><Text style={[styles.dayNumber, isToday && styles.todayNumber]}>{parseLocalDate(day).getDate()}</Text><Text style={styles.dayDate}>{new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(parseLocalDate(day)).replace('.', '')}</Text>{isToday ? <Text style={styles.todayTag}>HOY</Text> : null}</View>
              <View style={styles.dayMeals}>
                {(['comida','cena'] as const).map(slot => {
                  const planned = meals.find(item => item.slot === slot);
                  return <View key={slot} style={styles.mealRow}>
                    <Text style={styles.mealSlot}>{slot === 'comida' ? '☀  Comida' : '☾  Cena'}</Text>
                    {planned ? <View style={styles.plannedPill}><Text style={styles.plannedText} numberOfLines={1}>{planned.title}</Text><Pressable accessibilityLabel={`Quitar ${planned.title}`} onPress={() => deleteMeal(planned)} hitSlop={8}><Text style={styles.removeGlyph}>×</Text></Pressable></View> : <Pressable onPress={() => setMealTarget({ day, slot })} style={styles.addMealButton}><Text style={styles.addMealGlyph}>＋</Text><Text style={styles.addMealText}>Añadir menú</Text></Pressable>}
                  </View>;
                })}
              </View>
            </View>;
          })}
        </> : null}

        {tab === 'compra' ? <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>LISTA COMPARTIDA</Text><Text style={styles.sectionTitle}>A comprar</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Añadir artículo a la lista" onPress={() => setManualModal(true)} style={styles.addCircle}><Text style={styles.addCircleText}>＋</Text></Pressable></View>
          <View style={styles.progressCard}><View style={styles.progressInfo}><Text style={styles.progressTitle}>{doneCount === shopping.length && shopping.length > 0 ? '¡Compra lista!' : 'Progreso de la compra'}</Text><Text style={styles.progressValue}>{doneCount} de {shopping.length} comprados</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${shopping.length ? doneCount / shopping.length * 100 : 0}%` }]} /></View></View>
          {shopping.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>🧺</Text><Text style={styles.emptyTitle}>La lista está vacía</Text><Text style={styles.emptyBody}>Al poner platos en el menú, sus ingredientes aparecerán aquí automáticamente.</Text><PrimaryButton label="Añadir algo a mano" onPress={() => setManualModal(true)} /></View> : null}
          <View style={styles.shoppingCard}>
            {shopping.map((item, index) => <View key={item.key} style={[styles.shoppingRow, index === shopping.length - 1 && styles.lastRow]}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name} aria-checked={item.checked} accessibilityState={{ checked: item.checked, disabled: checkOverlay?.owner === scope && item.key in checkOverlay.values }} disabled={checkOverlay?.owner === scope && item.key in checkOverlay.values} onPress={() => toggleCheck(item)} style={{ flex: 1, minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={[styles.checkbox, item.checked && styles.checkboxDone]}>{item.checked ? <Text style={styles.tick}>✓</Text> : null}</View>
              <View style={styles.shoppingInfo}><Text style={[styles.shoppingName, item.checked && styles.crossed]}>{item.name}</Text><Text style={styles.shoppingMeta}>{item.quantity !== undefined ? `${numberText(item.quantity)}${item.unit ? ` ${item.unit}` : ''} · ` : ''}{item.manual && !item.sources.length ? 'Añadido a mano' : item.sources.join(' · ')}</Text></View>
              {item.quantity !== undefined ? <Text style={styles.amount}>{numberText(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</Text> : null}
              </Pressable>
              {item.manualIds.length ? <Pressable accessibilityRole="button" accessibilityLabel="Eliminar añadido a mano" onPress={() => { const row = data.manualItems.find(manual => item.manualIds.includes(manual.id)); if (row) deleteManual(row); }} style={styles.shareButton}><Text style={styles.removeGlyph}>×</Text></Pressable> : null}
            </View>)}
          </View>
          <Text style={styles.listHint}>Los ingredientes se agrupan automáticamente. Si cambia el menú, la lista se actualiza.</Text>
        </> : null}

        {tab === 'platos' ? <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>COLECCIÓN DE CASA</Text><Text style={styles.sectionTitle}>Vuestros platos</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Añadir plato" onPress={() => openRecipe()} style={styles.addCircle}><Text style={styles.addCircleText}>＋</Text></Pressable></View>
          <Text style={styles.recipeIntro}>Cada plato guarda sus ingredientes. Añádelo al menú semanal cuando os apetezca.</Text>
          {data.recipes.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>📖</Text><Text style={styles.emptyTitle}>Todavía no hay platos</Text><Text style={styles.emptyBody}>Cread vuestra colección una vez y reutilizadla semana tras semana.</Text><PrimaryButton label="Añadir un plato" onPress={() => openRecipe()} /></View> : data.recipes.map(recipe => <Pressable key={recipe.id} accessibilityRole="button" accessibilityLabel={`Editar ${recipe.title}`} onPress={() => openRecipe(recipe)} style={styles.recipeCard}><View style={styles.recipeTop}><Text style={styles.recipeEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeTitle}>{recipe.title}</Text><Text style={styles.recipeSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={styles.recipeArrow}>✦</Text></View><View style={styles.ingredientChips}>{recipe.ingredients.slice(0, 5).map((ingredient, i) => <Text key={`${recipe.id}-${i}`} style={styles.ingredientChip}>{formatIngredient(ingredient)}</Text>)}{recipe.ingredients.length > 5 ? <Text style={styles.ingredientChip}>+{recipe.ingredients.length - 5}</Text> : null}</View>{recipe.note ? <Text style={styles.recipeNote}>{recipe.note}</Text> : null}</Pressable>)}
        </> : null}
        <View style={{ height: 22 }} />
      </ScrollView>

      <View style={styles.tabBar}>
        <TabButton active={tab === 'semana'} icon="▦" label="Semana" onPress={() => setTab('semana')} />
        <TabButton active={tab === 'compra'} icon="☑" label="Compra" badge={shopping.length - doneCount || undefined} onPress={() => setTab('compra')} />
        <TabButton active={tab === 'platos'} icon="◉" label="Platos" onPress={() => setTab('platos')} />
      </View>

      <Modal visible={accountModal} transparent animationType="fade" onRequestClose={() => { if (!logoutBusy) setAccountModal(false); }}>
        <View style={[styles.optionsShade, { paddingTop: insets.top + 84 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones" disabled={logoutBusy} onPress={() => setAccountModal(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.optionsMenu}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Opciones</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" disabled={logoutBusy} onPress={() => setAccountModal(false)} style={styles.shareButton}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text selectable style={styles.accountEmail}>{userEmail}</Text>
          <Text style={styles.fieldHint}>Casa actual: {household?.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Compartir casa" disabled={logoutBusy} onPress={() => { if (household) void Share.share({ message: `Únete a ${household.name} en iHambre con este código: ${household.inviteCode}` }).catch(e => setError(errorText(e))); }} style={styles.optionsRow}><Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M8 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-3M12 15V2m-4 4 4-4 4 4" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={styles.optionsText}>Compartir casa</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Unirme a una casa" disabled={busy || logoutBusy} onPress={() => { setAccountModal(false); setError(''); setInviteCode(''); setJoinModal(true); }} style={styles.optionsRow}><Svg width={24} height={24} viewBox="0 0 24 24"><Path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" fill="none" stroke={C.green} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={styles.optionsText}>Unirme a una casa</Text></Pressable>
          {logoutError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>{logoutError}</Text> : null}
          <PrimaryButton label={logoutBusy ? 'Cerrando sesión…' : 'Cerrar sesión'} disabled={logoutBusy} onPress={signOut} />
        </View></View>
      </Modal>
      <Modal visible={joinModal} transparent animationType="slide" onRequestClose={() => { if (!busy) setJoinModal(false); }}>
        <KeyboardFrame style={styles.modalShade}><View accessibilityViewIsModal style={styles.modalCard}><KeyboardForm>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Unirme a una casa</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancelar unión a casa" disabled={busy} onPress={() => setJoinModal(false)} style={styles.shareButton}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text style={styles.fieldLabel}>CÓDIGO DE INVITACIÓN</Text><TextInput accessibilityLabel="Código de invitación" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" autoCorrect={false} placeholder="8 letras o números" style={[styles.input, styles.codeInput]} maxLength={8} editable={!busy} />
          <Text style={styles.fieldHint}>Pídele el código a quien creó la casa. Tu casa actual y sus datos se conservan.</Text>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton label={busy ? 'Uniéndome…' : 'Unirme a la casa'} disabled={busy || inviteCode.trim().length !== 8} onPress={() => enterHouse(inviteCode)} />
        </KeyboardForm></View></KeyboardFrame>
      </Modal>
      <Modal visible={Boolean(mealTarget)} transparent animationType="slide" onRequestClose={() => setMealTarget(null)}>
        <View style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>PLANIFICAR</Text><Text style={styles.modalTitle}>{mealTarget ? dateLong(mealTarget.day) : ''}</Text><Text style={styles.modalSub}>{mealTarget?.slot === 'comida' ? 'Comida' : 'Cena'}</Text></View><Pressable onPress={() => setMealTarget(null)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          <ScrollView style={{ maxHeight: 390 }}>
            {data.recipes.map(recipe => <Pressable key={recipe.id} onPress={() => planRecipe(recipe)} style={styles.recipeChoice}><Text style={styles.recipeChoiceEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeChoiceTitle}>{recipe.title}</Text><Text style={styles.recipeChoiceSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={styles.recipeArrow}>＋</Text></Pressable>)}
            {data.recipes.length === 0 ? <Text style={styles.modalEmpty}>Primero guarda un plato con sus ingredientes.</Text> : null}
          </ScrollView>
          <Pressable onPress={() => { setMealTarget(null); openRecipe(); }} style={styles.outlineButton}><Text style={styles.outlineText}>＋  Crear un plato nuevo</Text></Pressable>
        </View></View>
      </Modal>

      <Modal visible={recipeModal} transparent animationType="slide" onRequestClose={() => setRecipeModal(false)}>
        <KeyboardFrame style={styles.modalShade}><View style={styles.modalCard}><KeyboardForm><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>{editingRecipeId ? 'EDITAR RECETA' : 'NUEVA RECETA'}</Text><Text style={styles.modalTitle}>Un plato de casa</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar receta" onPress={() => setRecipeModal(false)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text style={styles.fieldLabel}>NOMBRE DEL PLATO</Text><TextInput value={recipeName} onChangeText={setRecipeName} placeholder="p. ej. Tortilla de patata" placeholderTextColor="#9aa49b" style={styles.input} maxLength={100} />
          <Text style={styles.fieldLabel}>INGREDIENTES</Text>
          {recipeIngredients.map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TextInput accessibilityLabel={`Ingrediente ${index + 1}`} value={row.text} editable={!busy} onChangeText={text => setRecipeIngredients(rows => rows.map(r => r.id === row.id ? { ...r, text } : r))} placeholder="p. ej. Patatas — 500 g" placeholderTextColor="#9aa49b" style={[styles.input, { flex: 1 }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ingrediente ${index + 1}`} disabled={busy} onPress={() => setRecipeIngredients(rows => rows.length === 1 ? emptyIngredientRows() : rows.filter(r => r.id !== row.id))} style={styles.shareButton}><Text style={styles.removeGlyph}>×</Text></Pressable>
          </View>)}
          <Pressable accessibilityRole="button" accessibilityLabel="Añadir ingrediente" disabled={busy} onPress={() => setRecipeIngredients(rows => [...rows, { id: makeId(), text: '' }])} style={styles.outlineButton}><Text style={styles.outlineText}>＋  Añadir ingrediente</Text></Pressable>
          <Text style={styles.fieldHint}>Puedes escribir solo el nombre o añadir cantidad así: «Arroz — 200 g».</Text>
          <Text style={styles.fieldLabel}>NOTA (OPCIONAL)</Text><TextInput value={recipeNote} onChangeText={setRecipeNote} placeholder="Algún truco o detalle…" placeholderTextColor="#9aa49b" style={styles.input} maxLength={240} />
          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton label={busy ? 'Guardando…' : editingRecipeId ? 'Guardar cambios' : 'Guardar plato'} disabled={busy} onPress={saveRecipe} />
        </KeyboardForm></View></KeyboardFrame>
      </Modal>

      <Modal visible={manualModal} transparent animationType="slide" onRequestClose={() => setManualModal(false)}>
        <KeyboardFrame style={styles.modalShade}><View style={styles.modalCard}><KeyboardForm><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>AÑADIR A LA LISTA</Text><Text style={styles.modalTitle}>Algo más para comprar</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar artículo" onPress={() => setManualModal(false)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text style={styles.fieldLabel}>ARTÍCULO</Text><TextInput value={manualName} onChangeText={setManualName} placeholder="p. ej. detergente" placeholderTextColor="#9aa49b" style={styles.input} autoFocus />
          <Text style={styles.fieldLabel}>CANTIDAD (OPCIONAL)</Text><TextInput value={manualAmount} onChangeText={setManualAmount} placeholder="p. ej. 2 botellas" placeholderTextColor="#9aa49b" style={styles.input} />
          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton label="Añadir a la compra" disabled={busy} onPress={addManualShopping} />
        </KeyboardForm></View></KeyboardFrame>
      </Modal>
    </SafeAreaView>
  );
}

function authErrorText(e: unknown) {
  const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
  const status = e && typeof e === 'object' && 'status' in e ? e.status : 0;
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo. Revisa también tu correo y Spam por si ya recibiste la activación.';
  if (code === 'email_not_confirmed') return 'Activa tu cuenta antes de iniciar sesión: abre el enlace del correo de activación. Revisa también Spam.';
  if (code === 'validation_failed' || code === 'email_address_invalid') return 'Revisa el correo electrónico: escribe una dirección válida.';
  return `No se pudo completar la solicitud. ${errorText(e)}`;
}

function errorText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return 'Ha ocurrido un problema. Inténtalo de nuevo.';
}

function LoadingScreen() { return <View style={styles.centerScreen}><ActivityIndicator size="large" color={C.green} /><Text style={styles.muted}>Preparando vuestra casa…</Text></View>; }

function AuthScreen({ busy, error, notice, onAuth }: { busy: boolean; error: string; notice: string; onAuth: (mode: 'login' | 'signup', email: string, password: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return <SafeAreaView style={styles.screen}><StatusBar style="dark" /><KeyboardFrame>
    {busy || error || notice ? <View testID="auth-feedback" accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined} style={[styles.authFeedback, error ? styles.authFeedbackError : null]}><Text style={[styles.authFeedbackText, error ? { color: C.red } : null]}>{busy ? (mode === 'signup' ? 'Creando tu cuenta… Espera a la confirmación del servicio.' : 'Iniciando sesión…') : error || notice}</Text></View> : null}
    <KeyboardForm contentContainerStyle={styles.authScreen}><View style={styles.authBrand}><Image accessibilityLabel="Logo iHambre" source={require('./assets/icon.png')} style={styles.logoLarge} /><Text style={styles.brand}>iHambre</Text><Text style={styles.authTitle}>Menú & compra</Text><Text style={styles.authIntro}>Una semana más sencilla, entre los dos.</Text></View>
    <View style={styles.authCard}><Text style={styles.eyebrow}>{mode === 'login' ? 'QUÉ BUENO VERTE' : 'EMPEZAR JUNTOS'}</Text><Text style={styles.sectionTitle}>{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</Text>
      <Text style={styles.fieldLabel}>CORREO ELECTRÓNICO</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vosotros@correo.com" style={styles.input} />
      <Text style={styles.fieldLabel}>CONTRASEÑA</Text><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" style={styles.input} />
      <PrimaryButton label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} disabled={busy || !email || password.length < 6} onPress={() => onAuth(mode, email, password)} />
      <Pressable disabled={busy} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.modeLink}><Text style={styles.modeLinkText}>{mode === 'login' ? '¿Primera vez? Crea una cuenta' : 'Ya tengo cuenta · Iniciar sesión'}</Text></Pressable>
    </View><Text style={styles.authFoot}>Cuenta privada para compartir recetas y compra solo con quien invites.</Text>
  </KeyboardForm></KeyboardFrame></SafeAreaView>;
}

function HouseholdScreen({ busy, error, email, onCreate, onJoin, onSignOut }: { busy: boolean; error: string; email: string; onCreate: (name: string) => void; onJoin: (code: string) => void; onSignOut: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create'); const [name, setName] = useState('Nuestra casa'); const [code, setCode] = useState('');
  return <SafeAreaView style={styles.screen}><StatusBar style="dark" /><KeyboardFrame><KeyboardForm contentContainerStyle={styles.authScreen}><View style={styles.authBrand}><Image accessibilityLabel="Logo iHambre" source={require('./assets/icon.png')} style={styles.logoLarge} /><Text style={styles.brand}>iHambre</Text><Text style={styles.authTitle}>Con quién compartes</Text><Text style={styles.authIntro}>{email}</Text></View>
    <View style={styles.authCard}><View style={styles.segment}><Pressable onPress={() => setMode('create')} style={[styles.segmentPart, mode === 'create' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'create' && styles.segmentTextActive]}>Crear casa</Text></Pressable><Pressable onPress={() => setMode('join')} style={[styles.segmentPart, mode === 'join' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'join' && styles.segmentTextActive]}>Unirme</Text></Pressable></View>
      {mode === 'create' ? <><Text style={styles.fieldLabel}>NOMBRE DE LA CASA</Text><TextInput value={name} onChangeText={setName} placeholder="Nuestra casa" style={styles.input} /><Text style={styles.fieldHint}>Después podrás compartir un código para que tu pareja se una.</Text><PrimaryButton label={busy ? 'Creando…' : 'Crear casa compartida'} disabled={busy} onPress={() => onCreate(name)} /></> : <><Text style={styles.fieldLabel}>CÓDIGO DE INVITACIÓN</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="8 letras o números" style={[styles.input, styles.codeInput]} maxLength={8} /><Text style={styles.fieldHint}>Pídele el código a quien creó la casa.</Text><PrimaryButton label={busy ? 'Uniéndome…' : 'Unirme a la casa'} disabled={busy || code.trim().length < 8} onPress={() => onJoin(code)} /></>}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View><Pressable onPress={onSignOut} style={styles.modeLink}><Text style={styles.modeLinkText}>Cerrar sesión</Text></Pressable>
  </KeyboardForm></KeyboardFrame></SafeAreaView>;
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}
function Notice({ text, type, onClose }: { text: string; type: 'error' | 'ok'; onClose: () => void }) {
  return <Pressable onPress={onClose} style={[styles.notice, type === 'error' ? styles.noticeError : styles.noticeOk]}><Text style={[styles.noticeText, type === 'error' ? styles.noticeErrorText : styles.noticeOkText]}>{text}</Text><Text style={styles.noticeClose}>×</Text></Pressable>;
}
function TabButton({ active, icon, label, badge, onPress }: { active: boolean; icon: string; label: string; badge?: number; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.tabButton}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Text style={[styles.tabIcon, active && styles.tabIconSelected]}>{icon}</Text>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}</View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  authFeedback: { flexShrink: 0, marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: C.green, backgroundColor: '#e7f0e3' },
  authFeedbackError: { borderColor: C.red, backgroundColor: '#f8e7e2' },
  authFeedbackText: { color: C.green, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  screen: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 22, paddingTop: Platform.OS === 'web' ? 18 : 13, paddingBottom: 13 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 58, height: 58, borderRadius: 16 },
  logoText: { color: C.cream, fontSize: 29, fontWeight: '700', marginTop: -3 },
  brand: { fontFamily: 'Notebook', color: C.green, fontSize: 32, letterSpacing: 2.2 },
  title: { color: C.muted, fontSize: 14, fontWeight: '600', marginTop: -2 },
  subtitle: { marginTop: 8, color: C.muted, fontSize: 12 },
  shareButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.leaf, alignItems: 'center', justifyContent: 'center' },
  optionsButton: { minWidth: 60, minHeight: 44, borderRadius: 22, backgroundColor: C.leaf, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  optionsShade: { flex: 1, backgroundColor: 'rgba(24,45,35,0.22)', alignItems: 'flex-end', paddingHorizontal: 18 },
  optionsMenu: { width: '100%', maxWidth: 320, padding: 18, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  optionsRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  optionsText: { fontSize: 15, color: C.green, fontWeight: '600' },
  accountEmail: { fontSize: 16, color: C.ink, marginBottom: 12 },

  localBanner: { marginHorizontal: 18, marginBottom: 8, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff0d8', flexDirection: 'row', gap: 9, alignItems: 'center' },
  bannerIcon: { fontSize: 15, color: '#8d602d' }, bannerText: { color: '#785b3a', fontSize: 11, lineHeight: 19, flex: 1 },
  notice: { marginHorizontal: 18, marginBottom: 8, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeError: { backgroundColor: '#f8e7e2' }, noticeOk: { backgroundColor: '#e7f0e3' }, noticeText: { flex: 1, fontSize: 13, lineHeight: 19 }, noticeErrorText: { color: C.red }, noticeOkText: { color: C.green }, noticeClose: { fontSize: 19, color: C.muted },
  weekBar: { marginHorizontal: 18, paddingVertical: 7, paddingHorizontal: 7, borderRadius: 17, backgroundColor: C.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line },
  arrowButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, arrow: { fontSize: 32, color: C.green, marginTop: -5 },
  weekCenter: { alignItems: 'center' }, weekTitle: { fontFamily: 'Notebook', fontSize: 22, color: C.ink }, weekCaption: { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  content: { padding: 18, paddingTop: 19, paddingBottom: 24 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, eyebrow: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 }, sectionTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 30, marginTop: 3 }, countPill: { color: C.green, backgroundColor: C.leaf, overflow: 'hidden', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  dayCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 18, marginBottom: 11, padding: 13, flexDirection: 'row', gap: 12 }, dayToday: { borderColor: '#9cb991', backgroundColor: '#fefff9' },
  dayHeader: { width: 43, alignItems: 'center', paddingTop: 4 }, dayName: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 1 }, dayNumber: { fontFamily: 'Notebook', fontSize: 30, color: C.ink, lineHeight: 34 }, todayNumber: { color: C.green }, dayDate: { fontSize: 11, color: C.muted }, todayTag: { marginTop: 6, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: C.leaf, color: C.green, fontSize: 11, fontWeight: '900', overflow: 'hidden', borderRadius: 5 },
  dayMeals: { flex: 1, gap: 8, borderLeftWidth: 1, borderColor: '#e6bbaa', paddingLeft: 11 }, mealRow: { minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 8 }, mealSlot: { width: 80, color: C.muted, fontSize: 13, fontWeight: '600' }, addMealButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 6 }, addMealGlyph: { fontSize: 15, color: C.green, fontWeight: '700' }, addMealText: { fontSize: 11, color: C.muted },
  plannedPill: { flex: 1, minHeight: 44, paddingLeft: 10, paddingRight: 6, borderRadius: 10, backgroundColor: '#eef3e8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, plannedText: { flex: 1, color: C.green, fontSize: 11, fontWeight: '700' }, removeGlyph: { color: '#96a197', fontSize: 21, paddingHorizontal: 4 },
  emptyCard: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 15 }, emptyEmoji: { fontSize: 36, marginBottom: 10 }, emptyTitle: { fontFamily: 'Notebook', fontSize: 24, color: C.ink }, emptyBody: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginTop: 7, marginBottom: 17, maxWidth: 285 },
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8, width: '100%' }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' }, disabledButton: { opacity: 0.45 }, pressed: { opacity: 0.82 },
  addCircle: { backgroundColor: C.green, width: 41, height: 41, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, addCircleText: { color: '#fff', fontSize: 25, lineHeight: 28, marginTop: -2 },
  progressCard: { backgroundColor: C.green, borderRadius: 18, padding: 16, marginBottom: 13 }, progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, progressTitle: { color: '#fff', fontWeight: '700', fontSize: 13 }, progressValue: { color: '#d9e7d5', fontSize: 11 }, progressTrack: { height: 6, borderRadius: 10, backgroundColor: '#537c67', overflow: 'hidden' }, progressFill: { height: 6, borderRadius: 10, backgroundColor: '#f2bd87' },
  shoppingCard: { borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.paper, paddingHorizontal: 13 }, shoppingRow: { minHeight: 61, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 11 }, lastRow: { borderBottomWidth: 0 }, checkbox: { width: 23, height: 23, borderRadius: 8, borderWidth: 1.5, borderColor: '#b9c4b9', alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: C.green, borderColor: C.green }, tick: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 19 }, shoppingInfo: { flex: 1 }, shoppingName: { fontFamily: 'Notebook', fontSize: 22, color: C.ink, fontWeight: '700' }, crossed: { textDecorationLine: 'line-through', color: '#99a299' }, shoppingMeta: { marginTop: 3, color: C.muted, fontSize: 11 }, amount: { color: C.green, fontSize: 11, fontWeight: '800' }, listHint: { color: C.muted, fontSize: 11, lineHeight: 19, marginTop: 12, marginHorizontal: 3 }, manualSection: { marginTop: 20 }, manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 1, borderColor: C.line },
  recipeIntro: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: -7, marginBottom: 15 }, recipeCard: { borderRadius: 17, borderColor: C.line, borderWidth: 1, backgroundColor: C.paper, padding: 14, marginBottom: 11 }, recipeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, recipeEmoji: { fontSize: 24 }, recipeTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 22 }, recipeSub: { color: C.muted, fontSize: 11, marginTop: 3 }, recipeArrow: { fontSize: 18, color: C.green, fontWeight: '700' }, ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 }, ingredientChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.pale, color: C.muted, fontSize: 11 }, recipeNote: { marginTop: 9, color: C.muted, fontSize: 11 },
  tabBar: { minHeight: 69, paddingBottom: Platform.OS === 'ios' ? 15 : 5, paddingTop: 5, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.paper, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, tabButton: { width: '31%', alignItems: 'center', justifyContent: 'center', gap: 3 }, tabIconWrap: { minWidth: 45, height: 31, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' }, tabIconActive: { backgroundColor: C.leaf }, tabIcon: { color: C.muted, fontSize: 19, fontWeight: '700' }, tabIconSelected: { color: C.green }, tabLabel: { color: C.muted, fontSize: 11, fontWeight: '600' }, tabLabelActive: { color: C.green, fontWeight: '800' }, badge: { position: 'absolute', right: 0, top: -3, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 2 },
  modalShade: { flex: 1, backgroundColor: 'rgba(24,45,35,0.38)', justifyContent: 'flex-end' }, modalCard: { backgroundColor: C.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22, maxHeight: '92%', flexShrink: 1 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 }, modalTitle: { fontFamily: 'Notebook', fontSize: 28, color: C.ink, marginTop: 4 }, modalSub: { fontSize: 13, color: C.muted, marginTop: 3 }, closeGlyph: { color: C.muted, fontSize: 29, lineHeight: 30, paddingHorizontal: 4 }, recipeChoice: { minHeight: 59, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.paper, marginBottom: 8, borderWidth: 1, borderColor: C.line, gap: 10 }, recipeChoiceEmoji: { fontSize: 22 }, recipeChoiceTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 21, fontWeight: '700' }, recipeChoiceSub: { color: C.muted, fontSize: 11, marginTop: 3 }, modalEmpty: { textAlign: 'center', color: C.muted, fontSize: 13, paddingVertical: 22 }, outlineButton: { minHeight: 43, borderWidth: 1, borderColor: C.green, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, outlineText: { color: C.green, fontSize: 13, fontWeight: '800' },
  fieldLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 11, marginBottom: 6 }, input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, paddingHorizontal: 13, fontSize: 16, color: C.ink }, multiline: { minHeight: 100, paddingTop: 12 }, fieldHint: { color: C.muted, fontSize: 11, lineHeight: 20, marginTop: 6 }, codeInput: { letterSpacing: 3, fontSize: 18, fontWeight: '800' },
  centerScreen: { flex: 1, backgroundColor: C.cream, justifyContent: 'center', alignItems: 'center', gap: 12 }, loadingInline: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, muted: { color: C.muted, fontSize: 11 },
  authScreen: { flexGrow: 1, backgroundColor: C.cream, justifyContent: 'center', padding: 22 }, authBrand: { alignItems: 'center', marginBottom: 23 }, logoLarge: { width: 86, height: 86, borderRadius: 22, marginBottom: 13 }, logoLargeText: { color: C.cream, fontSize: 38, fontWeight: '700', marginTop: -5 }, authTitle: { fontFamily: 'Notebook', color: C.ink, fontSize: 32, marginTop: 3 }, authIntro: { color: C.muted, fontSize: 13, marginTop: 6 }, authCard: { borderRadius: 20, backgroundColor: C.paper, padding: 18, borderWidth: 1, borderColor: C.line }, modeLink: { alignItems: 'center', padding: 14 }, modeLinkText: { color: C.green, fontSize: 11, fontWeight: '700' }, authFoot: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 11 }, segment: { padding: 3, backgroundColor: C.pale, borderRadius: 12, flexDirection: 'row', marginBottom: 17 }, segmentPart: { flex: 1, height: 37, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: C.paper }, segmentText: { color: C.muted, fontSize: 11, fontWeight: '700' }, segmentTextActive: { color: C.green }, errorText: { color: C.red, fontSize: 11, marginTop: 10, lineHeight: 19 }, successText: { color: C.green, fontSize: 11, marginTop: 10, lineHeight: 19 },
});
