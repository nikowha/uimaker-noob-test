// Fenêtre de gauche : paramètres de l'élément sélectionné, ou arbre écran > areas > widgets (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { limitNumber } from '../utils/numbers.js';
import { appSettings, appState, commitChange, DEFAULT_APP_SETTINGS, notifyChange, selectNode, updateAppSetting } from '../model/store.js';
import { ANCHORS, APPEARANCE_FIELDS, getFieldLimits, limitWidgetNumbers, PLATFORMS, SCREEN_PRESETS, STYLE_TARGETS, WIDGET_TYPES } from '../model/catalog.js';
import { buildNodeIndex, computeNodePath, countStyleUsers, createId, createModuleScreen, createPage } from '../model/document.js';
import { addModuleState, canRepeatModuleIn, countModuleInstances, deleteModuleState, getRepeatCount, isModuleUpdateAvailable, listInstanceNodes } from '../model/modules.js';
import { APP_VERSION } from '../version.js';
import { getLibraryEntry } from '../io/moduleLibrary.js';
import { getIconSvg } from '../render/iconLibrary.js';
import {
  createButtonRow, createCheckboxField, createColorField, createInfoRow, createNumberField, createPanelSection,
  createSelectElement, createSelectField, createSidesField, createSizeField, createTextField,
} from './fields.js';
import { createActionEditor, createEventsSection } from './actionEditor.js';
import {
  copySelectedAppearance, deleteSelection, detachInstance, duplicateSelection, openModuleEditor, pasteAppearanceOnSelection, publishModule, saveAsModule,
  splitSelectedArea, updateInstanceNode, updateModuleFromLibrary, updateNode,
} from './editorActions.js';

const LEFT_SECTIONS = [{ value: 'properties', label: 'Paramètres' }, { value: 'tree', label: 'Arbre' }, { value: 'settings', label: 'Réglages de l\x27app' }];
const SIZING_MODES = [{ value: 'fill', label: 'Remplir le reste' }, { value: 'fixed', label: 'Fixe (px)' }, { value: 'proportional', label: 'Proportionnelle' }];
const LAYOUT_MODES = [{ value: 'stack', label: 'Pile' }, { value: 'grid', label: 'Grille' }, { value: 'free', label: 'Libre (ancrage)' }];
const ALIGN_CHOICES = ['start', 'center', 'end', 'stretch', 'spaceBetween'];

/** Onglets des paramètres de la sélection. */
const PARAMETER_TABS = [
  { value: 'properties', label: 'Propriétés', title: 'Nom, contenu, paramètres propres et notes' },
  { value: 'look', label: 'Apparence', title: 'Taille, placement et apparence' },
  { value: 'interaction', label: 'Interaction', title: 'État, action et événements' },
];

let panelBodyElement = null;
let sectionSelectHost = null;
/** Élément interne choisi pour chaque instance (clé = ID de l'instance). */
const innerNodeKeyByInstance = new Map();
/** Élément choisi dans chaque répétition (clé = ID de la répétition). */
const repeatItemIndexByWidget = new Map();
let lastStateSelectedId = null;

/**
 * Range une section dans un onglet (sans onglet = toujours visible, au-dessus des onglets).
 * @param {'look'|'properties'|'interaction'} tab onglet
 * @param {HTMLElement} section section
 * @returns {HTMLElement} la même section
 */
function putInTab(tab, section) {
  section.dataset.parameterTab = tab;
  return section;
}

/**
 * Affiche les sections de la sélection : celles sans onglet, la barre d'onglets, puis l'onglet choisi.
 * @param {HTMLElement[]} sections sections
 */
function showParameterSections(sections) {
  const tabbedSections = sections.filter((section) => section.dataset.parameterTab);
  panelBodyElement.append(...sections.filter((section) => !section.dataset.parameterTab));
  if (tabbedSections.length === 0) return;
  const currentTab = appState.parameterTab;
  const shownSections = tabbedSections.filter((section) => section.dataset.parameterTab === currentTab);
  panelBodyElement.append(createElement('div', { className: 'parameter-tabs', attributes: { role: 'tablist' } }, PARAMETER_TABS.map((tab) => createElement('button', {
    className: tab.value === currentTab ? 'is-active' : '', text: tab.label,
    attributes: { type: 'button', role: 'tab', title: tab.title, 'aria-selected': String(tab.value === currentTab) },
    on: { click: () => {
      appState.parameterTab = tab.value;
      notifyChange();
      panelBodyElement.scrollTop = 0;
    } },
  }))), ...shownSections);
  if (shownSections.length === 0) panelBodyElement.append(createElement('div', { className: 'panel-hint', text: 'Rien à régler ici pour cet élément.' }));
}

/**
 * Champs d'apparence (style ou valeurs propres d'un élément).
 * @param {object} appearanceValues valeurs actuelles
 * @param {(key: string, value: any) => void} onFieldChange appelé à chaque changement
 * @returns {HTMLElement[]} champs
 */
function createAppearanceFields(appearanceValues, onFieldChange) {
  const { uiDocument, currentThemeId } = appState;
  return APPEARANCE_FIELDS.map((fieldDefinition) => {
    const currentValue = appearanceValues[fieldDefinition.key];
    if (fieldDefinition.kind === 'color') return createColorField(fieldDefinition.label, currentValue, uiDocument, currentThemeId, (newValue) => onFieldChange(fieldDefinition.key, newValue));
    if (fieldDefinition.kind === 'number') return createNumberField(fieldDefinition.label, currentValue, (newValue) => onFieldChange(fieldDefinition.key, newValue), fieldDefinition);
    if (fieldDefinition.kind === 'select') return createSelectField(fieldDefinition.label, currentValue ?? '', fieldDefinition.options, (newValue) => onFieldChange(fieldDefinition.key, newValue || undefined));
    return createSidesField(fieldDefinition.label, currentValue, (newValues) => onFieldChange(fieldDefinition.key, newValues));
  });
}

/**
 * Écrit ou efface une valeur dans un objet (undefined / '' = effacer).
 * @param {object} targetObject objet
 * @param {string} key clé
 * @param {any} value valeur
 */
function setOrDeleteValue(targetObject, key, value) {
  if (value === undefined || value === '') delete targetObject[key]; else targetObject[key] = value;
}

/**
 * Section « Apparence » d'une area ou d'un widget : style lié, valeurs propres, copier / coller.
 * @param {object} node area ou widget
 * @param {string} styleTarget type pour filtrer les styles proposés ("area" ou type de widget)
 * @returns {HTMLElement} section
 */
function createNodeAppearanceSection(node, styleTarget) {
  const { uiDocument } = appState;
  const styleChoices = [{ value: '', label: '— aucun —' }, ...Object.entries(uiDocument.styles)
    .filter(([, style]) => !style.appliesTo || style.appliesTo === 'any' || style.appliesTo === styleTarget)
    .map(([styleId, style]) => ({ value: styleId, label: `${style.name} (${styleId})` }))];
  return createPanelSection('Apparence', [
    createSelectField('Style lié', node.style ?? '', styleChoices, (styleId) => updateNode(node.id, (targetNode) => setOrDeleteValue(targetNode, 'style', styleId))),
    createButtonRow([
      { label: 'Créer un style lié', title: 'Crée un style à partir de cet élément et le lie', onClick: () => createStyleFromNode(node.id, styleTarget) },
      { label: 'Copier', title: 'Copier l\'apparence', onClick: copySelectedAppearance },
      { label: 'Coller', title: 'Coller l\'apparence copiée', onClick: pasteAppearanceOnSelection },
    ]),
    createElement('div', { className: 'panel-hint', text: 'Valeurs propres à cet élément (prioritaires sur le style) :' }),
    ...createAppearanceFields(node.styleOverrides ?? {}, (key, value) => updateNode(node.id, (targetNode) => {
      targetNode.styleOverrides ??= {};
      setOrDeleteValue(targetNode.styleOverrides, key, value);
    })),
  ]);
}

