// État de l'application : document, sélection, historique annuler / rétablir, sauvegarde locale (PROTOTYPE).
import { createEmptyDocument, normalizeImportedDocument } from './document.js';

const STORAGE_KEY = 'uimakerNoob.prototype.document';
const SETTINGS_STORAGE_KEY = 'uimakerNoob.settings';
const HISTORY_LIMIT = 100;
const STATE_LOCK_MESSAGE = 'Tu modifies un état : repasse sur « Normal » (bandeau) pour changer la structure du module.';

/** Réglages de l'application (pas du projet), gardés dans l'appareil. */
export const DEFAULT_APP_SETTINGS = {
  handleSize: 18,            // hauteur des poignées de widget (px à l'écran, quel que soit le zoom)
  resizeHandleSize: 14,      // côté des poignées de redimensionnement (px à l'écran)
  scrubPixelsPerStep: 6,     // px à parcourir pour changer une valeur d'un pas en glissant
  snapDistance: 10,          // distance d'aimantation des bords d'areas (px à l'écran)
  longPressDuration: 500,    // mode test : durée d'un appui long (ms)
  doubleTapDelay: 300,       // mode test : délai max entre deux taps pour un double tap (ms)
  simulateMouseWithPencil: false,      // mode test : le Pencil imite la souris (pour tester une app de bureau sur iPad)
  pencilDoubleTapAs: 'rightClick',     // … double tap du Pencil = clic droit ou double clic
  pencilLongPressAs: 'rightClick',     // … appui long du Pencil = clic droit ou rien
};

export const appSettings = { ...DEFAULT_APP_SETTINGS };

/** Charge les réglages de l'application. */
function loadAppSettings() {
  try {
    const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
    for (const settingKey of Object.keys(DEFAULT_APP_SETTINGS)) {
      if (typeof storedSettings[settingKey] === typeof DEFAULT_APP_SETTINGS[settingKey]) appSettings[settingKey] = storedSettings[settingKey];
    }
  } catch (error) {
    console.error('loadAppSettings', error);
  }
}

/**
 * Change un réglage de l'application et l'enregistre.
 * @param {string} settingKey clé (DEFAULT_APP_SETTINGS)
 * @param {number|string|boolean|undefined} settingValue nouvelle valeur (undefined ou mauvais type = valeur par défaut)
 */
export function updateAppSetting(settingKey, settingValue) {
  const isValidValue = typeof settingValue === typeof DEFAULT_APP_SETTINGS[settingKey] && !Number.isNaN(settingValue);
  appSettings[settingKey] = isValidValue ? settingValue : DEFAULT_APP_SETTINGS[settingKey];
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch (error) {
    console.error('updateAppSetting', error);
  }
  notifyChange();
}

let activeHistoryGroup = null;
let lastHistoryGroup = null;

/**
 * Regroupe les modifications suivantes en un seul pas d'annulation (ex. valeur changée en glissant).
 * @param {string|null} historyGroup nom du groupe, null pour terminer
 */
export function setHistoryGroup(historyGroup) {
  activeHistoryGroup = historyGroup;
}

/** Magasin central : toute modification du document passe par commitChange(). */
export const appState = {
  uiDocument: null,
  selectedId: null,          // ID d'un écran, area, widget, ou style (T…)
  currentScreenId: null,
  editedModuleId: null,      // module en cours d'édition sur le canevas (null = on édite l'écran courant)
  editedStateId: null,       // état du module en cours d'édition (null = apparence normale)
  parentModuleIds: [],       // modules d'où l'on vient (édition d'un module dans un module)
  currentThemeId: null,
  armedLibraryItem: null,    // { kind: 'widget'|'module'|'libraryModule'|'icon', value } en attente d'un tap sur le canevas
  isScrubbing: false,        // vrai pendant qu'on change une valeur en glissant (la fenêtre de gauche ne se redessine pas)
  areIdsVisible: true,
  copiedAppearance: null,
  leftPanelSection: 'properties',
  parameterTab: 'properties', // onglet des paramètres de la sélection : properties, look ou interaction
  rightPanelSection: 'widgets',
};

const undoStack = [];
const redoStack = [];
const changeListeners = new Set();

/**
 * Abonne une fonction aux changements (document ou interface).
 * @param {() => void} listener fonction appelée après chaque changement
 */
export function subscribeToChanges(listener) {
  changeListeners.add(listener);
}

/** Prévient les abonnés qu'il faut redessiner. */
export function notifyChange() {
  for (const listener of changeListeners) listener();
}

/** Enregistre le document dans le stockage local du navigateur. */
function saveDocumentLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.uiDocument));
  } catch (error) {
    console.error('saveDocumentLocally', error);
  }
}

