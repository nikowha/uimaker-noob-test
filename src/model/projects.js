// Projets : projet ouvert, enregistrement automatique, versions, corbeille, protection entre onglets (PROTOTYPE).
import { appState, loadAppSettings, LEGACY_DOCUMENT_STORAGE_KEY, notifyChange, openDocument, setDocumentChangeHandler } from './store.js';
import { cloneJson, createEmptyDocument, normalizeImportedDocument } from './document.js';
import { buildTemplate } from './templates.js';
import { eraseProject, readAllProjects, readProject, readVersions, updateProject, writeProject, writeVersions } from '../io/projectDatabase.js';

const CURRENT_PROJECT_KEY = 'uimakerNoob.currentProjectId';
const EMERGENCY_KEY_PREFIX = 'uimakerNoob.emergency.';
const SAVE_DELAY_MS = 500;
const SAVE_RETRY_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_VERSION_LIMIT = 20;
const LOCK_ATTEMPTS = 4;
const LOCK_RETRY_MS = 250;
export const TRASH_DAYS = 30;
export const BACKUP_REMINDER_DAYS = 7;

/** Projet ouvert (null si la base est inaccessible) : enregistrement sans son document, qui est dans appState. */
let openedRecord = null;
let releaseOpenedLock = null;
let savedDocumentText = null;
let lastVersionAt = 0;
let isDirty = false;
let hasSaveError = false;
let changeCount = 0;
let saveTimerId = null;
let saveChain = Promise.resolve();
let statusListener = () => {};

/** @returns {string} identifiant unique (aussi sans HTTPS, en test local) */
function createUniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Lit une clé du stockage simple.
 * @param {Storage} storage stockage
 * @param {string} key clé
 * @returns {string|null} texte, ou null si absent ou inaccessible
 */
function readStorageText(storage, key) {
  try { return storage.getItem(key); } catch (error) { console.error('readStorageText', error); return null; }
}

/**
 * Écrit (ou efface) une clé du stockage simple.
 * @param {Storage} storage stockage
 * @param {string} key clé
 * @param {string|null} text texte, null pour effacer
 */
function writeStorageText(storage, key, text) {
  try { if (text === null) storage.removeItem(key); else storage.setItem(key, text); } catch (error) { console.warn('writeStorageText', error); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Témoin d'enregistrement
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Abonne le témoin d'enregistrement de la barre du haut.
 * @param {() => void} listener fonction appelée à chaque changement d'état
 */
export function subscribeToSaveStatus(listener) {
  statusListener = listener;
}

/** @returns {'readonly'|'failed'|'pending'|'saved'} état de l'enregistrement */
export function getSaveStatus() {
  if (appState.isReadOnly) return 'readonly';
  if (hasSaveError) return 'failed';
  return isDirty ? 'pending' : 'saved';
}

/** @returns {string|null} projet ouvert */
export function getOpenedProjectId() {
  return openedRecord?.id ?? null;
}

/** @returns {boolean} vrai si le projet ouvert n'a pas de fichier de sauvegarde récent */
export function isBackupDue() {
  return Boolean(openedRecord) && isRecordBackupDue(openedRecord);
}

/**
 * Indique si un projet a besoin d'une sauvegarde en fichier.
 * @param {object} record projet
 * @returns {boolean} vrai si modifié depuis une sauvegarde de plus de 7 jours
 */
export function isRecordBackupDue(record) {
  const lastSafeDate = record.fileSavedAt ?? record.createdAt;
  return record.updatedAt > lastSafeDate && Date.now() - lastSafeDate > BACKUP_REMINDER_DAYS * DAY_MS;
}

// ---------------------------------------------------------------------------------------------------------------------
// Verrous entre onglets
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Prend le verrou d'un projet.
 * @param {string} projectId projet
 * @param {number} [attempts] nombre d'essais (au rechargement, l'ancien onglet met un instant à le rendre)
 * @returns {Promise<(() => void)|null>} fonction qui rend le verrou, ou null si un autre onglet l'a
 */
async function acquireProjectLock(projectId, attempts = 1) {
  if (!navigator.locks) return () => {};
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolvePromise) => { setTimeout(resolvePromise, LOCK_RETRY_MS); });
    const release = await new Promise((resolvePromise) => {
      navigator.locks.request(`uimaker-noob-project-${projectId}`, { ifAvailable: true }, (lock) => {
        if (!lock) { resolvePromise(null); return undefined; }
        return new Promise((releaseLock) => resolvePromise(releaseLock));
      }).catch((error) => { console.error('acquireProjectLock', error); resolvePromise(() => {}); });
    });
    if (release) return release;
  }
  return null;
}