/**
 * Crée un style lié à partir de l'apparence d'un élément (style actuel + valeurs propres).
 * @param {string} nodeId élément
 * @param {string} styleTarget cible du style
 */
function createStyleFromNode(nodeId, styleTarget) {
  let createdStyleId = null;
  commitChange((uiDocument) => {
    const node = buildNodeIndex(uiDocument).get(nodeId).node;
    const baseStyle = node.style ? uiDocument.styles[node.style] ?? {} : {};
    createdStyleId = createId(uiDocument, 'T');
    const { name: unusedName, appliesTo: unusedTarget, ...baseValues } = baseStyle;
    uiDocument.styles[createdStyleId] = { name: `${node.name}Style`, appliesTo: styleTarget, ...baseValues, ...(node.styleOverrides ?? {}) };
    node.style = createdStyleId;
    node.styleOverrides = {};
  });
  notifyChange();
}

/**
 * Champs communs : ID, chemin, nom, notes.
 * @param {object} node nœud
 * @returns {HTMLElement[]} champs
 */
function createIdentityFields(node) {
  const nodeIndex = buildNodeIndex(appState.uiDocument);
  return [
    createInfoRow('ID', node.id),
    createInfoRow('Chemin', computeNodePath(nodeIndex, node.id)),
    createTextField('Nom (anglais)', node.name, (newName) => updateNode(node.id, (targetNode) => { targetNode.name = newName.trim() || targetNode.name; })),
  ];
}

/**
 * Champ de notes pour le codeur.
 * @param {object} node nœud
 * @returns {HTMLElement} champ
 */
function createNotesField(node) {
  return createTextField('Notes pour le codeur', node.notes, (newNotes) => updateNode(node.id, (targetNode) => { targetNode.notes = newNotes; }), { isMultiline: true });
}

/**
 * Paramètres d'un écran.
 * @param {object} screen écran
 * @returns {HTMLElement[]} sections
 */
function createScreenProperties(screen) {
  const presetChoices = SCREEN_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }));
  return [putInTab('properties', createPanelSection('Écran', [
    createInfoRow('ID', screen.id),
    createTextField('Nom (anglais)', screen.name, (newName) => updateNode(screen.id, (targetScreen) => { targetScreen.name = newName.trim() || targetScreen.name; })),
    createButtonRow([{ label: 'Supprimer l\'écran', isDanger: true, onClick: deleteSelection }]),
  ])), putInTab('look', createPanelSection('Format et taille', [
    createSelectField('Format', screen.preset, presetChoices, (presetKey) => updateNode(screen.id, (targetScreen) => {
      const preset = SCREEN_PRESETS.find((candidate) => candidate.key === presetKey);
      const isPortrait = targetScreen.orientation === 'portrait';
      const [longSide, shortSide] = [Math.max(preset.width, preset.height), Math.min(preset.width, preset.height)];
      targetScreen.preset = presetKey;
      targetScreen.size = isPortrait ? { width: shortSide, height: longSide } : { width: longSide, height: shortSide };
      if (preset.platform !== 'any') targetScreen.platform = preset.platform;
      if (preset.safeArea) targetScreen.safeArea = { ...preset.safeArea };
    })),
    createSelectField('Orientation', screen.orientation, [{ value: 'landscape', label: 'Paysage' }, { value: 'portrait', label: 'Portrait' }],
      (orientation) => updateNode(screen.id, (targetScreen) => {
        if (orientation === targetScreen.orientation) return;
        targetScreen.orientation = orientation;
        targetScreen.size = { width: targetScreen.size.height, height: targetScreen.size.width };
      })),
    createNumberField('Largeur', screen.size.width, (width) => updateNode(screen.id, (targetScreen) => { if (width > 0) { targetScreen.size.width = width; targetScreen.preset = 'custom'; } }), { min: 1, isInteger: true }),
    createNumberField('Hauteur', screen.size.height, (height) => updateNode(screen.id, (targetScreen) => { if (height > 0) { targetScreen.size.height = height; targetScreen.preset = 'custom'; } }), { min: 1, isInteger: true }),
    createSidesField('Zones sûres', ['top', 'right', 'bottom', 'left'].map((side) => screen.safeArea?.[side] ?? 0), (safeValues) => updateNode(screen.id, (targetScreen) => {
      const [top, right, bottom, left] = safeValues ?? [0, 0, 0, 0];
      targetScreen.safeArea = { top, right, bottom, left };
    })),
  ])), putInTab('properties', createPanelSection('Propriétés de l\'écran', [
    createSelectField('Plateforme', screen.platform, PLATFORMS, (platform) => updateNode(screen.id, (targetScreen) => { targetScreen.platform = platform; })),
    createNotesField(screen),
  ])), putInTab('interaction', createEventsSection(screen, true, (mutateNode) => updateNode(screen.id, mutateNode)))];
}

/**
 * Paramètres d'une area : découpage, taille, placement des widgets, apparence.
 * @param {object} area area
 * @param {object} record entrée d'index
 * @returns {HTMLElement[]} sections
 */
