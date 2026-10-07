import type { Ingredient, ManualShoppingItem, PlannedMeal, ShoppingItem } from './types';

const clean = (value: string | undefined): string => (value ?? '').trim();

export function shoppingKey(name: string, unit?: string): string {
  const normalizedName = clean(name).toLocaleLowerCase('es').normalize('NFC');
  const normalizedUnit = clean(unit).toLocaleLowerCase('es').normalize('NFC');
  return `${normalizedName}|${normalizedUnit}`;
}

export function aggregateShopping(
  meals: PlannedMeal[],
  checks: Record<string, boolean>,
  manualItems: ManualShoppingItem[],
): ShoppingItem[] {
  const result = new Map<string, ShoppingItem>();
  const add = (ingredient: Ingredient, source?: string, manualId?: string) => {
    const name = clean(ingredient.name);
    if (!name) return;
    const unit = clean(ingredient.unit);
    const key = shoppingKey(name, unit);
    const current = result.get(key);
    if (current) {
      if (ingredient.quantity !== undefined) {
        current.quantity = (current.quantity ?? 0) + ingredient.quantity;
      }
      if (source && !current.sources.includes(source)) current.sources.push(source);
      if (manualId && !current.manualIds.includes(manualId)) current.manualIds.push(manualId);
      if (manualId && checks[key] === undefined && Boolean((ingredient as ManualShoppingItem).checked)) current.checked = true;
      current.manual ||= Boolean(manualId);
      return;
    }
    result.set(key, {
      key,
      name,
      ...(ingredient.quantity !== undefined ? { quantity: ingredient.quantity } : {}),
      ...(unit ? { unit } : {}),
      checked: checks[key] ?? (manualId ? Boolean((ingredient as ManualShoppingItem).checked) : false),
      manual: Boolean(manualId),
      manualIds: manualId ? [manualId] : [],
      sources: source ? [source] : [],
    });
  };

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) add(ingredient, meal.title);
  }
  for (const item of manualItems) add(item, undefined, item.id);

  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
