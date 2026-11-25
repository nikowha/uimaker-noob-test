// Variables de test : nombres, textes et oui / non auxquels l'UI se relie pour être essayée (PROTOTYPE).

export const VARIABLE_KINDS = [{ value: 'number', label: 'Nombre' }, { value: 'boolean', label: 'Oui / non' }, { value: 'text', label: 'Texte' }];
export const VARIABLE_OPERATIONS = [{ value: 'set', label: 'mettre à' }, { value: 'add', label: 'ajouter' }, { value: 'toggle', label: 'inverser (oui / non)' }];
const DEFAULT_VALUES = { number: 4, boolean: false, text: 'Text' };
const INTERPOLATED_KEYS = ['text', 'label', 'value'];

/**
 * Crée une variable.
 * @param {string} name nom (celui de la donnée dans l'app)
 * @param {'number'|'boolean'|'text'} [kind] type
 * @param {object} [otherValues] value, min, max, description
 * @returns {object} variable
 */
export function createVariable(name, kind = 'number', otherValues = {}) {
  return { name, kind, value: DEFAULT_VALUES[kind], ...(kind === 'number' ? { min: 0, max: 64 } : {}), description: '', ...otherValues };
}

/**
 * Convertit une valeur au type de la variable, dans ses limites.
 * @param {object} variable variable
 * @param {any} rawValue valeur voulue
 * @returns {number|boolean|string} valeur valide
 */
export function convertVariableValue(variable, rawValue) {
  if (variable.kind === 'boolean') return rawValue === true || rawValue === 'true';
  if (variable.kind === 'text') return String(rawValue ?? '');
  let numberValue = Number(rawValue);
  if (!Number.isFinite(numberValue)) numberValue = Number(variable.value) || 0;
  if (typeof variable.max === 'number') numberValue = Math.min(variable.max, numberValue);
  return typeof variable.min === 'number' ? Math.max(variable.min, numberValue) : numberValue;
}

/**
 * Change le type d'une variable (valeur par défaut du nouveau type).
 * @param {object} variable variable, modifiée sur place
 * @param {'number'|'boolean'|'text'} kind type
 */
export function setVariableKind(variable, kind) {
  variable.kind = kind;
  variable.value = DEFAULT_VALUES[kind];
  delete variable.min;
  delete variable.max;
  if (kind === 'number') Object.assign(variable, { min: 0, max: 64 });
}

/**
 * Calcule la valeur après une action « changer une variable ».
 * @param {object} variable variable
 * @param {object} action { operation, amount }
 * @param {Record<string, any>} [sourceContent] réglages du custom widget qui lance l'action
 * @returns {number|boolean|string} nouvelle valeur
 */
export function computeVariableChange(variable, action, sourceContent = {}) {
  if (action.operation === 'toggle') return variable.kind === 'boolean' ? !variable.value : variable.value;
  if (action.operation === 'add' && variable.kind === 'number') return convertVariableValue(variable, variable.value + (Number(readAmount(action.amount, sourceContent)) || 0));
  return convertVariableValue(variable, readAmount(action.amount, sourceContent));
}

/**
 * Remplace {nom.de.variable} par sa valeur dans les textes d'un widget.
 * @param {object} uiDocument document
 * @param {object} widget widget
 * @returns {object} widget (copie si un texte change)
 */
export function interpolateWidget(uiDocument, widget) {
  const variables = Object.values(uiDocument.variables ?? {});
  if (!widget.content || variables.length === 0) return widget;
  const changedContent = {};
  for (const key of INTERPOLATED_KEYS) {
    const sourceText = widget.content[key];
    if (typeof sourceText !== 'string' || !sourceText.includes('{')) continue;
    changedContent[key] = sourceText.replace(/\{([^{}]+)\}/g, (wholeText, name) => {
      const variable = variables.find((candidate) => candidate.name === name.trim());
      return variable ? String(variable.value) : wholeText;
    });
  }
  return Object.keys(changedContent).length ? { ...widget, content: { ...widget.content, ...changedContent } } : widget;
}

/**
 * Compte les liens vers une variable (répétitions, états, actions, textes).
 * @param {object} uiDocument document
 * @param {string} variableId variable
 * @returns {number} nombre de liens
 */
export function countVariableUsers(uiDocument, variableId) {
  const { name } = uiDocument.variables[variableId];
  let userCount = 0;
  const visitValue = (value) => {
    if (typeof value === 'string') { if (value.includes(`{${name}}`)) userCount += 1; return; }
    if (!value || typeof value !== 'object') return;
    if (value.variableId === variableId || value.countVariableId === variableId) userCount += 1;
    Object.values(value).forEach(visitValue);
  };
  visitValue([uiDocument.screens, uiDocument.modules, uiDocument.menus]);
  return userCount;
}

/**
 * Lit la valeur d'une action ; « {réglage} » = réglage du custom widget qui lance l'action.
 * @param {any} amount valeur de l'action
 * @param {Record<string, any>} sourceContent réglages du widget
 * @returns {any} valeur
 */
function readAmount(amount, sourceContent) {
  const paramKey = typeof amount === 'string' ? /^\{(\w+)\}$/.exec(amount.trim())?.[1] : null;
  return paramKey && Object.hasOwn(sourceContent, paramKey) ? sourceContent[paramKey] : amount;
}
