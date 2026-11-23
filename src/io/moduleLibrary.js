// Bibliothèque de modules, commune à tous les projets de cet appareil (IndexedDB) — PROTOTYPE.
import { MODULE_LIBRARY_FORMAT, MODULE_LIBRARY_FORMAT_VERSION, parseModuleFile } from '../model/modules.js';
import { notifyChange } from '../model/store.js';

const DATABASE_NAME = 'uimaker-noob';
const STORE_NAME = 'modules';
const entriesById = new Map();
let databasePromise = null;

/** @returns {Promise<IDBDatabase>} base ouverte */
function openDatabase() {
  databasePromise ??= new Promise((resolvePromise, rejectPromise) => {
    const openRequest = indexedDB.open(DATABASE_NAME, 1);
    openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(STORE_NAME, { keyPath: 'libraryId' });
    openRequest.onsuccess = () => resolvePromise(openRequest.result);
    openRequest.onerror = () => { databasePromise = null; rejectPromise(openRequest.error); };
  });
  return databasePromise;
}

/**
 * Exécute une écriture et attend qu'elle soit enregistrée.
 * @param {(objectStore: IDBObjectStore) => void} writeToStore écriture
 */
async function runWrite(writeToStore) {
  const database = await openDatabase();
  await new Promise((resolvePromise, rejectPromise) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.oncomplete = () => resolvePromise();
    transaction.onerror = () => rejectPromise(transaction.error);
    transaction.onabort = () => rejectPromise(transaction.error);
    writeToStore(transaction.objectStore(STORE_NAME));
  });
}

/** Charge la bibliothèque et demande un stockage durable. */
export async function loadModuleLibrary() {
  const database = await openDatabase();
  const storedEntries = await new Promise((resolvePromise, rejectPromise) => {
    const readRequest = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    readRequest.onsuccess = () => resolvePromise(readRequest.result);
    readRequest.onerror = () => rejectPromise(readRequest.error);
  });
  entriesById.clear();
  for (const entry of storedEntries) entriesById.set(entry.libraryId, entry);
  navigator.storage?.persist?.().catch(() => false);
  notifyChange();
}

/** @returns {object[]} modules triés par catégorie puis par nom */
export function listLibraryEntries() {
  return [...entriesById.values()].sort((first, second) => `${first.category}|${first.name}`.localeCompare(`${second.category}|${second.name}`));
}

/**
 * Renvoie un module de la bibliothèque.
 * @param {string} libraryId module
 * @returns {object|undefined} entrée
 */
export function getLibraryEntry(libraryId) {
  return entriesById.get(libraryId);
}

/**
 * Ajoute ou remplace un module.
 * @param {object} entry entrée
 */
export async function putLibraryEntry(entry) {
  await runWrite((objectStore) => objectStore.put(entry));
  entriesById.set(entry.libraryId, entry);
  notifyChange();
}

/**
 * Supprime un module de la bibliothèque (les copies dans les projets restent).
 * @param {string} libraryId module
 */
export async function deleteLibraryEntry(libraryId) {
  await runWrite((objectStore) => objectStore.delete(libraryId));
  entriesById.delete(libraryId);
  notifyChange();
}

/**
 * Texte d'un fichier .uimodules.
 * @param {object[]} entries modules
 * @returns {string} JSON
 */
export function createModuleFileText(entries) {
  return JSON.stringify({ format: MODULE_LIBRARY_FORMAT, formatVersion: MODULE_LIBRARY_FORMAT_VERSION, modules: entries }, null, 2);
}

/**
 * Importe un fichier : ajoute les nouveaux modules, remplace ceux dont la version est plus ancienne.
 * @param {string} fileText contenu
 * @returns {Promise<{addedCount: number, skippedCount: number}>} bilan
 */
export async function importModuleFile(fileText) {
  const importedEntries = parseModuleFile(fileText);
  const keptEntries = importedEntries.filter((entry) => !entriesById.has(entry.libraryId) || entriesById.get(entry.libraryId).version < entry.version);
  await runWrite((objectStore) => keptEntries.forEach((entry) => objectStore.put(entry)));
  for (const entry of keptEntries) entriesById.set(entry.libraryId, entry);
  notifyChange();
  return { addedCount: keptEntries.length, skippedCount: importedEntries.length - keptEntries.length };
}
