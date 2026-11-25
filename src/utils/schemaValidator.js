// Petit vérificateur JSON Schema : seulement les règles utilisées par data/ui.schema.json (PROTOTYPE).

/**
 * Donne le type JSON d'une valeur.
 * @param {any} value valeur
 * @returns {string} type
 */
function getJsonType(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

/**
 * Vérifie une valeur.
 * @param {any} value valeur
 * @param {object} rootSchema schéma complet
 * @returns {Array<{path: string, message: string}>} problèmes
 */
export function validateWithSchema(value, rootSchema) {
  return validateValue(value, rootSchema, '', rootSchema);
}

/**
 * Vérifie une valeur avec une partie du schéma.
 * @param {any} value valeur
 * @param {object} schema partie du schéma
 * @param {string} path chemin lisible
 * @param {object} rootSchema schéma complet
 * @returns {Array<{path: string, message: string}>} problèmes
 */
function validateValue(value, schema, path, rootSchema) {
  const problems = [];
  const addProblem = (message) => problems.push({ path: path || 'fichier', message });
  const check = (childValue, childSchema, childPath = path) => validateValue(childValue, childSchema, childPath, rootSchema);
  if (schema.$ref) problems.push(...check(value, rootSchema.$defs[schema.$ref.replace('#/$defs/', '')]));
  const jsonType = getJsonType(value);
  if (schema.type && ![schema.type].flat().includes(jsonType)) { addProblem(`type « ${jsonType} », attendu « ${[schema.type].flat().join(' ou ')} »`); return problems; }
  if ('const' in schema && value !== schema.const) addProblem(`valeur attendue : ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) addProblem(`valeur « ${value} » inconnue`);
  if (schema.pattern && jsonType === 'string' && !new RegExp(schema.pattern, 'u').test(value)) addProblem(`« ${value} » n'a pas la bonne forme`);
  if (typeof schema.minimum === 'number' && value < schema.minimum) addProblem(`${value} est sous ${schema.minimum}`);
  if (typeof schema.maximum === 'number' && value > schema.maximum) addProblem(`${value} dépasse ${schema.maximum}`);
  if (jsonType === 'array') {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) addProblem(`nombre d'éléments incorrect (${value.length})`);
    if (schema.items) value.forEach((item, index) => problems.push(...check(item, schema.items, `${path}[${item?.id ?? index}]`)));
  }
  if (jsonType === 'object') {
    for (const requiredKey of schema.required ?? []) if (!(requiredKey in value)) addProblem(`champ « ${requiredKey} » manquant`);
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (schema.propertyNames) problems.push(...check(key, schema.propertyNames, childPath));
      const childSchema = schema.properties?.[key] ?? schema.additionalProperties;
      if (childSchema && childValue !== undefined) problems.push(...check(childValue, childSchema, childPath));
    }
  }
  for (const partSchema of schema.allOf ?? []) problems.push(...check(value, partSchema));
  if (schema.if && check(value, schema.if).length === 0 && schema.then) problems.push(...check(value, schema.then));
  if (schema.anyOf && !schema.anyOf.some((choice) => check(value, choice).length === 0)) addProblem('aucune des formes permises');
  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter((choice) => check(value, choice).length === 0).length;
    if (matchCount !== 1) addProblem(matchCount === 0 ? 'aucune des formes permises' : 'plusieurs formes à la fois');
  }
  return problems;
}