function createAreaProperties(area, record) {
  const sizing = area.sizing ?? { mode: 'fill' };
  const updateSizing = (key, value) => updateNode(area.id, (targetArea) => {
    targetArea.sizing ??= { mode: 'fill' };
    setOrDeleteValue(targetArea.sizing, key, value);
    if (typeof targetArea.sizing.size === 'number') targetArea.sizing.size = limitNumber(targetArea.sizing.size, targetArea.sizing);
  });
  const sections = [putInTab('properties', createPanelSection('Area', [
    ...createIdentityFields(area),
    createButtonRow([
      { label: 'Diviser ⇆', title: 'Découper en deux, côte à côte', onClick: () => splitSelectedArea('horizontal') },
      { label: 'Diviser ⇅', title: 'Découper en deux, l\'une sous l\'autre', onClick: () => splitSelectedArea('vertical') },
      record.parent ? { label: 'Supprimer', isDanger: true, onClick: deleteSelection } : null,
    ].filter(Boolean)),
    area.moduleId ? createInfoRow('Module', `${area.moduleId} · ${appState.uiDocument.modules[area.moduleId]?.name ?? 'introuvable'}`) : null,
    area.moduleId ? createModuleButtonRow(area.moduleId) : null,
    createButtonRow([area.moduleId
      ? { label: 'Détacher', title: 'Remplace l\'instance par une copie modifiable', onClick: () => detachInstance(area.id) }
      : { label: '→ Module', title: 'Enregistre cette area et son contenu comme module (projet + bibliothèque)', onClick: () => saveAsModule(area.id) }]),
    area.split ? createInfoRow('Découpage', area.split === 'horizontal' ? 'côte à côte' : 'empilé') : null,
  ]))];
  if (record.parent) {
    sections.push(putInTab('look', createPanelSection('Taille dans le découpage', [
      createSelectField('Mode', sizing.mode, SIZING_MODES, (mode) => updateSizing('mode', mode)),
      sizing.mode === 'fixed' ? createNumberField('Taille (px)', sizing.size, (size) => updateSizing('size', size), { min: sizing.min ?? 0, max: sizing.max }) : null,
      sizing.mode === 'proportional' ? createNumberField('Proportion (0–1)', sizing.ratio, (ratio) => updateSizing('ratio', ratio), { step: 0.01, min: 0.05, max: 0.95 }) : null,
      createNumberField('Min (px)', sizing.min, (minimum) => updateSizing('min', minimum), { min: 0, max: sizing.max }),
      createNumberField('Max (px)', sizing.max, (maximum) => updateSizing('max', maximum), { min: sizing.min ?? 0 }),
      createCheckboxField('Séparateur déplaçable après cette area (dans l\'app)', area.resizableSplitter ?? appState.uiDocument.project.defaults?.resizableSplitter,
        (isResizable) => updateNode(area.id, (targetArea) => { targetArea.resizableSplitter = isResizable; })),
    ])));
  }
  if (area.moduleId) sections.push(...createInstanceStateSection(area, (mutateNode) => updateNode(area.id, mutateNode)), ...createInstanceSettingsSections(area));
  if (!area.split && !area.moduleId) sections.push(putInTab('look', createWidgetLayoutSection(area)));
  if (!area.moduleId) sections.push(putInTab('look', createNodeAppearanceSection(area, 'area')));
  sections.push(putInTab('interaction', createEventsSection(area, false, (mutateNode) => updateNode(area.id, mutateNode))));
  sections.push(putInTab('properties', createPanelSection('Notes', [createNotesField(area)])));
  return sections;
}

/**
 * Section « Placement des widgets » d'une area feuille ou d'un widget conteneur.
 * @param {object} holderNode area ou conteneur
 * @returns {HTMLElement} section
 */
function createWidgetLayoutSection(holderNode) {
  const widgetLayout = holderNode.widgetLayout ?? { mode: 'stack' };
  const updateLayout = (key, value) => updateNode(holderNode.id, (targetNode) => { targetNode.widgetLayout ??= { mode: 'stack' }; setOrDeleteValue(targetNode.widgetLayout, key, value); });
  const parseTracks = (tracksText) => tracksText.trim().split(/\s+/).filter(Boolean).map((track) => (/^\d+$/.test(track) ? Number(track) : track));
  const modeFields = [];
  if (widgetLayout.mode === 'stack' || !widgetLayout.mode) {
    modeFields.push(
      createSelectField('Direction', widgetLayout.direction ?? 'vertical', [{ value: 'vertical', label: 'Verticale' }, { value: 'horizontal', label: 'Horizontale' }], (direction) => updateLayout('direction', direction)),
      createSelectField('Alignement (axe principal)', widgetLayout.alignMain ?? 'start', ALIGN_CHOICES.filter((choice) => choice !== 'stretch'), (alignMain) => updateLayout('alignMain', alignMain)),
      createSelectField('Alignement (travers)', widgetLayout.alignCross ?? 'stretch', ALIGN_CHOICES.filter((choice) => choice !== 'spaceBetween'), (alignCross) => updateLayout('alignCross', alignCross)),
      createSelectField('Défilement', widgetLayout.scroll ?? 'none', ['none', 'auto'], (scroll) => updateLayout('scroll', scroll)),
    );
  } else if (widgetLayout.mode === 'grid') {
    modeFields.push(
      createTextField('Colonnes', (widgetLayout.columns ?? ['1fr', '1fr']).join(' '), (tracksText) => updateLayout('columns', parseTracks(tracksText)), { placeholder: 'ex. 120 1fr auto' }),
      createTextField('Lignes', (widgetLayout.rows ?? []).join(' '), (tracksText) => updateLayout('rows', tracksText.trim() ? parseTracks(tracksText) : undefined), { placeholder: 'auto si vide' }),
    );
  } else {
    modeFields.push(createElement('div', { className: 'panel-hint', text: 'Mode libre : chaque widget choisit son ancrage et ses décalages.' }));
  }
  return createPanelSection('Placement des widgets', [
    createSelectField('Mode', widgetLayout.mode ?? 'stack', LAYOUT_MODES, (mode) => updateLayout('mode', mode)),
    ...modeFields,
    widgetLayout.mode !== 'free' ? createNumberField('Espacement', widgetLayout.gap, (gap) => updateLayout('gap', gap), { min: 0 }) : null,
    widgetLayout.mode !== 'free' ? createSidesField('Marges', widgetLayout.padding, (padding) => updateLayout('padding', padding)) : null,
  ]);
}

/**
 * Indique si un widget peut répéter un module sans créer de boucle.
 * @param {string} widgetId widget
 * @param {string} moduleId module
 * @returns {boolean} vrai si possible
 */
function canRepeatModule(widgetId, moduleId) {
  return canRepeatModuleIn(appState.uiDocument, buildNodeIndex(appState.uiDocument).get(widgetId)?.screen.id, moduleId);
}

/**
 * Champ de contenu d'un widget selon sa définition dans le catalogue.
 * @param {object} widget widget
 * @param {object} fieldDefinition { target, key, label, kind, options }
 * @param {(mutateNode: (node: object) => void) => void} [updateWidget] applique une modification (au widget par défaut)
 * @returns {HTMLElement} champ
 */