/** Garde l'écran courant, le thème et la sélection valides après un changement de document. */
function repairViewState() {
  const { uiDocument } = appState;
  if (!uiDocument.screens.some((screen) => screen.id === appState.currentScreenId)) appState.currentScreenId = uiDocument.screens[0]?.id ?? null;
  if (appState.editedModuleId && !uiDocument.modules[appState.editedModuleId]) { appState.editedModuleId = null; appState.parentModuleIds = []; }
  const editedStates = uiDocument.modules[appState.editedModuleId]?.states ?? [];
  if (!editedStates.some((state) => state.id === appState.editedStateId)) appState.editedStateId = null;
  if (!uiDocument.themes[appState.currentThemeId]) appState.currentThemeId = uiDocument.project.defaultTheme ?? Object.keys(uiDocument.themes)[0];
}

/**
 * Applique une modification du document avec historique, sauvegarde et redessin.
 * @param {(uiDocument: object) => void} mutateDocument fonction qui modifie le document
 * @returns {boolean} faux si la modification a échoué (document inchangé)
 */
export function commitChange(mutateDocument) {
  const previousSnapshot = JSON.stringify(appState.uiDocument);
  try {
    const moduleBefore = appState.uiDocument.modules[appState.editedModuleId];
    const editedRootBefore = JSON.stringify(moduleBefore?.root);
    const editedStatesBefore = JSON.stringify(moduleBefore?.states);
    mutateDocument(appState.uiDocument);
    const editedModule = appState.uiDocument.modules[appState.editedModuleId];
    const isRootChanged = editedModule && JSON.stringify(editedModule.root) !== editedRootBefore;
    if (isRootChanged && appState.editedStateId) throw new Error(STATE_LOCK_MESSAGE);
    if (isRootChanged || (editedModule && JSON.stringify(editedModule.states) !== editedStatesBefore)) editedModule.hasLocalChanges = true;
  } catch (error) {
    console.error('commitChange', error);
    appState.uiDocument = JSON.parse(previousSnapshot);
    if (error.message === STATE_LOCK_MESSAGE) { alert(STATE_LOCK_MESSAGE); notifyChange(); }
    return false;
  }
  if (JSON.stringify(appState.uiDocument) === previousSnapshot) { notifyChange(); return true; }
  const isSameGroup = activeHistoryGroup !== null && activeHistoryGroup === lastHistoryGroup;
  if (!isSameGroup) undoStack.push(previousSnapshot);
  lastHistoryGroup = activeHistoryGroup;
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  repairViewState();
  saveDocumentLocally();
  notifyChange();
  return true;
}

/**
 * Annule (direction -1) ou rétablit (direction +1) la dernière modification.
 * @param {-1|1} direction sens
 */
export function stepHistory(direction) {
  const sourceStack = direction < 0 ? undoStack : redoStack;
  const targetStack = direction < 0 ? redoStack : undoStack;
  if (sourceStack.length === 0) return;
  targetStack.push(JSON.stringify(appState.uiDocument));
  const usedCounters = appState.uiDocument.project.idCounters ?? {};
  appState.uiDocument = JSON.parse(sourceStack.pop());
  const restoredCounters = appState.uiDocument.project.idCounters ??= {};
  for (const [prefix, count] of Object.entries(usedCounters)) restoredCounters[prefix] = Math.max(restoredCounters[prefix] ?? 0, count);
  repairViewState();
  saveDocumentLocally();
  notifyChange();
}

/**
 * Remplace tout le document (nouveau projet, import) ; reste annulable.
 * @param {object} newDocument document de remplacement
 */
export function replaceDocument(newDocument) {
  commitChange((uiDocument) => {
    for (const key of Object.keys(uiDocument)) delete uiDocument[key];
    Object.assign(uiDocument, newDocument);
  });
  appState.selectedId = null;
  appState.editedModuleId = null;
  appState.editedStateId = null;
  appState.parentModuleIds = [];
  appState.currentScreenId = newDocument.screens[0]?.id ?? null;
  appState.currentThemeId = newDocument.project.defaultTheme;
  notifyChange();
}

/** Charge le document enregistré, ou crée le projet de départ. */
export function loadInitialDocument() {
  loadAppSettings();
  let storedDocument = null;
  try {
    const storedText = localStorage.getItem(STORAGE_KEY);
    if (storedText) storedDocument = normalizeImportedDocument(JSON.parse(storedText));
  } catch (error) {
    console.error('loadInitialDocument', error);
  }
  appState.uiDocument = storedDocument ?? createEmptyDocument();
  appState.currentScreenId = appState.uiDocument.screens[0].id;
  appState.currentThemeId = appState.uiDocument.project.defaultTheme;
}

/**
 * Affiche un écran (quitte l'édition d'un module).
 * @param {string} screenId écran
 */
export function showScreen(screenId) {
  appState.currentScreenId = screenId;
  appState.editedModuleId = null;
  appState.editedStateId = null;
  appState.parentModuleIds = [];
}

/**
 * Change la sélection (et redessine).
 * @param {string|null} nodeId ID sélectionné
 */
export function selectNode(nodeId) {
  appState.selectedId = nodeId;
  if (nodeId && appState.leftPanelSection !== 'properties' && appState.leftPanelSection !== 'tree') appState.leftPanelSection = 'properties';
  notifyChange();
}
