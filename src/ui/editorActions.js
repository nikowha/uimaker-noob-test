// Actions de l'éditeur partagées par le canevas, les panneaux et le clavier (PROTOTYPE).
import { appState, commitChange, notifyChange, selectNode } from '../model/store.js';
import {
  buildNodeIndex, cloneJson, cloneSubtreeWithNewIds, createWidget, deleteArea, deleteStyle,
  insertWidget, isWidgetHolder, removeWidget, splitArea,
} from '../model/document.js';
import {
  assertNoModuleCycle, buildLibraryEntry, createModuleInstance, detachModuleInstance, installLibraryEntry, isModuleUpdateAvailable, placeAreaModule,
  preparePublication, saveNodeAsModule, setInstanceNodeValues,
} from '../model/modules.js';
import { createCustomWidgetNode, installCustomWidget } from '../model/customWidgets.js';
import { getCustomWidgetEntry } from '../io/customWidgetLibrary.js';
import { getLibraryEntry, putLibraryEntry } from '../io/moduleLibrary.js';

const ICON_TARGET_TYPES = new Set(['button', 'icon']);
const FREE_DROP_DEFAULT_SIZE = { width: 240, height: 160 };
const DEFAULT_FREE_PLACEMENT = { anchor: 'topLeft', x: 24, y: 24 };

/**
 * En mode libre, « remplir » étire le widget sur toute l'area. Quand on le dépose à un point précis,
 * on remplace « remplir » par une taille fixe pour qu'il reste là où on l'a lâché.
 * @param {object} widget widget déposé en mode libre
 */
function replaceFillSizeForFreeDrop(widget) {
  widget.size ??= {};
  for (const dimension of ['width', 'height']) {
    if (widget.size[dimension] === 'fill') widget.size[dimension] = FREE_DROP_DEFAULT_SIZE[dimension];
  }
}

/**
 * Renvoie l'entrée d'index du nœud sélectionné.
 * @returns {object|null} { node, kind, parent, siblings, screen } ou null
 */
export function getSelectedRecord() {
  if (!appState.selectedId) return null;
  return buildNodeIndex(appState.uiDocument).get(appState.selectedId) ?? null;
}

/**
 * Trouve où ajouter un widget quand on ne glisse pas : la sélection si elle peut contenir des widgets,
 * sinon le parent du widget sélectionné, sinon la première area feuille de l'écran courant.
 * @returns {string|null} ID de l'area ou du conteneur
 */
export function findDefaultHolderId() {
  const nodeIndex = buildNodeIndex(appState.uiDocument);
  const selectedRecord = appState.selectedId ? nodeIndex.get(appState.selectedId) : null;
  if (selectedRecord && selectedRecord.kind !== 'screen' && isWidgetHolder(selectedRecord.node)) return selectedRecord.node.id;
  if (selectedRecord?.kind === 'widget' && selectedRecord.siblings) return selectedRecord.parent.id;
  const editedRoot = appState.uiDocument.modules[appState.editedModuleId]?.root;
  if (editedRoot && isWidgetHolder(editedRoot)) return editedRoot.id;
  for (const record of nodeIndex.values()) {
    if (record.kind === 'area' && record.screen.id === (appState.editedModuleId ?? appState.currentScreenId) && isWidgetHolder(record.node)) return record.node.id;
  }
  return null;
}

/**
 * Crée le widget correspondant à un élément de bibliothèque.
 * @param {object} uiDocument document
 * @param {{kind: string, value: string}} libraryItem widget du catalogue, module ou icône
 * @returns {object} widget
 */
function createWidgetFromLibraryItem(uiDocument, libraryItem) {
  if (libraryItem.kind === 'module') return createModuleInstance(uiDocument, libraryItem.value);
  if (libraryItem.kind === 'libraryModule') return createModuleInstance(uiDocument, installLibraryEntry(uiDocument, getLibraryEntry(libraryItem.value)));
  if (libraryItem.kind === 'customWidget') return createCustomWidgetNode(uiDocument, libraryItem.value);
  if (libraryItem.kind === 'libraryCustomWidget') return createCustomWidgetNode(uiDocument, installCustomWidget(uiDocument, getCustomWidgetEntry(libraryItem.value)));
  if (libraryItem.kind === 'icon') {
    const iconWidget = createWidget(uiDocument, 'icon');
    iconWidget.content.icon = `lucide:${libraryItem.value}`;
    iconWidget.name = `${libraryItem.value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join('')}Icon`;
    return iconWidget;
  }
  return createWidget(uiDocument, libraryItem.value);
}

