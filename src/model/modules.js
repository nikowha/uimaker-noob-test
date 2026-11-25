// Modules : agencements réutilisables de widgets, d'areas et d'autres modules (PROTOTYPE).
// À ne pas confondre avec un « custom widget » (widget codé) : voir customWidgets.js.
import { buildNodeIndex, cloneJson, cloneSubtreeWithNewIds, collectSubtreeNodeIds, createId, remapIds } from './document.js';
import { checkCustomWidget, installCustomWidget } from './customWidgets.js';

export const MODULE_LIBRARY_FORMAT = 'uimaker-noob-modules';
export const MODULE_LIBRARY_FORMAT_VERSION = '0.1';
const COLOR_REFERENCE_PATTERN = /^\$V\d+$/;

/**
 * Enregistre un widget ou une area (avec son contenu) comme module du projet. L'original ne change pas.
 * @param {object} uiDocument document
 * @param {object} node widget ou area
 * @returns {string} ID du module (G…)
 */
export function saveNodeAsModule(uiDocument, node) {
  const moduleId = createId(uiDocument, 'G');
  const moduleRoot = cloneSubtreeWithNewIds(uiDocument, node);
  const kind = node.type ? 'widget' : 'area';
  const removedKeys = kind === 'area' ? ['placement', 'sizing', 'resizableSplitter'] : ['placement'];
  for (const removedKey of removedKeys) delete moduleRoot[removedKey];
  uiDocument.modules[moduleId] = { name: node.name || 'Module', kind, libraryId: crypto.randomUUID(), version: 1, libraryUpdatedAt: new Date().toISOString(), notes: '', root: moduleRoot };
  ensureModuleNodeKeys(moduleRoot);
  return moduleId;
}

/**
 * Liste les éléments directement contenus dans un nœud.
 * @param {object} node area ou widget
 * @returns {object[]} enfants
 */
function getChildNodes(node) {
  return [...(node.children ?? []), ...(node.widgets ?? [])];
}

/**
 * Donne à chaque élément d'un module une clé stable, pour le reconnaître d'un projet à l'autre (les ID changent).
 * @param {object} moduleRoot racine, modifiée sur place
 */
function ensureModuleNodeKeys(moduleRoot) {
  const usedKeys = new Set();
  const visitNode = (node) => {
    if (!node.moduleNodeKey || usedKeys.has(node.moduleNodeKey)) node.moduleNodeKey = crypto.randomUUID();
    usedKeys.add(node.moduleNodeKey);
    getChildNodes(node).forEach(visitNode);
  };
  visitNode(moduleRoot);
}

/**
 * Relie les éléments de deux versions d'un module : par clé, sinon par position et type (anciens modules sans clé).
 * @param {object} packageRoot version de la bibliothèque
 * @param {object} projectRoot version du projet
 * @returns {Map<string, string>} ID bibliothèque → ID projet
 */
function matchModuleNodeIds(packageRoot, projectRoot) {
  const projectIdsByKey = new Map();
  const visitNode = (node, position, onNode) => {
    onNode(node, `${position}:${node.type ?? 'area'}`);
    getChildNodes(node).forEach((childNode, childIndex) => visitNode(childNode, `${position}/${childIndex}`, onNode));
  };
  visitNode(projectRoot, '', (node, positionKey) => projectIdsByKey.set(node.moduleNodeKey ?? positionKey, node.id));
  const idMapping = new Map([[packageRoot.id, projectRoot.id]]);
  const usedIds = new Set([projectRoot.id]);
  visitNode(packageRoot, '', (node, positionKey) => {
    const projectId = projectIdsByKey.get(node.moduleNodeKey) ?? projectIdsByKey.get(positionKey);
    if (idMapping.has(node.id) || !projectId || usedIds.has(projectId)) return;
    idMapping.set(node.id, projectId);
    usedIds.add(projectId);
  });
  return idMapping;
}

/**
 * Crée une instance d'un module de widgets.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @returns {object} widget de type moduleInstance
 */
export function createModuleInstance(uiDocument, moduleId) {
  const module = uiDocument.modules[moduleId];
  return { id: createId(uiDocument, 'W'), name: module.name, type: 'moduleInstance', moduleId, overrides: {},
    size: cloneJson(module.root.size ?? { width: 'hug', height: 'hug' }), notes: '' };
}

/**
 * Transforme une area feuille vide en instance d'un module d'area.
 * @param {object} area area vide
 * @param {string} moduleId module
 * @returns {boolean} faux si l'area n'est pas une feuille vide
 */
export function placeAreaModule(area, moduleId) {
  if (area.split || area.moduleId || (area.widgets ?? []).length > 0) return false;
  delete area.widgets;
  delete area.widgetLayout;
  area.moduleId = moduleId;
  return true;
}

