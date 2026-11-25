// Bibliothèque de custom widgets, commune à tous les projets de cet appareil (IndexedDB) — PROTOTYPE.
import { checkCustomWidget } from '../model/customWidgets.js';
import { notifyChange } from '../model/store.js';

const DATABASE_NAME = 'uimaker-noob-custom-widgets';
const STORE_NAME = 'customWidgets';
const entriesById = new Map();
let databasePromise = null;

/** @returns {Promise<IDBDatabase>} base ouverte */
function openDatabase() {
  databasePromise ??= new Promise((resolvePromise, rejectPromise) => {
    const openRequest = indexedDB.open(DATABASE_NAME, 1);
    openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(STORE_NAME, { keyPath: 'libraryId' });
    openRequest.onsuccess = () => { openRequest.result.onclose = () => { databasePromise = null; }; resolvePromise(openRequest.result); };
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

/** Charge la bibliothèque. */
export async function loadCustomWidgetLibrary() {
  const database = await openDatabase();
  const storedEntries = await new Promise((resolvePromise, rejectPromise) => {
    const readRequest = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    readRequest.onsuccess = () => resolvePromise(readRequest.result);
    readRequest.onerror = () => rejectPromise(readRequest.error);
  });
  entriesById.clear();
  for (const entry of storedEntries) entriesById.set(entry.libraryId, entry);
  notifyChange();
}

/** @returns {object[]} custom widgets triés par nom */
export function listCustomWidgetEntries() {
  return [...entriesById.values()].sort((first, second) => first.name.localeCompare(second.name));
}

/**
 * Renvoie un custom widget de la bibliothèque.
 * @param {string} libraryId identifiant
 * @returns {object|undefined} définition
 */
export function getCustomWidgetEntry(libraryId) {
  return entriesById.get(libraryId);
}

/**
 * Ajoute une définition ; si elle existe déjà, la remplace quand elle est plus récente, sinon demande.
 * @param {object} definition définition vérifiée
 * @param {(entry: object, existingEntry: object) => boolean} shouldReplace question posée si la version n'est pas plus récente
 * @returns {Promise<boolean>} vrai si elle a été écrite
 */
export async function putCustomWidgetEntry(definition, shouldReplace) {
  const existingEntry = entriesById.get(definition.libraryId);
  if (existingEntry) {
    const withoutDate = (entry) => JSON.stringify({ ...entry, updatedAt: '' });
    if (withoutDate(existingEntry) === withoutDate(definition)) return false;
    if (definition.version <= existingEntry.version && !shouldReplace(definition, existingEntry)) return false;
  }
  await runWrite((objectStore) => objectStore.put(definition));
  entriesById.set(definition.libraryId, definition);
  notifyChange();
  return true;
}

/**
 * Supprime une définition de la bibliothèque (les projets gardent la leur).
 * @param {string} libraryId identifiant
 */
export async function deleteCustomWidgetEntry(libraryId) {
  await runWrite((objectStore) => objectStore.delete(libraryId));
  entriesById.delete(libraryId);
  notifyChange();
}

/**
 * Importe des définitions venues d'une sauvegarde.
 * @param {any[]} definitions définitions
 * @param {(entry: object) => boolean} shouldReplace question
 * @returns {Promise<number>} nombre écrit
 */
export async function importCustomWidgets(definitions, shouldReplace) {
  const checkedDefinitions = definitions.map(checkCustomWidget);
  let writtenCount = 0;
  for (const definition of checkedDefinitions) if (await putCustomWidgetEntry(definition, shouldReplace)) writtenCount += 1;
  return writtenCount;
}
