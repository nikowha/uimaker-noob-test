// Modules : agencements réutilisables de widgets, d'areas et d'autres modules (PROTOTYPE).
// À ne pas confondre avec un « custom widget » (widget codé), qui n'existe pas encore dans l'app.
import { buildNodeIndex, cloneJson, cloneSubtreeWithNewIds, collectSubtreeNodeIds, createId, remapIds } from './document.js';

export const MODULE_LIBRARY_FORMAT = 'uimaker-noob-modules';
export const MODULE_LIBRARY_FORMAT_VERSION = '0.1';
const COLOR_KEYS = new Set(['background', 'textColor', 'borderColor']);

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
  uiDocument.modules[moduleId] = { name: node.name || 'Module', kind, libraryId: crypto.randomUUID(), version: 1, notes: '', root: moduleRoot };
  return moduleId;
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

/**
 * Applique les réglages propres d'une instance au contenu du module.
 * @param {object} moduleRoot racine du module
 * @param {object} overrides { idInterne: { content } }
 * @returns {object} copie
 */
export function applyModuleOverrides(moduleRoot, overrides) {
  const rootCopy = cloneJson(moduleRoot);
  const visitNode = (node) => {
    const nodeOverride = overrides?.[node.id];
    if (nodeOverride?.content) node.content = { ...node.content, ...nodeOverride.content };
    for (const childNode of [...(node.children ?? []), ...(node.widgets ?? [])]) visitNode(childNode);
  };
  visitNode(rootCopy);
  return rootCopy;
}

/**
 * Détache une instance (widget ou area) : elle devient une copie modifiable du module.
 * @param {object} uiDocument document
 * @param {string} instanceId instance
 * @returns {string|null} ID de l'élément détaché
 */
export function detachModuleInstance(uiDocument, instanceId) {
  const record = buildNodeIndex(uiDocument).get(instanceId);
  const instance = record?.node;
  const module = instance ? uiDocument.modules[instance.moduleId] : null;
  if (!module) return null;
  const detachedNode = cloneSubtreeWithNewIds(uiDocument, applyModuleOverrides(module.root, instance.overrides));
  detachedNode.name = instance.name;
  if (record.kind === 'area') {
    delete instance.moduleId;
    delete instance.overrides;
    const { id: unusedId, notes: unusedNotes, events: moduleEvents, ...detachedValues } = detachedNode;
    Object.assign(instance, detachedValues);
    if (!instance.events?.length && moduleEvents) instance.events = moduleEvents;
    return instance.id;
  }
  for (const key of ['size', 'placement', 'state', 'action']) if (instance[key]) detachedNode[key] = cloneJson(instance[key]);
  if (instance.events?.length) detachedNode.events = cloneJson(instance.events);
  record.siblings[record.siblings.indexOf(instance)] = detachedNode;
  return detachedNode.id;
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
    if (value.moduleId === moduleId) instanceCount += 1;
    Object.values(value).forEach(visitValue);
  };
  visitValue(uiDocument.screens);
  visitValue(uiDocument.modules);
  return instanceCount;
}

/** @returns {{styles: Set, colorVariables: Set, menus: Set, modules: Set}} relevé de références vide */
function createReferenceSets() {
  return { styles: new Set(), colorVariables: new Set(), menus: new Set(), modules: new Set() };
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
    else if (key === 'moduleId') references.modules.add(childValue);
    else if (COLOR_KEYS.has(key) && childValue.startsWith('$')) references.colorVariables.add(childValue.slice(1));
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
  for (const moduleId of includesSubmodules ? references.modules : new Set(moduleIds)) collectReferences(source.modules[moduleId]?.root, references);
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
    neutralizeExternalLinks(packagedModule.root, moduleNodeIds);
  }
  for (const menu of Object.values(menus)) neutralizeExternalLinks(menu, allInsideIds);
  const colorVariables = pickEntries(uiDocument.colorVariables, references.colorVariables);
  for (const colorVariable of Object.values(colorVariables)) {
    colorVariable.values = Object.fromEntries(Object.entries(colorVariable.values).map(([themeId, color]) => [uiDocument.themes[themeId]?.name ?? themeId, color]));
  }
  return { libraryId: module.libraryId, version: module.version ?? 1, name: module.name, kind: module.kind, category: '', tags: [],
    updatedAt: new Date().toISOString(),
    package: { rootModuleId: moduleId, modules, menus, colorVariables, styles: pickEntries(uiDocument.styles, references.styles) } };
}

/**
 * Installe un module de la bibliothèque dans le projet (avec ses sous-modules). Un module déjà présent est réutilisé.
 * Une variable de couleur de même nom reprend celle du projet.
 * @param {object} uiDocument document
 * @param {object} entry entrée de bibliothèque
 * @returns {string} ID du module dans le projet
 */
export function installLibraryEntry(uiDocument, entry) {
  const packageData = cloneJson(entry.package);
  const idMapping = new Map();
  const newModuleIds = [];
  for (const [packageModuleId, packagedModule] of Object.entries(packageData.modules)) {
    const existingModule = Object.entries(uiDocument.modules).find(([, candidate]) => candidate.libraryId === packagedModule.libraryId);
    if (existingModule) { idMapping.set(packageModuleId, existingModule[0]); continue; }
    newModuleIds.push(packageModuleId);
    idMapping.set(packageModuleId, createId(uiDocument, 'G'));
    for (const nodeId of collectSubtreeNodeIds(packagedModule.root)) idMapping.set(nodeId, createId(uiDocument, nodeId.startsWith('A') ? 'A' : 'W'));
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
    if (packageModuleId === packageData.rootModuleId) module.name = entry.name;
    uiDocument.modules[idMapping.get(packageModuleId)] = module;
  }
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
  collectReferences(modules[moduleId]?.root, references);
  return [...references.modules].some((childId) => hasModuleCycle(modules, childId, [...ancestorIds, moduleId]));
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
    for (const collectionName of ['styles', 'colorVariables', 'menus']) packageData[collectionName] ??= {};
    return { ...entry, name: String(entry.name ?? rootModule.name), kind: rootModule.kind, category: String(entry.category ?? ''),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [], version: Number(entry.version) || 1 };
  });
}
