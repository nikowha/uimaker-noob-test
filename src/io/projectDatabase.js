// Base des projets de cet appareil (IndexedDB « uimaker-noob-projects ») — PROTOTYPE.
// Deux magasins : « projects » (un enregistrement par projet) et « versions » (copies d'un projet).

const DATABASE_NAME = 'uimaker-noob-projects';
const DATABASE_VERSION = 1;
const OPEN_TIMEOUT_MS = 5000;

export const PROJECT_STORE = 'projects';
export const VERSION_STORE = 'versions';

let databasePromise = null;

/** @returns {Promise<IDBDatabase>} base ouverte */
function openDatabase() {
  databasePromise ??= new Promise((resolvePromise, rejectPromise) => {
    const fail = (error) => { databasePromise = null; rejectPromise(error); };
    const timeoutId = setTimeout(() => fail(new Error('la base de données ne répond pas')), OPEN_TIMEOUT_MS);
    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      openRequest.result.createObjectStore(VERSION_STORE, { keyPath: 'versionId' }).createIndex('projectId', 'projectId');
    };
    openRequest.onerror = () => { clearTimeout(timeoutId); fail(openRequest.error); };
    openRequest.onsuccess = () => {
      clearTimeout(timeoutId);
      const database = openRequest.result;
      database.onclose = () => { databasePromise = null; };
      database.onversionchange = () => { database.close(); databasePromise = null; };
      resolvePromise(database);
    };
  });
  return databasePromise;
}

/**
 * Exécute une transaction ; rouvre la base une fois si iOS l'a fermée en arrière-plan.
 * @param {string[]} storeNames magasins utilisés
 * @param {'readonly'|'readwrite'} mode lecture ou écriture
 * @param {(stores: Record<string, IDBObjectStore>, setResult: (value: any) => void) => void} runInTransaction travail
 * @returns {Promise<any>} valeur passée à setResult, quand la transaction est terminée
 */
export async function runTransaction(storeNames, mode, runInTransaction) {
  const attemptTransaction = async () => {
    const database = await openDatabase();
    return new Promise((resolvePromise, rejectPromise) => {
      let resultValue;
      const transaction = database.transaction(storeNames, mode);
      transaction.oncomplete = () => resolvePromise(resultValue);
      transaction.onerror = () => rejectPromise(transaction.error);
      transaction.onabort = () => rejectPromise(transaction.error ?? new Error('enregistrement interrompu'));
      runInTransaction(Object.fromEntries(storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)])), (value) => { resultValue = value; });
    });
  };
  try {
    return await attemptTransaction();
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw error;
    databasePromise = null;
    return attemptTransaction();
  }
}

/** @returns {Promise<object[]>} tous les projets (corbeille comprise) */
export function readAllProjects() {
  return runTransaction([PROJECT_STORE], 'readonly', (stores, setResult) => {
    const readRequest = stores[PROJECT_STORE].getAll();
    readRequest.onsuccess = () => setResult(readRequest.result);
  });
}

/**
 * Lit un projet.
 * @param {string} projectId projet
 * @returns {Promise<object|undefined>} enregistrement
 */
export function readProject(projectId) {
  return runTransaction([PROJECT_STORE], 'readonly', (stores, setResult) => {
    const readRequest = stores[PROJECT_STORE].get(projectId);
    readRequest.onsuccess = () => setResult(readRequest.result);
  });
}

/**
 * Ajoute ou remplace un projet, avec au besoin une version écrite dans la même transaction.
 * @param {object} projectRecord projet
 * @param {object|null} [versionRecord] version à garder
 */
export function writeProject(projectRecord, versionRecord = null) {
  return runTransaction([PROJECT_STORE, VERSION_STORE], 'readwrite', (stores) => {
    stores[PROJECT_STORE].put(projectRecord);
    if (versionRecord) stores[VERSION_STORE].put(versionRecord);
  });
}

/**
 * Modifie un projet sans risque d'écraser une écriture plus récente (lecture et écriture dans la même transaction).
 * @param {string} projectId projet
 * @param {(projectRecord: object) => void} mutateRecord modification
 */
export function updateProject(projectId, mutateRecord) {
  return runTransaction([PROJECT_STORE], 'readwrite', (stores) => {
    const readRequest = stores[PROJECT_STORE].get(projectId);
    readRequest.onsuccess = () => {
      if (!readRequest.result) return;
      mutateRecord(readRequest.result);
      stores[PROJECT_STORE].put(readRequest.result);
    };
  });
}

/**
 * Efface définitivement un projet et ses versions.
 * @param {string} projectId projet
 */
export function eraseProject(projectId) {
  return runTransaction([PROJECT_STORE, VERSION_STORE], 'readwrite', (stores) => {
    stores[PROJECT_STORE].delete(projectId);
    const keysRequest = stores[VERSION_STORE].index('projectId').getAllKeys(projectId);
    keysRequest.onsuccess = () => keysRequest.result.forEach((versionId) => stores[VERSION_STORE].delete(versionId));
  });
}

/**
 * Lit les versions d'un projet.
 * @param {string} projectId projet
 * @returns {Promise<object[]>} versions, la plus récente d'abord
 */
export async function readVersions(projectId) {
  const versions = await runTransaction([VERSION_STORE], 'readonly', (stores, setResult) => {
    const readRequest = stores[VERSION_STORE].index('projectId').getAll(projectId);
    readRequest.onsuccess = () => setResult(readRequest.result);
  });
  return versions.sort((first, second) => second.createdAt - first.createdAt);
}

/**
 * Écrit et efface des versions en une fois.
 * @param {object[]} writtenVersions versions à écrire
 * @param {string[]} [erasedVersionIds] versions à effacer
 */
export function writeVersions(writtenVersions, erasedVersionIds = []) {
  return runTransaction([VERSION_STORE], 'readwrite', (stores) => {
    for (const version of writtenVersions) stores[VERSION_STORE].put(version);
    for (const versionId of erasedVersionIds) stores[VERSION_STORE].delete(versionId);
  });
}
