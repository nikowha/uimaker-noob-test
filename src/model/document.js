// Document UImaker_noob : données du projet au format « spec UI » + opérations (PROTOTYPE).
// Le document en mémoire suit directement le format décrit dans UISPEC_GUIDE.md.
import { SCREEN_PRESETS, WIDGET_TYPES } from './catalog.js';

export const UISPEC_FORMAT = 'uimaker-noob-uispec';
export const UISPEC_FORMAT_VERSION = '0.3';
export const GENERATOR_NAME = 'UImaker_noob prototype 0.1';

const ID_PATTERN = /^([A-Z])(\d+)$/;

/**
 * Crée un nouvel ID court jamais utilisé pour un préfixe (S, A, W, C, T, V, H).
 * @param {object} uiDocument document
 * @param {string} prefix lettre du type
 * @returns {string} nouvel ID
 */
export function createId(uiDocument, prefix) {
  const idCounters = uiDocument.project.idCounters ??= {};
  idCounters[prefix] = (idCounters[prefix] ?? 0) + 1;
  return `${prefix}${idCounters[prefix]}`;
}

/**
 * Remet les compteurs d'ID au-dessus du plus grand ID trouvé (après un import).
 * @param {object} uiDocument document
 */
export function recomputeIdCounters(uiDocument) {
  const idCounters = uiDocument.project.idCounters ??= {};
  const registerId = (candidateId) => {
    const match = typeof candidateId === 'string' ? ID_PATTERN.exec(candidateId) : null;
    if (match) idCounters[match[1]] = Math.max(idCounters[match[1]] ?? 0, Number(match[2]));
  };
  const visitValue = (value) => {
    if (Array.isArray(value)) { value.forEach(visitValue); return; }
    if (value && typeof value === 'object') {
      registerId(value.id);
      Object.values(value).forEach(visitValue);
    }
  };
  for (const collectionName of ['themes', 'colorVariables', 'styles', 'modules', 'menus', 'variables']) {
    Object.keys(uiDocument[collectionName] ?? {}).forEach(registerId);
  }
  visitValue(uiDocument.screens);
  visitValue(uiDocument.modules);
}

/**
 * Copie profonde d'une valeur JSON.
 * @param {any} value valeur à copier
 * @returns {any} copie
 */
export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Crée une area feuille (qui contient des widgets).
 * @param {object} uiDocument document
 * @param {string} name nom anglais
 * @returns {object} area
 */
export function createLeafArea(uiDocument, name = 'Area') {
  return {
    id: createId(uiDocument, 'A'), name,
    sizing: { mode: 'fill' },
    widgetLayout: { mode: 'free', direction: 'vertical', gap: 8, padding: [8, 8, 8, 8], alignMain: 'start', alignCross: 'stretch' },
    widgets: [],
  };
}

/**
 * Crée un écran à partir d'un préréglage.
 * @param {object} uiDocument document
 * @param {string} presetKey clé du préréglage (SCREEN_PRESETS)
 * @returns {object} écran
 */
export function createScreen(uiDocument, presetKey) {
  const preset = SCREEN_PRESETS.find((candidate) => candidate.key === presetKey) ?? SCREEN_PRESETS[0];
  const screenId = createId(uiDocument, 'S');
  return {
    id: screenId, name: `Screen${screenId.slice(1)}`,
    platform: preset.platform, preset: preset.key,
    orientation: preset.portrait ? 'portrait' : 'landscape',
    size: { width: preset.width, height: preset.height },
    safeArea: cloneJson(preset.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 }),
    notes: '',
    root: createLeafArea(uiDocument, 'Root'),
  };
}

/**
 * Crée un widget d'un type du catalogue.
 * @param {object} uiDocument document
 * @param {string} widgetType type (clé de WIDGET_TYPES)
 * @returns {object} widget
 */
export function createWidget(uiDocument, widgetType) {
  const typeDefinition = WIDGET_TYPES[widgetType];
  const widget = { id: createId(uiDocument, 'W'), type: widgetType, ...cloneJson(typeDefinition.defaults) };
  if (typeDefinition.isContainer) widget.children = [];
  if (widgetType === 'pageStack') widget.children = [createPage(uiDocument, 'Page1'), createPage(uiDocument, 'Page2')];
  widget.notes = '';
  return widget;
}

/**
 * Crée une page (conteneur qui remplit sa pile de pages).
 * @param {object} uiDocument document
 * @param {string} pageName nom anglais de la page
 * @returns {object} conteneur
 */
