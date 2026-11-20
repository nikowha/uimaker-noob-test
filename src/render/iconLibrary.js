// Bibliothèque d'icônes Lucide (chargée à la demande) et recherche EN / FR (PROTOTYPE).

const ICON_LIBRARY_URL = './data/icons.json';
const SVG_OPEN_TAG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

let iconLibrary = null;
let loadingPromise = null;

/**
 * Charge la bibliothèque d'icônes une seule fois.
 * @returns {Promise<object>} bibliothèque { source, version, license, icons }
 */
export function loadIconLibrary() {
  loadingPromise ??= fetch(ICON_LIBRARY_URL)
    .then((response) => response.json())
    .then((libraryData) => { iconLibrary = libraryData; return libraryData; })
    .catch((error) => { console.error('loadIconLibrary', error); loadingPromise = null; throw error; });
  return loadingPromise;
}

/** @returns {boolean} vrai si la bibliothèque est chargée */
export function isIconLibraryLoaded() {
  return iconLibrary !== null;
}

/**
 * Renvoie le SVG complet d'une icône référencée « lucide:nom ».
 * @param {string} iconReference référence (ex. "lucide:house")
 * @returns {string} balisage SVG, ou chaîne vide si inconnue / pas encore chargée
 */
export function getIconSvg(iconReference) {
  if (!iconReference || !iconLibrary) return '';
  const iconName = iconReference.replace(/^lucide:/, '');
  const icon = iconLibrary.icons[iconName];
  return icon ? `${SVG_OPEN_TAG}${icon.svg}</svg>` : '';
}

/**
 * Renvoie les informations d'export d'une icône (SVG + tags + licence).
 * @param {string} iconReference référence (ex. "lucide:house")
 * @returns {object|null} entrée pour le champ "icons" de ui.json
 */
export function getIconExportEntry(iconReference) {
  const iconName = iconReference.replace(/^lucide:/, '');
  const icon = iconLibrary?.icons[iconName];
  if (!icon) return null;
  return { svg: getIconSvg(iconReference), license: iconLibrary.license, source: `lucide ${iconLibrary.version}`,
    tags: { en: icon.tags, fr: icon.tagsFr } };
}

/**
 * Normalise un texte pour la recherche (minuscules, sans accents).
 * @param {string} text texte
 * @returns {string} texte normalisé
 */
function normalizeSearchText(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Cherche des icônes par nom ou tags anglais / français. Tous les mots doivent correspondre.
 * @param {string} searchText texte saisi
 * @param {number} maximumResults nombre maximal de résultats
 * @returns {string[]} noms d'icônes (sans préfixe)
 */
export function searchIcons(searchText, maximumResults) {
  if (!iconLibrary) return [];
  const searchWords = normalizeSearchText(searchText).split(/\s+/).filter(Boolean);
  const matchingNames = [];
  for (const [iconName, icon] of Object.entries(iconLibrary.icons)) {
    const searchableText = normalizeSearchText(`${iconName} ${icon.tags.join(' ')} ${icon.tagsFr.join(' ')}`);
    if (searchWords.every((searchWord) => searchableText.includes(searchWord))) {
      matchingNames.push(iconName);
      if (matchingNames.length >= maximumResults) break;
    }
  }
  return matchingNames;
}
