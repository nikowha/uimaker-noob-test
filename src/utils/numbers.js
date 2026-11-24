// Limites des champs numériques (PROTOTYPE).

/**
 * Ramène un nombre dans ses limites.
 * @param {number} value nombre
 * @param {{min?: number, max?: number, isInteger?: boolean}} [limits] limites (max l'emporte si elles se croisent)
 * @returns {number} nombre valide
 */
export function limitNumber(value, limits = {}) {
  let limitedValue = limits.isInteger ? Math.round(value) : value;
  if (typeof limits.min === 'number') limitedValue = Math.max(limits.min, limitedValue);
  if (typeof limits.max === 'number') limitedValue = Math.min(limits.max, limitedValue);
  return limitedValue;
}

/**
 * Empêche un champ de dépasser ses limites. Le maximum (et « pas de négatif ») s'applique pendant la frappe ;
 * un minimum positif attend la validation, sinon on ne pourrait pas taper 12 quand le minimum est 5.
 * @param {HTMLInputElement} inputElement champ numérique
 * @param {{min?: number, max?: number, isInteger?: boolean}} limits limites
 */
export function attachNumberLimits(inputElement, limits) {
  if (typeof limits.min === 'number') inputElement.min = String(limits.min);
  if (typeof limits.max === 'number') inputElement.max = String(limits.max);
  const writeLimited = (typedLimits) => {
    if (inputElement.value === '') return;
    const typedValue = Number(inputElement.value);
    const limitedValue = limitNumber(typedValue, typedLimits);
    if (limitedValue !== typedValue) inputElement.value = String(limitedValue);
  };
  inputElement.addEventListener('input', () => writeLimited({ max: limits.max, min: typeof limits.min === 'number' && limits.min <= 0 ? limits.min : undefined }));
  inputElement.addEventListener('change', () => writeLimited(limits));
}
