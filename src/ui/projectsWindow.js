// Fenêtre « Projets » : liste, versions, corbeille, fichiers de sauvegarde (PROTOTYPE).
import { createElement, pickFile } from '../utils/dom.js';
import { appState } from '../model/store.js';
import { normalizeImportedDocument } from '../model/document.js';
import { TEMPLATE_CATEGORIES } from '../model/templates.js';
import {
  addProject, createProject, deleteVersion, duplicateProject, eraseProjectForever, getOpenedProjectId, isRecordBackupDue, isUntouchedProject, keepVersion, listProjects,
  moveProjectToTrash, openProject, renameProject, replaceOpenedDocument, restoreProjectFromTrash, restoreVersion, TRASH_DAYS,
} from '../model/projects.js';
import { readVersions } from '../io/projectDatabase.js';
import { importProjectFile, isProjectFile, saveBackupFile, saveOneProjectFile } from '../io/projectFiles.js';
import { isZipBytes, readZipFile } from '../utils/zip.js';
import { parseUiSpecImport } from '../io/uispecExport.js';
import { renderScreen } from '../render/screenRenderer.js';
import { createButtonRow, createSelectElement } from './fields.js';
import { fitScreenInView } from './canvasView.js';

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 140;
const VERSION_KIND_LABELS = { auto: 'Automatique', safety: 'Sécurité', named: 'Gardée' };

/** Fenêtre ouverte (null sinon) et projet dont on regarde les versions. */
let windowElement = null;
let versionsProjectId = null;
let isBusy = false;

/**
 * Écrit une date courte.
 * @param {number} timestamp date
 * @returns {string} texte
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** @returns {boolean} vrai si la fenêtre (ou une de ses questions) est ouverte */
export function isProjectsWindowOpen() {
  return document.querySelector('.projects-backdrop') !== null;
}

/**
 * Pose une question avec des boutons.
 * @param {string} message question
 * @param {Array<{value: string, label: string, isDanger?: boolean}>} choices réponses ; la dernière sert aussi à « fermer »
 * @returns {Promise<string>} réponse choisie
 */
function askChoice(message, choices) {
  return new Promise((resolvePromise) => {
    const answer = (value) => { backdrop.remove(); resolvePromise(value); };
    const backdrop = createElement('div', { className: 'projects-backdrop is-question' }, [createElement('div', { className: 'projects-question' }, [
      createElement('p', { text: message }),
      createButtonRow(choices.map((choice) => ({ label: choice.label, isDanger: choice.isDanger, onClick: () => answer(choice.value) }))),
    ])]);
    document.body.append(backdrop);
  });
}

/**
 * Exécute une action de la fenêtre, une à la fois, puis la redessine.
 * @param {string} actionName nom affiché en cas d'erreur
 * @param {() => Promise<any>} action action
 */
async function runAction(actionName, action) {
  if (isBusy) return;
  isBusy = true;
  try {
    await action();
  } catch (error) {
    console.error(actionName, error);
    alert(`${actionName} : ${error.message}`);
  } finally {
    isBusy = false;
  }
  await renderProjectsWindow();
}

/**
 * Ouvre un projet et ferme la fenêtre.
 * @param {() => Promise<any>} openAction ouverture
 */
async function openAndClose(openAction) {
  await openAction();
  closeProjectsWindow();
  fitScreenInView();
}

/**
 * Crée l'aperçu du premier écran d'un projet.
 * @param {object} record projet
 * @returns {HTMLElement} aperçu
 */
function createProjectPreview(record) {
  const previewElement = createElement('div', { className: 'project-preview' });
  try {
    const uiDocument = normalizeImportedDocument(record.document);
    const screen = uiDocument.screens[0];
    const scale = Math.min(PREVIEW_WIDTH / screen.size.width, PREVIEW_HEIGHT / screen.size.height);
    const screenElement = renderScreen(uiDocument, screen, { themeId: uiDocument.project.defaultTheme, isEditor: false });
    screenElement.style.transform = `scale(${scale})`;
    previewElement.append(createElement('div', { className: 'module-preview', style: { width: `${screen.size.width * scale}px`, height: `${screen.size.height * scale}px` } }, [screenElement]));
  } catch (error) {
    console.error('createProjectPreview', error);
    previewElement.textContent = 'Aperçu impossible';
  }
  return previewElement;
}

