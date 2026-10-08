import type { Recipe } from '../data/cloud';
import type { PlannedMeal } from './types';

// Legacy plans had no recipe ID. Only an exact, unique title within this
// household's recipe collection is safe to link; never guess among duplicates.
export function syncPlannedRecipes(meals: PlannedMeal[], recipes: Recipe[]): PlannedMeal[] {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const byTitle = new Map<string, Recipe[]>();
  for (const recipe of recipes) byTitle.set(recipe.title, [...(byTitle.get(recipe.title) ?? []), recipe]);
  return meals.map(meal => {
    const matches = byTitle.get(meal.title);
    const recipe = meal.recipeId ? byId.get(meal.recipeId) : matches?.length === 1 ? matches[0] : undefined;
    return recipe ? { ...meal, recipeId: recipe.id, title: recipe.title, ingredients: recipe.ingredients } : meal;
  });
}
