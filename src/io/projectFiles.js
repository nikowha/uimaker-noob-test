// Fichiers .uimnoob : un projet, ou tous les projets et la bibliothèque de modules (PROTOTYPE).
import { normalizeImportedDocument } from '../model/document.js';
import { addImportedVersions, addProject, markFileSaved, replaceProject } from '../model/projects.js';
import { createModuleFileText, importModuleFile, listLibraryEntries } from './moduleLibrary.js';
import { readAllProjects, readVersions } from './projectDatabase.js';
import { saveFile } from '../utils/dom.js';

const PROJECT_FILE_FORMAT = 'uimaker-noob-projects';
const PROJECT_FILE_FORMAT_VERSION = '1';

/**
 * Enregistre des projets dans un fichier .uimnoob (avec leurs versions gardées par l'utilisateur).
 * @param {object[]} records projets
 * @param {object[]} moduleEntries modules de la bibliothèque à joindre
 * @param {string} baseName nom du fichier sans extension
 */
async function saveProjectFile(records, moduleEntries, baseName) {
  const projects = [];
  for (const record of records) {
    const versions = (await readVersions(record.id)).filter((version) => version.kind === 'named');
    projects.push({ id: record.id, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt, document: record.document, versions });
  }
  const fileText = JSON.stringify({ format: PROJECT_FILE_FORMAT, formatVersion: PROJECT_FILE_FORMAT_VERSION, savedAt: new Date().toISOString(), projects, modules: moduleEntries });
  const isSaved = await saveFile(`${baseName.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.uimnoob`, fileText, 'application/json');
  if (isSaved) await markFileSaved(records);
}

/**
 * Enregistre un projet dans un fichier.
 * @param {object} record projet
 */
export function saveOneProjectFile(record) {
  return saveProjectFile([record], [], record.name);
}

/**
 * Enregistre tous les projets et la bibliothèque de modules dans un fichier.
 * @param {object[]} records projets
 */
export function saveBackupFile(records) {
  return saveProjectFile(records, listLibraryEntries(), `UImaker_noob_backup_${new Date().toISOString().slice(0, 10)}`);
}

/**
 * Indique si un contenu JSON est un fichier de projets.
 * @param {any} fileValue contenu
 * @returns {boolean} vrai pour un .uimnoob
 */
export function isProjectFile(fileValue) {
  return fileValue?.format === PROJECT_FILE_FORMAT;
}

/**
 * Vérifie tout le fichier avant de rien changer.
 * @param {any} fileValue contenu
 * @returns {object[]} projets prêts à importer
 */
function checkProjects(fileValue) {
  if (!Array.isArray(fileValue.projects)) throw new Error('Aucun projet dans ce fichier');
  return fileValue.projects.map((project) => {
    if (typeof project?.id !== 'string' || !project.id) throw new Error('Projet sans identifiant');
    const uiDocument = normalizeImportedDocument(project.document);
    const name = String(uiDocument.project.name || project.name || 'MyApp');
    uiDocument.project.name = name;
    const versions = (Array.isArray(project.versions) ? project.versions : []).map((version) => ({
      versionId: String(version.versionId), name: String(version.name ?? ''), createdAt: Number(version.createdAt) || Date.now(), document: normalizeImportedDocument(version.document) }));
    return { id: project.id, name, createdAt: Number(project.createdAt) || Date.now(), updatedAt: Number(project.updatedAt) || Date.now(), document: uiDocument, versions };
  });
}

/**
 * Importe un fichier de projets.
 * @param {any} fileValue contenu
 * @param {(importedProject: object, existingRecord: object) => Promise<'replace'|'both'|'skip'>} askConflict question posée quand un projet existe déjà
 * @param {(entry: object) => boolean} shouldReplaceModule question posée quand un module diffère
 * @returns {Promise<{addedRecords: object[], replacedCount: number, skippedCount: number, moduleCount: number}>} bilan
 */
export async function importProjectFile(fileValue, askConflict, shouldReplaceModule) {
  const importedProjects = checkProjects(fileValue);
  const report = { addedRecords: [], replacedCount: 0, skippedCount: 0, moduleCount: 0 };
  for (const importedProject of importedProjects) {
    const { versions, ...project } = importedProject;
    const existingRecord = (await readAllProjects()).find((record) => record.id === project.id);
    if (!existingRecord) {
      report.addedRecords.push(await addProject(project.document, { id: project.id, createdAt: project.createdAt, updatedAt: project.updatedAt, fileSavedAt: Date.now() }));
      await addImportedVersions(project.id, versions, false);
      continue;
    }
    const isSame = !existingRecord.deletedAt && JSON.stringify(normalizeImportedDocument(existingRecord.document)) === JSON.stringify(project.document);
    const choice = isSame ? 'skip' : await askConflict(project, existingRecord);
    if (choice === 'replace') {
      await replaceProject(project);
      await addImportedVersions(project.id, versions, false);
      report.replacedCount += 1;
    } else if (choice === 'both') {
      const record = await addProject(project.document, { createdAt: project.createdAt, updatedAt: project.updatedAt });
      await addImportedVersions(record.id, versions, true);
      report.addedRecords.push(record);
    } else report.skippedCount += 1;
  }
  if (Array.isArray(fileValue.modules) && fileValue.modules.length) {
    report.moduleCount = (await importModuleFile(createModuleFileText(fileValue.modules), shouldReplaceModule)).addedCount;
  }
  return report;
}