/**
 * Crée la carte d'un projet.
 * @param {object} record projet
 * @param {boolean} isLast vrai si c'est le seul projet
 * @returns {HTMLElement} carte
 */
function createProjectCard(record, isLast) {
  const isLastEmpty = isLast && isUntouchedProject(record);
  const isOpened = record.id === getOpenedProjectId();
  const openThisProject = () => runAction('Ouverture impossible', () => openAndClose(() => openProject(record.id)));
  const nameInput = createElement('input', { className: 'project-card-name', attributes: { type: 'text', title: 'Nom du projet', 'aria-label': 'Nom du projet' }, on: {
    change: () => {
      const newName = nameInput.value.trim();
      if (newName && newName !== record.name) runAction('Renommage impossible', () => renameProject(record.id, newName));
      else nameInput.value = record.name;
    } } });
  nameInput.value = record.name;
  const previewButton = createElement('button', { className: 'project-preview-button', attributes: { type: 'button', title: 'Ouvrir ce projet', 'aria-label': `Ouvrir ${record.name}` }, on: { click: openThisProject } }, [createProjectPreview(record)]);
  const fileText = record.fileSavedAt ? `Fichier : ${formatDate(record.fileSavedAt)}` : 'Jamais sauvegardé en fichier';
  return createElement('div', { className: `project-card${isOpened ? ' is-opened' : ''}` }, [
    previewButton, nameInput,
    createElement('div', { className: 'panel-hint', text: `${isOpened ? 'Ouvert · ' : ''}Modifié le ${formatDate(record.updatedAt)}` }),
    createElement('div', { className: `panel-hint${isRecordBackupDue(record) ? ' is-warning' : ''}`, text: fileText }),
    createButtonRow([
      ...(isOpened ? [] : [{ label: 'Ouvrir', onClick: openThisProject }]),
      { label: 'Sauvegarder', title: 'Enregistrer ce projet dans un fichier .uimnoob', onClick: () => runAction('Sauvegarde impossible', () => saveOneProjectFile(record)) },
      { label: 'Versions', title: 'Anciennes copies de ce projet', onClick: () => runAction('Versions illisibles', async () => { versionsProjectId = record.id; }) },
      { label: 'Dupliquer', onClick: () => runAction('Copie impossible', () => duplicateProject(record.id)) },
      ...(isLastEmpty ? [] : [{ label: 'Supprimer', isDanger: true, title: `Mettre à la corbeille (${TRASH_DAYS} jours)`, onClick: () => {
        const lastText = isLast ? '\nC\'est ton seul projet : un projet vide « MyApp » sera créé à la place.' : '';
        if (confirm(`Mettre « ${record.name} » à la corbeille ? Il y reste ${TRASH_DAYS} jours.${lastText}`)) runAction('Suppression impossible', () => moveProjectToTrash(record.id));
      } }]),
    ]),
    isLastEmpty ? createElement('div', { className: 'panel-hint', text: 'Seul projet, et vide : il faut toujours un projet ouvert. Il pourra être supprimé dès qu\'il y en aura un autre.' }) : null,
  ]);
}

/**
 * Crée la ligne d'un projet à la corbeille.
 * @param {object} record projet
 * @returns {HTMLElement} ligne
 */
function createTrashRow(record) {
  const daysLeft = Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - record.deletedAt) / 86400000));
  return createElement('div', { className: 'projects-row' }, [
    createElement('span', { text: `${record.name} · encore ${daysLeft} j` }),
    createButtonRow([
      { label: 'Récupérer', onClick: () => runAction('Récupération impossible', () => restoreProjectFromTrash(record.id)) },
      { label: 'Effacer', isDanger: true, onClick: () => {
        if (confirm(`Effacer définitivement « ${record.name} » et ses versions ? On ne peut pas revenir en arrière.`)) runAction('Effacement impossible', () => eraseProjectForever(record.id));
      } },
    ]),
  ]);
}

/**
 * Lit le texte d'un fichier importé ; dans un zip exporté, celui de ui.json.
 * @param {File} chosenFile fichier
 * @returns {Promise<string>} JSON
 */
