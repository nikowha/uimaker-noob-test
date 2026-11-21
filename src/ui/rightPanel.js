// Fenêtre de droite : bibliothèque de widgets, icônes, styles partagés, thèmes (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { appState, commitChange, notifyChange, selectNode } from '../model/store.js';
import { WIDGET_TYPES } from '../model/catalog.js';
import { buildNodeIndex, countStyleUsers, createId, insertWidget } from '../model/document.js';
import { buildTemplate, TEMPLATE_CATEGORIES } from '../model/templates.js';
import { getIconSvg, isIconLibraryLoaded, loadIconLibrary, searchIcons } from '../render/iconLibrary.js';
import { createButtonRow, createPanelSection, createSelectElement } from './fields.js';
import { startLibraryDrag } from './canvasView.js';
import { applyIconFromLibrary, findDefaultHolderId } from './editorActions.js';

const RIGHT_SECTIONS = [
  { value: 'widgets', label: 'Bibliothèque de widgets' }, { value: 'templates', label: 'Modèles' }, { value: 'icons', label: 'Icônes' },
  { value: 'styles', label: 'Styles partagés' }, { value: 'themes', label: 'Thèmes et couleurs' },
];
const MAXIMUM_ICON_RESULTS = 240;
const FREE_TEMPLATE_WIDTH = 320;

let panelBodyElement = null;
let sectionSelectHost = null;
let iconSearchText = '';

/**
 * Tuile de bibliothèque : glisser vers le canevas, ou toucher puis toucher l'area cible.
 * @param {{kind: string, value: string, label: string}} libraryItem élément
 * @param {string} iconMarkup SVG de la tuile
 * @param {string} [subtitle] petit texte sous le nom
 * @returns {HTMLElement} tuile
 */
function createLibraryTile(libraryItem, iconMarkup, subtitle) {
  const isArmed = appState.armedLibraryItem?.kind === libraryItem.kind && appState.armedLibraryItem?.value === libraryItem.value;
  return createElement('div', {
    className: `library-tile${isArmed ? ' is-armed' : ''}`,
    attributes: { title: `${libraryItem.label} — glisser dans une area, ou toucher puis toucher l'area` },
    on: { pointerdown: (pointerEvent) => { pointerEvent.preventDefault(); startLibraryDrag(libraryItem, pointerEvent); } },
  }, [createElement('span', { className: 'library-tile-icon', html: iconMarkup }), createElement('span', { className: 'library-tile-label', text: libraryItem.label }),
    subtitle ? createElement('span', { className: 'library-tile-subtitle', text: subtitle }) : null]);
}

/** @returns {HTMLElement[]} contenu de la section Widgets */
function createWidgetLibrary() {
  const catalogTiles = Object.entries(WIDGET_TYPES).map(([widgetType, typeDefinition]) =>
    createLibraryTile({ kind: 'widget', value: widgetType, label: typeDefinition.label }, getIconSvg(`lucide:${typeDefinition.libraryIcon}`)));
  const componentEntries = Object.entries(appState.uiDocument.components);
  const componentTiles = componentEntries.map(([componentId, component]) => {
    const tile = createLibraryTile({ kind: 'component', value: componentId, label: component.name }, getIconSvg('lucide:component'), componentId);
    return tile;
  });
  const componentManagement = componentEntries.map(([componentId, component]) => createElement('div', { className: 'list-row' }, [
    createElement('code', { text: componentId }),
    createElement('input', { attributes: { type: 'text', value: component.name }, on: { change: (changeEvent) => commitChange((uiDocument) => {
      uiDocument.components[componentId].name = changeEvent.target.value.trim() || component.name;
    }) } }),
    createElement('button', { className: 'is-danger', text: '✕', attributes: { type: 'button', title: 'Supprimer ce widget perso (les instances deviennent des placeholders)' },
      on: { click: () => commitChange((uiDocument) => { delete uiDocument.components[componentId]; }) } }),
  ]));
  return [
    createPanelSection('Widgets de base', [createElement('div', { className: 'library-grid' }, catalogTiles)]),
    createPanelSection('Widgets perso', componentTiles.length
      ? [createElement('div', { className: 'library-grid' }, componentTiles), ...componentManagement]
      : [createElement('div', { className: 'panel-hint', text: 'Aucun pour l\'instant. Sélectionne un widget (ou un conteneur rempli) puis « → Widget perso » à gauche.' })]),
  ];
}

/**
 * Applique un modèle : nouvel écran (affiché), groupe de widgets (dans l'area sélectionnée) ou thèmes.
 * @param {string} categoryKey catégorie
 * @param {string} templateKey modèle
 */