const MERGED_OVERRIDE_KEYS = ['content', 'state', 'styleOverrides'];
const REPLACED_OVERRIDE_KEYS = ['style', 'action', 'events', 'activeStates'];

/**
 * Fusionne des valeurs ; null efface une valeur.
 * @param {object|undefined} baseValues valeurs de départ
 * @param {object} changedValues changements
 * @returns {object} résultat
 */
function mergeValues(baseValues, changedValues) {
  return Object.fromEntries(Object.entries({ ...baseValues, ...changedValues }).filter(([, value]) => value !== null));
}

/**
 * Applique des réglages d'instance à un élément (sans son contenu). Pour un module imbriqué, les réglages passent à l'instance.
 * @param {object} node élément, modifié sur place
 * @param {object|undefined} nodeOverride réglages
 */
function applyNodeOverride(node, nodeOverride) {
  if (!nodeOverride) return;
  for (const key of MERGED_OVERRIDE_KEYS) if (nodeOverride[key]) node[key] = mergeValues(node[key], nodeOverride[key]);
  for (const key of REPLACED_OVERRIDE_KEYS) {
    if (nodeOverride[key] === null) delete node[key];
    else if (nodeOverride[key] !== undefined) node[key] = cloneJson(nodeOverride[key]);
  }
  if (nodeOverride.overrides) node.overrides = mergeOverrides(node.overrides, nodeOverride.overrides);
}

/**
 * Fusionne deux jeux de réglages d'instance (le second l'emporte).
 * @param {object|undefined} baseOverrides réglages définis dans le module
 * @param {object} outerOverrides réglages de l'instance qui l'entoure
 * @returns {object} réglages
 */
function mergeOverrides(baseOverrides, outerOverrides) {
  const merged = cloneJson(baseOverrides ?? {});
  for (const [nodeId, outerOverride] of Object.entries(outerOverrides)) {
    const nodeOverride = merged[nodeId] ??= {};
    for (const key of MERGED_OVERRIDE_KEYS) if (outerOverride[key]) nodeOverride[key] = { ...nodeOverride[key], ...cloneJson(outerOverride[key]) };
    for (const key of REPLACED_OVERRIDE_KEYS) if (outerOverride[key] !== undefined) nodeOverride[key] = cloneJson(outerOverride[key]);
    if (outerOverride.overrides) nodeOverride.overrides = mergeOverrides(nodeOverride.overrides, outerOverride.overrides);
  }
  return merged;
}

/**
 * Applique les réglages propres d'une instance au contenu du module.
 * @param {object} moduleRoot racine du module
 * @param {object} overrides { idInterne: { content, state, styleOverrides, style, action, events, overrides } }
 * @returns {object} copie
 */
export function applyModuleOverrides(moduleRoot, overrides) {
  const rootCopy = cloneJson(moduleRoot);
  const visitNode = (node) => {
    applyNodeOverride(node, overrides?.[node.id]);
    getChildNodes(node).forEach(visitNode);
  };
  visitNode(rootCopy);
  return rootCopy;
}

/**
 * Ajoute un état à un module.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @param {string} name nom anglais
 * @param {object} [stateValues] description, variableId, overrides
 * @returns {string} ID de l'état (E…)
 */
export function addModuleState(uiDocument, moduleId, name, stateValues = {}) {
  const state = { id: createId(uiDocument, 'E'), stateKey: crypto.randomUUID(), name, description: '', overrides: {}, ...stateValues };
  (uiDocument.modules[moduleId].states ??= []).push(state);
  return state.id;
}

/**
 * Supprime un état et le retire de toutes les instances.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @param {string} stateId état
 */
export function deleteModuleState(uiDocument, moduleId, stateId) {
  const module = uiDocument.modules[moduleId];
  module.states = (module.states ?? []).filter((state) => state.id !== stateId);
  const visitValue = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.activeStates)) {
      value.activeStates = value.activeStates.filter((activeId) => activeId !== stateId);
      if (value.activeStates.length === 0) delete value.activeStates;
    }
    Object.values(value).forEach(visitValue);
  };
  visitValue(uiDocument.screens);
  visitValue(uiDocument.modules);
}

/**
 * Réunit les changements des états actifs (choisis, ou reliés à une variable « oui »), dans l'ordre du module.
 * @param {object} uiDocument document
 * @param {object} module module
 * @param {string[]} [activeStates] états choisis
 * @returns {object} réglages
 */
export function collectStateOverrides(uiDocument, module, activeStates = []) {
  return (module.states ?? []).reduce((merged, state) => {
    const isActive = activeStates.includes(state.id) || uiDocument.variables?.[state.variableId]?.value === true;
    return isActive ? mergeOverrides(merged, state.overrides ?? {}) : merged;
  }, {});
}