/**
 * Indique si un élément de bibliothèque est un module d'area.
 * @param {{kind: string, value: string}} libraryItem élément
 * @returns {boolean} vrai pour un module d'area
 */
function isAreaModuleItem(libraryItem) {
  if (libraryItem.kind === 'module') return appState.uiDocument.modules[libraryItem.value]?.kind === 'area';
  return libraryItem.kind === 'libraryModule' && getLibraryEntry(libraryItem.value)?.kind === 'area';
}

/**
 * Trouve l'area qui contient un élément.
 * @param {object} uiDocument document
 * @param {string} nodeId area ou widget
 * @returns {object|undefined} area
 */
function findEnclosingArea(uiDocument, nodeId) {
  const nodeIndex = buildNodeIndex(uiDocument);
  let record = nodeIndex.get(nodeId);
  while (record?.kind === 'widget') record = nodeIndex.get(record.parent.id);
  return record?.kind === 'area' ? record.node : undefined;
}

/**
 * Pose un élément ; refuse un module qui finirait par se contenir lui-même.
 * @param {(uiDocument: object) => void} placeItem pose
 * @returns {boolean} vrai si c'est posé
 */
function commitPlacement(placeItem) {
  let errorMessage = null;
  const isPlaced = commitChange((uiDocument) => {
    placeItem(uiDocument);
    try { assertNoModuleCycle(uiDocument); } catch (error) { errorMessage = error.message; throw error; }
  });
  if (!isPlaced) { alert(`Impossible de poser cet élément : ${errorMessage ?? 'erreur interne'}.`); notifyChange(); }
  return isPlaced;
}

/**
 * Pose un module d'area dans une area vide.
 * @param {{kind: string, value: string}} libraryItem module
 * @param {string} holderId area (ou conteneur dans l'area)
 */
function placeAreaModuleItem(libraryItem, holderId) {
  const targetArea = findEnclosingArea(appState.uiDocument, holderId);
  if (!targetArea) return;
  if (targetArea.split || targetArea.moduleId || (targetArea.widgets ?? []).length > 0) {
    alert(`« ${targetArea.name} » n'est pas vide. Un module d'area se pose dans une area vide : divise d'abord cette area.`);
    return;
  }
  const isPlaced = commitPlacement((uiDocument) => {
    const moduleId = libraryItem.kind === 'module' ? libraryItem.value : installLibraryEntry(uiDocument, getLibraryEntry(libraryItem.value));
    placeAreaModule(findEnclosingArea(uiDocument, holderId), moduleId);
  });
  if (isPlaced) selectNode(targetArea.id);
}

/**
 * Enregistre un widget ou une area comme module, dans le projet et dans la bibliothèque commune.
 * @param {string} nodeId élément
 */
export function saveAsModule(nodeId) {
  let moduleId = null;
  commitChange((uiDocument) => { moduleId = saveNodeAsModule(uiDocument, buildNodeIndex(uiDocument).get(nodeId).node); });
  appState.rightPanelSection = 'modules';
  selectNode(nodeId);
  if (moduleId) sendModuleToLibrary(moduleId);
}

/**
 * Copie un module du projet dans la bibliothèque commune (la catégorie et les tags déjà choisis restent).
 * @param {string} moduleId module
 */
export function sendModuleToLibrary(moduleId) {
  const entry = buildLibraryEntry(appState.uiDocument, moduleId);
  const { category = '', tags = [] } = getLibraryEntry(entry.libraryId) ?? {};
  putLibraryEntry({ ...entry, category, tags }).catch((error) => {
    console.error('sendModuleToLibrary', error);
    alert(`Le module est dans le projet, mais pas dans la bibliothèque : ${error.message}`);
  });
}

/**
 * Publie un module modifié dans la bibliothèque : nouvelle version, proposée ensuite aux autres projets.
 * @param {string} moduleId module
 */
export function publishModule(moduleId) {
  const module = appState.uiDocument.modules[moduleId];
  const entry = getLibraryEntry(module.libraryId);
  if (entry && isModuleUpdateAvailable(module, entry)
    && !confirm(`La bibliothèque a une autre version (v${entry.version}) de « ${module.name} ». La remplacer par celle de ce projet ?`)) return;
  let publishedIds = [];
  if (!commitChange((uiDocument) => { publishedIds = preparePublication(uiDocument, moduleId, getLibraryEntry); })) return;
  publishedIds.forEach(sendModuleToLibrary);
}

/**
 * Met à jour un module du projet depuis la bibliothèque (annulable). Les réglages des instances restent.
 * @param {string} moduleId module
 */