/**
 * Exécute un travail sur un projet, refusé s'il est ouvert dans un autre onglet.
 * @param {string} projectId projet
 * @param {() => Promise<any>} work travail
 * @returns {Promise<any>} résultat
 */
async function runWithProjectLock(projectId, work) {
  if (projectId === openedRecord?.id && !appState.isReadOnly) return work();
  const release = await acquireProjectLock(projectId);
  if (!release) throw new Error('ce projet est ouvert dans un autre onglet');
  try { return await work(); } finally { release(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Enregistrement automatique
// ---------------------------------------------------------------------------------------------------------------------

/** @returns {string} clé de la copie de secours du projet ouvert */
function getEmergencyKey() {
  return EMERGENCY_KEY_PREFIX + (openedRecord?.id ?? 'local');
}

/** Note un changement du document : copie de secours tout de suite, base un peu après. */
function handleDocumentChange() {
  changeCount += 1;
  isDirty = true;
  if (openedRecord) openedRecord.updatedAt = Date.now();
  writeStorageText(localStorage, getEmergencyKey(), JSON.stringify({ updatedAt: Date.now(), document: appState.uiDocument }));
  saveTimerId ??= setTimeout(() => { saveOpenedProject(); }, SAVE_DELAY_MS);
  statusListener();
}

/**
 * Enregistre le projet ouvert maintenant (les écritures se suivent).
 * @returns {Promise<boolean>} vrai si tout est enregistré
 */
export function saveOpenedProject() {
  clearTimeout(saveTimerId);
  saveTimerId = null;
  saveChain = saveChain.then(writeOpenedProject);
  return saveChain;
}

/** @returns {Promise<boolean>} vrai si tout est enregistré */
async function writeOpenedProject() {
  if (!isDirty) return true;
  const savedCount = changeCount;
  const savedRecord = openedRecord;
  try {
    if (!savedRecord) throw new Error('base de données inaccessible');
    const documentText = JSON.stringify(appState.uiDocument);
    const isVersionDue = savedDocumentText !== null && savedDocumentText !== documentText && Date.now() - lastVersionAt >= AUTO_VERSION_INTERVAL_MS;
    const version = isVersionDue ? createVersionRecord(savedRecord.id, JSON.parse(savedDocumentText), 'auto', '') : null;
    await writeProject({ ...savedRecord, name: appState.uiDocument.project.name, document: JSON.parse(documentText) }, version);
    savedDocumentText = documentText;
    hasSaveError = false;
    if (changeCount === savedCount) {
      isDirty = false;
      writeStorageText(localStorage, EMERGENCY_KEY_PREFIX + savedRecord.id, null);
    }
    if (version) {
      lastVersionAt = version.createdAt;
      pruneVersions(savedRecord.id).catch((error) => console.error('pruneVersions', error));
    }
  } catch (error) {
    console.error('writeOpenedProject', error);
    hasSaveError = true;
    saveTimerId ??= setTimeout(() => { saveOpenedProject(); }, SAVE_RETRY_MS);
  }
  statusListener();
  return !isDirty;
}

// ---------------------------------------------------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Fabrique une version.
 * @param {string} projectId projet
 * @param {object} uiDocument document à garder
 * @param {'auto'|'safety'|'named'} kind automatique, sécurité (avant restauration ou remplacement), ou gardée par l'utilisateur
 * @param {string} name nom affiché
 * @returns {object} version
 */
function createVersionRecord(projectId, uiDocument, kind, name) {
  return { versionId: createUniqueId(), projectId, kind, name, createdAt: Date.now(), document: cloneJson(uiDocument) };
}

/**
 * Ne garde que les dernières versions automatiques (celles gardées par l'utilisateur restent).
 * @param {string} projectId projet
 */
async function pruneVersions(projectId) {
  const removableVersions = (await readVersions(projectId)).filter((version) => version.kind !== 'named').slice(AUTO_VERSION_LIMIT);
  if (removableVersions.length) await writeVersions([], removableVersions.map((version) => version.versionId));
}

/**
 * Garde une copie du projet ouvert.
 * @param {'safety'|'named'} kind type de version
 * @param {string} name nom affiché
 */
export async function keepVersion(kind, name) {
  if (!openedRecord || appState.isReadOnly) throw new Error('projet en lecture seule ou non enregistré');
  const projectId = openedRecord.id;
  const version = createVersionRecord(projectId, appState.uiDocument, kind, name);
  await writeVersions([version]);
  lastVersionAt = version.createdAt;
  await pruneVersions(projectId);
}

/**
 * Efface une version.
 * @param {object} version version
 */
export function deleteVersion(version) {
  return writeVersions([], [version.versionId]);
}

/**
 * Remplace le document du projet ouvert, après une copie de sécurité. L'historique repart de zéro.
 * @param {object} uiDocument nouveau document
 * @param {string} versionName nom de la copie de sécurité
 */
export async function replaceOpenedDocument(uiDocument, versionName) {
  const normalizedDocument = normalizeImportedDocument(uiDocument);
  await keepVersion('safety', versionName);
  openDocument(normalizedDocument, appState.isReadOnly);
  handleDocumentChange();
  await saveOpenedProject();
}

/**
 * Remet une ancienne version d'un projet (ouvre le projet si besoin).
 * @param {object} version version
 */
export async function restoreVersion(version) {
  if (openedRecord?.id !== version.projectId) await openProject(version.projectId);
  await replaceOpenedDocument(version.document, 'Avant restauration');
}

// ---------------------------------------------------------------------------------------------------------------------
// Ouvrir et gérer les projets
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Fabrique un enregistrement de projet.
 * @param {object} uiDocument document
 * @returns {object} projet
 */
function createProjectRecord(uiDocument) {
  const now = Date.now();
  return { id: createUniqueId(), name: uiDocument.project.name, createdAt: now, updatedAt: now, fileSavedAt: null, deletedAt: null, document: uiDocument };
}

/**
 * Choisit un nom libre parmi les projets.
 * @param {string} baseName nom voulu
 * @param {object[]} records projets existants
 * @returns {string} nom, avec un numéro s'il est pris
 */
function chooseFreeName(baseName, records) {
  const usedNames = new Set(records.map((record) => record.name));
  if (!usedNames.has(baseName)) return baseName;
  let copyNumber = 2;
  while (usedNames.has(`${baseName} ${copyNumber}`)) copyNumber += 1;
  return `${baseName} ${copyNumber}`;
}

/**
 * Affiche un projet déjà lu.
 * @param {object} record projet
 * @param {object} uiDocument document normalisé
 * @param {(() => void)|null} release rend le verrou (null = lecture seule)
 * @param {object|null} newestVersion dernière version gardée
 */
function showProject(record, uiDocument, release, newestVersion) {
  releaseOpenedLock?.();
  releaseOpenedLock = release;
  const { document: storedDocument, ...recordWithoutDocument } = record;
  openedRecord = recordWithoutDocument;
  savedDocumentText = JSON.stringify(storedDocument);
  lastVersionAt = newestVersion?.createdAt ?? record.createdAt;
  isDirty = false;
  hasSaveError = false;
  openDocument(uiDocument, !release);
  writeStorageText(localStorage, CURRENT_PROJECT_KEY, record.id);
  writeStorageText(sessionStorage, CURRENT_PROJECT_KEY, record.id);
  statusListener();
}

/**
 * Ouvre un projet ; l'actuel est enregistré d'abord.
 * @param {string} projectId projet
 */
export async function openProject(projectId) {
  if (projectId === openedRecord?.id && !appState.isReadOnly) return;
  const release = await acquireProjectLock(projectId, LOCK_ATTEMPTS);
  try {
    if (openedRecord && !appState.isReadOnly && !(await saveOpenedProject())) throw new Error('le projet actuel n\'a pas pu être enregistré');
    const record = await readProject(projectId);
    if (!record) throw new Error('projet introuvable');
    const newestVersion = (await readVersions(projectId))[0] ?? null;
    // Copie de secours plus récente que la base (fermeture brutale) : on la reprend.
    let emergencyCopy = null;
    if (release) {
      try { emergencyCopy = JSON.parse(readStorageText(localStorage, EMERGENCY_KEY_PREFIX + projectId) ?? 'null'); } catch (error) { console.error('openProject (secours)', error); }
    }
    const isEmergencyNewer = emergencyCopy && emergencyCopy.updatedAt >= record.updatedAt;
    showProject(record, normalizeImportedDocument(isEmergencyNewer ? emergencyCopy.document : record.document), release, newestVersion);
    if (isEmergencyNewer) handleDocumentChange();
  } catch (error) {
    release?.();
    throw error;
  }
}

/**
 * Essaie de passer en écriture un projet ouvert en lecture seule (il est relu).
 * @returns {Promise<boolean>} vrai si c'est fait
 */
export async function retryWritableProject() {
  if (!appState.isReadOnly || !openedRecord) return true;
  await openProject(openedRecord.id);
  return !appState.isReadOnly;
}

/**
 * Ajoute un projet sans l'ouvrir.
 * @param {object} uiDocument document
 * @param {object} [recordChanges] champs imposés (import)
 * @returns {Promise<object>} projet
 */
export async function addProject(uiDocument, recordChanges = {}) {
  const normalizedDocument = normalizeImportedDocument(uiDocument);
  normalizedDocument.project.name = chooseFreeName(normalizedDocument.project.name || 'MyApp', (await readAllProjects()).filter((record) => !record.deletedAt));
  const record = { ...createProjectRecord(normalizedDocument), ...recordChanges };
  await writeProject(record);
  return record;
}

/**
 * Crée un projet et l'ouvre.
 * @param {string|null} templateKey modèle d'écran (null = projet vide)
 */
export async function createProject(templateKey = null) {
  const uiDocument = createEmptyDocument();
  if (templateKey) {
    const { createdNode } = buildTemplate(uiDocument, 'screen', templateKey);
    uiDocument.screens = Array.isArray(createdNode) ? createdNode : [createdNode];
  }
  await openProject((await addProject(uiDocument)).id);
}

/** @returns {Promise<object[]>} projets, corbeille comprise, le plus récent d'abord (celui ouvert à jour) */
export async function listProjects() {
  if (openedRecord && !appState.isReadOnly) await saveOpenedProject();
  return (await readAllProjects()).sort((first, second) => second.updatedAt - first.updatedAt);
}

/**
 * Renomme un projet.
 * @param {string} projectId projet
 * @param {string} name nom
 */
export function renameProject(projectId, name) {
  return runWithProjectLock(projectId, async () => {
    if (projectId === openedRecord?.id) {
      appState.uiDocument.project.name = name;
      handleDocumentChange();
      if (!(await saveOpenedProject())) throw new Error('enregistrement impossible');
      notifyChange();
      return;
    }
    await updateProject(projectId, (record) => { record.name = name; record.document.project.name = name; record.updatedAt = Date.now(); });
  });
}

/**
 * Duplique un projet (sans ses versions).
 * @param {string} projectId projet
 */
export async function duplicateProject(projectId) {
  if (projectId === openedRecord?.id && !appState.isReadOnly) await saveOpenedProject();
  const record = await readProject(projectId);
  if (record) await addProject(record.document);
}

/**
 * Met un projet à la corbeille ; si c'est celui ouvert, en ouvre un autre (ou un nouveau).
 * @param {string} projectId projet
 */
export async function moveProjectToTrash(projectId) {
  if (projectId !== openedRecord?.id) {
    await runWithProjectLock(projectId, () => updateProject(projectId, (record) => { record.deletedAt = Date.now(); }));
    return;
  }
  if (appState.isReadOnly) throw new Error('ce projet est ouvert dans un autre onglet');
  const otherProject = (await listProjects()).find((record) => record.id !== projectId && !record.deletedAt);
  if (otherProject) await openProject(otherProject.id); else await createProject();
  await runWithProjectLock(projectId, () => updateProject(projectId, (record) => { record.deletedAt = Date.now(); }));
}

/**
 * Ressort un projet de la corbeille.
 * @param {string} projectId projet
 */
export function restoreProjectFromTrash(projectId) {
  return updateProject(projectId, (record) => { record.deletedAt = null; });
}

/**
 * Efface définitivement un projet de la corbeille.
 * @param {string} projectId projet
 */
export function eraseProjectForever(projectId) {
  return runWithProjectLock(projectId, async () => {
    await eraseProject(projectId);
    writeStorageText(localStorage, EMERGENCY_KEY_PREFIX + projectId, null);
  });
}

/**
 * Note que des projets ont été enregistrés dans un fichier.
 * @param {object[]} savedRecords projets tels qu'ils sont dans le fichier
 */
export async function markFileSaved(savedRecords) {
  for (const savedRecord of savedRecords) {
    if (savedRecord.id === openedRecord?.id) openedRecord.fileSavedAt = Date.now();
    await updateProject(savedRecord.id, (record) => { record.fileSavedAt = Date.now(); });
  }
  statusListener();
}

/**
 * Remplace un projet existant par celui d'un fichier, après une copie de sécurité.
 * @param {object} importedProject projet du fichier
 */
export function replaceProject(importedProject) {
  return runWithProjectLock(importedProject.id, async () => {
    if (importedProject.id === openedRecord?.id) {
      await replaceOpenedDocument(importedProject.document, 'Avant import');
      return;
    }
    const record = await readProject(importedProject.id);
    const safetyVersion = createVersionRecord(record.id, record.document, 'safety', 'Avant import');
    await writeProject({ ...record, name: importedProject.name, updatedAt: importedProject.updatedAt, deletedAt: null, document: importedProject.document }, safetyVersion);
    writeStorageText(localStorage, EMERGENCY_KEY_PREFIX + record.id, null);
    await pruneVersions(record.id);
  });
}

/**
 * Ajoute à un projet les versions gardées qui viennent d'un fichier.
 * @param {string} projectId projet
 * @param {object[]} versions versions du fichier
 * @param {boolean} areNewVersions vrai pour en faire des copies (projet gardé en double)
 */
export function addImportedVersions(projectId, versions, areNewVersions) {
  return writeVersions(versions.map((version) => ({ ...version, projectId, kind: 'named', versionId: areNewVersions ? createUniqueId() : version.versionId })));
}

// ---------------------------------------------------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------------------------------------------------

/** @returns {object|null} document de l'ancienne sauvegarde unique (elle n'est jamais effacée) */
function readLegacyDocument() {
  try {
    const legacyText = localStorage.getItem(LEGACY_DOCUMENT_STORAGE_KEY);
    return legacyText ? normalizeImportedDocument(JSON.parse(legacyText)) : null;
  } catch (error) {
    console.error('readLegacyDocument', error);
    return null;
  }
}

/**
 * Efface les projets restés plus de 30 jours à la corbeille.
 * @param {object[]} records projets
 */
async function emptyOldTrash(records) {
  for (const record of records) {
    if (record.deletedAt && Date.now() - record.deletedAt > TRASH_DAYS * DAY_MS) {
      await eraseProjectForever(record.id).catch((error) => console.error('emptyOldTrash', error));
    }
  }
}

/** Choisit et ouvre le projet de départ : le dernier ouvert, l'ancien projet unique, ou un nouveau. */
async function openFirstProject() {
  const records = await readAllProjects();
  await emptyOldTrash(records);
  const usableRecords = records.filter((record) => !record.deletedAt).sort((first, second) => second.updatedAt - first.updatedAt);
  const lastIds = [readStorageText(sessionStorage, CURRENT_PROJECT_KEY), readStorageText(localStorage, CURRENT_PROJECT_KEY)];
  const orderedRecords = [...lastIds.map((lastId) => usableRecords.find((record) => record.id === lastId)).filter(Boolean), ...usableRecords];
  for (const record of orderedRecords) {
    try { await openProject(record.id); return; } catch (error) { console.error(`openFirstProject (${record.name})`, error); }
  }
  if (records.length > 0 || !readLegacyDocument()) { await createProject(); return; }
  // Deux onglets au même moment : un seul reprend l'ancien projet.
  const importLegacy = async () => {
    const existingRecords = await readAllProjects();
    return existingRecords[0] ?? addProject(readLegacyDocument());
  };
  const record = navigator.locks ? await navigator.locks.request('uimaker-noob-legacy-import', importLegacy) : await importLegacy();
  await openProject(record.id);
}

/** Démarre la gestion des projets (à attendre avant d'afficher l'application). */
export async function startProjects() {
  loadAppSettings();
  setDocumentChangeHandler(handleDocumentChange);
  try {
    await openFirstProject();
  } catch (error) {
    console.error('startProjects', error);
    let localCopy = null;
    try { localCopy = JSON.parse(readStorageText(localStorage, `${EMERGENCY_KEY_PREFIX}local`) ?? 'null'); } catch (parseError) { console.error('startProjects (secours)', parseError); }
    openDocument(localCopy ? normalizeImportedDocument(localCopy.document) : readLegacyDocument() ?? createEmptyDocument(), false);
    hasSaveError = true;
    setTimeout(() => alert(`Stockage inaccessible (${error.message}) : tes projets ne peuvent pas être lus. Recharge la page ; en attendant, exporte ce que tu fais.`), 0);
  }
  const saveNow = () => { if (isDirty && !appState.isReadOnly) saveOpenedProject(); };
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow();
    else if (appState.isReadOnly) retryWritableProject().catch((error) => console.error('retryWritableProject', error));
  });
}