/**
 * Contenu réel d'une instance : module + états actifs + réglages + ce que l'instance décide (taille, place, état, action).
 * @param {object} uiDocument document
 * @param {object} instance widget ou area qui utilise le module
 * @returns {object} racine (avec les ID du module)
 */
export function resolveInstanceRoot(uiDocument, instance) {
  const module = uiDocument.modules[instance.moduleId];
  const root = applyModuleOverrides(module.root, mergeOverrides(collectStateOverrides(uiDocument, module, instance.activeStates), instance.overrides ?? {}));
  const instanceKeys = module.kind === 'area' ? ['sizing', 'resizableSplitter'] : ['placement'];
  for (const key of instanceKeys) {
    if (instance[key] === undefined) delete root[key]; else root[key] = cloneJson(instance[key]);
  }
  root.name = instance.name;
  if (instance.size) root.size = cloneJson(instance.size);
  if (instance.state) root.state = { ...root.state, ...instance.state };
  if (instance.action && instance.action.type !== 'none') root.action = cloneJson(instance.action);
  if (instance.events?.length) root.events = [...cloneJson(instance.events), ...(root.events ?? [])];
  return root;
}

/**
 * Remplace une instance par son contenu, sur place. Son ID ne change pas : les liens vers elle restent bons.
 * @param {object} uiDocument document
 * @param {object} instance widget ou area
 */
function replaceInstanceByContent(uiDocument, instance) {
  const detachedNode = cloneSubtreeWithNewIds(uiDocument, resolveInstanceRoot(uiDocument, instance), instance.id);
  if (instance.notes) detachedNode.notes = instance.notes;
  for (const key of Object.keys(instance)) delete instance[key];
  Object.assign(instance, detachedNode);
}

/**
 * Détache une instance (widget ou area) : elle devient une copie modifiable du module.
 * @param {object} uiDocument document
 * @param {string} instanceId instance
 * @returns {string|null} ID de l'élément détaché
 */
export function detachModuleInstance(uiDocument, instanceId) {
  const instance = buildNodeIndex(uiDocument).get(instanceId)?.node;
  if (!uiDocument.modules[instance?.moduleId]) return null;
  replaceInstanceByContent(uiDocument, instance);
  return instanceId;
}

const REPEAT_DRAW_LIMIT = 64;

/**
 * Nombre d'éléments dessinés : la variable reliée (dans les limites min / max), sinon le nombre d'exemple.
 * @param {object} uiDocument document
 * @param {object} repeatWidget répétition
 * @returns {number} nombre
 */
export function getRepeatCount(uiDocument, repeatWidget) {
  const { previewCount = 0, countVariableId, minCount = 0, maxCount = 0 } = repeatWidget.content ?? {};
  const variable = uiDocument.variables?.[countVariableId];
  let itemCount = variable?.kind === 'number' ? Math.max(minCount, variable.value) : previewCount;
  if (variable && maxCount > 0) itemCount = Math.min(maxCount, itemCount);
  return Math.max(0, Math.min(REPEAT_DRAW_LIMIT, Math.round(itemCount)));
}

/**
 * Contenu dessiné d'une répétition : un conteneur avec le nombre d'exemple d'instances du module répété.
 * @param {object} uiDocument document
 * @param {object} repeatWidget widget de type repeat
 * @param {(itemIndex: number) => string} createItemId donne l'ID de chaque élément
 * @returns {object|null} conteneur, null si le module n'existe pas ou n'est pas un module de widgets
 */
export function buildRepeatContainer(uiDocument, repeatWidget, createItemId) {
  const content = repeatWidget.content ?? {};
  const module = uiDocument.modules[content.itemModuleId];
  if (module?.kind !== 'widget') return null;
  const { direction = 'horizontal', distribution = 'share', itemSize = 40, itemMinSize = 0, crossSize = 'fill', alternateColor, gap = 0 } = content;
  const [mainKey, crossKey] = direction === 'vertical' ? ['height', 'width'] : ['width', 'height'];
  const isFixed = distribution === 'fixed' || distribution === 'wrap';
  const crossValue = distribution === 'wrap' || crossSize !== 'fill' ? module.root.size?.[crossKey] ?? 'hug' : 'fill';
  const size = { [mainKey]: isFixed ? itemSize : 'fill', [crossKey]: distribution === 'wrap' && crossValue === 'fill' ? itemSize : crossValue };
  if (!isFixed && itemMinSize > 0) size[mainKey === 'width' ? 'minWidth' : 'minHeight'] = itemMinSize;
  const itemCount = getRepeatCount(uiDocument, repeatWidget);
  const children = Array.from({ length: itemCount }, (unusedItem, itemIndex) => {
    const isAlternate = alternateColor && Math.floor(itemIndex / Math.max(1, content.alternateEvery ?? 1)) % 2 === 1;
    const alternateOverrides = isAlternate ? { [module.root.id]: { styleOverrides: { background: alternateColor } } } : {};
    return { id: createItemId(itemIndex), name: `${module.name}${itemIndex + 1}`, type: 'moduleInstance', moduleId: content.itemModuleId, size: { ...size }, activeStates: content.itemOverrides?.[itemIndex]?.activeStates,
      overrides: mergeOverrides(alternateOverrides, content.itemOverrides?.[itemIndex]?.overrides ?? {}) };
  });
  return { ...repeatWidget, type: 'container', content: {}, styleOverrides: { borderWidth: 0, radius: 0, ...repeatWidget.styleOverrides }, children,
    widgetLayout: { mode: 'stack', direction, gap, padding: [0, 0, 0, 0], alignMain: 'start', alignCross: crossValue === 'fill' ? 'stretch' : 'start',
      scroll: distribution === 'wrap' || !(isFixed || itemMinSize > 0) ? 'none' : 'auto', wrap: distribution === 'wrap' } };
}