export function createPage(uiDocument, pageName) {
  const page = createWidget(uiDocument, 'container');
  Object.assign(page, { name: pageName, size: { width: 'fill', height: 'fill' }, styleOverrides: { borderWidth: 0 } });
  return page;
}

/**
 * Crée un projet complètement vide : un écran vide, un seul thème, aucune variable, aucun style, aucun widget.
 * @returns {object} document
 */
export function createEmptyDocument() {
  const uiDocument = {
    format: UISPEC_FORMAT, formatVersion: UISPEC_FORMAT_VERSION, generator: GENERATOR_NAME,
    project: { name: 'MyApp', notes: '', defaultTheme: 'H1', idCounters: {},
      defaults: { areaSizing: { mode: 'fill' }, resizableSplitter: false } },
    themes: {}, colorVariables: {}, styles: {}, icons: {}, modules: {}, menus: {}, variables: {}, screens: [],
  };
  const themeId = createId(uiDocument, 'H');
  uiDocument.themes[themeId] = { name: 'Default' };
  uiDocument.project.defaultTheme = themeId;
  const screen = createScreen(uiDocument, '16:9-small');
  screen.name = 'MainScreen';
  uiDocument.screens.push(screen);
  return uiDocument;
}

const MODULE_SCREEN_MARGIN = 24;
const MODULE_SCREEN_SIZES = { area: { width: 480, height: 320 }, widget: { width: 360, height: 220 } };

/**
 * Fabrique l'écran provisoire où un module s'édite (il n'est pas enregistré dans le projet).
 * Un module de widgets est posé dans une area provisoire qui porte l'ID du module.
 * @param {object} uiDocument document
 * @param {string} moduleId module
 * @returns {object} écran
 */
export function createModuleScreen(uiDocument, moduleId) {
  const module = uiDocument.modules[moduleId];
  const kind = module.kind === 'area' ? 'area' : 'widget';
  const fitSize = (dimension) => (kind === 'widget' && typeof module.root.size?.[dimension] === 'number' ? module.root.size[dimension] + MODULE_SCREEN_MARGIN * 2 : 0);
  const size = module.previewSize ?? { width: Math.max(MODULE_SCREEN_SIZES[kind].width, fitSize('width')), height: Math.max(MODULE_SCREEN_SIZES[kind].height, fitSize('height')) };
  const root = kind === 'area' ? module.root : { id: moduleId, name: module.name,
    widgetLayout: { mode: 'stack', direction: 'vertical', alignCross: 'start', padding: Array(4).fill(MODULE_SCREEN_MARGIN) }, widgets: [module.root] };
  return { id: moduleId, name: module.name, platform: 'module', size, root };
}

/**
 * Construit l'index de tous les nœuds (écrans, modules, areas, widgets) : ID → { node, kind, parent, siblings, screen }.
 * @param {object} uiDocument document
 * @returns {Map<string, object>} index
 */
export function buildNodeIndex(uiDocument) {
  const nodeIndex = new Map();
  const indexWidget = (widget, parent, siblings, screen) => {
    nodeIndex.set(widget.id, { node: widget, kind: 'widget', parent, siblings, screen });
    for (const childWidget of widget.children ?? []) indexWidget(childWidget, widget, widget.children, screen);
  };
  const indexArea = (area, parent, siblings, screen, rootOwner = screen) => {
    nodeIndex.set(area.id, { node: area, kind: 'area', parent, siblings, screen, rootOwner });
    for (const childArea of area.children ?? []) indexArea(childArea, area, area.children, screen, rootOwner);
    for (const widget of area.widgets ?? []) indexWidget(widget, area, area.widgets, screen);
  };
  // Contenu des modules d'abord : en cas d'ID en double dans un fichier importé, l'écran garde la priorité.
  for (const [moduleId, module] of Object.entries(uiDocument.modules ?? {})) {
    if (!module.root) continue;
    const moduleScreen = createModuleScreen(uiDocument, moduleId);
    nodeIndex.set(moduleId, { node: module, kind: 'module', parent: null, siblings: null, screen: moduleScreen, rootOwner: module });
    if (module.kind === 'area') indexArea(module.root, null, null, moduleScreen, module);
    else indexWidget(module.root, moduleScreen.root, null, moduleScreen);
  }
  for (const screen of uiDocument.screens) {
    nodeIndex.set(screen.id, { node: screen, kind: 'screen', parent: null, siblings: uiDocument.screens, screen });
    indexArea(screen.root, null, null, screen);
  }
  return nodeIndex;
}

/**
 * Calcule le chemin d'un nœud (« S1 > A1 > A3 > W7 »).
 * @param {Map<string, object>} nodeIndex index des nœuds
 * @param {string} nodeId ID du nœud
 * @returns {string} chemin
 */