function createWidgetContentField(widget, fieldDefinition, updateWidget = (mutateNode) => updateNode(widget.id, mutateNode)) {
  const targetObject = fieldDefinition.target === 'widget' ? widget : widget[fieldDefinition.target] ?? {};
  const currentValue = targetObject[fieldDefinition.key];
  const commitValue = (newValue) => updateWidget((targetWidget) => {
    if (fieldDefinition.target === 'widget') { targetWidget[fieldDefinition.key] = newValue; return; }
    targetWidget[fieldDefinition.target] ??= {};
    targetWidget[fieldDefinition.target][fieldDefinition.key] = newValue;
    limitWidgetNumbers(targetWidget);
    if (targetWidget.type === 'separator' && fieldDefinition.key === 'orientation') {
      targetWidget.size = newValue === 'vertical' ? { width: 1, height: 'fill' } : { width: 'fill', height: 1 };
    }
  });
  /** Change le module répété ; refusé s'il finirait par se contenir lui-même. Les exemples de l'ancien module sont retirés. */
  const commitModuleChoice = (moduleId) => {
    if (!canRepeatModule(widget.id, moduleId)) { alert('Impossible : ce module se contiendrait lui-même.'); notifyChange(); return; }
    updateWidget((targetWidget) => { targetWidget.content = { ...targetWidget.content, itemModuleId: moduleId }; delete targetWidget.content.itemOverrides; });
  };
  switch (fieldDefinition.kind) {
    case 'textarea': return createTextField(fieldDefinition.label, currentValue, commitValue, { isMultiline: true });
    case 'number': return createNumberField(fieldDefinition.label, currentValue, (newValue) => commitValue(newValue ?? 0), { step: fieldDefinition.step, isInteger: fieldDefinition.isInteger, ...getFieldLimits(fieldDefinition, widget) });
    case 'numberVariable': return createSelectField(fieldDefinition.label, currentValue ?? '', [{ value: '', label: '— aucune —' },
      ...Object.entries(appState.uiDocument.variables ?? {}).filter(([, variable]) => variable.kind === 'number').map(([variableId, variable]) => ({ value: variableId, label: `${variable.name} = ${variable.value}` }))],
    (variableId) => commitValue(variableId || undefined));
    case 'moduleSelect': return createSelectField(fieldDefinition.label, currentValue ?? '', [{ value: '', label: '— choisir un module —' },
      ...Object.entries(appState.uiDocument.modules).filter(([, module]) => module.kind === 'widget').map(([moduleId, module]) => ({ value: moduleId, label: `${module.name} (${moduleId})` }))], commitModuleChoice);
    case 'select': return createSelectField(fieldDefinition.label, currentValue, fieldDefinition.options, commitValue);
    case 'checkbox': return createCheckboxField(fieldDefinition.label, currentValue, commitValue);
    case 'color': return createColorField(fieldDefinition.label, currentValue, appState.uiDocument, appState.currentThemeId, commitValue);
    case 'rawColor': {
      const colorInput = createElement('input', { attributes: { type: 'color' }, on: { change: () => commitValue(colorInput.value) } });
      colorInput.value = currentValue ?? '#5B6B8C';
      return createElement('label', { className: 'field-row' }, [createElement('span', { className: 'field-label', text: fieldDefinition.label }), colorInput]);
    }
    case 'lines': return createTextField(fieldDefinition.label, (currentValue ?? []).join('\n'), (linesText) => commitValue(linesText.split('\n').map((line) => line.trim()).filter(Boolean)), { isMultiline: true });
    case 'itemLines': return createTextField(fieldDefinition.label,
      (currentValue ?? []).map((item) => (item.icon ? `${item.label} | ${item.icon}` : item.label)).join('\n'),
      (linesText) => commitValue(linesText.split('\n').map((line) => line.trim()).filter(Boolean).map((line, lineIndex) => {
        const [itemLabel, itemIcon = ''] = line.split('|').map((part) => part.trim());
        return { ...(currentValue?.[lineIndex] ?? {}), label: itemLabel, icon: itemIcon };
      })), { isMultiline: true, placeholder: 'Texte | lucide:icone' });
    case 'pageSelect': return createSelectField(fieldDefinition.label, String(currentValue ?? 0),
      (widget.children ?? []).map((pageWidget, pageIndex) => ({ value: String(pageIndex), label: `${pageIndex} · ${pageWidget.name} (${pageWidget.id})` })),
      (pageIndexText) => commitValue(Number(pageIndexText)));
    case 'pageStackRef': {
      const widgetScreen = buildNodeIndex(appState.uiDocument).get(widget.id)?.screen;
      const pageStackChoices = [...buildNodeIndex(appState.uiDocument).values()]
        .filter((record) => record.kind === 'widget' && record.node.type === 'pageStack' && record.screen.id === widgetScreen?.id)
        .map((record) => ({ value: record.node.id, label: `${record.node.name} (${record.node.id})` }));
      return createSelectField(fieldDefinition.label, currentValue ?? '', [{ value: '', label: '— aucune —' }, ...pageStackChoices],
        (pageStackId) => commitValue(pageStackId || undefined));
    }
    case 'menuLinks': {
      const menuChoices = [{ value: '', label: '— menu —' }, ...Object.entries(appState.uiDocument.menus ?? {}).map(([menuId, menu]) => ({ value: menuId, label: `${menuId} · ${menu.name}` }))];
      const menuLinks = currentValue ?? [];
      const linkRows = menuLinks.map((menuLink, linkIndex) => {
        const updateLink = (changes) => commitValue(menuLinks.map((candidate, candidateIndex) => (candidateIndex === linkIndex ? { ...candidate, ...changes } : candidate)));
        const labelInput = createElement('input', { attributes: { type: 'text' }, on: { change: () => updateLink({ label: labelInput.value }) } });
        labelInput.value = menuLink.label ?? '';
        return createElement('div', { className: 'list-row' }, [labelInput,
          createSelectElement(menuLink.menuId ?? '', menuChoices, (menuId) => updateLink({ menuId })),
          createElement('button', { className: 'is-danger', text: '✕', attributes: { type: 'button' },
            on: { click: () => commitValue(menuLinks.filter((unusedLink, candidateIndex) => candidateIndex !== linkIndex)) } })]);
      });
      return createElement('div', {}, [createElement('div', { className: 'field-label', text: fieldDefinition.label }), ...linkRows,
        createButtonRow([{ label: '+ Menu', onClick: () => commitValue([...menuLinks, { label: 'Menu', menuId: '' }]) }])]);
    }
    case 'tableColumns': return createTextField(fieldDefinition.label,
      (currentValue ?? []).map((column) => `${column.label} | ${column.width ?? 'fill'}`).join('\n'),
      (linesText) => commitValue(linesText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [columnLabel, columnWidth = 'fill'] = line.split('|').map((part) => part.trim());
        return { label: columnLabel, width: /^\d+$/.test(columnWidth) ? Number(columnWidth) : 'fill' };
      })), { isMultiline: true, placeholder: 'Name | fill\nSize | 80' });
    case 'tableRows': return createTextField(fieldDefinition.label,
      (currentValue ?? []).map((rowCells) => rowCells.join(' | ')).join('\n'),
      (linesText) => commitValue(linesText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('|').map((cell) => cell.trim()))),
      { isMultiline: true, placeholder: 'Item A | Mesh | 12 MB' });
    case 'icon': {
      const previewElement = createElement('span', { className: 'icon-preview', html: getIconSvg(currentValue) });
      const textRow = createTextField(fieldDefinition.label, currentValue, (iconReference) => commitValue(iconReference.trim()), { placeholder: 'lucide:nom' });
      textRow.querySelector('input').before(previewElement);
      textRow.append(createElement('button', { text: 'Choisir…', attributes: { type: 'button', title: 'Ouvre la bibliothèque d\'icônes à droite ; un tap sur une icône l\'applique' },
        on: { click: (clickEvent) => { clickEvent.preventDefault(); appState.rightPanelSection = 'icons'; notifyChange(); } } }));
      return textRow;
    }
    default: return createTextField(fieldDefinition.label, currentValue, commitValue, { placeholder: fieldDefinition.placeholder });
  }
}

/**
 * Paramètres d'un widget.
 * @param {object} widget widget
 * @param {object} record entrée d'index
 * @returns {HTMLElement[]} sections
 */