/**
 * Remplace toutes les instances des écrans par leur contenu (mode test, sur une copie du document).
 * @param {object} uiDocument copie du document
 */
export function expandAllModuleInstances(uiDocument) {
  const moduleMenuIds = new Set();
  for (const module of Object.values(uiDocument.modules)) {
    const references = createReferenceSets();
    collectReferences([module.root, module.states], references);
    references.menus.forEach((menuId) => moduleMenuIds.add(menuId));
  }
  const expandNode = (node, parentModuleIds) => {
    let insideModuleIds = parentModuleIds;
    while (node.moduleId && uiDocument.modules[node.moduleId] && !insideModuleIds.includes(node.moduleId)) {
      insideModuleIds = [...insideModuleIds, node.moduleId];
      replaceInstanceByContent(uiDocument, node);
    }
    if (node.type === 'repeat' && !insideModuleIds.includes(node.content?.itemModuleId)) {
      const repeatContainer = buildRepeatContainer(uiDocument, node, () => createId(uiDocument, 'W'));
      if (repeatContainer) Object.assign(node, repeatContainer);
    }
    getChildNodes(node).forEach((childNode) => expandNode(childNode, insideModuleIds));
  };
  for (const screen of uiDocument.screens) expandNode(screen.root, []);
  uiDocument.modules = {};
  deleteUnusedMenus(uiDocument, moduleMenuIds);
}

/**
 * Supprime des menus si plus rien ne les utilise.
 * @param {object} uiDocument document
 * @param {Iterable<string>} menuIds menus à vérifier
 */
function deleteUnusedMenus(uiDocument, menuIds) {
  for (const menuId of menuIds) {
    const { [menuId]: checkedMenu, ...otherMenus } = uiDocument.menus;
    const usersText = JSON.stringify([uiDocument.screens, uiDocument.modules, otherMenus]);
    if (checkedMenu && !usersText.includes(`"menuId":"${menuId}"`)) delete uiDocument.menus[menuId];
  }
}

/**
 * Liste les éléments internes d'une instance, modules imbriqués compris.
 * @param {object} uiDocument document
 * @param {object} instance widget ou area
 * @returns {Array<{path: string[], node: object, baseNode: object, depth: number, isChanged: boolean}>} éléments :
 *   path = instances imbriquées à traverser, node = valeurs affichées, baseNode = valeurs du module
 */
export function listInstanceNodes(uiDocument, instance) {
  const entries = [];
  const visitModule = (moduleId, overrides, baseOverrides, ownOverrides, path, depth, parentModuleIds) => {
    const module = uiDocument.modules[moduleId];
    if (!module || parentModuleIds.includes(moduleId)) return;
    const visitPair = (node, baseNode, nodeDepth) => {
      const ownOverride = ownOverrides?.[node.id];
      entries.push({ path, node, baseNode, depth: nodeDepth, isChanged: [...MERGED_OVERRIDE_KEYS, ...REPLACED_OVERRIDE_KEYS].some((key) => ownOverride?.[key] !== undefined) });
      const innerModule = uiDocument.modules[node.moduleId];
      const withStates = (innerNode) => mergeOverrides(collectStateOverrides(uiDocument, innerModule, innerNode.activeStates), innerNode.overrides ?? {});
      if (innerModule) visitModule(node.moduleId, withStates(node), withStates(baseNode), ownOverride?.overrides, [...path, node.id], nodeDepth + 1, [...parentModuleIds, moduleId]);
      const baseChildren = getChildNodes(baseNode);
      getChildNodes(node).forEach((childNode, childIndex) => visitPair(childNode, baseChildren[childIndex], nodeDepth + 1));
    };
    visitPair(applyModuleOverrides(module.root, overrides), applyModuleOverrides(module.root, baseOverrides), depth);
  };
  const module = uiDocument.modules[instance.moduleId];
  const stateOverrides = module ? collectStateOverrides(uiDocument, module, instance.activeStates) : {};
  visitModule(instance.moduleId, mergeOverrides(stateOverrides, instance.overrides ?? {}), stateOverrides, instance.overrides, [], 0, []);
  return entries;
}