async function readImportedText(chosenFile) {
  const bytes = new Uint8Array(await chosenFile.arrayBuffer());
  if (!isZipBytes(bytes)) return new TextDecoder().decode(bytes);
  const uiJsonBytes = await readZipFile(bytes, (path) => /(^|\/)ui\.json$/.test(path) && !path.startsWith('__MACOSX'));
  if (!uiJsonBytes) throw new Error('ce zip ne contient pas de ui.json');
  return new TextDecoder().decode(uiJsonBytes);
}

/**
 * Importe un fichier choisi : .uimnoob (projets), ui.json ou zip exporté (au choix : nouveau projet ou remplacement).
 */
export async function importFile() {
  const chosenFile = await pickFile();
  if (!chosenFile) return;
  await runAction('Import impossible', async () => {
    const fileText = await readImportedText(chosenFile);
    let fileValue;
    try { fileValue = JSON.parse(fileText); } catch (error) { throw new Error(`JSON illisible : ${error.message}`); }
    if (isProjectFile(fileValue)) { await importProjects(fileValue); return; }
    const uiDocument = parseUiSpecImport(fileText);
    const choice = await askChoice(`Importer « ${uiDocument.project.name} » :`, [
      { value: 'new', label: 'Nouveau projet' },
      ...(appState.isReadOnly || !getOpenedProjectId() ? [] : [{ value: 'replace', label: `Remplacer « ${appState.uiDocument.project.name} »` }]),
      { value: 'cancel', label: 'Annuler' },
    ]);
    if (choice === 'new') await openAndClose(async () => openProject((await addProject(uiDocument)).id));
    if (choice === 'replace') await openAndClose(() => replaceOpenedDocument(uiDocument, 'Avant import'));
  });
}

/**
 * Importe un fichier de projets et affiche le bilan.
 * @param {object} fileValue contenu
 */
async function importProjects(fileValue) {
  await listProjects();
  const report = await importProjectFile(fileValue,
    (importedProject, existingRecord) => askChoice(
      `« ${importedProject.name} » existe déjà ici${existingRecord.deletedAt ? ' (à la corbeille)' : ''}.\nFichier : modifié le ${formatDate(importedProject.updatedAt)}.\nCet appareil : modifié le ${formatDate(existingRecord.updatedAt)}.`,
      [{ value: 'both', label: 'Garder les deux' }, { value: 'replace', label: 'Remplacer', isDanger: true }, { value: 'skip', label: 'Ignorer' }]),
    (entry) => confirm(`« ${entry.name} » v${entry.version} (bibliothèque) modifié des deux côtés. Remplacer celui de cet appareil par celui du fichier ?`));
  alert(`${report.addedRecords.length} projet(s) ajouté(s), ${report.replacedCount} remplacé(s), ${report.skippedCount} ignoré(s) ou identique(s), ${report.moduleCount} module(s) et ${report.customWidgetCount} custom widget(s) ajouté(s) ou mis à jour.`);
  if (report.addedRecords.length === 1 && report.replacedCount === 0 && windowElement === null) {
    await openProject(report.addedRecords[0].id);
    fitScreenInView();
  }
}

/**
 * Crée la vue des versions d'un projet.
 * @param {object} record projet
 * @returns {Promise<HTMLElement[]>} contenu
 */
async function createVersionsView(record) {
  const versions = await readVersions(record.id);
  const isOpened = record.id === getOpenedProjectId() && !appState.isReadOnly;
  const nameInput = createElement('input', { attributes: { type: 'text', placeholder: 'Nom de la version (ex. avant refonte)' } });
  const goBack = () => runAction('Retour impossible', async () => { versionsProjectId = null; });
  return [
    createButtonRow([{ label: '← Projets', onClick: goBack }]),
    createElement('h3', { text: `Versions de « ${record.name} »` }),
    createElement('div', { className: 'panel-hint', text: 'Une copie automatique toutes les 10 minutes de travail (les 20 dernières). Les versions gardées restent. Restaurer garde d\'abord l\'état actuel.' }),
    isOpened ? createElement('div', { className: 'projects-row' }, [nameInput, createButtonRow([{ label: 'Garder une version', onClick: () =>
      runAction('Version impossible', () => keepVersion('named', nameInput.value.trim() || 'Version')) }])])
      : createElement('div', { className: 'panel-hint', text: 'Ouvre ce projet pour garder une version.' }),
    ...versions.map((version) => createElement('div', { className: 'projects-row' }, [
      createElement('span', { text: `${formatDate(version.createdAt)} · ${version.name || VERSION_KIND_LABELS[version.kind]}${version.kind === 'named' ? ' ★' : ''}` }),
      createButtonRow([
        { label: 'Restaurer', onClick: () => runAction('Restauration impossible', () => openAndClose(() => restoreVersion(version))) },
        { label: 'Effacer', isDanger: true, onClick: () => { if (confirm('Effacer cette version ?')) runAction('Effacement impossible', () => deleteVersion(version)); } },
      ]),
    ])),
    versions.length ? null : createElement('div', { className: 'panel-hint', text: 'Aucune version pour l\'instant.' }),
  ];
}