function createWidgetProperties(widget, record) {
  const typeDefinition = WIDGET_TYPES[widget.type];
  const isModuleRoot = !record.siblings;
  const parentLayout = record.parent.widgetLayout ?? { mode: 'stack' };
  const updateSize = (key, value) => updateNode(widget.id, (targetWidget) => {
    const size = targetWidget.size ??= {};
    setOrDeleteValue(size, key, value);
    if (typeof size.width === 'number') size.width = limitNumber(size.width, { min: size.minWidth, max: size.maxWidth });
    if (typeof size.height === 'number') size.height = limitNumber(size.height, { min: size.minHeight, max: size.maxHeight });
  });
  const sizeLimits = (capitalized) => ({ min: widget.size?.[`min${capitalized}`] ?? 0, max: widget.size?.[`max${capitalized}`] });
  const updatePlacement = (key, value) => updateNode(widget.id, (targetWidget) => { targetWidget.placement ??= { anchor: 'topLeft', x: 0, y: 0 }; setOrDeleteValue(targetWidget.placement, key, value); });
  const typeLabel = widget.type === 'moduleInstance'
    ? `Module ${widget.moduleId} · ${appState.uiDocument.modules[widget.moduleId]?.name ?? '?'}`
    : typeDefinition?.label ?? widget.type;
  const sections = [putInTab('properties', createPanelSection(typeLabel, [
    ...createIdentityFields(widget),
    widget.type === 'moduleInstance' ? createModuleButtonRow(widget.moduleId) : null,
    isModuleRoot ? null : createButtonRow([
      { label: 'Dupliquer', onClick: duplicateSelection },
      widget.type === 'moduleInstance'
        ? { label: 'Détacher', title: 'Remplace l\'instance par une copie modifiable', onClick: () => detachInstance(widget.id) }
        : { label: '→ Module', title: 'Enregistre ce widget et son contenu comme module (projet + bibliothèque)', onClick: () => saveAsModule(widget.id) },
      { label: 'Supprimer', isDanger: true, onClick: deleteSelection },
    ]),
  ].filter(Boolean)))];
  if (widget.type === 'moduleInstance') sections.push(...createInstanceStateSection(widget, (mutateNode) => updateNode(widget.id, mutateNode)));
  if (typeDefinition?.fields.length) sections.push(putInTab('properties', createPanelSection('Contenu', typeDefinition.fields.map((fieldDefinition) => createWidgetContentField(widget, fieldDefinition)))));
  const sizeAndPlacementFields = [
    createSizeField('Largeur', widget.size?.width, (width) => updateSize('width', width), sizeLimits('Width')),
    createSizeField('Hauteur', widget.size?.height, (height) => updateSize('height', height), sizeLimits('Height')),
    createNumberField('Largeur min', widget.size?.minWidth, (value) => updateSize('minWidth', value), { min: 0, max: widget.size?.maxWidth }),
    createNumberField('Largeur max', widget.size?.maxWidth, (value) => updateSize('maxWidth', value), { min: widget.size?.minWidth ?? 0 }),
    createNumberField('Hauteur min', widget.size?.minHeight, (value) => updateSize('minHeight', value), { min: 0, max: widget.size?.maxHeight }),
    createNumberField('Hauteur max', widget.size?.maxHeight, (value) => updateSize('maxHeight', value), { min: widget.size?.minHeight ?? 0 }),
  ];
  if (parentLayout.mode === 'free') {
    sizeAndPlacementFields.push(
      createSelectField('Ancrage', widget.placement?.anchor ?? 'topLeft', ANCHORS, (anchor) => updatePlacement('anchor', anchor)),
      createNumberField('Décalage X', widget.placement?.x, (value) => updatePlacement('x', value ?? 0)),
      createNumberField('Décalage Y', widget.placement?.y, (value) => updatePlacement('y', value ?? 0)),
    );
  } else if (parentLayout.mode === 'grid') {
    sizeAndPlacementFields.push(
      createNumberField('Colonne (0…, vide = auto)', widget.placement?.column, (value) => updatePlacement('column', value), { min: 0, isInteger: true }),
      createNumberField('Ligne (0…)', widget.placement?.row, (value) => updatePlacement('row', value), { min: 0, isInteger: true }),
      createNumberField('Étendue colonnes', widget.placement?.columnSpan, (value) => updatePlacement('columnSpan', value), { min: 1, isInteger: true }),
    );
  }
  sections.push(putInTab('look', createPanelSection('Taille et placement', sizeAndPlacementFields)));
  if (widget.type === 'pageStack') {
    sections.push(putInTab('properties', createPanelSection('Pages', [
      createElement('div', { className: 'panel-hint', text: 'Une seule page visible à la fois. Une liste ou des onglets peuvent la piloter (champ « Pilote la pile de pages »). Choisis la page affichée dans « Contenu » pour la modifier.' }),
      createButtonRow([{ label: '+ Page', onClick: () => addPageToStack(widget.id) }]),
    ])));
  }
  if (widget.children && widget.type !== 'pageStack') sections.push(putInTab('properties', createWidgetLayoutSection(widget)));
  sections.push(putInTab('interaction', createPanelSection('État et action', [
    createCheckboxField('Actif', widget.state?.enabled !== false, (isEnabled) => updateNode(widget.id, (targetWidget) => { targetWidget.state ??= {}; targetWidget.state.enabled = isEnabled; })),
    createCheckboxField('Visible', widget.state?.visible !== false, (isVisible) => updateNode(widget.id, (targetWidget) => { targetWidget.state ??= {}; targetWidget.state.visible = isVisible; })),
    createElement('div', { className: 'field-label', text: 'Action du clic / tap' }),
    createActionEditor(widget.action, (newAction) => updateNode(widget.id, (targetWidget) => { targetWidget.action = newAction; })),
  ])));
  sections.push(putInTab('interaction', createEventsSection(widget, false, (mutateNode) => updateNode(widget.id, mutateNode))));
  if (widget.type === 'moduleInstance') sections.push(...createInstanceSettingsSections(widget));
  else sections.push(putInTab('look', createNodeAppearanceSection(widget, widget.type)));
  if (widget.type === 'repeat' && widget.content?.itemModuleId) sections.push(...createRepeatSections(widget));
  sections.push(putInTab('properties', createPanelSection('Notes', [createNotesField(widget)])));
  return sections;
}

/**
 * Boutons d'un module du projet : modifier, publier, mettre à jour (selon son état).
 * @param {string} moduleId module
 * @returns {HTMLElement|null} rangée
 */
function createModuleButtonRow(moduleId) {
  const module = appState.uiDocument.modules[moduleId];
  if (!module) return null;
  const entry = getLibraryEntry(module.libraryId);
  return createButtonRow([
    appState.editedModuleId === moduleId ? null : { label: 'Modifier le module', title: 'Ouvre le module sur le canevas : toutes ses instances changent', onClick: () => openModuleEditor(moduleId) },
    module.hasLocalChanges && entry ? { label: 'Publier dans la bibliothèque', title: 'Nouvelle version, proposée ensuite aux autres projets', onClick: () => publishModule(moduleId) } : null,
    isModuleUpdateAvailable(module, entry) ? { label: `Mettre à jour (v${module.version} → v${entry.version})`, onClick: () => updateModuleFromLibrary(moduleId) } : null,
  ].filter(Boolean));
}

/**
 * Cases « états » d'une instance.
 * @param {object} instance instance (moduleId, activeStates)
 * @param {(mutateInstance: (instance: object) => void) => void} updateInstance applique une modification
 * @returns {HTMLElement[]} cases
 */
