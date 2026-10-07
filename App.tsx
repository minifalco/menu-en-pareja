import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ingredient, ManualShoppingItem, PlannedMeal, ShoppingItem } from './src/domain/types';
import { aggregateShopping, shoppingKey } from './src/domain/shopping';
import { formatIngredient, parseIngredients } from './src/domain/ingredients';
import { addDays, formatISODate, getMonday, getWeekDates, parseLocalDate } from './src/domain/dates';
import {
  addManualItem, addMeal, addRecipe, cloudEnabled, createHousehold, emptyWeek,
  joinHousehold, listMyHouseholds, loadLocal, loadWeek, removeManualItem,
  removeMeal, saveLocal, setManualChecked, setShoppingChecked, supabase,
  type Household, type Recipe, type WeekData,
} from './src/data/cloud';

const C = {
  ink: '#19392d', green: '#245b43', leaf: '#dce9d5', cream: '#fbf8f0', paper: '#ffffff',
  muted: '#718075', line: '#e8e5dc', orange: '#e89b62', pale: '#f2efe6', red: '#b65345',
};
const ACTIVE_HOUSEHOLD = 'menu-pareja:active-household';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const makeInviteCode = () => Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

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
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const [sessionReady, setSessionReady] = useState(!cloudEnabled);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [data, setData] = useState<WeekData>(emptyWeek());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('semana');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mealTarget, setMealTarget] = useState<{ day: string; slot: 'comida' | 'cena' } | null>(null);
  const [recipeModal, setRecipeModal] = useState(false);
  const [manualModal, setManualModal] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState('');
  const [recipeNote, setRecipeNote] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState('');

  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      setSessionReady(true);
      if (!session) setHousehold(null);
    });
    supabase.auth.getSession().then(({ data: result }) => {
      setUserEmail(result.session?.user.email ?? null);
      setSessionReady(true);
    }).catch(() => setSessionReady(true));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!cloudEnabled || !userEmail) return;
    let alive = true;
    setBusy(true);
    listMyHouseholds().then(async houses => {
      if (!alive) return;
      const savedId = await AsyncStorage.getItem(ACTIVE_HOUSEHOLD);
      const active = houses.find(h => h.id === savedId) ?? houses[0] ?? null;
      setHousehold(active);
      if (active) await AsyncStorage.setItem(ACTIVE_HOUSEHOLD, active.id);
    }).catch(e => setError(errorText(e))).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [userEmail]);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError('');
    const localKey = household ? `menu-pareja:${household.id}:${weekStart}` : `menu-pareja:local:${weekStart}`;
    const fetchData = async () => {
      try {
        const next = household ? await loadWeek(household.id, weekStart) : await loadLocal<WeekData>(localKey) ?? emptyWeek();
        if (!household && !cloudEnabled) next.recipes = await loadLocal<Recipe[]>('menu-pareja:local:recipes') ?? next.recipes;
        if (alive) setData(next);
      } catch (e) {
        const cached = await loadLocal<WeekData>(localKey);
        if (alive) {
          setData(cached ?? emptyWeek());
          setError(`No se pudo conectar. ${errorText(e)}${cached ? ' Mostrando lo guardado en este móvil.' : ''}`);
        }
      } finally {
        if (alive) { setLoaded(true); setBusy(false); }
      }
    };
    fetchData();
    return () => { alive = false; };
  }, [household?.id, weekStart]);

  useEffect(() => {
    if (!household || !supabase || !userEmail) return;
    const client = supabase;
    const channel = client.channel(`household-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes', filter: `household_id=eq.${household.id}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planned_meals', filter: `household_id=eq.${household.id}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_checks', filter: `household_id=eq.${household.id}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manual_shopping_items', filter: `household_id=eq.${household.id}` }, () => reload())
      .subscribe();
    function reload() {
      loadWeek(household!.id, weekStart).then(next => { setData(next); setError(''); }).catch(e => setError(errorText(e)));
    }
    return () => { void client.removeChannel(channel); };
  }, [household?.id, weekStart, userEmail]);

  useEffect(() => {
    if (!loaded) return;
    const key = household ? `menu-pareja:${household.id}:${weekStart}` : `menu-pareja:local:${weekStart}`;
    void saveLocal(key, data);
    if (!household && !cloudEnabled) void saveLocal('menu-pareja:local:recipes', data.recipes);
  }, [data, household?.id, weekStart, loaded]);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const shopping = useMemo(() => aggregateShopping(data.meals, data.checks, data.manualItems), [data.meals, data.checks, data.manualItems]);
  const doneCount = shopping.filter(item => item.checked).length;
  const today = formatISODate(new Date());
  const localMode = !cloudEnabled;

  async function doAuth(mode: 'login' | 'signup', email: string, password: string) {
    if (!supabase) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) setNotice('Revisa tu correo para confirmar la cuenta y después inicia sesión.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function makeHouse(name: string) {
    setBusy(true); setError('');
    try {
      const created = await createHousehold(name.trim() || 'Nuestra casa', makeInviteCode());
      await AsyncStorage.setItem(ACTIVE_HOUSEHOLD, created.id);
      setHousehold(created);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function enterHouse(code: string) {
    setBusy(true); setError('');
    try {
      const joined = await joinHousehold(code);
      await AsyncStorage.setItem(ACTIVE_HOUSEHOLD, joined.id);
      setHousehold(joined);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function saveRecipe() {
    if (!recipeName.trim()) { setError('Ponle un nombre al plato.'); return; }
    const recipe = { title: recipeName.trim(), ingredients: parseIngredients(recipeIngredients), note: recipeNote.trim() };
    setBusy(true); setError('');
    try {
      const saved = household ? await addRecipe(household.id, recipe) : { ...recipe, id: makeId() };
      setData(current => ({ ...current, recipes: [...current.recipes, saved].sort((a,b) => a.title.localeCompare(b.title, 'es')) }));
      setRecipeName(''); setRecipeIngredients(''); setRecipeNote(''); setRecipeModal(false);
      setNotice('Plato guardado en vuestra colección.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function planRecipe(recipe: Recipe) {
    if (!mealTarget) return;
    const meal: PlannedMeal = {
      id: makeId(), title: recipe.title, day: mealTarget.day, slot: mealTarget.slot,
      ingredients: recipe.ingredients,
    };
    setBusy(true); setError('');
    try {
      if (household) await addMeal(household.id, weekStart, meal);
      setData(current => ({ ...current, meals: [...current.meals, meal] }));
      setMealTarget(null); setNotice('Menú añadido; la compra se ha actualizado.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function deleteMeal(meal: PlannedMeal) {
    setBusy(true); setError('');
    try {
      if (household) await removeMeal(household.id, meal.id);
      setData(current => ({ ...current, meals: current.meals.filter(item => item.id !== meal.id) }));
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function toggleCheck(item: ShoppingItem) {
    const checked = !item.checked;
    if (!item.sources.length && item.manualIds.length) {
      setData(current => ({ ...current, manualItems: current.manualItems.map(row => item.manualIds.includes(row.id) ? { ...row, checked } : row) }));
      try {
        if (household) await Promise.all(item.manualIds.map(id => setManualChecked(household.id, id, checked)));
      } catch (e) { setError(`No se pudo sincronizar esta casilla: ${errorText(e)}`); }
      return;
    }
    setData(current => ({ ...current, checks: { ...current.checks, [item.key]: checked } }));
    try { if (household) await setShoppingChecked(household.id, weekStart, item.key, checked); }
    catch (e) { setError(`No se pudo sincronizar esta casilla: ${errorText(e)}`); }
  }

  async function addManualShopping() {
    if (!manualName.trim()) { setError('Escribe qué necesitas comprar.'); return; }
    const parsed = parseIngredients(`${manualName.trim()}${manualAmount.trim() ? ` — ${manualAmount.trim()}` : ''}`)[0];
    const item: ManualShoppingItem = { ...parsed, id: makeId(), checked: false };
    setBusy(true); setError('');
    try {
      if (household) await addManualItem(household.id, weekStart, item);
      setData(current => ({ ...current, manualItems: [...current.manualItems, item] }));
      setManualName(''); setManualAmount(''); setManualModal(false);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function deleteManual(item: ManualShoppingItem) {
    try {
      if (household) await removeManualItem(household.id, item.id);
      setData(current => ({ ...current, manualItems: current.manualItems.filter(row => row.id !== item.id) }));
    } catch (e) { setError(errorText(e)); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setHousehold(null);
  }

  if (cloudEnabled && !sessionReady) return <LoadingScreen />;
  if (cloudEnabled && !userEmail) return <AuthScreen busy={busy} error={error} notice={notice} onAuth={doAuth} />;
  if (cloudEnabled && userEmail && !household) return <HouseholdScreen busy={busy} error={error} email={userEmail} onCreate={makeHouse} onJoin={enterHouse} onSignOut={signOut} />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brandLine}>
          <View style={styles.logo}><Text style={styles.logoText}>⌂</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>CASA EN ORDEN</Text>
            <Text style={styles.title}>Menú & compra</Text>
          </View>
          {household ? <Pressable onPress={() => Share.share({ message: `Únete a ${household.name} en Menú en pareja con este código: ${household.inviteCode}` })} style={styles.shareButton}><Text style={styles.shareGlyph}>↗</Text></Pressable> : null}
        </View>
        {household ? <Text style={styles.subtitle}>{household.name} · sincronizado</Text> : <Text style={styles.subtitle}>Planead juntos, comprad sin duplicar</Text>}
      </View>

      {localMode ? <View style={styles.localBanner}><Text style={styles.bannerIcon}>☁</Text><Text style={styles.bannerText}>Modo en este móvil · la sincronización compartida se activa al conectar el servicio gratuito.</Text></View> : null}
      {error ? <Notice text={error} type="error" onClose={() => setError('')} /> : null}
      {notice ? <Notice text={notice} type="ok" onClose={() => setNotice('')} /> : null}

      <View style={styles.weekBar}>
        <Pressable accessibilityLabel="Semana anterior" onPress={() => setWeekStart(addDays(weekStart, -7))} style={styles.arrowButton}><Text style={styles.arrow}>‹</Text></Pressable>
        <Pressable style={styles.weekCenter} onPress={() => setWeekStart(getMonday(new Date()))}>
          <Text style={styles.weekTitle}>{weekLabel(weekStart)}</Text>
          <Text style={styles.weekCaption}>{weekStart === getMonday(new Date()) ? 'ESTA SEMANA' : 'TOCA PARA VOLVER A HOY'}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Semana siguiente" onPress={() => setWeekStart(addDays(weekStart, 7))} style={styles.arrowButton}><Text style={styles.arrow}>›</Text></Pressable>
      </View>

      {!loaded ? <View style={styles.loadingInline}><ActivityIndicator color={C.green} /><Text style={styles.muted}>Cargando vuestra semana…</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'semana' ? <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>VUESTRA SEMANA</Text><Text style={styles.sectionTitle}>¿Qué comemos?</Text></View><Text style={styles.countPill}>{data.meals.length} platos</Text></View>
          {!data.recipes.length ? <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>🥗</Text><Text style={styles.emptyTitle}>Empezad con un plato</Text><Text style={styles.emptyBody}>Guardad una receta con sus ingredientes y luego colocadla en el día que queráis.</Text><PrimaryButton label="Crear primer plato" onPress={() => setRecipeModal(true)} /></View> : null}
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
            {shopping.map((item, index) => <Pressable key={item.key} onPress={() => toggleCheck(item)} style={[styles.shoppingRow, index === shopping.length - 1 && styles.lastRow]}>
              <View style={[styles.checkbox, item.checked && styles.checkboxDone]}>{item.checked ? <Text style={styles.tick}>✓</Text> : null}</View>
              <View style={styles.shoppingInfo}><Text style={[styles.shoppingName, item.checked && styles.crossed]}>{item.name}</Text><Text style={styles.shoppingMeta}>{item.quantity !== undefined ? `${numberText(item.quantity)}${item.unit ? ` ${item.unit}` : ''} · ` : ''}{item.manual && !item.sources.length ? 'Añadido a mano' : item.sources.join(' · ')}</Text></View>
              {item.quantity !== undefined ? <Text style={styles.amount}>{numberText(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</Text> : null}
              {item.manualIds.length ? <Pressable accessibilityLabel="Eliminar añadido a mano" onPress={() => { const row = data.manualItems.find(manual => item.manualIds.includes(manual.id)); if (row) deleteManual(row); }} hitSlop={8}><Text style={styles.removeGlyph}>×</Text></Pressable> : null}
            </Pressable>)}
          </View>
          <Text style={styles.listHint}>Los ingredientes se agrupan automáticamente. Si cambia el menú, la lista se actualiza.</Text>
        </> : null}

        {tab === 'platos' ? <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>COLECCIÓN DE CASA</Text><Text style={styles.sectionTitle}>Vuestros platos</Text></View><Pressable onPress={() => setRecipeModal(true)} style={styles.addCircle}><Text style={styles.addCircleText}>＋</Text></Pressable></View>
          <Text style={styles.recipeIntro}>Cada plato guarda sus ingredientes. Añádelo al menú semanal cuando os apetezca.</Text>
          {data.recipes.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyEmoji}>📖</Text><Text style={styles.emptyTitle}>Todavía no hay platos</Text><Text style={styles.emptyBody}>Cread vuestra colección una vez y reutilizadla semana tras semana.</Text><PrimaryButton label="Añadir un plato" onPress={() => setRecipeModal(true)} /></View> : data.recipes.map(recipe => <View key={recipe.id} style={styles.recipeCard}><View style={styles.recipeTop}><Text style={styles.recipeEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeTitle}>{recipe.title}</Text><Text style={styles.recipeSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={styles.recipeArrow}>✦</Text></View><View style={styles.ingredientChips}>{recipe.ingredients.slice(0, 5).map((ingredient, i) => <Text key={`${recipe.id}-${i}`} style={styles.ingredientChip}>{formatIngredient(ingredient)}</Text>)}{recipe.ingredients.length > 5 ? <Text style={styles.ingredientChip}>+{recipe.ingredients.length - 5}</Text> : null}</View>{recipe.note ? <Text style={styles.recipeNote}>{recipe.note}</Text> : null}</View>)}
        </> : null}
        <View style={{ height: 22 }} />
      </ScrollView>

      <View style={styles.tabBar}>
        <TabButton active={tab === 'semana'} icon="▦" label="Semana" onPress={() => setTab('semana')} />
        <TabButton active={tab === 'compra'} icon="☑" label="Compra" badge={shopping.length - doneCount || undefined} onPress={() => setTab('compra')} />
        <TabButton active={tab === 'platos'} icon="◉" label="Platos" onPress={() => setTab('platos')} />
      </View>

      <Modal visible={Boolean(mealTarget)} transparent animationType="slide" onRequestClose={() => setMealTarget(null)}>
        <View style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>PLANIFICAR</Text><Text style={styles.modalTitle}>{mealTarget ? dateLong(mealTarget.day) : ''}</Text><Text style={styles.modalSub}>{mealTarget?.slot === 'comida' ? 'Comida' : 'Cena'}</Text></View><Pressable onPress={() => setMealTarget(null)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <ScrollView style={{ maxHeight: 390 }}>
            {data.recipes.map(recipe => <Pressable key={recipe.id} onPress={() => planRecipe(recipe)} style={styles.recipeChoice}><Text style={styles.recipeChoiceEmoji}>🍲</Text><View style={{ flex: 1 }}><Text style={styles.recipeChoiceTitle}>{recipe.title}</Text><Text style={styles.recipeChoiceSub}>{recipe.ingredients.length} ingredientes</Text></View><Text style={styles.recipeArrow}>＋</Text></Pressable>)}
            {data.recipes.length === 0 ? <Text style={styles.modalEmpty}>Primero guarda un plato con sus ingredientes.</Text> : null}
          </ScrollView>
          <Pressable onPress={() => { setMealTarget(null); setRecipeModal(true); }} style={styles.outlineButton}><Text style={styles.outlineText}>＋  Crear un plato nuevo</Text></Pressable>
        </View></View>
      </Modal>

      <Modal visible={recipeModal} transparent animationType="slide" onRequestClose={() => setRecipeModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>NUEVA RECETA</Text><Text style={styles.modalTitle}>Un plato de casa</Text></View><Pressable onPress={() => setRecipeModal(false)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text style={styles.fieldLabel}>NOMBRE DEL PLATO</Text><TextInput value={recipeName} onChangeText={setRecipeName} placeholder="p. ej. Tortilla de patata" placeholderTextColor="#9aa49b" style={styles.input} maxLength={100} />
          <Text style={styles.fieldLabel}>INGREDIENTES · UNO POR LÍNEA</Text><TextInput value={recipeIngredients} onChangeText={setRecipeIngredients} placeholder={'Patatas — 500 g\nHuevos — 4 ud\nCebolla'} placeholderTextColor="#9aa49b" style={[styles.input, styles.multiline]} multiline textAlignVertical="top" />
          <Text style={styles.fieldHint}>Puedes escribir solo el nombre o añadir cantidad así: «Arroz — 200 g».</Text>
          <Text style={styles.fieldLabel}>NOTA (OPCIONAL)</Text><TextInput value={recipeNote} onChangeText={setRecipeNote} placeholder="Algún truco o detalle…" placeholderTextColor="#9aa49b" style={styles.input} maxLength={240} />
          <PrimaryButton label={busy ? 'Guardando…' : 'Guardar plato'} disabled={busy} onPress={saveRecipe} />
        </View></ScrollView></KeyboardAvoidingView>
      </Modal>

      <Modal visible={manualModal} transparent animationType="slide" onRequestClose={() => setManualModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>AÑADIR A LA LISTA</Text><Text style={styles.modalTitle}>Algo más para comprar</Text></View><Pressable onPress={() => setManualModal(false)}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
          <Text style={styles.fieldLabel}>ARTÍCULO</Text><TextInput value={manualName} onChangeText={setManualName} placeholder="p. ej. detergente" placeholderTextColor="#9aa49b" style={styles.input} autoFocus />
          <Text style={styles.fieldLabel}>CANTIDAD (OPCIONAL)</Text><TextInput value={manualAmount} onChangeText={setManualAmount} placeholder="p. ej. 2 botellas" placeholderTextColor="#9aa49b" style={styles.input} />
          <PrimaryButton label="Añadir a la compra" disabled={busy} onPress={addManualShopping} />
        </View></KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function errorText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return 'Ha ocurrido un problema. Inténtalo de nuevo.';
}

function LoadingScreen() { return <View style={styles.centerScreen}><ActivityIndicator size="large" color={C.green} /><Text style={styles.muted}>Preparando vuestra casa…</Text></View>; }

function AuthScreen({ busy, error, notice, onAuth }: { busy: boolean; error: string; notice: string; onAuth: (mode: 'login' | 'signup', email: string, password: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return <SafeAreaView style={styles.authScreen}><StatusBar style="dark" /><View style={styles.authBrand}><View style={styles.logoLarge}><Text style={styles.logoLargeText}>⌂</Text></View><Text style={styles.brand}>CASA EN ORDEN</Text><Text style={styles.authTitle}>Menú & compra</Text><Text style={styles.authIntro}>Una semana más sencilla, entre los dos.</Text></View>
    <View style={styles.authCard}><Text style={styles.eyebrow}>{mode === 'login' ? 'QUÉ BUENO VERTE' : 'EMPEZAR JUNTOS'}</Text><Text style={styles.sectionTitle}>{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</Text>
      <Text style={styles.fieldLabel}>CORREO ELECTRÓNICO</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vosotros@correo.com" style={styles.input} />
      <Text style={styles.fieldLabel}>CONTRASEÑA</Text><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" style={styles.input} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}{notice ? <Text style={styles.successText}>{notice}</Text> : null}
      <PrimaryButton label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} disabled={busy || !email || password.length < 6} onPress={() => onAuth(mode, email, password)} />
      <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.modeLink}><Text style={styles.modeLinkText}>{mode === 'login' ? '¿Primera vez? Crea una cuenta' : 'Ya tengo cuenta · Iniciar sesión'}</Text></Pressable>
    </View><Text style={styles.authFoot}>Cuenta privada para compartir recetas y compra solo con quien invites.</Text>
  </SafeAreaView>;
}

function HouseholdScreen({ busy, error, email, onCreate, onJoin, onSignOut }: { busy: boolean; error: string; email: string; onCreate: (name: string) => void; onJoin: (code: string) => void; onSignOut: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create'); const [name, setName] = useState('Nuestra casa'); const [code, setCode] = useState('');
  return <SafeAreaView style={styles.authScreen}><StatusBar style="dark" /><View style={styles.authBrand}><View style={styles.logoLarge}><Text style={styles.logoLargeText}>⌂</Text></View><Text style={styles.brand}>VUESTRA CASA</Text><Text style={styles.authTitle}>Con quién compartes</Text><Text style={styles.authIntro}>{email}</Text></View>
    <View style={styles.authCard}><View style={styles.segment}><Pressable onPress={() => setMode('create')} style={[styles.segmentPart, mode === 'create' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'create' && styles.segmentTextActive]}>Crear casa</Text></Pressable><Pressable onPress={() => setMode('join')} style={[styles.segmentPart, mode === 'join' && styles.segmentActive]}><Text style={[styles.segmentText, mode === 'join' && styles.segmentTextActive]}>Unirme</Text></Pressable></View>
      {mode === 'create' ? <><Text style={styles.fieldLabel}>NOMBRE DE LA CASA</Text><TextInput value={name} onChangeText={setName} placeholder="Nuestra casa" style={styles.input} /><Text style={styles.fieldHint}>Después podrás compartir un código para que tu pareja se una.</Text><PrimaryButton label={busy ? 'Creando…' : 'Crear casa compartida'} disabled={busy} onPress={() => onCreate(name)} /></> : <><Text style={styles.fieldLabel}>CÓDIGO DE INVITACIÓN</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="8 letras o números" style={[styles.input, styles.codeInput]} maxLength={8} /><Text style={styles.fieldHint}>Pídele el código a quien creó la casa.</Text><PrimaryButton label={busy ? 'Uniéndome…' : 'Unirme a la casa'} disabled={busy || code.trim().length < 8} onPress={() => onJoin(code)} /></>}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View><Pressable onPress={onSignOut} style={styles.modeLink}><Text style={styles.modeLinkText}>Cerrar sesión</Text></Pressable>
  </SafeAreaView>;
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
  screen: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 22, paddingTop: Platform.OS === 'web' ? 18 : 13, paddingBottom: 13 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: C.cream, fontSize: 29, fontWeight: '700', marginTop: -3 },
  brand: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: C.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: 1 },
  subtitle: { marginTop: 8, color: C.muted, fontSize: 12 },
  shareButton: { width: 38, height: 38, borderRadius: 20, backgroundColor: C.leaf, alignItems: 'center', justifyContent: 'center' },
  shareGlyph: { fontSize: 21, fontWeight: '700', color: C.green },
  localBanner: { marginHorizontal: 18, marginBottom: 8, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff0d8', flexDirection: 'row', gap: 9, alignItems: 'center' },
  bannerIcon: { fontSize: 15, color: '#8d602d' }, bannerText: { color: '#785b3a', fontSize: 11, lineHeight: 16, flex: 1 },
  notice: { marginHorizontal: 18, marginBottom: 8, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeError: { backgroundColor: '#f8e7e2' }, noticeOk: { backgroundColor: '#e7f0e3' }, noticeText: { flex: 1, fontSize: 12, lineHeight: 17 }, noticeErrorText: { color: C.red }, noticeOkText: { color: C.green }, noticeClose: { fontSize: 19, color: C.muted },
  weekBar: { marginHorizontal: 18, paddingVertical: 7, paddingHorizontal: 7, borderRadius: 17, backgroundColor: C.paper, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.line },
  arrowButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, arrow: { fontSize: 32, color: C.green, marginTop: -5 },
  weekCenter: { alignItems: 'center' }, weekTitle: { fontSize: 15, fontWeight: '800', color: C.ink }, weekCaption: { marginTop: 2, color: C.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  content: { padding: 18, paddingTop: 19, paddingBottom: 24 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, eyebrow: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 }, sectionTitle: { color: C.ink, fontWeight: '800', fontSize: 23, letterSpacing: -0.6, marginTop: 3 }, countPill: { color: C.green, backgroundColor: C.leaf, overflow: 'hidden', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  dayCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 18, marginBottom: 11, padding: 13, flexDirection: 'row', gap: 12 }, dayToday: { borderColor: '#9cb991', backgroundColor: '#fefff9' },
  dayHeader: { width: 43, alignItems: 'center', paddingTop: 4 }, dayName: { fontSize: 8, color: C.muted, fontWeight: '800', letterSpacing: 1 }, dayNumber: { fontSize: 23, fontWeight: '800', color: C.ink, lineHeight: 29 }, todayNumber: { color: C.green }, dayDate: { fontSize: 9, color: C.muted }, todayTag: { marginTop: 6, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: C.leaf, color: C.green, fontSize: 7, fontWeight: '900', overflow: 'hidden', borderRadius: 5 },
  dayMeals: { flex: 1, gap: 8, borderLeftWidth: 1, borderColor: C.line, paddingLeft: 11 }, mealRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 }, mealSlot: { width: 72, color: C.muted, fontSize: 10, fontWeight: '600' }, addMealButton: { flex: 1, minHeight: 34, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 6 }, addMealGlyph: { fontSize: 15, color: C.green, fontWeight: '700' }, addMealText: { fontSize: 11, color: C.muted },
  plannedPill: { flex: 1, minHeight: 34, paddingLeft: 10, paddingRight: 6, borderRadius: 10, backgroundColor: '#eef3e8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }, plannedText: { flex: 1, color: C.green, fontSize: 11, fontWeight: '700' }, removeGlyph: { color: '#96a197', fontSize: 21, paddingHorizontal: 4 },
  emptyCard: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 15 }, emptyEmoji: { fontSize: 36, marginBottom: 10 }, emptyTitle: { fontSize: 16, fontWeight: '800', color: C.ink }, emptyBody: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18, marginTop: 7, marginBottom: 17, maxWidth: 285 },
  primaryButton: { minHeight: 45, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8, width: '100%' }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' }, disabledButton: { opacity: 0.45 }, pressed: { opacity: 0.82 },
  addCircle: { backgroundColor: C.green, width: 41, height: 41, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, addCircleText: { color: '#fff', fontSize: 25, lineHeight: 28, marginTop: -2 },
  progressCard: { backgroundColor: C.green, borderRadius: 18, padding: 16, marginBottom: 13 }, progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, progressTitle: { color: '#fff', fontWeight: '700', fontSize: 13 }, progressValue: { color: '#d9e7d5', fontSize: 10 }, progressTrack: { height: 6, borderRadius: 10, backgroundColor: '#537c67', overflow: 'hidden' }, progressFill: { height: 6, borderRadius: 10, backgroundColor: '#f2bd87' },
  shoppingCard: { borderWidth: 1, borderColor: C.line, borderRadius: 18, backgroundColor: C.paper, paddingHorizontal: 13 }, shoppingRow: { minHeight: 61, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 11 }, lastRow: { borderBottomWidth: 0 }, checkbox: { width: 23, height: 23, borderRadius: 8, borderWidth: 1.5, borderColor: '#b9c4b9', alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: C.green, borderColor: C.green }, tick: { color: '#fff', fontWeight: '900', fontSize: 14, lineHeight: 17 }, shoppingInfo: { flex: 1 }, shoppingName: { fontSize: 13, color: C.ink, fontWeight: '700' }, crossed: { textDecorationLine: 'line-through', color: '#99a299' }, shoppingMeta: { marginTop: 3, color: C.muted, fontSize: 9 }, amount: { color: C.green, fontSize: 10, fontWeight: '800' }, listHint: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 12, marginHorizontal: 3 }, manualSection: { marginTop: 20 }, manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 1, borderColor: C.line },
  recipeIntro: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: -7, marginBottom: 15 }, recipeCard: { borderRadius: 17, borderColor: C.line, borderWidth: 1, backgroundColor: C.paper, padding: 14, marginBottom: 11 }, recipeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, recipeEmoji: { fontSize: 24 }, recipeTitle: { color: C.ink, fontWeight: '800', fontSize: 14 }, recipeSub: { color: C.muted, fontSize: 10, marginTop: 3 }, recipeArrow: { fontSize: 18, color: C.green, fontWeight: '700' }, ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 }, ingredientChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.pale, color: C.muted, fontSize: 9 }, recipeNote: { marginTop: 9, color: C.muted, fontSize: 10 },
  tabBar: { minHeight: 69, paddingBottom: Platform.OS === 'ios' ? 15 : 5, paddingTop: 5, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.paper, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, tabButton: { width: '31%', alignItems: 'center', justifyContent: 'center', gap: 3 }, tabIconWrap: { minWidth: 45, height: 31, borderRadius: 15, alignItems: 'center', justifyContent: 'center', position: 'relative' }, tabIconActive: { backgroundColor: C.leaf }, tabIcon: { color: C.muted, fontSize: 19, fontWeight: '700' }, tabIconSelected: { color: C.green }, tabLabel: { color: C.muted, fontSize: 9, fontWeight: '600' }, tabLabelActive: { color: C.green, fontWeight: '800' }, badge: { position: 'absolute', right: 0, top: -3, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 8, fontWeight: '800', paddingHorizontal: 2 },
  modalShade: { flex: 1, backgroundColor: 'rgba(24,45,35,0.38)', justifyContent: 'flex-end' }, modalCard: { backgroundColor: C.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 22, maxHeight: '90%' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 }, modalTitle: { fontSize: 21, fontWeight: '800', color: C.ink, marginTop: 4 }, modalSub: { fontSize: 12, color: C.muted, marginTop: 3 }, closeGlyph: { color: C.muted, fontSize: 29, lineHeight: 30, paddingHorizontal: 4 }, recipeChoice: { minHeight: 59, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.paper, marginBottom: 8, borderWidth: 1, borderColor: C.line, gap: 10 }, recipeChoiceEmoji: { fontSize: 22 }, recipeChoiceTitle: { color: C.ink, fontSize: 13, fontWeight: '700' }, recipeChoiceSub: { color: C.muted, fontSize: 10, marginTop: 3 }, modalEmpty: { textAlign: 'center', color: C.muted, fontSize: 12, paddingVertical: 22 }, outlineButton: { minHeight: 43, borderWidth: 1, borderColor: C.green, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, outlineText: { color: C.green, fontSize: 12, fontWeight: '800' },
  fieldLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 11, marginBottom: 6 }, input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, paddingHorizontal: 13, fontSize: 13, color: C.ink }, multiline: { minHeight: 100, paddingTop: 12 }, fieldHint: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 6 }, codeInput: { letterSpacing: 3, fontSize: 18, fontWeight: '800' },
  centerScreen: { flex: 1, backgroundColor: C.cream, justifyContent: 'center', alignItems: 'center', gap: 12 }, loadingInline: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, muted: { color: C.muted, fontSize: 11 },
  authScreen: { flex: 1, backgroundColor: C.cream, justifyContent: 'center', padding: 22 }, authBrand: { alignItems: 'center', marginBottom: 23 }, logoLarge: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }, logoLargeText: { color: C.cream, fontSize: 38, fontWeight: '700', marginTop: -5 }, authTitle: { color: C.ink, fontSize: 27, fontWeight: '800', marginTop: 3 }, authIntro: { color: C.muted, fontSize: 12, marginTop: 6 }, authCard: { borderRadius: 20, backgroundColor: C.paper, padding: 18, borderWidth: 1, borderColor: C.line }, modeLink: { alignItems: 'center', padding: 14 }, modeLinkText: { color: C.green, fontSize: 11, fontWeight: '700' }, authFoot: { color: C.muted, fontSize: 10, textAlign: 'center', marginTop: 11 }, segment: { padding: 3, backgroundColor: C.pale, borderRadius: 12, flexDirection: 'row', marginBottom: 17 }, segmentPart: { flex: 1, height: 37, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: C.paper }, segmentText: { color: C.muted, fontSize: 11, fontWeight: '700' }, segmentTextActive: { color: C.green }, errorText: { color: C.red, fontSize: 11, marginTop: 10, lineHeight: 16 }, successText: { color: C.green, fontSize: 11, marginTop: 10, lineHeight: 16 },
});