/**
 * Compare deux jeux de valeurs.
 * @param {object} [baseValues] valeurs du module
 * @param {object} [newValues] valeurs voulues
 * @returns {object|undefined} changements (null = valeur effacée), undefined s'il n'y en a pas
 */
function diffValues(baseValues = {}, newValues = {}) {
  const changes = {};
  for (const key of new Set([...Object.keys(baseValues), ...Object.keys(newValues)])) {
    if (JSON.stringify(baseValues[key]) !== JSON.stringify(newValues[key])) changes[key] = newValues[key] ?? null;
  }
  return Object.keys(changes).length ? changes : undefined;
}

/**
 * Enregistre les réglages d'un élément interne pour une instance (seulement ce qui diffère du module).
 * @param {object} instance instance, modifiée sur place
 * @param {{path: string[], baseNode: object}} entry élément (listInstanceNodes)
 * @param {object|null} newNode valeurs voulues, null pour revenir au module
 */
export function setInstanceNodeValues(instance, entry, newNode) {
  let overrides = instance.overrides ??= {};
  for (const nestedInstanceId of entry.path) overrides = (overrides[nestedInstanceId] ??= {}).overrides ??= {};
  const { baseNode } = entry;
  const nodeOverride = {};
  if (newNode) {
    for (const key of MERGED_OVERRIDE_KEYS) {
      const changes = diffValues(baseNode[key], newNode[key]);
      if (changes) nodeOverride[key] = changes;
    }
    for (const key of REPLACED_OVERRIDE_KEYS) {
      if (JSON.stringify(baseNode[key]) !== JSON.stringify(newNode[key])) nodeOverride[key] = newNode[key] ?? null;
    }
  }
  const nestedOverrides = overrides[baseNode.id]?.overrides;
  if (nestedOverrides) nodeOverride.overrides = nestedOverrides;
  overrides[baseNode.id] = nodeOverride;
  removeEmptyOverrides(instance.overrides);
}

/**
 * Retire les réglages vides.
 * @param {object} overrides réglages, modifiés sur place
 */
function removeEmptyOverrides(overrides) {
  for (const [nodeId, nodeOverride] of Object.entries(overrides)) {
    if (nodeOverride.overrides) {
      removeEmptyOverrides(nodeOverride.overrides);
      if (Object.keys(nodeOverride.overrides).length === 0) delete nodeOverride.overrides;
    }
    if (Object.keys(nodeOverride).length === 0) delete overrides[nodeId];
  }
}

/**
 * Compte les instances d'un module (écrans et autres modules).
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @returns {number} nombre d'instances
 */
export function countModuleInstances(uiDocument, moduleId) {
  let instanceCount = 0;
  const visitValue = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.moduleId === moduleId || value.itemModuleId === moduleId) instanceCount += 1;
    Object.values(value).forEach(visitValue);
  };
  visitValue(uiDocument.screens);
  visitValue(uiDocument.modules);
  return instanceCount;
}

/** @returns {{styles: Set, colorVariables: Set, menus: Set, modules: Set}} relevé de références vide */
function createReferenceSets() {
  return { styles: new Set(), colorVariables: new Set(), menus: new Set(), modules: new Set(), variables: new Set(), customWidgets: new Set() };
}

/**
 * Relève les références (styles, variables, menus, modules) d'une valeur.
 * @param {any} value valeur
 * @param {object} references reçoit les références
 */
function collectReferences(value, references) {
  if (!value || typeof value !== 'object') return;
  for (const [key, childValue] of Object.entries(value)) {
    if (typeof childValue !== 'string') { collectReferences(childValue, references); continue; }
    if (!childValue) continue;
    if (key === 'style') references.styles.add(childValue);
    else if (key === 'menuId') references.menus.add(childValue);
    else if (key === 'variableId' || key === 'countVariableId') references.variables.add(childValue);
    else if (key === 'moduleId' || key === 'itemModuleId') references.modules.add(childValue);
    else if (key === 'customWidgetId') references.customWidgets.add(childValue);
    else if (COLOR_REFERENCE_PATTERN.test(childValue)) references.colorVariables.add(childValue.slice(1));
  }
}

