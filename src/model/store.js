// État de l'application : document, sélection, historique annuler / rétablir, sauvegarde locale (PROTOTYPE).
import { createDefaultDocument, normalizeImportedDocument } from './document.js';

const STORAGE_KEY = 'uimakerNoob.prototype.document';
const HISTORY_LIMIT = 100;

/** Magasin central : toute modification du document passe par commitChange(). */
export const appState = {
  uiDocument: null,
  selectedId: null,          // ID d'un écran, area, widget, ou style (T…)
  currentScreenId: null,
  currentThemeId: null,
  armedLibraryItem: null,    // { kind: 'widget'|'component'|'icon', value } en attente d'un tap sur le canevas
  areIdsVisible: true,
  copiedAppearance: null,
  leftPanelSection: 'properties',
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
  if (!uiDocument.themes[appState.currentThemeId]) appState.currentThemeId = uiDocument.project.defaultTheme ?? Object.keys(uiDocument.themes)[0];
}

/**
 * Applique une modification du document avec historique, sauvegarde et redessin.
 * @param {(uiDocument: object) => void} mutateDocument fonction qui modifie le document
 */
export function commitChange(mutateDocument) {
  const previousSnapshot = JSON.stringify(appState.uiDocument);
  try {
    mutateDocument(appState.uiDocument);
  } catch (error) {
    console.error('commitChange', error);
    appState.uiDocument = JSON.parse(previousSnapshot);
    return;
  }
  if (JSON.stringify(appState.uiDocument) === previousSnapshot) { notifyChange(); return; }
  undoStack.push(previousSnapshot);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  repairViewState();
  saveDocumentLocally();
  notifyChange();
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
  appState.uiDocument = JSON.parse(sourceStack.pop());
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
  appState.currentScreenId = newDocument.screens[0]?.id ?? null;
  appState.currentThemeId = newDocument.project.defaultTheme;
  notifyChange();
}

/** Charge le document enregistré, ou crée le projet de départ. */
export function loadInitialDocument() {
  let storedDocument = null;
  try {
    const storedText = localStorage.getItem(STORAGE_KEY);
    if (storedText) storedDocument = normalizeImportedDocument(JSON.parse(storedText));
  } catch (error) {
    console.error('loadInitialDocument', error);
  }
  appState.uiDocument = storedDocument ?? createDefaultDocument();
  appState.currentScreenId = appState.uiDocument.screens[0].id;
  appState.currentThemeId = appState.uiDocument.project.defaultTheme;
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