function createStateCheckboxes(instance, updateInstance) {
  return (appState.uiDocument.modules[instance.moduleId]?.states ?? []).map((state) => createCheckboxField(`État : ${state.name}`, instance.activeStates?.includes(state.id), (isActive) => updateInstance((targetInstance) => {
    const otherStates = (targetInstance.activeStates ?? []).filter((stateId) => stateId !== state.id);
    const activeStates = isActive ? [...otherStates, state.id] : otherStates;
    if (activeStates.length) targetInstance.activeStates = activeStates; else delete targetInstance.activeStates;
  })));
}

/**
 * Section « États » d'une instance (vide si le module n'en a pas).
 * @param {object} instance instance
 * @param {(mutateInstance: (instance: object) => void) => void} updateInstance applique une modification
 * @returns {HTMLElement[]} section
 */
function createInstanceStateSection(instance, updateInstance) {
  const checkboxes = createStateCheckboxes(instance, updateInstance);
  return checkboxes.length ? [putInTab('properties', createPanelSection('États actifs', checkboxes))] : [];
}

/**
 * Section « États » d'un module : ajouter, nommer, décrire, relier à une variable, supprimer.
 * @param {string} moduleId module
 * @returns {HTMLElement} section
 */
function createModuleStatesSection(moduleId) {
  const { modules, variables } = appState.uiDocument;
  const updateState = (stateId, mutateState) => updateNode(moduleId, (targetModule) => mutateState(targetModule.states.find((state) => state.id === stateId)));
  const variableChoices = [{ value: '', label: '— aucune —' }, ...Object.entries(variables ?? {}).filter(([, variable]) => variable.kind === 'boolean').map(([variableId, variable]) => ({ value: variableId, label: `${variable.name} (${variableId})` }))];
  const openState = (stateId) => { appState.editedModuleId = moduleId; appState.editedStateId = stateId; notifyChange(); };
  return createPanelSection('États', [
    createElement('div', { className: 'panel-hint', text: 'Une apparence par situation (muet, sélectionné, en erreur…). Plusieurs états peuvent être actifs : le dernier de la liste l\'emporte.' }),
    ...(modules[moduleId].states ?? []).map((state) => createElement('div', { className: 'event-row' }, [
      createTextField('Nom (anglais)', state.name, (newName) => updateState(state.id, (targetState) => { targetState.name = newName.trim() || targetState.name; })),
      createTextField('Quand ?', state.description, (description) => updateState(state.id, (targetState) => { targetState.description = description; }), { placeholder: 'ex. la piste est muette' }),
      createSelectField('Variable de test', state.variableId ?? '', variableChoices, (variableId) => updateState(state.id, (targetState) => setOrDeleteValue(targetState, 'variableId', variableId))),
      createButtonRow([{ label: 'Modifier l\'apparence', onClick: () => openState(state.id) },
        { label: 'Supprimer', isDanger: true, onClick: () => commitChange((uiDocument) => deleteModuleState(uiDocument, moduleId, state.id)) }]),
    ])),
    createButtonRow([{ label: '+ État', onClick: () => {
      let stateId = null;
      commitChange((uiDocument) => { stateId = addModuleState(uiDocument, moduleId, `State${(uiDocument.modules[moduleId].states ?? []).length + 1}`); });
      if (stateId) notifyChange();
    } }]),
  ]);
}

/**
 * Paramètres de l'état en cours d'édition.
 * @returns {HTMLElement[]} sections
 */
function createStateProperties() {
  const { editedModuleId, editedStateId, selectedId, uiDocument } = appState;
  const state = uiDocument.modules[editedModuleId].states.find((candidate) => candidate.id === editedStateId);
  const instance = { id: `state:${state.id}`, moduleId: editedModuleId, overrides: state.overrides };
  if (selectedId !== lastStateSelectedId) {
    lastStateSelectedId = selectedId;
    if (selectedId) innerNodeKeyByInstance.set(instance.id, selectedId);
  }
  const updateState = (mutateState) => updateNode(editedModuleId, (targetModule) => mutateState(targetModule.states.find((candidate) => candidate.id === editedStateId)));
  return [putInTab('properties', createPanelSection('État', [createInfoRow('ID', state.id), createInfoRow('Nom', state.name), createInfoRow('Quand ?', state.description || '—'),
    createButtonRow([{ label: 'Revenir à Normal', onClick: () => { appState.editedStateId = null; selectNode(editedModuleId); } }])])),
  ...createInstanceSettingsSections(instance, updateState, 'Ce que change cet état', true)];
}

/**
 * Sections « Réglages de cette instance », une par onglet : change un élément interne sans toucher aux autres instances.
 * @param {object} instance widget ou area qui utilise un module
 * @param {(mutateInstance: (instance: object) => void) => void} [updateInstance] applique une modification à l'instance
 * @param {string} [title] titre
 * @param {boolean} [isModuleState] vrai pour régler un état du module (la racine est réglable aussi)
 * @param {() => HTMLElement[]} [createLeadingFields] champs à mettre au début de chaque section
 * @returns {HTMLElement[]} sections
 */
function createInstanceSettingsSections(instance, updateInstance = (mutateInstance) => updateNode(instance.id, mutateInstance), title = 'Réglages de cette instance', isModuleState = false, createLeadingFields = () => []) {
  const entries = listInstanceNodes(appState.uiDocument, instance);
  if (entries.length === 0) return [putInTab('properties', createPanelSection(title, [createElement('div', { className: 'panel-hint', text: 'Module introuvable.' })]))];
  const getEntryKey = (entry) => [...entry.path, entry.node.id].join('/');
  const selectedEntry = entries.find((entry) => getEntryKey(entry) === innerNodeKeyByInstance.get(instance.id))
    ?? entries.find((entry) => WIDGET_TYPES[entry.node.type]?.fields.length && !entry.node.children) ?? entries[0];
  const { node } = selectedEntry;
  const updateInner = (mutateNode) => updateInstanceNode(updateInstance, selectedEntry, mutateNode);
  const isInstanceRoot = selectedEntry === entries[0] && !isModuleState;
  const updateState = (key, value) => updateInner((targetNode) => { targetNode.state = { ...targetNode.state, [key]: value }; });
  const styleChoices = [{ value: '', label: '— aucun —' }, ...Object.entries(appState.uiDocument.styles).map(([styleId, style]) => ({ value: styleId, label: `${style.name} (${styleId})` }))];
  const changedCount = entries.filter((entry) => entry.isChanged).length;
  const contentFields = (WIDGET_TYPES[node.type]?.fields ?? []).filter((fieldDefinition) => fieldDefinition.target !== 'widget' && fieldDefinition.kind !== 'pageStackRef');
  const createHint = (text) => createElement('div', { className: 'panel-hint', text });
  const chooseEntry = (entryKey) => {
    innerNodeKeyByInstance.set(instance.id, entryKey);
    if (isModuleState && !entryKey.includes('/')) selectNode(entryKey); else notifyChange();
  };
  const fieldsByTab = {
    look: node.moduleId ? [createHint('Cet élément est un module : choisis un élément à l\'intérieur.')] : [
      createSelectField('Style lié', node.style ?? '', styleChoices, (styleId) => updateInner((targetNode) => setOrDeleteValue(targetNode, 'style', styleId))),
      ...createAppearanceFields(node.styleOverrides ?? {}, (key, value) => updateInner((targetNode) => {
        targetNode.styleOverrides ??= {};
        setOrDeleteValue(targetNode.styleOverrides, key, value);
      })),
    ],
    properties: [
      ...(node.moduleId ? createStateCheckboxes(node, updateInner) : []),
      ...contentFields.map((fieldDefinition) => createWidgetContentField(node, fieldDefinition, updateInner)),
      ...(contentFields.length || node.moduleId ? [] : [createHint('Aucun contenu à régler pour cet élément.')]),
    ],
    interaction: isInstanceRoot ? [createHint('L\'élément principal se règle plus haut, sur l\'instance elle-même.')] : [
      ...(node.type ? [
        createCheckboxField('Actif', node.state?.enabled !== false, (isEnabled) => updateState('enabled', isEnabled)),
        createCheckboxField('Visible', node.state?.visible !== false, (isVisible) => updateState('visible', isVisible)),
        createElement('div', { className: 'field-label', text: 'Action du clic / tap' }),
        createActionEditor(node.action, (newAction) => updateInner((targetNode) => { targetNode.action = newAction; })),
      ] : []),
      createEventsSection(node, false, updateInner),
    ],
  };
  return PARAMETER_TABS.map((tab) => putInTab(tab.value, createPanelSection(title, [
    createHint(isModuleState ? 'Ce que cet état change. ● = différent de « Normal ».' : 'Change un élément ici sans toucher aux autres instances. ● = différent du module.'),
    ...createLeadingFields(),
    createSelectField('Élément', getEntryKey(selectedEntry), entries.map((entry) => ({ value: getEntryKey(entry), label: `${'\u2003'.repeat(entry.depth)}${entry.isChanged ? '● ' : ''}${entry.node.name ?? entry.node.id} (${entry.node.id})` })), chooseEntry),
    ...fieldsByTab[tab.value],
    createButtonRow([
      selectedEntry.isChanged ? { label: 'Rétablir cet élément', title: 'Remet tout cet élément comme dans le module (les 3 onglets)', onClick: () => updateInner(null) } : null,
      changedCount ? { label: `Tout rétablir (${changedCount})`, onClick: () => updateInstance((targetInstance) => { targetInstance.overrides = {}; }) } : null,
    ].filter(Boolean)),
  ])));
}