/**
 * Crée la liste des projets.
 * @param {object[]} records projets
 * @returns {HTMLElement[]} contenu
 */
function createProjectsView(records) {
  const activeRecords = records.filter((record) => !record.deletedAt);
  const trashRecords = records.filter((record) => record.deletedAt);
  const screenTemplates = TEMPLATE_CATEGORIES.find((category) => category.key === 'screen').templates;
  const newProjectSelect = createSelectElement('', [{ value: '', label: '+ Nouveau projet…' }, { value: 'empty', label: 'Projet vide' },
    ...Object.entries(screenTemplates).map(([templateKey, template]) => ({ value: `template:${templateKey}`, label: `Modèle : ${template.label}` }))],
  (choice) => { if (choice) runAction('Création impossible', () => openAndClose(() => createProject(choice === 'empty' ? null : choice.slice('template:'.length)))); });
  return [
    createElement('div', { className: 'projects-actions' }, [newProjectSelect, createButtonRow([
      { label: 'Importer un fichier…', title: 'Fichier .uimnoob, ui.json ou zip exporté', onClick: importFile },
      { label: 'Tout sauvegarder', title: 'Tous les projets et la bibliothèque de modules dans un fichier .uimnoob', onClick: () => runAction('Sauvegarde impossible', () => saveBackupFile(activeRecords)) },
    ])]),
    createElement('div', { className: 'panel-hint', text: 'Les projets sont gardés dans ce navigateur. Un fichier (Sauvegarder) les met à l\'abri et sert à passer de l\'iPad au PC.' }),
    createElement('div', { className: 'projects-grid' }, activeRecords.map((record) => createProjectCard(record, activeRecords.length === 1))),
    trashRecords.length ? createElement('details', { className: 'projects-trash' }, [createElement('summary', { text: `Corbeille (${trashRecords.length})` }), ...trashRecords.map(createTrashRow)]) : null,
  ];
}

/** Redessine la fenêtre si elle est ouverte. */
async function renderProjectsWindow() {
  if (!windowElement) return;
  const bodyElement = windowElement.querySelector('.projects-body');
  try {
    const records = await listProjects();
    const versionsRecord = records.find((record) => record.id === versionsProjectId);
    const content = versionsRecord ? await createVersionsView(versionsRecord) : createProjectsView(records);
    bodyElement.replaceChildren(...content.filter(Boolean));
  } catch (error) {
    console.error('renderProjectsWindow', error);
    bodyElement.replaceChildren(createElement('div', { className: 'panel-hint is-warning', text: `Projets illisibles : ${error.message}` }));
  }
}

/** Ferme la fenêtre (ou revient des versions à la liste si on appuie sur Échap). */
export function closeProjectsWindow() {
  windowElement?.remove();
  windowElement = null;
  versionsProjectId = null;
}

/** Ouvre la fenêtre Projets. */
export function openProjectsWindow() {
  if (windowElement) return;
  windowElement = createElement('div', { className: 'projects-backdrop' }, [createElement('div', { className: 'projects-window', attributes: { role: 'dialog', 'aria-label': 'Projets' } }, [
    createElement('div', { className: 'projects-header' }, [createElement('h2', { text: 'Projets' }),
      createElement('button', { text: 'Fermer', attributes: { type: 'button' }, on: { click: closeProjectsWindow } })]),
    createElement('div', { className: 'projects-body' }, [createElement('div', { className: 'panel-hint', text: 'Chargement…' })]),
  ])]);
  document.body.append(windowElement);
  renderProjectsWindow();
}