/**
 * Relève tout ce que des modules utilisent, de proche en proche.
 * @param {object} source collections { modules, styles, colorVariables, menus }
 * @param {string[]} moduleIds modules de départ
 * @param {boolean} includesSubmodules vrai pour suivre aussi les sous-modules
 * @returns {object} références
 */
function collectModuleDependencies(source, moduleIds, includesSubmodules) {
  const references = createReferenceSets();
  for (const moduleId of moduleIds) references.modules.add(moduleId);
  // Un Set parcouru par for…of visite aussi les éléments ajoutés pendant le parcours.
  for (const moduleId of includesSubmodules ? references.modules : new Set(moduleIds)) collectReferences([source.modules[moduleId]?.root, source.modules[moduleId]?.states], references);
  for (const menuId of references.menus) collectReferences(source.menus[menuId], references);
  for (const styleId of references.styles) collectReferences(source.styles[styleId], references);
  return references;
}

/**
 * Neutralise les liens vers l'extérieur du module (écran ou widget du projet d'origine).
 * @param {any} value valeur modifiée sur place
 * @param {Set<string>} insideIds ID qui existent dans le module
 */
function neutralizeExternalLinks(value, insideIds) {
  if (!value || typeof value !== 'object') return;
  for (const [key, childValue] of Object.entries(value)) {
    if (key === 'controlsPageStack' && childValue && !insideIds.has(childValue)) delete value[key];
    else if (key === 'action' && childValue?.target && !insideIds.has(childValue.target)) {
      value[key] = { type: 'custom', description: `À relier dans ce projet : ${childValue.type} (cible d'origine ${childValue.target})` };
    } else neutralizeExternalLinks(childValue, insideIds);
  }
}

/**
 * Fabrique l'entrée de bibliothèque d'un module, avec tout ce qu'il utilise.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @returns {object} entrée { libraryId, version, name, kind, category, tags, updatedAt, package }
 */
export function buildLibraryEntry(uiDocument, moduleId) {
  const module = uiDocument.modules[moduleId];
  const references = collectModuleDependencies(uiDocument, [moduleId], true);
  const pickEntries = (collection, ids) => Object.fromEntries([...ids].filter((id) => collection[id]).map((id) => [id, cloneJson(collection[id])]));
  const modules = pickEntries(uiDocument.modules, references.modules);
  const menus = pickEntries(uiDocument.menus, references.menus);
  const allInsideIds = new Set();
  for (const packagedModule of Object.values(modules)) {
    const moduleNodeIds = new Set(collectSubtreeNodeIds(packagedModule.root));
    moduleNodeIds.forEach((nodeId) => allInsideIds.add(nodeId));
    neutralizeExternalLinks([packagedModule.root, packagedModule.states], moduleNodeIds);
  }
  for (const menu of Object.values(menus)) neutralizeExternalLinks(menu, allInsideIds);
  const colorVariables = pickEntries(uiDocument.colorVariables, references.colorVariables);
  for (const colorVariable of Object.values(colorVariables)) {
    colorVariable.values = Object.fromEntries(Object.entries(colorVariable.values).map(([themeId, color]) => [uiDocument.themes[themeId]?.name ?? themeId, color]));
  }
  for (const packagedModule of Object.values(modules)) delete packagedModule.hasLocalChanges;
  return { libraryId: module.libraryId, version: module.version ?? 1, name: module.name, kind: module.kind, category: '', tags: [],
    updatedAt: module.libraryUpdatedAt ?? new Date().toISOString(),
    package: { rootModuleId: moduleId, modules, menus, colorVariables, styles: pickEntries(uiDocument.styles, references.styles),
      variables: pickEntries(uiDocument.variables ?? {}, references.variables), customWidgets: pickEntries(uiDocument.customWidgets ?? {}, references.customWidgets) } };
}

/**
 * Installe un module de la bibliothèque dans le projet (avec ses sous-modules). Un module déjà présent est réutilisé,
 * ou remplacé si on demande une mise à jour : ses éléments gardent leurs ID, donc les réglages des instances restent.
 * Une variable de couleur de même nom reprend celle du projet.
 * @param {object} uiDocument document
 * @param {object} entry entrée de bibliothèque
 * @param {boolean} [shouldUpdate] vrai pour mettre à jour le module (et ses sous-modules plus anciens, sauf modifiés ici)
 * @returns {string} ID du module dans le projet
 * @throws {Error} si un module finirait par se contenir lui-même
 */