export function computeNodePath(nodeIndex, nodeId) {
  const pathIds = [];
  let currentRecord = nodeIndex.get(nodeId);
  while (currentRecord) {
    if (currentRecord.node.id) pathIds.unshift(currentRecord.node.id);
    currentRecord = currentRecord.parent ? nodeIndex.get(currentRecord.parent.id) : null;
  }
  const screenRecord = nodeIndex.get(nodeId);
  if (screenRecord && pathIds[0] !== screenRecord.screen.id) pathIds.unshift(screenRecord.screen.id);
  return pathIds.join(' > ');
}

/**
 * Indique si un nœud peut recevoir des widgets (area feuille ou widget conteneur).
 * @param {object} node area ou widget
 * @returns {boolean} vrai si c'est une cible de dépôt
 */
export function isWidgetHolder(node) {
  return Array.isArray(node.widgets) || (Array.isArray(node.children) && Boolean(node.type));
}

/**
 * Renvoie la liste des widgets d'un nœud qui en contient (area feuille → widgets, conteneur → children).
 * @param {object} holderNode area feuille ou widget conteneur
 * @returns {object[]} liste modifiable
 */
export function getHeldWidgets(holderNode) {
  return holderNode.type ? holderNode.children : holderNode.widgets;
}

/**
 * Remplace un nœud par un autre dans la liste de son parent (ou à la racine d'un écran).
 * @param {object} record entrée d'index du nœud remplacé
 * @param {object} replacementNode nouveau nœud
 */
function replaceAreaInParent(record, replacementNode) {
  if (record.siblings) {
    record.siblings[record.siblings.indexOf(record.node)] = replacementNode;
  } else {
    record.rootOwner.root = replacementNode;
  }
}

/**
 * Découpe une area en deux (façon Blender). Si le parent est déjà découpé dans le même sens,
 * la nouvelle area est ajoutée à côté ; sinon l'area est enveloppée dans une nouvelle area découpée.
 * @param {object} uiDocument document
 * @param {string} areaId area à découper
 * @param {'horizontal'|'vertical'} splitDirection sens du découpage
 * @returns {string|null} ID de la nouvelle area
 */
export function splitArea(uiDocument, areaId, splitDirection) {
  const nodeIndex = buildNodeIndex(uiDocument);
  const record = nodeIndex.get(areaId);
  if (!record || record.kind !== 'area') return null;
  const area = record.node;
  if (area.split && area.split === splitDirection) {
    const addedArea = createLeafArea(uiDocument);
    area.children.push(addedArea);
    return addedArea.id;
  }
  const addedArea = createLeafArea(uiDocument);
  if (record.parent && record.parent.split === splitDirection) {
    record.siblings.splice(record.siblings.indexOf(area) + 1, 0, addedArea);
    return addedArea.id;
  }
  const wrapperArea = { id: createId(uiDocument, 'A'), name: 'Split', sizing: area.sizing ?? { mode: 'fill' },
    split: splitDirection, children: [area, addedArea] };
  if (area.resizableSplitter !== undefined) wrapperArea.resizableSplitter = area.resizableSplitter;
  area.sizing = { mode: 'fill' };
  replaceAreaInParent(record, wrapperArea);
  return addedArea.id;
}

/**
 * Supprime une area. Si le parent n'a plus qu'un enfant, cet enfant prend sa place.
 * @param {object} uiDocument document
 * @param {string} areaId area à supprimer
 * @returns {boolean} faux si l'area est la racine d'un écran
 */
export function deleteArea(uiDocument, areaId) {
  const nodeIndex = buildNodeIndex(uiDocument);
  const record = nodeIndex.get(areaId);
  if (!record || record.kind !== 'area' || !record.parent) return false;
  record.siblings.splice(record.siblings.indexOf(record.node), 1);
  const parentArea = record.parent;
  if (parentArea.children.length === 1) {
    const remainingArea = parentArea.children[0];
    remainingArea.sizing = parentArea.sizing ?? { mode: 'fill' };
    replaceAreaInParent(nodeIndex.get(parentArea.id), remainingArea);
  }
  return true;
}

/**
 * Transforme une area découpée vide en feuille, ou l'inverse n'est pas permis : sert à vider une area.
 * @param {object} area area à rendre feuille
 */
export function ensureLeafArea(area) {
  if (!area.split && !area.moduleId) {
    area.widgets ??= [];
    area.widgetLayout ??= { mode: 'free', direction: 'vertical', gap: 8, padding: [8, 8, 8, 8], alignMain: 'start', alignCross: 'stretch' };
  }
}

