// Fenêtre de droite, section « Modules » : modules du projet et bibliothèque commune (PROTOTYPE).
import { createElement, pickTextFile, saveFile } from '../utils/dom.js';
import { appState, commitChange, notifyChange } from '../model/store.js';
import { createEmptyDocument } from '../model/document.js';
import { countModuleInstances, installLibraryEntry, isModuleUpdateAvailable } from '../model/modules.js';
import { createModuleFileText, deleteLibraryEntry, getLibraryEntry, importModuleFile, listLibraryEntries, putLibraryEntry } from '../io/moduleLibrary.js';
import { renderScreen } from '../render/screenRenderer.js';
import { openModuleEditor, publishModule, updateModuleFromLibrary } from './editorActions.js';
import { createButtonRow, createPanelSection, createTextField } from './fields.js';

const PREVIEW_WIDTH = 104;
const PREVIEW_HEIGHT = 64;
const PREVIEW_DEFAULT_SIZE = { width: 320, height: 200 };
const PREVIEW_AREA_SIZE = { width: 480, height: 300 };

let librarySearchText = '';
const libraryPreviewDocuments = new Map();
/** Cartes ouvertes, gardées quand la fenêtre se redessine. */
const openCardIds = new Set();

/**
 * Crée la partie repliable d'une carte.
 * @param {string} cardId identifiant de la carte
 * @param {HTMLElement[]} children contenu
 * @returns {HTMLElement} partie repliable
 */
function createCardDetails(cardId, children) {
  const detailsElement = createElement('details', { className: 'module-details', attributes: { open: openCardIds.has(cardId) } }, children);
  detailsElement.addEventListener('toggle', () => { if (detailsElement.open) openCardIds.add(cardId); else openCardIds.delete(cardId); });
  return detailsElement;
}

/**
 * Crée l'aperçu réduit d'un module.
 * @param {object} uiDocument document qui contient le module
 * @param {string} moduleId module
 * @param {string} themeId thème
 * @returns {HTMLElement} aperçu
 */
function createModulePreview(uiDocument, moduleId, themeId) {
  const module = uiDocument.modules[moduleId];
  const isArea = module.kind === 'area';
  const moduleSize = module.root.size ?? {};
  const readSize = (dimension) => (typeof moduleSize[dimension] === 'number' ? moduleSize[dimension] + 16 : PREVIEW_DEFAULT_SIZE[dimension]);
  const previewSize = isArea ? PREVIEW_AREA_SIZE : { width: readSize('width'), height: readSize('height') };
  const root = isArea ? { id: 'A0', name: 'Preview', moduleId }
    : { id: 'A0', name: 'Preview', widgetLayout: { mode: 'stack', direction: 'vertical', padding: [8, 8, 8, 8], alignCross: 'start' },
      widgets: [{ id: 'W0', name: module.name, type: 'moduleInstance', moduleId, size: module.root.size }] };
  const screenElement = renderScreen(uiDocument, { id: 'S0', size: previewSize, root }, { themeId, isEditor: false });
  const scale = Math.min(PREVIEW_WIDTH / previewSize.width, PREVIEW_HEIGHT / previewSize.height);
  screenElement.style.transform = `scale(${scale})`;
  return createElement('div', { className: 'module-preview', style: { width: `${previewSize.width * scale}px`, height: `${previewSize.height * scale}px` } }, [screenElement]);
}

/**
 * Document temporaire où un module de la bibliothèque est installé, pour son aperçu.
 * @param {object} entry module de la bibliothèque
 * @returns {{uiDocument: object, moduleId: string}} document et ID du module
 */
function getLibraryPreviewDocument(entry) {
  const cachedPreview = libraryPreviewDocuments.get(entry.libraryId);
  if (cachedPreview?.entry === entry) return cachedPreview;
  const uiDocument = createEmptyDocument();
  const preview = { entry, uiDocument, moduleId: installLibraryEntry(uiDocument, entry) };
  libraryPreviewDocuments.set(entry.libraryId, preview);
  return preview;
}

