// Vérification d'une spec avant l'export : schéma, noms vides ou en double, références cassées (PROTOTYPE).
import { buildNodeIndex } from './document.js';
import { validateWithSchema } from '../utils/schemaValidator.js';

/** Champs qui contiennent un ID, et où le chercher. */
const REFERENCE_COLLECTIONS = { style: 'styles', moduleId: 'modules', itemModuleId: 'modules', menuId: 'menus', variableId: 'variables', countVariableId: 'variables' };
const NODE_REFERENCE_KEYS = ['target', 'controlsPageStack'];

/**
 * Cherche les références qui ne mènent nulle part.
 * @param {object} uiSpec spec
 * @param {Map<string, object>} nodeIndex index
 * @returns {string[]} problèmes
 */
function findBrokenReferences(uiSpec, nodeIndex) {
  const problems = new Set();
  const visit = (value, ownerId) => {
    if (typeof value === 'string') {
      const variableId = /^\$(V\d+)$/.exec(value)?.[1];
      if (variableId && !uiSpec.colorVariables?.[variableId]) problems.add(`${ownerId} : variable de couleur ${variableId} introuvable`);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, ownerId)); return; }
    const currentOwnerId = typeof value.id === 'string' ? value.id : ownerId;
    for (const [key, childValue] of Object.entries(value)) {
      if (typeof childValue === 'string' && childValue) {
        const collectionName = REFERENCE_COLLECTIONS[key];
        if (collectionName && !uiSpec[collectionName]?.[childValue]) problems.add(`${currentOwnerId} : ${key} = ${childValue} introuvable`);
        if (NODE_REFERENCE_KEYS.includes(key) && /^[SAWG]\d+$/.test(childValue) && !nodeIndex.has(childValue)) problems.add(`${currentOwnerId} : ${key} = ${childValue} introuvable`);
      }
      visit(childValue, currentOwnerId);
    }
  };
  for (const collectionName of ['styles', 'modules', 'menus']) for (const [entryId, entry] of Object.entries(uiSpec[collectionName] ?? {})) visit(entry, entryId);
  for (const screen of uiSpec.screens) visit(screen, screen.id);
  return [...problems];
}

/**
 * Cherche les noms vides et les noms en double (dans un même écran ou module, et entre écrans, modules, styles…).
 * @param {object} uiSpec spec
 * @param {Map<string, object>} nodeIndex index
 * @returns {string[]} problèmes
 */
function findNameProblems(uiSpec, nodeIndex) {
  const problems = [];
  const groups = new Map();
  const addName = (groupLabel, name, id) => {
    if (!name?.trim()) { problems.push(`${id} : nom vide`); return; }
    const groupKey = `${groupLabel}|${name}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { groupLabel, name, ids: [] });
    groups.get(groupKey).ids.push(id);
  };
  for (const [id, record] of nodeIndex) {
    if (record.kind === 'screen') addName('écrans', record.node.name, id);
    else if (record.kind === 'module') addName('modules', record.node.name, id);
    else addName(record.screen.id, record.node.name, id);
  }
  for (const [collectionName, label] of [['styles', 'styles'], ['colorVariables', 'variables de couleur'], ['variables', 'variables de test'], ['themes', 'thèmes'], ['menus', 'menus']]) {
    for (const [entryId, entry] of Object.entries(uiSpec[collectionName] ?? {})) addName(label, entry.name, entryId);
  }
  for (const { groupLabel, name, ids } of groups.values()) {
    if (ids.length > 1) problems.push(`Nom « ${name} » en double (${groupLabel}) : ${ids.join(', ')}`);
  }
  return problems;
}

/**
 * Vérifie une spec exportée.
 * @param {object} uiSpec spec
 * @param {object|null} schema schéma (null = non chargé)
 * @returns {{errors: string[], warnings: string[]}} erreurs de forme ou de référence, et avertissements de noms
 */
export function checkUiSpec(uiSpec, schema) {
  const nodeIndex = buildNodeIndex(uiSpec);
  const schemaProblems = schema ? validateWithSchema(uiSpec, schema).map((problem) => `${problem.path} : ${problem.message}`) : ['Schéma non chargé : forme non vérifiée'];
  return { errors: [...new Set(schemaProblems), ...findBrokenReferences(uiSpec, nodeIndex)], warnings: findNameProblems(uiSpec, nodeIndex) };
}
