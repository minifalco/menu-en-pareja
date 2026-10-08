import type { Ingredient } from './types';

export function parseIngredients(input: string): Ingredient[] {
  return input.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(.+?)\s*(?:—|–|-|,)\s*(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/u);
    if (!match) return { name: line };
    const name = match[1].trim();
    const quantity = Number(match[2].replace(',', '.'));
    const unit = match[3]?.trim();
    return { name, quantity, ...(unit ? { unit } : {}) };
  });
}

// Texto editable de una fila de ingrediente: «Arroz — 200 g».
export function ingredientText(ingredient: Ingredient): string {
  return ingredient.quantity === undefined
    ? ingredient.name
    : `${ingredient.name} — ${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}`;
}

export function formatIngredient(ingredient: Ingredient): string {
  const amount = ingredient.quantity === undefined
    ? ''
    : `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ''} `;
  return `${amount}${ingredient.name}`;
}
