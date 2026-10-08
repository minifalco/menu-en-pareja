import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Ingredient, ManualShoppingItem, PlannedMeal, ShoppingItem } from '../domain/types';
import { makeId, makeInviteCode } from '../domain/ids';
import { createAsyncBoundary, mergeById } from '../domain/cloudState';
import { syncPlannedRecipes } from '../domain/recipes';
import { aggregateShopping, buildManualItem } from '../domain/shopping';
import { ingredientText, parseIngredients } from '../domain/ingredients';
import { getMonday } from '../domain/dates';
import { authErrorText, errorText } from '../lib/errors';
import {
  addManualItem, addMeal, addRecipe, changePassword, cloudEnabled, createHousehold, deleteMyAccount, emptyWeek,
  joinHousehold, leaveHousehold, listMyHouseholds, loadLocal, loadWeek, regenerateInviteCode, removeHouseholdMember, removeManualItem,
  removeMeal, requestPasswordReset, resetPasswordWithCode, updateRecipe, updateLocalRecipePlans, saveLocal, setManualChecked, setShoppingChecked, subscribeHouseholdChanges, supabase,
  type Household, type Recipe, type WeekData,
} from '../data/cloud';

const ACTIVE_HOUSEHOLD = 'menu-pareja:active-household';

export type IngredientRow = { id: string; text: string; original?: Ingredient };
export const emptyIngredientRows = (): IngredientRow[] => [{ id: makeId(), text: '' }];
export type MealTarget = { day: string; slot: 'comida' | 'cena' };
type CheckWrites = { values: Map<string, boolean>; running: number; version: number };