/**
 * Sections d'une répétition : module répété et valeurs d'exemple de chaque élément.
 * @param {object} widget répétition
 * @returns {HTMLElement[]} sections
 */
function createRepeatSections(widget) {
  const itemCount = Math.max(1, getRepeatCount(appState.uiDocument, widget));
  const itemIndex = Math.min(repeatItemIndexByWidget.get(widget.id) ?? 0, itemCount - 1);
  const itemInstance = { id: `${widget.id}#${itemIndex}`, moduleId: widget.content.itemModuleId, overrides: widget.content.itemOverrides?.[itemIndex]?.overrides,
    activeStates: widget.content.itemOverrides?.[itemIndex]?.activeStates };
  const updateItem = (mutateItem) => updateNode(widget.id, (targetWidget) => {
    const itemOverrides = targetWidget.content.itemOverrides ??= {};
    mutateItem(itemOverrides[itemIndex] ??= {});
    if (Object.keys(itemOverrides[itemIndex].overrides ?? {}).length === 0 && !itemOverrides[itemIndex].activeStates) delete itemOverrides[itemIndex];
  });
  const createItemSelect = () => [createSelectField('Élément répété', String(itemIndex), Array.from({ length: itemCount }, (unusedItem, index) => ({ value: String(index),
    label: `${widget.content.itemOverrides?.[index] ? '● ' : ''}Élément ${index + 1}` })), (indexText) => { repeatItemIndexByWidget.set(widget.id, Number(indexText)); notifyChange(); })];
  const stateCheckboxes = createStateCheckboxes(itemInstance, updateItem);
  return [putInTab('properties', createPanelSection('Éléments répétés', [
    createElement('div', { className: 'panel-hint', text: 'Le nombre d\'exemple sert à dessiner et à tester ; l\'app décidera du vrai nombre. Tu peux donner des valeurs d\'exemple à chaque élément.' }),
    createModuleButtonRow(widget.content.itemModuleId),
    ...(stateCheckboxes.length ? [...createItemSelect(), ...stateCheckboxes] : []),
  ])), ...createInstanceSettingsSections(itemInstance, updateItem, 'Valeurs d\'exemple de l\'élément', false, createItemSelect)];
}

/**
 * Paramètres d'un module ouvert sur le canevas.
 * @param {string} moduleId module
 * @returns {HTMLElement[]} sections
 */
function createModuleProperties(moduleId) {
  const module = appState.uiDocument.modules[moduleId];
  const screenSize = createModuleScreen(appState.uiDocument, moduleId).size;
  const updatePreviewSize = (dimension, value) => updateNode(moduleId, (targetModule) => { if (value > 0) targetModule.previewSize = { ...screenSize, [dimension]: value }; });
  return [createPanelSection('Module', [
    createInfoRow('ID', moduleId),
    createTextField('Nom (anglais)', module.name, (newName) => updateNode(moduleId, (targetModule) => { targetModule.name = newName.trim() || targetModule.name; })),
    createInfoRow('Version', `v${module.version}${module.hasLocalChanges ? ' · modifié, pas publié' : ''}`),
    createInfoRow('Instances', String(countModuleInstances(appState.uiDocument, moduleId))),
    createModuleButtonRow(moduleId),
    createNumberField('Largeur de l\'aperçu', screenSize.width, (width) => updatePreviewSize('width', width), { min: 40 }),
    createNumberField('Hauteur de l\'aperçu', screenSize.height, (height) => updatePreviewSize('height', height), { min: 40 }),
    createTextField('Notes pour le codeur', module.notes, (newNotes) => updateNode(moduleId, (targetModule) => { targetModule.notes = newNotes; }), { isMultiline: true }),
  ]), createModuleStatesSection(moduleId)];
}

/**
 * Ajoute une page à une pile de pages et l'affiche.
 * @param {string} pageStackId pile de pages
 */
function addPageToStack(pageStackId) {
  commitChange((uiDocument) => {
    const pageStack = buildNodeIndex(uiDocument).get(pageStackId).node;
    pageStack.children.push(createPage(uiDocument, `Page${pageStack.children.length + 1}`));
    pageStack.content = { ...pageStack.content, activeIndex: pageStack.children.length - 1 };
  });
}

/**
 * Paramètres d'un style partagé (T…).
 * @param {string} styleId style
 * @returns {HTMLElement[]} sections
 */
function createStyleProperties(styleId) {
  const style = appState.uiDocument.styles[styleId];
  const updateStyle = (key, value) => commitChange((uiDocument) => setOrDeleteValue(uiDocument.styles[styleId], key, value));
  return [createPanelSection('Style partagé', [
    createInfoRow('ID', styleId),
    createInfoRow('Utilisé par', `${countStyleUsers(appState.uiDocument, styleId)} élément(s)`),
    createTextField('Nom (anglais)', style.name, (newName) => updateStyle('name', newName.trim() || style.name)),
    createSelectField('S\'applique à', style.appliesTo ?? 'any', STYLE_TARGETS, (target) => updateStyle('appliesTo', target)),
    ...createAppearanceFields(style, updateStyle),
    createButtonRow([{ label: 'Supprimer le style', isDanger: true, onClick: deleteSelection }]),
  ])];
}

