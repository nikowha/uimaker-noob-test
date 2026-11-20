// Fenêtre du haut : projet, écrans, thème affiché, annuler / rétablir, zoom, import / export (PROTOTYPE).
import { createElement, pickTextFile, saveTextFile } from '../utils/dom.js';
import { appState, commitChange, notifyChange, replaceDocument, selectNode, stepHistory } from '../model/store.js';
import { SCREEN_PRESETS } from '../model/catalog.js';
import { createEmptyDocument, createScreen } from '../model/document.js';
import { buildUiSpecExport, parseUiSpecImport } from '../io/uispecExport.js';
import { getIconSvg } from '../render/iconLibrary.js';
import { createSelectElement } from './fields.js';
import { fitScreenInView, zoomFromButton } from './canvasView.js';

const ZOOM_STEP = 1.25;

let topBarElement = null;

/**
 * Bouton d'icône de la barre du haut.
 * @param {string} iconName nom Lucide
 * @param {string} title infobulle
 * @param {() => void} onClick action
 * @param {string} [label] texte à côté de l'icône
 * @returns {HTMLElement} bouton
 */
function createToolbarButton(iconName, title, onClick, label) {
  return createElement('button', { className: 'top-button', attributes: { type: 'button', title },
    on: { click: onClick } }, [createElement('span', { className: 'top-button-icon', html: getIconSvg(`lucide:${iconName}`) }), label ? createElement('span', { text: label }) : null]);
}

/** Exporte ui.json (téléchargement sur PC, partage sur iPad). */
async function exportUiSpec() {
  try {
    const uiSpec = await buildUiSpecExport(appState.uiDocument);
    const safeName = (appState.uiDocument.project.name || 'project').replace(/[^\w-]+/g, '_');
    await saveTextFile(`${safeName}_ui.json`, JSON.stringify(uiSpec, null, 2), 'application/json');
  } catch (error) {
    console.error('exportUiSpec', error);
    alert(`Export impossible : ${error.message}`);
  }
}

/** Importe un ui.json (remplace le projet, annulable). */
async function importUiSpec() {
  const importedText = await pickTextFile();
  if (importedText === null) return;
  try {
    replaceDocument(parseUiSpecImport(importedText));
  } catch (error) {
    console.error('importUiSpec', error);
    alert(`Import impossible : ${error.message}`);
  }
}

/** Remplace le projet par un nouveau projet de départ (annulable). */
function startNewProject() {
  if (confirm('Nouveau projet ? (le projet actuel reste récupérable avec Annuler)')) replaceDocument(createEmptyDocument());
}

/**
 * Ajoute un écran depuis un préréglage.
 * @param {string} presetKey préréglage
 */
function addScreenFromPreset(presetKey) {
  let createdScreenId = null;
  commitChange((uiDocument) => {
    const screen = createScreen(uiDocument, presetKey);
    uiDocument.screens.push(screen);
    createdScreenId = screen.id;
  });
  appState.currentScreenId = createdScreenId;
  selectNode(createdScreenId);
}

/** Redessine la barre du haut. */
export function renderTopBar() {
  const { uiDocument } = appState;
  const projectNameInput = createElement('input', { className: 'project-name', attributes: { type: 'text', title: 'Nom du projet' },
    on: { change: () => commitChange((targetDocument) => { targetDocument.project.name = projectNameInput.value.trim() || 'MyApp'; }) } });
  projectNameInput.value = uiDocument.project.name;
  const screenSelect = createSelectElement(appState.currentScreenId, uiDocument.screens.map((screen) => ({ value: screen.id, label: `${screen.id} · ${screen.name}` })),
    (screenId) => { appState.currentScreenId = screenId; appState.selectedId = screenId; notifyChange(); });
  screenSelect.title = 'Écran affiché';
  const addScreenSelect = createSelectElement('', [{ value: '', label: '+ Écran…' }, ...SCREEN_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))],
    (presetKey) => { if (presetKey) addScreenFromPreset(presetKey); });
  addScreenSelect.title = 'Ajouter un écran avec un format prédéfini';
  const themeSelect = createSelectElement(appState.currentThemeId, Object.entries(uiDocument.themes).map(([themeId, theme]) => ({ value: themeId, label: `Thème : ${theme.name}` })),
    (themeId) => { appState.currentThemeId = themeId; notifyChange(); });
  themeSelect.title = 'Thème affiché (ne change pas le thème par défaut)';
  topBarElement.replaceChildren(
    createToolbarButton('panel-left', 'Afficher / replier la fenêtre de gauche', () => document.body.classList.toggle('is-left-collapsed')),
    createElement('span', { className: 'app-title', text: 'UImaker_noob' }),
    projectNameInput,
    createElement('span', { className: 'top-separator' }),
    screenSelect, addScreenSelect, themeSelect,
    createElement('span', { className: 'top-separator' }),
    createToolbarButton('undo-2', 'Annuler (Ctrl+Z)', () => stepHistory(-1)),
    createToolbarButton('redo-2', 'Rétablir (Ctrl+Y)', () => stepHistory(1)),
    createToolbarButton('zoom-out', 'Dézoomer', () => zoomFromButton(1 / ZOOM_STEP)),
    createToolbarButton('scan', 'Cadrer l\'écran', fitScreenInView),
    createToolbarButton('zoom-in', 'Zoomer', () => zoomFromButton(ZOOM_STEP)),
    createToolbarButton(appState.areIdsVisible ? 'tag' : 'tag', appState.areIdsVisible ? 'Masquer les ID' : 'Afficher les ID',
      () => { appState.areIdsVisible = !appState.areIdsVisible; notifyChange(); }, appState.areIdsVisible ? 'ID' : 'ID off'),
    createElement('span', { className: 'top-spacer' }),
    createToolbarButton('file-plus', 'Nouveau projet', startNewProject),
    createToolbarButton('file-down', 'Importer un ui.json', importUiSpec, 'Importer'),
    createToolbarButton('file-up', 'Exporter ui.json (spec UI pour une autre session)', exportUiSpec, 'Exporter'),
    createToolbarButton('panel-right', 'Afficher / replier la fenêtre de droite', () => document.body.classList.toggle('is-right-collapsed')),
  );
}

/**
 * Crée la barre du haut.
 * @returns {HTMLElement} élément
 */
export function createTopBar() {
  topBarElement = createElement('header', { className: 'top-bar' });
  return topBarElement;
}
