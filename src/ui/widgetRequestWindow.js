// Fenêtre « demande de custom widget » : description à écrire, puis fichier à donner à une session (PROTOTYPE).
import { createElement, saveFile } from '../utils/dom.js';
import { appState } from '../model/store.js';
import { WIDGET_TYPES } from '../model/catalog.js';
import { createRequestText } from '../model/widgetRequest.js';
import { resolveAppearance, resolveColor } from '../render/styleResolver.js';
import { createButtonRow, createTextField } from './fields.js';

const GUIDE_URL = './data/CUSTOM_WIDGET_GUIDE.md';

let windowElement = null;
/** Textes en cours par widget ou définition : fermer la fenêtre ne les perd pas. */
const drafts = new Map();

/** Ferme la fenêtre. */
export function closeWidgetRequestWindow() {
  windowElement?.remove();
  windowElement = null;
}

/** @returns {boolean} vrai si la fenêtre est ouverte */
export function isWidgetRequestWindowOpen() {
  return windowElement !== null;
}

/**
 * Règles CSS qui s'appliquent à un rendu.
 * @param {HTMLElement} rootElement rendu
 * @returns {string} CSS
 */
function collectMatchingRules(rootElement) {
  const elements = [rootElement, ...rootElement.querySelectorAll('*')];
  const matchingRules = [];
  for (const styleSheet of document.styleSheets) {
    let rules;
    try { rules = [...styleSheet.cssRules]; } catch (error) { console.warn('collectMatchingRules', error); continue; }
    for (const rule of rules) {
      if (!rule.selectorText?.includes('.ui')) continue;
      const selector = rule.selectorText.replace(/::?(before|after|hover|active|focus|placeholder)\b/g, '');
      try {
        if (elements.some((element) => element.matches(selector))) matchingRules.push(rule.cssText);
      } catch (error) { console.warn('collectMatchingRules', selector, error); }
    }
  }
  return matchingRules.join('\n');
}

/**
 * Relève le rendu actuel d'un widget sur le canevas.
 * @param {object} widget widget
 * @returns {object} { width, height, html, css, appearance }
 */
function takeSnapshot(widget) {
  const { uiDocument, currentThemeId: themeId } = appState;
  const appearance = Object.fromEntries(Object.entries(resolveAppearance(uiDocument, widget)).map(([key, value]) => [key, resolveColor(uiDocument, value, themeId)]));
  const canvasElement = document.querySelector(`.ui-widget[data-node-id="${CSS.escape(widget.id)}"]`);
  if (!canvasElement) return { width: widget.size?.width ?? '?', height: widget.size?.height ?? '?', html: '', css: '', appearance };
  const copyElement = canvasElement.cloneNode(true);
  copyElement.classList.remove('is-selected');
  copyElement.removeAttribute('data-node-id');
  return { width: canvasElement.offsetWidth, height: canvasElement.offsetHeight, html: copyElement.outerHTML, css: collectMatchingRules(canvasElement), appearance };
}

/** @returns {Promise<string>} guide des custom widgets */
async function fetchGuide() {
  const response = await fetch(GUIDE_URL);
  if (!response.ok) throw new Error(`guide introuvable (${response.status})`);
  return response.text();
}

/**
 * Ouvre la fenêtre de demande.
 * @param {object} [source] { widget } = widget de base ou custom widget posé, { definition } = custom widget à modifier ; vide = nouveau
 */
export function openWidgetRequestWindow(source = {}) {
  if (windowElement) return;
  const { widget = null, definition = null } = source;
  const { uiDocument } = appState;
  const draftKey = definition?.libraryId ?? (widget ? `${uiDocument.project.name}/${widget.id}` : 'new');
  const draft = drafts.get(draftKey) ?? { name: definition?.name ?? widget?.name ?? '', description: widget?.type === 'placeholder' ? widget.content?.description ?? '' : '' };
  drafts.set(draftKey, draft);
  const snapshot = widget && !definition ? takeSnapshot(widget) : null;
  // Le guide est lu d'avance : sur iPad, le partage doit suivre directement un toucher.
  const guidePromise = fetchGuide();
  guidePromise.catch((error) => console.error('fetchGuide', error));

  /** Enregistre la demande. */
  const saveRequest = async () => {
    const name = draft.name.trim();
    if (!name) { alert('Donne un nom au widget.'); return; }
    if (!draft.description.trim()) { alert('Décris ce que tu veux.'); return; }
    try {
      const requestText = createRequestText(uiDocument, { name, description: draft.description, widget, snapshot, definition }, await guidePromise);
      if (await saveFile(`Demande_${name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.md`, requestText, 'text/markdown')) closeWidgetRequestWindow();
    } catch (error) {
      console.error('saveRequest', error);
      alert(`Demande impossible : ${error.message}`);
    }
  };

  const title = definition ? `Faire modifier « ${definition.name} »`
    : widget ? `Faire coder à partir de « ${widget.name} » (${WIDGET_TYPES[widget.type].label})` : 'Demander un nouveau custom widget';
  const content = definition ? 'le code actuel' : widget ? 'les réglages et le dessin du widget' : 'les couleurs du projet';
  const nameField = createTextField('Nom du widget', draft.name, (name) => { draft.name = name; });
  nameField.addEventListener('input', (inputEvent) => { draft.name = inputEvent.target.value; });
  const descriptionField = createTextField('Ce que tu veux (dessin, gestes, réglages, événements)', draft.description, (description) => { draft.description = description; }, { isMultiline: true });
  descriptionField.classList.add('request-description');
  descriptionField.addEventListener('input', (inputEvent) => { draft.description = inputEvent.target.value; });
  windowElement = createElement('div', { className: 'projects-backdrop' }, [createElement('div', { className: 'projects-window is-small', attributes: { role: 'dialog', 'aria-label': title } }, [
    createElement('div', { className: 'projects-header' }, [createElement('h2', { text: title }),
      createElement('button', { text: 'Fermer', attributes: { type: 'button' }, on: { click: closeWidgetRequestWindow } })]),
    createElement('div', { className: 'projects-body' }, [
      definition ? null : nameField,
      descriptionField,
      createElement('div', { className: 'panel-hint', text: `Le fichier contient ta demande, ${content} et le guide. Donne-le à une session Claude, puis importe le .uimwidget qu'elle te rend.` }),
      createButtonRow([{ label: 'Enregistrer la demande', onClick: saveRequest }]),
    ]),
  ])]);
  document.body.append(windowElement);
}