/**
 * Arbre écran > areas > widgets de l'écran courant.
 * @returns {HTMLElement} arbre
 */
function createTreeView() {
  const { uiDocument } = appState;
  const { editedModuleId } = appState;
  const screen = editedModuleId ? createModuleScreen(uiDocument, editedModuleId) : uiDocument.screens.find((candidate) => candidate.id === appState.currentScreenId);
  const createTreeRow = (node, depth, kindLabel) => createElement('div', {
    className: `tree-row${node.id === appState.selectedId ? ' is-selected' : ''}`,
    style: { paddingLeft: `${8 + depth * 14}px` },
    on: { click: () => selectNode(node.id) },
  }, [createElement('code', { text: node.id }), createElement('span', { text: ` ${node.name ?? ''}` }), createElement('span', { className: 'tree-kind', text: kindLabel })]);
  const rows = [];
  const visitWidget = (widget, depth) => {
    rows.push(createTreeRow(widget, depth, widget.type === 'moduleInstance' ? `module ${widget.moduleId}` : WIDGET_TYPES[widget.type]?.label ?? widget.type));
    for (const childWidget of widget.children ?? []) visitWidget(childWidget, depth + 1);
  };
  const visitArea = (area, depth) => {
    rows.push(createTreeRow(area, depth, area.moduleId ? `module ${area.moduleId}` : area.split ? (area.split === 'horizontal' ? 'area ⇆' : 'area ⇅') : 'area'));
    for (const childArea of area.children ?? []) visitArea(childArea, depth + 1);
    for (const widget of area.widgets ?? []) visitWidget(widget, depth + 1);
  };
  if (screen) {
    rows.push(createTreeRow(screen, 0, editedModuleId ? 'module' : 'écran'));
    if (screen.root.id === editedModuleId) screen.root.widgets.forEach((widget) => visitWidget(widget, 1));
    else visitArea(screen.root, 1);
  }
  return createElement('div', { className: 'tree-view' }, rows);
}

/**
 * Réglages de l'application (gardés dans l'appareil, pas dans le projet).
 * @returns {HTMLElement[]} sections
 */
function createAppSettingsView() {
  const settingDefinitions = [
    { key: 'handleSize', label: 'Taille des poignées de widget (px)', min: 8, max: 48 },
    { key: 'resizeHandleSize', label: 'Taille des poignées de redimensionnement (px)', min: 6, max: 40 },
    { key: 'scrubPixelsPerStep', label: 'Valeurs en glissant : px par pas (plus grand = plus lent)', min: 1, max: 40 },
    { key: 'snapDistance', label: 'Aimantation des bords d\x27areas (px, 0 = aucune)', min: 0, max: 40 },
  ];
  return [createPanelSection('Réglages de l\x27app', [
    createInfoRow('Version', APP_VERSION),
    createElement('div', { className: 'panel-hint', text: 'Gardés dans cet appareil. Astuce : glisse sur un libellé souligné pour changer la valeur.' }),
    ...settingDefinitions.map((settingDefinition) => createNumberField(settingDefinition.label, appSettings[settingDefinition.key],
      (newValue) => updateAppSetting(settingDefinition.key, newValue), { step: 1, min: settingDefinition.min, max: settingDefinition.max })),
    createElement('div', { className: 'panel-hint', text: 'Mode test (▶ Tester) — pour essayer sur iPad une app faite pour la souris :' }),
    createNumberField('Appui long (ms)', appSettings.longPressDuration, (newValue) => updateAppSetting('longPressDuration', newValue), { step: 10, min: 200, max: 2000 }),
    createNumberField('Double tap : délai max (ms)', appSettings.doubleTapDelay, (newValue) => updateAppSetting('doubleTapDelay', newValue), { step: 10, min: 150, max: 800 }),
    createCheckboxField('Simuler la souris avec le Pencil (aussi réglable dans la barre du test)', appSettings.simulateMouseWithPencil,
      (isChecked) => updateAppSetting('simulateMouseWithPencil', isChecked)),
    createSelectField('Pencil : double tap =', appSettings.pencilDoubleTapAs,
      [{ value: 'rightClick', label: 'Clic droit' }, { value: 'doubleClick', label: 'Double clic' }], (newValue) => updateAppSetting('pencilDoubleTapAs', newValue)),
    createSelectField('Pencil : appui long =', appSettings.pencilLongPressAs,
      [{ value: 'rightClick', label: 'Clic droit' }, { value: 'none', label: 'Rien' }], (newValue) => updateAppSetting('pencilLongPressAs', newValue)),
    createButtonRow([{ label: 'Valeurs par défaut', onClick: () => {
      for (const settingKey of Object.keys(DEFAULT_APP_SETTINGS)) updateAppSetting(settingKey, DEFAULT_APP_SETTINGS[settingKey]);
    } }]),
  ])];
}

/** Redessine la fenêtre de gauche. */
export function renderLeftPanel() {
  if (appState.isScrubbing) return;
  sectionSelectHost.replaceChildren(createSelectElement(appState.leftPanelSection, LEFT_SECTIONS, (section) => { appState.leftPanelSection = section; notifyChange(); }));
  const scrollPosition = panelBodyElement.scrollTop;
  panelBodyElement.replaceChildren();
  if (appState.leftPanelSection === 'settings') {
    panelBodyElement.append(...createAppSettingsView());
    return;
  }
  if (appState.leftPanelSection === 'tree') {
    panelBodyElement.append(createTreeView());
    panelBodyElement.scrollTop = scrollPosition;
    return;
  }
  const selectedId = appState.selectedId;
  if (selectedId?.startsWith('T') && appState.uiDocument.styles[selectedId]) {
    panelBodyElement.append(...createStyleProperties(selectedId));
  } else {
    const record = selectedId ? buildNodeIndex(appState.uiDocument).get(selectedId) : null;
    if (!record) {
      panelBodyElement.append(createElement('div', { className: 'panel-hint', html:
        'Sélectionne un élément dans la fenêtre centrale (Pencil, souris ou tap du doigt).<br><br>'
        + 'Le titre au-dessus du cadre sélectionne l\'écran.<br>Glisse un widget de la bibliothèque (à droite) dans une area, '
        + 'ou touche-le puis touche l\'area.<br><br>Doigt : glisser = déplacer la vue, 2 doigts = zoom.' }));
    } else if (appState.editedStateId && record.screen.id === appState.editedModuleId) showParameterSections(createStateProperties());
    else if (record.kind === 'screen') showParameterSections(createScreenProperties(record.node));
    else if (record.kind === 'module') panelBodyElement.append(...createModuleProperties(selectedId));
    else if (record.kind === 'area') showParameterSections(createAreaProperties(record.node, record));
    else showParameterSections(createWidgetProperties(record.node, record));
  }
  panelBodyElement.scrollTop = scrollPosition;
}

/**
 * Crée la fenêtre de gauche.
 * @returns {HTMLElement} élément
 */
export function createLeftPanel() {
  sectionSelectHost = createElement('div', { className: 'panel-header-select' });
  panelBodyElement = createElement('div', { className: 'panel-body' });
  return createElement('aside', { className: 'side-panel is-left' }, [
    createElement('div', { className: 'panel-header' }, [sectionSelectHost]), panelBodyElement,
  ]);
}