// Todo el estado compartido de la app y sus acciones. Las pantallas lo leen con useAppState().
function useAppStateValue() {
  const [sessionReady, setSessionReady] = useState(!cloudEnabled);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [rawData, setData] = useState<WeekData>(emptyWeek());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Auth feedback must not be cleared by household/week loads or auth notifications.
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [mealTarget, setMealTarget] = useState<MealTarget | null>(null);
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
  // A new boundary on every household, week or account change makes late responses from the previous one harmless.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => createAsyncBoundary(), [household, weekStart, userEmail]);
  // Each async scope owns its pending keys; a slow checkbox never locks other rows.
  const checkWritesByScope = useRef(new WeakMap<object, CheckWrites>());
  function checkWritesFor(owner: object): CheckWrites {
    let writes = checkWritesByScope.current.get(owner);
    if (!writes) { writes = { values: new Map(), running: 0, version: 0 }; checkWritesByScope.current.set(owner, writes); }
    return writes;
  }
  const [checkOverlay, setCheckOverlay] = useState<{ owner: typeof scope; values: Record<string, boolean> } | null>(null);
  const [dataScope, setDataScope] = useState<typeof scope | null>(null);
  const authOwner = useRef<string | null>(null);
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const data = useMemo(() => dataScope === scope ? { ...rawData, meals: syncPlannedRecipes(rawData.meals, rawData.recipes) } : emptyWeek(), [dataScope, scope, rawData]);
  useLayoutEffect(() => () => scope.close(), [scope]);

  function resetForms() {
    setRecipeName(''); setRecipeIngredients(emptyIngredientRows()); setRecipeNote(''); setManualName(''); setManualAmount('');
  }

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
    const channel = subscribeHouseholdChanges(client, household.id, change => {
      if (change.table === 'household_members') void checkMembership();
      reload();
    });
    function reload() {
      const isCurrent = scope.beginRead();
      loadWeek(household!.id, weekStart).then(next => {
        if (!isCurrent()) return;
        setData(next); setDataScope(scope); setLoaded(true); setError('');
      }).catch(e => { if (isCurrent()) setError(errorText(e)); });
    }
    // Someone joined or left. If it was us (removed by the owner), move to another household.
    async function checkMembership() {
      try {
        const houses = await listMyHouseholds();
        if (!scope.active() || houses.some(h => h.id === household!.id)) return;
        const next = houses[0] ?? null;
        if (next) await AsyncStorage.setItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`, next.id);
        else await AsyncStorage.removeItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`);
        if (!scope.active()) return;
        setHousehold(next);
        setNotice(`Ya no formas parte de ${household!.name}.`);
      } catch { /* The next reload reports connection problems. */ }
    }
    return () => { void client.removeChannel(channel); };
  }, [household, weekStart, userEmail, scope]);

  useEffect(() => {
    if (!loaded || dataScope !== scope || !scope.active() || (cloudEnabled && !household)) return;
    const key = household ? `menu-pareja:account:${userEmail}:${household.id}:${weekStart}` : `menu-pareja:local:${weekStart}`;
    void saveLocal(key, data);
    if (!household && !cloudEnabled) void saveLocal('menu-pareja:local:recipes', data.recipes);
  }, [data, household, weekStart, userEmail, loaded, dataScope, scope]);

  const shopping = useMemo(() => aggregateShopping(data.meals, data.checks, data.manualItems).map(item => ({ ...item, checked: checkOverlay?.owner === scope ? checkOverlay.values[item.key] ?? item.checked : item.checked })), [data.meals, data.checks, data.manualItems, checkOverlay, scope]);
  const doneCount = shopping.filter(item => item.checked).length;
  const isCheckPending = (key: string) => checkOverlay?.owner === scope && key in checkOverlay.values;

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

  // Recuperar la contraseña con el código que llega por correo.
  async function requestReset(email: string): Promise<boolean> {
    if (!supabase || authBusy) return false;
    setAuthBusy(true); setAuthError(''); setAuthNotice('');
    try {
      await requestPasswordReset(email);
      setAuthNotice('Si hay una cuenta con ese correo, te hemos enviado un código. Revisa también Spam.');
      return true;
    } catch (e) { setAuthError(authErrorText(e)); return false; }
    finally { setAuthBusy(false); }
  }

  async function confirmReset(email: string, code: string, password: string) {
    if (!supabase || authBusy) return;
    setAuthBusy(true); setAuthError(''); setAuthNotice('');
    try {
      await resetPasswordWithCode(email, code, password);
    } catch (e) {
      // A valid code signs in before the new password is saved; never leave that half-done session open.
      if ((await supabase.auth.getSession()).data.session) await supabase.auth.signOut({ scope: 'local' });
      setAuthError(authErrorText(e));
    } finally { setAuthBusy(false); }
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
      resetForms();
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
    const checkWrites = checkWritesFor(scope);
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
    const item = buildManualItem(manualName, manualAmount, makeId());
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
      await clearAccountState(result.error ? `Sesión cerrada en este móvil. No se pudo confirmar la desconexión con el servidor: ${errorText(result.error)}` : '', '');
    } catch (e) { setLogoutError(`No se pudo cerrar la sesión. ${errorText(e)}`); }
    finally { setLogoutBusy(false); }
  }

  // After signing out or deleting the account: reset memory and this account's on-device cache.
  async function clearAccountState(warning: string, notice: string) {
    scope.close();
    setUserEmail(null); setHousehold(null); setData(emptyWeek()); setDataScope(null);
    setAccountModal(false); setJoinModal(false); setInviteCode(''); setMealTarget(null); setRecipeModal(false); setManualModal(false);
    resetForms();
    setNotice(''); setError(''); setAuthError(warning); setAuthNotice(notice); setBusy(false);
    setWeekStart(getMonday(new Date()));
    // Remove only this account's on-device cache, never remote/shared data.
    try {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys.filter(key => key.startsWith(`menu-pareja:account:${userEmail}:`) || key === `${ACTIVE_HOUSEHOLD}:${userEmail}`));
    } catch { setAuthNotice(`${notice ? `${notice} ` : 'Sesión cerrada. '}No se pudo limpiar la copia local; sigue aislada de otras cuentas.`); }
  }

  // Irreversible. Shared households stay for the other members (see delete_my_account in Supabase).
  async function deleteAccount() {
    if (!supabase) return;
    await deleteMyAccount();
    await supabase.auth.signOut({ scope: 'local' });
    await clearAccountState('', 'Tu cuenta y tus datos se han borrado. Las casas compartidas siguen para las demás personas.');
  }

  // Gestión de la casa. Lanzan el error para que la pantalla lo muestre junto al botón.
  // Returns the household now shown (null → the create/join screen).
  async function leaveCurrentHousehold(): Promise<Household | null> {
    if (!household) return null;
    const left = household;
    await leaveHousehold(left.id);
    let next: Household | null = null;
    try {
      next = (await listMyHouseholds())[0] ?? null;
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys.filter(key => key.startsWith(`menu-pareja:account:${userEmail}:${left.id}:`)));
      if (next) await AsyncStorage.setItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`, next.id);
      else await AsyncStorage.removeItem(`${ACTIVE_HOUSEHOLD}:${userEmail}`);
    } catch { /* Already left: without the list, show the create/join screen. */ }
    setHousehold(next);
    setNotice(`Has salido de ${left.name}.`);
    return next;
  }

  async function rotateInviteCode() {
    if (!household) return;
    const target = household.id;
    const code = await regenerateInviteCode(target);
    setHousehold(current => current?.id === target ? { ...current, inviteCode: code } : current);
  }

  async function removeMember(userId: string) {
    if (!household) return;
    const target = household.id;
    const code = await removeHouseholdMember(target, userId);
    setHousehold(current => current?.id === target ? { ...current, inviteCode: code } : current);
  }

  return {
    // Sesión y casa
    localMode: !cloudEnabled, sessionReady, userEmail, household,
    authBusy, authError, authNotice, doAuth, requestReset, confirmReset, makeHouse, enterHouse, signOut, logoutBusy, logoutError, setLogoutError,
    deleteAccount, changePassword, leaveCurrentHousehold, rotateInviteCode, removeMember,
    // Semana y datos
    weekStart, setWeekStart, data, loaded, dataCurrent: dataScope === scope,
    busy, error, setError, notice, setNotice,
    // Menú y recetas
    mealTarget, setMealTarget, planRecipe, deleteMeal,
    recipeModal, setRecipeModal, editingRecipeId, openRecipe, saveRecipe,
    recipeName, setRecipeName, recipeIngredients, setRecipeIngredients, recipeNote, setRecipeNote,
    // Compra
    shopping, doneCount, isCheckPending, toggleCheck,
    manualModal, setManualModal, manualName, setManualName, manualAmount, setManualAmount, addManualShopping, deleteManual,
    // Menú de cuenta
    accountModal, setAccountModal, joinModal, setJoinModal, inviteCode, setInviteCode,
  };
}

export type AppState = ReturnType<typeof useAppStateValue>;
const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: React.PropsWithChildren) {
  const value = useAppStateValue();
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState debe usarse dentro de AppStateProvider');
  return value;
}
