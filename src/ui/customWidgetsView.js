// Fenêtre de droite, section « Custom widgets » : bibliothèque commune et custom widgets du projet (PROTOTYPE).
import { createElement, pickTextFile, saveFile } from '../utils/dom.js';
import { appState, commitChange } from '../model/store.js';
import { countCustomWidgetUsers, createCustomWidgetFileText, installCustomWidget, isCustomWidgetUpdateAvailable, parseCustomWidgetFile } from '../model/customWidgets.js';
import { deleteCustomWidgetEntry, getCustomWidgetEntry, listCustomWidgetEntries, putCustomWidgetEntry } from '../io/customWidgetLibrary.js';
import { createCustomWidgetPreview } from '../render/customWidgetPreview.js';
import { createButtonRow, createPanelSection } from './fields.js';

const EXAMPLE_URL = './data/knob.uimwidget';
const GUIDE_URL = './data/CUSTOM_WIDGET_GUIDE.md';

/**
 * Affiche une erreur.
 * @param {string} actionName action ratée
 * @param {Error} error erreur
 */
function reportError(actionName, error) {
  console.error(actionName, error);
  alert(`${actionName} : ${error.message}`);
}

/**
 * Lit un fichier fourni avec l'app.
 * @param {string} url adresse
 * @returns {Promise<string>} texte
 */
async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fichier introuvable (${response.status})`);
  return response.text();
}

/**
 * Ajoute un fichier .uimwidget à la bibliothèque.
 * @param {string} fileText contenu
 */
async function addToLibrary(fileText) {
  const definition = parseCustomWidgetFile(fileText);
  const isWritten = await putCustomWidgetEntry(definition, (entry, existingEntry) => confirm(`« ${entry.name} » v${entry.version} remplace la v${existingEntry.version} de la bibliothèque. Continuer ?`));
  if (!isWritten) { alert(`« ${definition.name} » : rien à changer.`); return; }
  const isUsedHere = Object.values(appState.uiDocument.customWidgets ?? {}).some((candidate) => candidate.libraryId === definition.libraryId);
  if (isUsedHere) alert(`« ${definition.name} » v${definition.version} est dans la bibliothèque. Ce projet garde son ancienne version : « Mettre à jour » pour la changer.`);
}

/** Choisit et importe un fichier .uimwidget. */
async function importCustomWidget() {
  try {
    const fileText = await pickTextFile();
    if (fileText !== null) await addToLibrary(fileText);
  } catch (error) {
    reportError('Import impossible', error);
  }
}

/** Ajoute l'exemple fourni. */
async function addExample() {
  try { await addToLibrary(await fetchText(EXAMPLE_URL)); } catch (error) { reportError('Exemple impossible', error); }
}

/** Enregistre le guide à donner à une session. */
async function saveGuide() {
  try { await saveFile('CUSTOM_WIDGET_GUIDE.md', await fetchText(GUIDE_URL), 'text/markdown'); } catch (error) { reportError('Guide impossible', error); }
}

/**
 * Enregistre une définition dans un fichier.
 * @param {object} definition définition
 */
function exportCustomWidget(definition) {
  saveFile(`${definition.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.uimwidget`, createCustomWidgetFileText(definition), 'application/json').catch((error) => reportError('Export impossible', error));
}

/**
 * Met à jour un custom widget du projet depuis la bibliothèque.
 * @param {string} customWidgetId définition du projet
 */
export function updateCustomWidget(customWidgetId) {
  const definition = appState.uiDocument.customWidgets[customWidgetId];
  const entry = getCustomWidgetEntry(definition.libraryId);
  if (!entry || !confirm(`Mettre à jour « ${definition.name} » de la v${definition.version} à la v${entry.version} dans ce projet ? Les réglages déjà faits restent quand ils existent encore.`)) return;
  commitChange((uiDocument) => { installCustomWidget(uiDocument, entry, true); });
}

/**
 * Crée la carte d'un custom widget.
 * @param {object} definition définition
 * @param {HTMLElement} tile tuile à glisser
 * @param {object[]} buttons boutons
 * @returns {HTMLElement} carte
 */
function createCard(definition, tile, buttons) {
  return createElement('div', { className: 'module-card', attributes: { title: definition.description || definition.name } }, [tile, createButtonRow(buttons)]);
}

/**
 * Contenu de la section Custom widgets.
 * @param {Function} createTile fabrique une tuile à glisser
 * @returns {HTMLElement[]} contenu
 */
export function createCustomWidgetsView(createTile) {
  const createPreview = (definition) => createElement('div', { className: 'custom-widget-thumbnail' }, [createCustomWidgetPreview(definition)]);
  const libraryCards = listCustomWidgetEntries().map((entry) => createCard(entry,
    createTile({ kind: 'libraryCustomWidget', value: entry.libraryId, label: entry.name }, createPreview(entry), `v${entry.version}`), [
      { label: 'Exporter', title: 'Fichier .uimwidget', onClick: () => exportCustomWidget(entry) },
      { label: 'Supprimer', isDanger: true, onClick: () => {
        if (confirm(`Supprimer « ${entry.name} » de la bibliothèque ? Les projets qui l'utilisent le gardent.`)) deleteCustomWidgetEntry(entry.libraryId).catch((error) => reportError('Suppression impossible', error));
      } },
    ]));
  const projectCards = Object.entries(appState.uiDocument.customWidgets ?? {}).map(([customWidgetId, definition]) => {
    const userCount = countCustomWidgetUsers(appState.uiDocument, customWidgetId);
    const entry = getCustomWidgetEntry(definition.libraryId);
    return createCard(definition, createTile({ kind: 'customWidget', value: customWidgetId, label: definition.name }, createPreview(definition), `${customWidgetId} · v${definition.version} · ${userCount} utilisation(s)`), [
      { label: 'Exporter', title: 'Fichier .uimwidget', onClick: () => exportCustomWidget(definition) },
      ...(entry ? [] : [{ label: '→ Bibliothèque', onClick: () => putCustomWidgetEntry(definition, () => true).catch((error) => reportError('Ajout impossible', error)) }]),
      ...(isCustomWidgetUpdateAvailable(definition, entry) ? [{ label: `Mettre à jour → v${entry.version}`, onClick: () => updateCustomWidget(customWidgetId) }] : []),
      { label: 'Supprimer', isDanger: true, onClick: () => {
        if (userCount > 0) { alert(`Ce custom widget est utilisé ${userCount} fois : supprime d'abord ses widgets.`); return; }
        commitChange((uiDocument) => { delete uiDocument.customWidgets[customWidgetId]; });
      } },
    ]);
  });
  const createGrid = (cards, emptyText) => (cards.length ? createElement('div', { className: 'module-grid' }, cards) : createElement('div', { className: 'panel-hint', text: emptyText }));
  return [
    createElement('div', { className: 'panel-hint', text: 'Un custom widget est un widget codé par une session Claude. Donne-lui le guide et ta description, puis importe le fichier .uimwidget qu\'elle te rend. Ici il n\'est qu\'un aperçu : son code tourne seulement dans « ▶ Tester », isolé et sans réseau.' }),
    createPanelSection('Bibliothèque (tous les projets)', [createGrid(libraryCards, 'Aucun custom widget.'),
      createButtonRow([{ label: 'Importer…', title: 'Fichier .uimwidget', onClick: importCustomWidget }, { label: 'Exemple (potard)', onClick: addExample }, { label: 'Guide pour la session', title: 'CUSTOM_WIDGET_GUIDE.md', onClick: saveGuide }])]),
    createPanelSection('Custom widgets de ce projet', [createGrid(projectCards, 'Aucun.')]),
  ];
}