export function updateModuleFromLibrary(moduleId) {
  const module = appState.uiDocument.modules[moduleId];
  const entry = getLibraryEntry(module.libraryId);
  if (!entry) return;
  const warningText = module.hasLocalChanges ? '\n\nAttention : les modifications faites dans ce projet seront remplacées.' : '';
  if (!confirm(`Mettre à jour « ${module.name} » vers la v${entry.version} dans ce projet ?${warningText}`)) return;
  let errorMessage = 'erreur interne';
  const isUpdated = commitChange((uiDocument) => {
    try { installLibraryEntry(uiDocument, entry, true); } catch (error) { errorMessage = error.message; throw error; }
  });
  if (!isUpdated) { alert(`Mise à jour impossible : ${errorMessage}.`); notifyChange(); }
}

/**
 * Ouvre un module sur le canevas pour le modifier.
 * @param {string} moduleId module
 */
export function openModuleEditor(moduleId) {
  if (appState.editedModuleId === moduleId) return;
  if (appState.editedModuleId) appState.parentModuleIds.push(appState.editedModuleId);
  appState.editedModuleId = moduleId;
  appState.editedStateId = null;
  appState.armedLibraryItem = null;
  selectNode(moduleId);
}

/** Termine l'édition du module : revient au module d'où l'on vient, sinon à l'écran. */
export function closeModuleEditor() {
  const { modules } = appState.uiDocument;
  appState.editedStateId = null;
  do { appState.editedModuleId = appState.parentModuleIds.pop() ?? null; } while (appState.editedModuleId && !modules[appState.editedModuleId]);
  selectNode(appState.editedModuleId);
}

/**
 * Change un élément interne pour une seule instance.
 * @param {(mutateInstance: (instance: object) => void) => void} updateInstance applique une modification à l'instance
 * @param {object} entry élément interne (listInstanceNodes)
 * @param {((node: object) => void)|null} mutateNode modification, null pour revenir aux valeurs du module
 */
export function updateInstanceNode(updateInstance, entry, mutateNode) {
  let newNode = null;
  if (mutateNode) { newNode = cloneJson(entry.node); mutateNode(newNode); }
  updateInstance((instance) => setInstanceNodeValues(instance, entry, newNode));
}

/**
 * Détache une instance de module (widget ou area).
 * @param {string} instanceId instance
 */
export function detachInstance(instanceId) {
  let detachedId = null;
  commitChange((uiDocument) => { detachedId = detachModuleInstance(uiDocument, instanceId); });
  if (detachedId) selectNode(detachedId);
}

/**
 * Ajoute un élément de bibliothèque dans une area / un conteneur et le sélectionne.
 * @param {{kind: string, value: string}} libraryItem élément de bibliothèque
 * @param {string} holderId cible
 * @param {number} [insertIndex] position dans la liste
 * @param {object} [placement] placement en mode libre
 */
export function placeLibraryItem(libraryItem, holderId, insertIndex, placement) {
  if (isAreaModuleItem(libraryItem)) { placeAreaModuleItem(libraryItem, holderId); return; }
  let createdWidgetId = null;
  const isPlaced = commitPlacement((uiDocument) => {
    const createdWidget = createWidgetFromLibraryItem(uiDocument, libraryItem);
    const holderNode = buildNodeIndex(uiDocument).get(holderId)?.node;
    if (!placement && holderNode?.widgetLayout?.mode === 'free') placement = { ...DEFAULT_FREE_PLACEMENT };
    if (placement) { createdWidget.placement = placement; replaceFillSizeForFreeDrop(createdWidget); }
    if (insertWidget(uiDocument, holderId, createdWidget, insertIndex)) createdWidgetId = createdWidget.id;
  });
  if (isPlaced && createdWidgetId) selectNode(createdWidgetId);
}

/**
 * Applique une icône : au widget sélectionné s'il accepte une icône, sinon ajoute un widget icône.
 * @param {string} iconName nom Lucide
 */
export function applyIconFromLibrary(iconName) {
  const selectedRecord = getSelectedRecord();
  if (selectedRecord?.kind === 'widget' && ICON_TARGET_TYPES.has(selectedRecord.node.type)) {
    const widgetId = selectedRecord.node.id;
    commitChange((uiDocument) => {
      const widget = buildNodeIndex(uiDocument).get(widgetId).node;
      widget.content = { ...widget.content, icon: `lucide:${iconName}` };
    });
    return;
  }
  const holderId = findDefaultHolderId();
  if (holderId) placeLibraryItem({ kind: 'icon', value: iconName }, holderId);
}