/**
 * Liste les ID d'une area ou d'un widget et de tout son contenu.
 * @param {object} node area ou widget
 * @returns {string[]} ID
 */
export function collectSubtreeNodeIds(node) {
  return [node.id, ...[...(node.children ?? []), ...(node.widgets ?? [])].flatMap(collectSubtreeNodeIds)];
}

const REFERENCE_KEYS = new Set(['id', 'target', 'controlsPageStack', 'menuId', 'style', 'moduleId', 'itemModuleId', 'variableId', 'countVariableId']);
const COLOR_REFERENCE_KEYS = new Set(['background', 'textColor', 'borderColor', 'checkedColor', 'alternateColor']);

/**
 * Copie une valeur en remplaçant les ID et toutes les références vers ces ID (liens internes compris).
 * @param {any} value valeur
 * @param {Map<string, string>} idMapping ancien ID → nouvel ID
 * @returns {any} copie
 */
export function remapIds(value, idMapping) {
  if (Array.isArray(value)) return value.map((item) => remapIds(item, idMapping));
  if (!value || typeof value !== 'object') return value;
  const getNewId = (oldId) => idMapping.get(oldId) ?? oldId;
  return Object.fromEntries(Object.entries(value).map(([key, childValue]) => {
    if (typeof childValue === 'string') {
      if (REFERENCE_KEYS.has(key)) return [key, getNewId(childValue)];
      if (COLOR_REFERENCE_KEYS.has(key) && childValue.startsWith('$')) return [key, `$${getNewId(childValue.slice(1))}`];
      return [key, childValue];
    }
    if (key === 'activeStates' && Array.isArray(childValue)) return [key, childValue.map(getNewId)];
    if (key === 'overrides' && childValue) {
      return [key, Object.fromEntries(Object.entries(childValue).map(([nodeId, nodeOverride]) => [getNewId(nodeId), remapIds(nodeOverride, idMapping)]))];
    }
    return [key, remapIds(childValue, idMapping)];
  }));
}

/**
 * Copie un widget ou une area avec de nouveaux ID. Les liens internes (pile de pages, actions) suivent la copie ;
 * un menu utilisé qui vise un élément copié est copié aussi.
 * @param {object} uiDocument document
 * @param {object} node widget ou area
 * @param {string} [rootId] ID à donner à la racine de la copie (nouveau par défaut)
 * @returns {object} copie
 */
export function cloneSubtreeWithNewIds(uiDocument, node, rootId) {
  const idMapping = new Map(rootId ? [[node.id, rootId]] : []);
  for (const nodeId of collectSubtreeNodeIds(node)) if (!idMapping.has(nodeId)) idMapping.set(nodeId, createId(uiDocument, nodeId.startsWith('A') ? 'A' : 'W'));
  const nodeText = JSON.stringify(node);
  const copiedMenus = Object.entries(uiDocument.menus ?? {}).filter(([menuId, menu]) => {
    const menuText = JSON.stringify(menu);
    return nodeText.includes(`"menuId":"${menuId}"`) && [...idMapping.keys()].some((nodeId) => menuText.includes(`"target":"${nodeId}"`));
  });
  for (const [menuId] of copiedMenus) idMapping.set(menuId, createId(uiDocument, 'M'));
  for (const [menuId, menu] of copiedMenus) uiDocument.menus[idMapping.get(menuId)] = remapIds(menu, idMapping);
  const copy = remapIds(node, idMapping);
  removeModuleNodeKeys(copy);
  return copy;
}

/**
 * Retire les clés de suivi des modules : une copie n'est pas le même élément que l'original.
 * @param {object} node widget ou area, modifié sur place
 */
function removeModuleNodeKeys(node) {
  delete node.moduleNodeKey;
  for (const childNode of [...(node.children ?? []), ...(node.widgets ?? [])]) removeModuleNodeKeys(childNode);
}

/**
 * Ajoute un widget dans une area feuille ou un conteneur, à un index donné.
 * @param {object} uiDocument document
 * @param {string} holderId ID de l'area ou du conteneur
 * @param {object} widget widget à ajouter
 * @param {number} [insertIndex] position (fin par défaut)
 * @returns {boolean} vrai si ajouté
 */
export function insertWidget(uiDocument, holderId, widget, insertIndex) {
  const holderRecord = buildNodeIndex(uiDocument).get(holderId);
  if (!holderRecord || !isWidgetHolder(holderRecord.node)) return false;
  const heldWidgets = getHeldWidgets(holderRecord.node);
  const safeIndex = insertIndex === undefined ? heldWidgets.length : Math.max(0, Math.min(insertIndex, heldWidgets.length));
  heldWidgets.splice(safeIndex, 0, widget);
  return true;
}