export function installLibraryEntry(uiDocument, entry, shouldUpdate = false) {
  const packageData = cloneJson(entry.package);
  const idMapping = new Map();
  const newModuleIds = [];
  const replacedMenuIds = new Set();
  for (const [packageModuleId, packagedModule] of Object.entries(packageData.modules)) {
    const existingModule = Object.entries(uiDocument.modules).find(([, candidate]) => candidate.libraryId === packagedModule.libraryId);
    idMapping.set(packageModuleId, existingModule?.[0] ?? createId(uiDocument, 'G'));
    if (existingModule) {
      const [, projectModule] = existingModule;
      matchModuleNodeIds(packagedModule.root, projectModule.root).forEach((projectId, packageId) => idMapping.set(packageId, projectId));
      for (const state of packagedModule.states ?? []) {
        const projectState = (projectModule.states ?? []).find((candidate) => candidate.stateKey === state.stateKey);
        if (projectState) idMapping.set(state.id, projectState.id);
      }
      const isRootModule = packageModuleId === packageData.rootModuleId;
      const isUpdated = shouldUpdate && (isRootModule || (packagedModule.version > projectModule.version && !projectModule.hasLocalChanges));
      if (!isUpdated) continue;
      const oldReferences = createReferenceSets();
      collectReferences([projectModule.root, projectModule.states], oldReferences);
      oldReferences.menus.forEach((menuId) => replacedMenuIds.add(menuId));
    }
    newModuleIds.push(packageModuleId);
    for (const nodeId of collectSubtreeNodeIds(packagedModule.root)) {
      if (!idMapping.has(nodeId)) idMapping.set(nodeId, createId(uiDocument, nodeId.startsWith('A') ? 'A' : 'W'));
    }
    for (const state of packagedModule.states ?? []) if (!idMapping.has(state.id)) idMapping.set(state.id, createId(uiDocument, 'E'));
  }
  const references = collectModuleDependencies(packageData, newModuleIds, false);
  for (const variableId of references.colorVariables) {
    const packagedVariable = packageData.colorVariables[variableId];
    if (!packagedVariable) continue;
    const existingVariable = Object.entries(uiDocument.colorVariables).find(([, candidate]) => candidate.name === packagedVariable.name);
    if (existingVariable) { idMapping.set(variableId, existingVariable[0]); continue; }
    const createdId = createId(uiDocument, 'V');
    const fallbackColor = Object.values(packagedVariable.values)[0] ?? '#888888';
    uiDocument.colorVariables[createdId] = { name: packagedVariable.name,
      values: Object.fromEntries(Object.entries(uiDocument.themes).map(([themeId, theme]) => [themeId, packagedVariable.values[theme.name] ?? fallbackColor])) };
    idMapping.set(variableId, createdId);
  }
  for (const customWidgetId of references.customWidgets) {
    const definition = packageData.customWidgets?.[customWidgetId];
    if (!definition) continue;
    const projectDefinition = Object.values(uiDocument.customWidgets ?? {}).find((candidate) => candidate.libraryId === definition.libraryId);
    idMapping.set(customWidgetId, installCustomWidget(uiDocument, definition, shouldUpdate && projectDefinition?.version < definition.version));
  }
  uiDocument.variables ??= {};
  for (const variableId of references.variables) {
    const packagedVariable = packageData.variables?.[variableId];
    if (!packagedVariable) continue;
    const existingVariable = Object.entries(uiDocument.variables).find(([, candidate]) => candidate.name === packagedVariable.name && candidate.kind === packagedVariable.kind);
    const projectVariableId = existingVariable?.[0] ?? createId(uiDocument, 'D');
    uiDocument.variables[projectVariableId] ??= packagedVariable;
    idMapping.set(variableId, projectVariableId);
  }
  for (const styleId of references.styles) {
    if (!packageData.styles[styleId]) continue;
    const style = remapIds(packageData.styles[styleId], idMapping);
    const existingStyle = Object.entries(uiDocument.styles).find(([, candidate]) => JSON.stringify(candidate) === JSON.stringify(style));
    const projectStyleId = existingStyle?.[0] ?? createId(uiDocument, 'T');
    if (!existingStyle) uiDocument.styles[projectStyleId] = style;
    idMapping.set(styleId, projectStyleId);
  }
  const installedMenuIds = [...references.menus].filter((menuId) => packageData.menus[menuId]);
  for (const menuId of installedMenuIds) idMapping.set(menuId, createId(uiDocument, 'M'));
  for (const menuId of installedMenuIds) uiDocument.menus[idMapping.get(menuId)] = remapIds(packageData.menus[menuId], idMapping);
  for (const packageModuleId of newModuleIds) {
    const module = remapIds(packageData.modules[packageModuleId], idMapping);
    if (packageModuleId === packageData.rootModuleId) Object.assign(module, { name: entry.name, libraryUpdatedAt: entry.updatedAt });
    uiDocument.modules[idMapping.get(packageModuleId)] = module;
  }
  deleteUnusedMenus(uiDocument, replacedMenuIds);
  assertNoModuleCycle(uiDocument);
  return idMapping.get(packageData.rootModuleId);
}