/**
 * Affiche une erreur d'écriture ou de lecture de la bibliothèque.
 * @param {string} actionName action ratée
 * @param {Error} error erreur
 */
function reportLibraryError(actionName, error) {
  console.error(actionName, error);
  alert(`${actionName} : ${error.message}`);
}

/**
 * Enregistre des modules dans un fichier .uimodules.
 * @param {object[]} entries modules
 * @param {string} baseName nom du fichier sans extension
 */
function exportModules(entries, baseName) {
  saveFile(`${baseName.replace(/[^\w-]+/g, '_')}.uimodules`, createModuleFileText(entries), 'application/json');
}

/** Choisit et importe un fichier .uimodules. */
async function importModules() {
  try {
    const fileText = await pickTextFile();
    if (fileText === null) return;
    const { addedCount, skippedCount } = await importModuleFile(fileText,
      (entry) => confirm(`« ${entry.name} » v${entry.version} a été modifié des deux côtés. Remplacer celui de cet appareil par celui du fichier ?`));
    alert(`${addedCount} module(s) ajouté(s) ou mis à jour, ${skippedCount} déjà présent(s).`);
  } catch (error) {
    reportLibraryError('Import impossible', error);
  }
}

/**
 * Carte d'un module de la bibliothèque : aperçu à glisser, nom, catégorie, tags.
 * @param {object} entry module
 * @param {Function} createTile fabrique une tuile à glisser
 * @returns {HTMLElement} carte
 */
function createLibraryCard(entry, createTile) {
  const preview = getLibraryPreviewDocument(entry);
  const tile = createTile({ kind: 'libraryModule', value: entry.libraryId, label: entry.name },
    createModulePreview(preview.uiDocument, preview.moduleId, preview.uiDocument.project.defaultTheme), `${entry.kind === 'area' ? 'area' : 'widgets'} · v${entry.version}`);
  const updateEntry = (changes) => putLibraryEntry({ ...getLibraryEntry(entry.libraryId), ...changes }).catch((error) => reportLibraryError('Modification impossible', error));
  const details = createCardDetails(entry.libraryId, [
    createElement('summary', { text: entry.category || 'Sans catégorie' }),
    createTextField('Nom', entry.name, (name) => updateEntry({ name: name.trim() || entry.name })),
    createTextField('Catégorie', entry.category, (category) => updateEntry({ category: category.trim() })),
    createTextField('Tags EN / FR', entry.tags.join(', '), (tagsText) => updateEntry({ tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean) }), { placeholder: 'login, connexion' }),
    createButtonRow([
      { label: 'Exporter', onClick: () => exportModules([getLibraryEntry(entry.libraryId)], entry.name) },
      { label: 'Supprimer', isDanger: true, onClick: () => {
        if (confirm(`Supprimer « ${entry.name} » de la bibliothèque ? Les copies déjà dans des projets restent.`)) deleteLibraryEntry(entry.libraryId).catch((error) => reportLibraryError('Suppression impossible', error));
      } },
    ]),
  ]);
  return createElement('div', { className: 'module-card' }, [tile, details]);
}

/**
 * Carte d'un module du projet.
 * @param {string} moduleId module
 * @param {object} module module
 * @param {Function} createTile fabrique une tuile à glisser
 * @returns {HTMLElement} carte
 */