/**
 * Retire un widget de son parent.
 * @param {object} uiDocument document
 * @param {string} widgetId widget à retirer
 * @returns {object|null} le widget retiré
 */
export function removeWidget(uiDocument, widgetId) {
  const record = buildNodeIndex(uiDocument).get(widgetId);
  if (!record || record.kind !== 'widget' || !record.siblings) return null;
  record.siblings.splice(record.siblings.indexOf(record.node), 1);
  return record.node;
}

/**
 * Indique si un nœud est (ou contient) un autre nœud — évite de déposer un conteneur dans lui-même.
 * @param {object} ancestorNode nœud parent supposé
 * @param {string} descendantId ID cherché
 * @returns {boolean} vrai si descendantId est dans ancestorNode
 */
export function containsNode(ancestorNode, descendantId) {
  if (ancestorNode.id === descendantId) return true;
  return (ancestorNode.children ?? []).some((childNode) => containsNode(childNode, descendantId))
    || (ancestorNode.widgets ?? []).some((childNode) => containsNode(childNode, descendantId));
}

/**
 * Supprime un style et retire ses références.
 * @param {object} uiDocument document
 * @param {string} styleId style à supprimer
 */
export function deleteStyle(uiDocument, styleId) {
  delete uiDocument.styles[styleId];
  for (const record of buildNodeIndex(uiDocument).values()) {
    if (record.node.style === styleId) delete record.node.style;
  }
}

/**
 * Compte les éléments qui utilisent un style.
 * @param {object} uiDocument document
 * @param {string} styleId style
 * @returns {number} nombre d'utilisateurs
 */
export function countStyleUsers(uiDocument, styleId) {
  let userCount = 0;
  for (const record of buildNodeIndex(uiDocument).values()) if (record.node.style === styleId) userCount += 1;
  return userCount;
}

/**
 * Convertit les anciens « widgets perso » (components) en modules. Leurs ID ne changent pas.
 * @param {object} uiDocument document importé
 */
function migrateComponentsToModules(uiDocument) {
  uiDocument.modules ??= {};
  for (const [componentId, component] of Object.entries(uiDocument.components ?? {})) {
    uiDocument.modules[componentId] ??= { ...component, kind: 'widget', libraryId: crypto.randomUUID(), version: 1 };
  }
  delete uiDocument.components;
  for (const module of Object.values(uiDocument.modules)) {
    module.kind ??= module.root?.type ? 'widget' : 'area';
    module.libraryId ??= crypto.randomUUID();
    module.version ??= 1;
  }
  const visitValue = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'componentInstance') {
      value.type = 'moduleInstance';
      value.moduleId = value.componentId;
      delete value.componentId;
    }
    Object.values(value).forEach(visitValue);
  };
  visitValue(uiDocument.screens);
  visitValue(uiDocument.modules);
}

/**
 * Vérifie et complète un document importé.
 * @param {any} importedValue contenu JSON lu
 * @returns {object} document prêt à l'emploi
 * @throws {Error} si le fichier n'est pas une spec UI
 */
export function normalizeImportedDocument(importedValue) {
  if (!importedValue || importedValue.format !== UISPEC_FORMAT) throw new Error(`Champ "format" attendu : "${UISPEC_FORMAT}"`);
  if (!Array.isArray(importedValue.screens) || importedValue.screens.length === 0) throw new Error('Aucun écran ("screens") dans le fichier');
  const uiDocument = cloneJson(importedValue);
  uiDocument.formatVersion = UISPEC_FORMAT_VERSION;
  uiDocument.project ??= { name: 'ImportedApp' };
  uiDocument.project.defaults ??= { areaSizing: { mode: 'fill' }, resizableSplitter: false };
  for (const collectionName of ['themes', 'colorVariables', 'styles', 'icons', 'menus', 'variables']) uiDocument[collectionName] ??= {};
  migrateComponentsToModules(uiDocument);
  if (Object.keys(uiDocument.themes).length === 0) uiDocument.themes.H1 = { name: 'Default' };
  if (!uiDocument.themes[uiDocument.project.defaultTheme]) uiDocument.project.defaultTheme = Object.keys(uiDocument.themes)[0];
  for (const record of buildNodeIndex(uiDocument).values()) {
    delete record.node.path;
    delete record.node.frame;
    if (record.kind === 'area') ensureLeafArea(record.node);
  }
  recomputeIdCounters(uiDocument);
  return uiDocument;
}
