// Fenêtre « Exporter » : zip complet ou ui.json seul, vérification, préparation puis enregistrement (PROTOTYPE).
import { createElement, saveFile } from '../utils/dom.js';
import { appState } from '../model/store.js';
import { cloneJson } from '../model/document.js';
import { checkUiSpec } from '../model/specCheck.js';
import { buildUiSpecExport } from '../io/uispecExport.js';
import { buildSpecPackage, loadSpecFiles } from '../io/specPackage.js';
import { createButtonRow, createCheckboxField, createSelectField } from './fields.js';

/** Derniers choix, gardés tant que l'app est ouverte. */
const exportChoices = { kind: 'zip', scale: '1', areAllThemes: true };

let windowElement = null;
let bodyElement = null;
/** Numéro de la préparation en cours : changer de numéro arrête la précédente. */
let preparationNumber = 0;

/** Ferme la fenêtre (arrête une préparation en cours). */
export function closeExportWindow() {
  preparationNumber += 1;
  windowElement?.remove();
  windowElement = null;
}

/** @returns {boolean} vrai si la fenêtre est ouverte */
export function isExportWindowOpen() {
  return windowElement !== null;
}

/**
 * Liste de problèmes repliable.
 * @param {string} title titre
 * @param {string[]} problems problèmes
 * @returns {HTMLElement|null} liste
 */
function createProblemList(title, problems) {
  if (problems.length === 0) return null;
  return createElement('details', { className: 'export-problems', attributes: { open: problems.length <= 6 } }, [
    createElement('summary', { text: `${title} (${problems.length})` }), createElement('ul', {}, problems.map((problem) => createElement('li', { text: problem })))]);
}

/** Affiche les réglages. */
function showChoices() {
  const themeCount = Object.keys(appState.uiDocument.themes).length;
  const isZip = exportChoices.kind === 'zip';
  bodyElement.replaceChildren(...[
    createSelectField('Export', exportChoices.kind, [{ value: 'zip', label: 'Zip complet (pour une session qui code)' }, { value: 'json', label: 'ui.json seul' }],
      (kind) => { exportChoices.kind = kind; showChoices(); }),
    isZip ? createElement('div', { className: 'panel-hint', text: 'ui.json, schéma, guide, icônes SVG, et une image PNG par écran, par module et par état de module.' }) : null,
    isZip ? createSelectField('Taille des images', exportChoices.scale, [{ value: '1', label: '1×' }, { value: '2', label: '2× (plus net, plus lourd)' }], (scale) => { exportChoices.scale = scale; }) : null,
    isZip && themeCount > 1 ? createCheckboxField(`Écrans dans les ${themeCount} thèmes (sinon : thème par défaut)`, exportChoices.areAllThemes, (isChecked) => { exportChoices.areAllThemes = isChecked; }) : null,
    createButtonRow([{ label: 'Préparer', onClick: prepareExport }]),
  ].filter(Boolean));
}

/** Vérifie le projet et fabrique le fichier, puis propose de l'enregistrer. */
async function prepareExport() {
  preparationNumber += 1;
  const currentNumber = preparationNumber;
  const isStopped = () => preparationNumber !== currentNumber;
  const progressElement = createElement('progress', { attributes: { max: 1, value: 0 } });
  const progressText = createElement('div', { className: 'panel-hint', text: 'Vérification…' });
  bodyElement.replaceChildren(progressText, progressElement, createButtonRow([{ label: 'Annuler', onClick: () => { preparationNumber += 1; showChoices(); } }]));
  try {
    const uiDocument = cloneJson(appState.uiDocument);
    const [uiSpec, specFiles] = await Promise.all([buildUiSpecExport(uiDocument), loadSpecFiles()]);
    const checkReport = checkUiSpec(uiSpec, specFiles.schemaText ? JSON.parse(specFiles.schemaText) : null);
    const baseName = (uiDocument.project.name || 'project').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    let result = { fileName: `${baseName}_ui.json`, mimeType: 'application/json', content: JSON.stringify(uiSpec, null, 2), problems: [], summary: 'ui.json prêt.' };
    if (exportChoices.kind === 'zip') {
      const specPackage = await buildSpecPackage(uiDocument, uiSpec, specFiles, { scale: Number(exportChoices.scale), areAllThemes: exportChoices.areAllThemes, isCancelled: isStopped,
        onProgress: (doneCount, totalCount) => { progressElement.max = Math.max(1, totalCount); progressElement.value = doneCount; progressText.textContent = `Images : ${doneCount} / ${totalCount}`; } });
      if (!specPackage) return;
      result = { fileName: `${baseName}_uispec.zip`, mimeType: 'application/zip', content: specPackage.zipBlob, problems: specPackage.problems,
        summary: `Zip prêt : ${specPackage.imageCount} image(s), ${Math.max(1, Math.round(specPackage.zipBlob.size / 1024))} Ko.` };
    }
    if (!isStopped()) showResult(result, checkReport);
  } catch (error) {
    console.error('prepareExport', error);
    if (isStopped()) return;
    showChoices();
    alert(`Export impossible : ${error.message}`);
  }
}

/**
 * Affiche le bilan et le bouton d'enregistrement (sur iPad, le partage doit suivre directement un toucher).
 * @param {{fileName: string, mimeType: string, content: string|Blob, problems: string[], summary: string}} result fichier prêt
 * @param {{errors: string[], warnings: string[]}} checkReport vérification
 */
function showResult(result, checkReport) {
  const isClean = checkReport.errors.length + checkReport.warnings.length + result.problems.length === 0;
  bodyElement.replaceChildren(...[
    createElement('div', { text: `${result.summary}${isClean ? ' Aucun problème trouvé.' : ''}` }),
    createProblemList('À corriger', checkReport.errors),
    createProblemList('Noms à revoir', checkReport.warnings),
    createProblemList('Fichiers', result.problems),
    isClean ? null : createElement('div', { className: 'panel-hint', text: 'Tu peux enregistrer quand même.' }),
    createButtonRow([
      { label: 'Enregistrer', title: result.fileName, onClick: async () => {
        try {
          if (await saveFile(result.fileName, result.content, result.mimeType)) closeExportWindow();
        } catch (error) {
          console.error('showResult', error);
          alert(`Enregistrement impossible : ${error.message}`);
        }
      } },
      { label: '← Réglages', onClick: showChoices },
    ]),
  ].filter(Boolean));
}

/** Ouvre la fenêtre Exporter. */
export function openExportWindow() {
  if (windowElement) return;
  bodyElement = createElement('div', { className: 'projects-body' });
  windowElement = createElement('div', { className: 'projects-backdrop' }, [createElement('div', { className: 'projects-window is-small', attributes: { role: 'dialog', 'aria-label': 'Exporter' } }, [
    createElement('div', { className: 'projects-header' }, [createElement('h2', { text: 'Exporter' }),
      createElement('button', { text: 'Fermer', attributes: { type: 'button' }, on: { click: closeExportWindow } })]),
    bodyElement,
  ])]);
  document.body.append(windowElement);
  showChoices();
}