function createProjectCard(moduleId, module, createTile) {
  const instanceCount = countModuleInstances(appState.uiDocument, moduleId);
  const libraryEntry = getLibraryEntry(module.libraryId);
  const hasUpdate = isModuleUpdateAvailable(module, libraryEntry);
  const stateText = `${module.hasLocalChanges ? ' · modifié' : ''}${hasUpdate ? ` · v${libraryEntry.version} dispo` : ''}`;
  const tile = createTile({ kind: 'module', value: moduleId, label: module.name },
    createModulePreview(appState.uiDocument, moduleId, appState.currentThemeId), `${moduleId} · v${module.version} · ${instanceCount} inst.${stateText}`);
  return createElement('div', { className: 'module-card' }, [tile, createCardDetails(moduleId, [
    createElement('summary', { text: module.kind === 'area' ? 'Module d\'area' : 'Module de widgets' }),
    createTextField('Nom', module.name, (name) => commitChange((uiDocument) => { uiDocument.modules[moduleId].name = name.trim() || module.name; })),
    createButtonRow([
      { label: 'Modifier', title: 'Ouvre le module sur le canevas', onClick: () => openModuleEditor(moduleId) },
      ...(libraryEntry ? [] : [{ label: '→ Bibliothèque', onClick: () => publishModule(moduleId) }]),
      ...(libraryEntry && module.hasLocalChanges ? [{ label: 'Publier', title: 'Nouvelle version dans la bibliothèque', onClick: () => publishModule(moduleId) }] : []),
      ...(hasUpdate ? [{ label: `Mettre à jour → v${libraryEntry.version}`, onClick: () => updateModuleFromLibrary(moduleId) }] : []),
      { label: 'Supprimer', isDanger: true, onClick: () => {
        if (instanceCount > 0) { alert(`Ce module est utilisé ${instanceCount} fois : supprime ou détache d'abord ses instances.`); return; }
        commitChange((uiDocument) => { delete uiDocument.modules[moduleId]; });
      } },
    ]),
  ])]);
}

/**
 * Normalise un texte pour la recherche.
 * @param {string} text texte
 * @returns {string} minuscules, sans accents
 */
function normalizeSearchText(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Contenu de la section Modules.
 * @param {Function} createTile fabrique une tuile à glisser
 * @returns {HTMLElement[]} contenu
 */
export function createModulesView(createTile) {
  const libraryEntries = listLibraryEntries();
  const searchWords = normalizeSearchText(librarySearchText).split(/\s+/).filter(Boolean);
  const shownEntries = libraryEntries.filter((entry) => {
    const searchableText = normalizeSearchText([entry.name, entry.category, ...entry.tags].join(' '));
    return searchWords.every((searchWord) => searchableText.includes(searchWord));
  });
  const searchInput = createElement('input', { attributes: { type: 'text', placeholder: 'Rechercher un module (nom, catégorie, tags)' },
    on: { change: () => { librarySearchText = searchInput.value; notifyChange(); } } });
  searchInput.value = librarySearchText;
  const projectModules = Object.entries(appState.uiDocument.modules);
  return [
    createElement('div', { className: 'panel-hint', text: 'Un module est un agencement de widgets, d\'areas ou d\'autres modules. Sélectionne un conteneur ou une area, puis « → Module » à gauche. Un module d\'area se pose dans une area vide.' }),
    createPanelSection('Bibliothèque (tous les projets)', [searchInput,
      createElement('div', { className: 'module-grid' }, shownEntries.map((entry) => createLibraryCard(entry, createTile))),
      shownEntries.length ? null : createElement('div', { className: 'panel-hint', text: libraryEntries.length ? 'Aucun module ne correspond.' : 'Bibliothèque vide.' }),
      createButtonRow([
        { label: 'Importer…', title: 'Importer un fichier .uimodules', onClick: importModules },
        { label: 'Tout exporter', title: 'Enregistrer toute la bibliothèque dans un fichier .uimodules', onClick: () => exportModules(listLibraryEntries(), 'bibliotheque') },
      ])].filter(Boolean)),
    createPanelSection('Modules de ce projet', projectModules.length
      ? [createElement('div', { className: 'module-grid' }, projectModules.map(([moduleId, module]) => createProjectCard(moduleId, module, createTile)))]
      : [createElement('div', { className: 'panel-hint', text: 'Aucun.' })]),
  ];
}