function applyTemplate(categoryKey, templateKey) {
  const holderId = categoryKey === 'widgets' ? findDefaultHolderId() : null;
  if (categoryKey === 'widgets' && !holderId) { alert('Sélectionne d\'abord une area qui contient des widgets (pas une area découpée).'); return; }
  let nodeToSelect = null;
  commitChange((uiDocument) => {
    const { createdNode } = buildTemplate(uiDocument, categoryKey, templateKey);
    if (categoryKey === 'screen') { uiDocument.screens.push(createdNode); nodeToSelect = createdNode.id; appState.currentScreenId = createdNode.id; }
    else if (categoryKey === 'widgets') {
      const holderNode = buildNodeIndex(uiDocument).get(holderId)?.node;
      if (holderNode?.widgetLayout?.mode === 'free') {
        createdNode.placement = { anchor: 'topLeft', x: 24, y: 24 };
        if (createdNode.size?.width === 'fill') createdNode.size.width = FREE_TEMPLATE_WIDTH;
      }
      insertWidget(uiDocument, holderId, createdNode);
      nodeToSelect = createdNode.id;
    }
    else { appState.currentThemeId = createdNode; }
  });
  if (nodeToSelect) selectNode(nodeToSelect);
}

/** @returns {HTMLElement[]} contenu de la section Modèles */
function createTemplatesView() {
  return [
    createElement('div', { className: 'panel-hint', text: 'Pour essayer vite. Chaque modèle crée de nouveaux éléments avec leurs propres ID (annulable).' }),
    ...TEMPLATE_CATEGORIES.map((category) => createPanelSection(category.label, Object.entries(category.templates).map(([templateKey, template]) => createElement('button', {
      className: 'template-button', attributes: { type: 'button' }, on: { click: () => applyTemplate(category.key, templateKey) },
    }, [createElement('span', { className: 'library-tile-icon', html: getIconSvg(`lucide:${template.icon}`) }), createElement('span', { text: template.label })])))),
  ];
}

/** @returns {HTMLElement[]} contenu de la section Icônes */
function createIconLibraryView() {
  if (!isIconLibraryLoaded()) {
    loadIconLibrary().then(notifyChange).catch(() => null);
    return [createElement('div', { className: 'panel-hint', text: 'Chargement des icônes…' })];
  }
  const resultsHost = createElement('div', { className: 'icon-grid' });
  const fillResults = () => {
    const iconNames = searchIcons(iconSearchText, MAXIMUM_ICON_RESULTS);
    resultsHost.replaceChildren(...iconNames.map((iconName) => createElement('button', {
      className: 'icon-cell', html: getIconSvg(`lucide:${iconName}`), attributes: { type: 'button', title: iconName },
      on: { click: () => applyIconFromLibrary(iconName) },
    })));
    countElement.textContent = iconNames.length >= MAXIMUM_ICON_RESULTS ? `${MAXIMUM_ICON_RESULTS}+ résultats` : `${iconNames.length} résultat(s)`;
  };
  const countElement = createElement('div', { className: 'panel-hint' });
  const searchInput = createElement('input', { attributes: { type: 'search', placeholder: 'Rechercher (anglais ou français)…' },
    on: { input: () => { iconSearchText = searchInput.value; fillResults(); } } });
  searchInput.value = iconSearchText;
  fillResults();
  return [
    createElement('div', { className: 'panel-hint', text: 'Toucher une icône : l\'applique au bouton / à l\'icône sélectionné, sinon ajoute un widget icône. Icônes Lucide (licence ISC).' }),
    searchInput, countElement, resultsHost,
  ];
}

/** @returns {HTMLElement[]} contenu de la section Styles */
function createStylesView() {
  const { uiDocument } = appState;
  const styleRows = Object.entries(uiDocument.styles).map(([styleId, style]) => createElement('div', {
    className: `list-row is-clickable${appState.selectedId === styleId ? ' is-selected' : ''}`,
    on: { click: () => selectNode(styleId) },
  }, [createElement('code', { text: styleId }), createElement('span', { text: style.name }),
    createElement('span', { className: 'tree-kind', text: `${style.appliesTo ?? 'any'} · ${countStyleUsers(uiDocument, styleId)} util.` })]));
  return [
    createElement('div', { className: 'panel-hint', text: 'Un style lié est partagé : le modifier change tous les éléments qui l\'utilisent. Toucher un style pour le modifier à gauche.' }),
    ...styleRows,
    createButtonRow([{ label: '+ Nouveau style', onClick: () => {
      let createdStyleId = null;
      commitChange((targetDocument) => {
        createdStyleId = createId(targetDocument, 'T');
        targetDocument.styles[createdStyleId] = { name: `Style${createdStyleId.slice(1)}`, appliesTo: 'any' };
      });
      selectNode(createdStyleId);
    } }]),
  ];
}

