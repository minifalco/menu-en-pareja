export type MealSlot = 'comida' | 'cena';

export interface Ingredient {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface PlannedMeal {
  id: string;
  recipeId?: string;
  title: string;
  day: string;
  slot: MealSlot;
  ingredients: Ingredient[];
}

export interface ManualShoppingItem extends Ingredient {
  id: string;
  checked?: boolean;
}

export interface ShoppingItem extends Ingredient {
  key: string;
  checked: boolean;
  manual: boolean;
  manualIds: string[];
  sources: string[];
}