/**
 * Indique si un module finit par se contenir lui-même.
 * @param {Record<string, object>} modules modules
 * @param {string} moduleId module
 * @param {string[]} [ancestorIds] modules parents
 * @returns {boolean} vrai s'il y a une boucle
 */
function hasModuleCycle(modules, moduleId, ancestorIds = []) {
  if (ancestorIds.includes(moduleId)) return true;
  const references = createReferenceSets();
  collectReferences([modules[moduleId]?.root, modules[moduleId]?.states], references);
  return [...references.modules].some((childId) => hasModuleCycle(modules, childId, [...ancestorIds, moduleId]));
}

/**
 * Vérifie qu'aucun module ne se contient lui-même.
 * @param {object} uiDocument document
 * @throws {Error} si un module se contient
 */
export function assertNoModuleCycle(uiDocument) {
  const loopingId = Object.keys(uiDocument.modules).find((moduleId) => hasModuleCycle(uiDocument.modules, moduleId));
  if (loopingId) throw new Error(`Le module « ${uiDocument.modules[loopingId].name} » se contiendrait lui-même`);
}

/**
 * Indique si un module peut être répété dans un autre (ou dans un écran) sans boucle.
 * @param {object} uiDocument document
 * @param {string|undefined} holderId module ou écran qui contient la répétition
 * @param {string} moduleId module répété
 * @returns {boolean} vrai si possible
 */
export function canRepeatModuleIn(uiDocument, holderId, moduleId) {
  if (!moduleId || !uiDocument.modules[holderId]) return true;
  return !collectModuleDependencies(uiDocument, [moduleId], true).modules.has(holderId);
}

/**
 * Indique si la bibliothèque a une version plus récente (ou différente) d'un module du projet.
 * @param {object} module module du projet
 * @param {object|undefined} entry entrée de bibliothèque
 * @returns {boolean} vrai si une mise à jour peut être proposée
 */
export function isModuleUpdateAvailable(module, entry) {
  if (!entry) return false;
  if (entry.version !== module.version) return entry.version > module.version;
  return Boolean(module.libraryUpdatedAt) && entry.updatedAt !== module.libraryUpdatedAt;
}

/**
 * Prépare la publication d'un module : nouvelle version, avec ses sous-modules modifiés.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @param {(libraryId: string) => object|undefined} getEntry lit la bibliothèque
 * @returns {string[]} modules à envoyer dans la bibliothèque
 */
export function preparePublication(uiDocument, moduleId, getEntry) {
  const dependencies = [...collectModuleDependencies(uiDocument, [moduleId], true).modules];
  const publishedIds = dependencies.filter((candidateId) => candidateId === moduleId || uiDocument.modules[candidateId]?.hasLocalChanges);
  for (const publishedId of publishedIds) {
    const module = uiDocument.modules[publishedId];
    const libraryVersion = getEntry(module.libraryId)?.version ?? 0;
    module.version = libraryVersion === 0 ? module.version : Math.max(module.version, libraryVersion) + 1;
    module.libraryUpdatedAt = new Date().toISOString();
    delete module.hasLocalChanges;
    ensureModuleNodeKeys(module.root);
  }
  return publishedIds;
}

/**
 * Lit un fichier .uimodules.
 * @param {string} fileText contenu
 * @returns {object[]} entrées valides
 * @throws {Error} si le fichier ou un module est invalide
 */
export function parseModuleFile(fileText) {
  const fileValue = JSON.parse(fileText);
  if (fileValue?.format !== MODULE_LIBRARY_FORMAT || !Array.isArray(fileValue.modules)) throw new Error('Ce n\'est pas un fichier de modules (.uimodules)');
  return fileValue.modules.map((entry) => {
    const packageData = entry?.package;
    const rootModule = packageData?.modules?.[packageData.rootModuleId];
    const isComplete = entry?.libraryId && rootModule?.root?.id && ['widget', 'area'].includes(rootModule.kind)
      && Object.values(packageData.modules).every((module) => module.libraryId && module.root?.id);
    if (!isComplete) throw new Error(`Module incomplet : ${entry?.name ?? '?'}`);
    if (hasModuleCycle(packageData.modules, packageData.rootModuleId)) throw new Error(`Le module « ${entry.name} » se contient lui-même`);
    for (const collectionName of ['styles', 'colorVariables', 'menus', 'customWidgets']) packageData[collectionName] ??= {};
    for (const [customWidgetId, definition] of Object.entries(packageData.customWidgets)) packageData.customWidgets[customWidgetId] = checkCustomWidget(definition);
    return { ...entry, name: String(entry.name ?? rootModule.name), kind: rootModule.kind, category: String(entry.category ?? ''),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [], version: Number(entry.version) || 1 };
  });
}
