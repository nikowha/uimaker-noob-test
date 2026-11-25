// Petits utilitaires DOM sans état (PROTOTYPE).

/**
 * Crée un élément DOM.
 * @param {string} tagName balise
 * @param {object} [options] { className, text, html, attributes, style, dataset, on: { événement: fonction } }
 * @param {Array<Node|string|null|false>} [children] enfants (les valeurs fausses sont ignorées)
 * @returns {HTMLElement} élément
 */
export function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.html !== undefined) element.innerHTML = options.html;
  for (const [attributeName, attributeValue] of Object.entries(options.attributes ?? {})) {
    if (attributeValue !== undefined && attributeValue !== null && attributeValue !== false) element.setAttribute(attributeName, attributeValue === true ? '' : attributeValue);
  }
  Object.assign(element.style, options.style ?? {});
  Object.assign(element.dataset, options.dataset ?? {});
  for (const [eventName, eventHandler] of Object.entries(options.on ?? {})) element.addEventListener(eventName, eventHandler);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/**
 * Télécharge (PC) ou partage (iPad) un fichier texte.
 * @param {string} fileName nom du fichier
 * @param {string} fileText contenu
 * @param {string} mimeType type MIME
 * @returns {Promise<boolean>} faux si l'utilisateur a annulé le partage
 */
export async function saveTextFile(fileName, fileText, mimeType) {
  const fileBlob = new Blob([fileText], { type: mimeType });
  const sharedFile = new File([fileBlob], fileName, { type: mimeType });
  const isTouchDevice = navigator.maxTouchPoints > 1;
  if (isTouchDevice && navigator.canShare?.({ files: [sharedFile] })) {
    try {
      await navigator.share({ files: [sharedFile] });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      console.error('saveTextFile (partage)', error);
    }
  }
  const downloadUrl = URL.createObjectURL(fileBlob);
  const downloadLink = createElement('a', { attributes: { href: downloadUrl, download: fileName } });
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  return true;
}

/**
 * Ouvre le sélecteur de fichiers et lit le fichier choisi en texte.
 * @returns {Promise<string|null>} texte, ou null si annulé
 */
export function pickTextFile() {
  return new Promise((resolvePromise) => {
    const fileInput = createElement('input', { attributes: { type: 'file' }, style: { display: 'none' } });
    fileInput.addEventListener('change', async () => {
      const chosenFile = fileInput.files?.[0];
      fileInput.remove();
      resolvePromise(chosenFile ? await chosenFile.text() : null);
    });
    document.body.append(fileInput);
    fileInput.click();
  });
}