/** @returns {HTMLElement[]} contenu de la section Thèmes */
function createThemesView() {
  const { uiDocument } = appState;
  const themeEntries = Object.entries(uiDocument.themes);
  const themeRows = themeEntries.map(([themeId, theme]) => createElement('div', { className: 'list-row' }, [
    createElement('code', { text: themeId }),
    createElement('input', { attributes: { type: 'text', value: theme.name }, on: { change: (changeEvent) => commitChange((targetDocument) => {
      targetDocument.themes[themeId].name = changeEvent.target.value.trim() || theme.name;
    }) } }),
    createElement('button', { text: uiDocument.project.defaultTheme === themeId ? '★' : '☆', attributes: { type: 'button', title: 'Thème par défaut' },
      on: { click: () => commitChange((targetDocument) => { targetDocument.project.defaultTheme = themeId; }) } }),
    themeEntries.length > 1 ? createElement('button', { className: 'is-danger', text: '✕', attributes: { type: 'button', title: 'Supprimer ce thème' },
      on: { click: () => commitChange((targetDocument) => {
        delete targetDocument.themes[themeId];
        for (const colorVariable of Object.values(targetDocument.colorVariables)) delete colorVariable.values[themeId];
        if (targetDocument.project.defaultTheme === themeId) targetDocument.project.defaultTheme = Object.keys(targetDocument.themes)[0];
      }) } }) : null,
  ]));
  const variableHeader = createElement('div', { className: 'variable-row is-header' }, [
    createElement('span', { text: 'Variable' }), ...themeEntries.map(([themeId, theme]) => createElement('span', { text: theme.name, attributes: { title: themeId } })), createElement('span'),
  ]);
  const variableRows = Object.entries(uiDocument.colorVariables).map(([variableId, colorVariable]) => createElement('div', { className: 'variable-row' }, [
    createElement('input', { attributes: { type: 'text', value: colorVariable.name, title: variableId }, on: { change: (changeEvent) => commitChange((targetDocument) => {
      targetDocument.colorVariables[variableId].name = changeEvent.target.value.trim().replace(/\s+/g, '') || colorVariable.name;
    }) } }),
    ...themeEntries.map(([themeId]) => {
      const colorInput = createElement('input', { attributes: { type: 'color' }, on: { change: () => commitChange((targetDocument) => {
        targetDocument.colorVariables[variableId].values[themeId] = colorInput.value;
      }) } });
      colorInput.value = (colorVariable.values[themeId] ?? '#888888').slice(0, 7);
      return colorInput;
    }),
    createElement('button', { className: 'is-danger', text: '✕', attributes: { type: 'button', title: `Supprimer ${variableId}` },
      on: { click: () => commitChange((targetDocument) => { delete targetDocument.colorVariables[variableId]; }) } }),
  ]));
  return [
    createPanelSection('Thèmes', [...themeRows, createButtonRow([{ label: '+ Thème', onClick: () => commitChange((targetDocument) => {
      const sourceThemeId = targetDocument.project.defaultTheme;
      const createdThemeId = createId(targetDocument, 'H');
      targetDocument.themes[createdThemeId] = { name: `Theme${createdThemeId.slice(1)}` };
      for (const colorVariable of Object.values(targetDocument.colorVariables)) colorVariable.values[createdThemeId] = colorVariable.values[sourceThemeId] ?? '#888888';
    }) }])]),
    createPanelSection('Variables de couleur', [
      createElement('div', { className: 'panel-hint', text: 'Une valeur par thème. Les styles et éléments utilisent la variable ; le thème affiché se choisit en haut.' }),
      variableHeader, ...variableRows,
      createButtonRow([{ label: '+ Variable', onClick: () => commitChange((targetDocument) => {
        const createdVariableId = createId(targetDocument, 'V');
        targetDocument.colorVariables[createdVariableId] = { name: `color${createdVariableId.slice(1)}`,
          values: Object.fromEntries(Object.keys(targetDocument.themes).map((themeId) => [themeId, '#888888'])) };
      }) }]),
    ]),
  ];
}

/** Redessine la fenêtre de droite. */
export function renderRightPanel() {
  sectionSelectHost.replaceChildren(createSelectElement(appState.rightPanelSection, RIGHT_SECTIONS, (section) => { appState.rightPanelSection = section; notifyChange(); }));
  const activeElement = document.activeElement;
  const isSearchFocused = activeElement?.type === 'search' && panelBodyElement.contains(activeElement);
  if (isSearchFocused) return;
  const scrollPosition = panelBodyElement.scrollTop;
  const sectionBuilders = { widgets: createWidgetLibrary, templates: createTemplatesView, icons: createIconLibraryView, styles: createStylesView, themes: createThemesView };
  panelBodyElement.replaceChildren(...(sectionBuilders[appState.rightPanelSection] ?? createWidgetLibrary)());
  panelBodyElement.scrollTop = scrollPosition;
}

/**
 * Crée la fenêtre de droite.
 * @returns {HTMLElement} élément
 */
export function createRightPanel() {
  sectionSelectHost = createElement('div', { className: 'panel-header-select' });
  panelBodyElement = createElement('div', { className: 'panel-body' });
  loadIconLibrary().then(notifyChange).catch(() => null);
  return createElement('aside', { className: 'side-panel is-right' }, [
    createElement('div', { className: 'panel-header' }, [sectionSelectHost]), panelBodyElement,
  ]);
}