/**
 * Déplace un widget vers une autre place (même parent ou autre).
 * @param {string} widgetId widget déplacé
 * @param {string} holderId nouvelle area / nouveau conteneur
 * @param {number} insertIndex position (calculée sans le widget déplacé)
 * @param {object} [placement] nouveau placement libre
 */
export function moveWidget(widgetId, holderId, insertIndex, placement) {
  commitChange((uiDocument) => {
    const movedWidget = removeWidget(uiDocument, widgetId);
    if (!movedWidget) return;
    if (placement) { movedWidget.placement = placement; replaceFillSizeForFreeDrop(movedWidget); }
    else if (placement === null) delete movedWidget.placement;
    insertWidget(uiDocument, holderId, movedWidget, insertIndex);
  });
}

/**
 * Modifie un nœud (écran, area, widget) par son ID.
 * @param {string} nodeId ID
 * @param {(node: object) => void} mutateNode modification
 */
export function updateNode(nodeId, mutateNode) {
  commitChange((uiDocument) => {
    const record = buildNodeIndex(uiDocument).get(nodeId);
    if (record) mutateNode(record.node);
  });
}

/** Supprime la sélection (widget, area non racine, écran s'il en reste un autre, style). */
export function deleteSelection() {
  const selectedId = appState.selectedId;
  if (!selectedId) return;
  if (selectedId.startsWith('T')) {
    commitChange((uiDocument) => deleteStyle(uiDocument, selectedId));
    selectNode(null);
    return;
  }
  const selectedRecord = getSelectedRecord();
  if (!selectedRecord || selectedRecord.kind === 'module') return;
  if (selectedRecord.kind !== 'screen' && !selectedRecord.siblings) { alert('C\'est la racine : elle ne peut pas être supprimée.'); return; }
  commitChange((uiDocument) => {
    if (selectedRecord.kind === 'widget') removeWidget(uiDocument, selectedId);
    else if (selectedRecord.kind === 'area') deleteArea(uiDocument, selectedId);
    else if (selectedRecord.kind === 'screen' && uiDocument.screens.length > 1) {
      uiDocument.screens = uiDocument.screens.filter((screen) => screen.id !== selectedId);
    }
  });
  selectNode(selectedRecord.parent?.id ?? null);
}

/** Duplique le widget sélectionné juste après lui. */
export function duplicateSelection() {
  const selectedRecord = getSelectedRecord();
  if (selectedRecord?.kind !== 'widget' || !selectedRecord.siblings) return;
  let duplicateId = null;
  commitChange((uiDocument) => {
    const record = buildNodeIndex(uiDocument).get(selectedRecord.node.id);
    const duplicate = cloneSubtreeWithNewIds(uiDocument, record.node);
    if (duplicate.placement) duplicate.placement = { ...duplicate.placement, x: (duplicate.placement.x ?? 0) + 16, y: (duplicate.placement.y ?? 0) + 16 };
    record.siblings.splice(record.siblings.indexOf(record.node) + 1, 0, duplicate);
    duplicateId = duplicate.id;
  });
  if (duplicateId) selectNode(duplicateId);
}

/**
 * Découpe l'area sélectionnée.
 * @param {'horizontal'|'vertical'} splitDirection sens
 */
export function splitSelectedArea(splitDirection) {
  const selectedRecord = getSelectedRecord();
  if (selectedRecord?.kind !== 'area') return;
  let createdAreaId = null;
  commitChange((uiDocument) => { createdAreaId = splitArea(uiDocument, selectedRecord.node.id, splitDirection); });
  if (createdAreaId) selectNode(createdAreaId);
}

/** Copie l'apparence (style lié + valeurs propres) de la sélection. */
export function copySelectedAppearance() {
  const selectedRecord = getSelectedRecord();
  if (!selectedRecord || selectedRecord.kind === 'screen' || selectedRecord.kind === 'module') return;
  appState.copiedAppearance = { style: selectedRecord.node.style ?? null, styleOverrides: cloneJson(selectedRecord.node.styleOverrides ?? {}) };
}

/** Colle l'apparence copiée sur la sélection. */
export function pasteAppearanceOnSelection() {
  const copiedAppearance = appState.copiedAppearance;
  if (!copiedAppearance || !['area', 'widget'].includes(getSelectedRecord()?.kind)) return;
  updateNode(appState.selectedId, (node) => {
    if (copiedAppearance.style) node.style = copiedAppearance.style; else delete node.style;
    node.styleOverrides = cloneJson(copiedAppearance.styleOverrides);
  });
}
