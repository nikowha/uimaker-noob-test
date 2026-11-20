// Modèles pour essayer vite : écrans types, groupes de widgets, thèmes (PROTOTYPE).
// Chaque modèle fabrique ses éléments avec de nouveaux ID (aucun ID partagé avec le projet).
import { WIDGET_TYPES } from './catalog.js';
import { createId, createLeafArea, createScreen, createWidget } from './document.js';

/**
 * Crée un widget du catalogue et fusionne des valeurs (content et state fusionnés, le reste remplacé).
 * @param {object} uiDocument document
 * @param {string} widgetType type
 * @param {object} [widgetValues] valeurs (name, content, size, placement, children…)
 * @returns {object} widget
 */
function buildWidget(uiDocument, widgetType, widgetValues = {}) {
  const widget = createWidget(uiDocument, widgetType);
  const { content, state, ...otherValues } = widgetValues;
  if (content) widget.content = { ...widget.content, ...content };
  if (state) widget.state = { ...widget.state, ...state };
  Object.assign(widget, otherValues);
  return widget;
}

/**
 * Crée une area feuille.
 * @param {object} uiDocument document
 * @param {string} name nom
 * @param {object} sizing taille dans le découpage
 * @param {object} widgetLayout placement des widgets
 * @param {object[]} widgets widgets
 * @param {object} [extraValues] autres valeurs (resizableSplitter, styleOverrides…)
 * @returns {object} area
 */
function buildLeafArea(uiDocument, name, sizing, widgetLayout, widgets, extraValues = {}) {
  const area = createLeafArea(uiDocument, name);
  return Object.assign(area, { sizing, widgetLayout: { ...area.widgetLayout, ...widgetLayout }, widgets }, extraValues);
}

/**
 * Crée une area découpée.
 * @param {object} uiDocument document
 * @param {string} name nom
 * @param {'horizontal'|'vertical'} splitDirection sens
 * @param {object} sizing taille dans le découpage du parent
 * @param {object[]} children sous-areas
 * @returns {object} area
 */
function buildSplitArea(uiDocument, name, splitDirection, sizing, children) {
  return { id: createId(uiDocument, 'A'), name, sizing, split: splitDirection, children };
}

/**
 * Crée un écran et remplace son area racine.
 * @param {object} uiDocument document
 * @param {string} presetKey préréglage
 * @param {string} name nom
 * @param {(uiDocument: object) => object} buildRootArea fabrique l'area racine
 * @param {object} [screenValues] autres valeurs (orientation, size…)
 * @returns {object} écran
 */
function buildScreen(uiDocument, presetKey, name, buildRootArea, screenValues = {}) {
  const screen = createScreen(uiDocument, presetKey);
  const rootArea = buildRootArea(uiDocument);
  rootArea.name = 'Root';
  delete rootArea.sizing;
  Object.assign(screen, { name, root: rootArea }, screenValues);
  return screen;
}

const VERTICAL_STACK = { mode: 'stack', direction: 'vertical', gap: 8, padding: [12, 12, 12, 12], alignMain: 'start', alignCross: 'stretch' };
const HORIZONTAL_BAR = { mode: 'stack', direction: 'horizontal', gap: 4, padding: [0, 4, 0, 4], alignMain: 'start', alignCross: 'center' };
const PANEL_LOOK = { background: '#26282E', borderWidth: 1, borderColor: '#3A3D45' };

/** Groupes de widgets (ajoutés dans l'area / le conteneur sélectionné). */
const WIDGET_GROUP_TEMPLATES = {
  loginForm: { label: 'Formulaire de connexion', icon: 'log-in', build: (uiDocument) => buildWidget(uiDocument, 'container', {
    name: 'LoginForm', size: { width: 'fill', height: 'hug', maxWidth: 360 },
    children: [
      buildWidget(uiDocument, 'text', { name: 'LoginTitle', content: { text: 'Sign in', textRole: 'title' } }),
      buildWidget(uiDocument, 'textField', { name: 'EmailField', content: { placeholder: 'Email', inputKind: 'email' } }),
      buildWidget(uiDocument, 'textField', { name: 'PasswordField', content: { placeholder: 'Password', inputKind: 'password' } }),
      buildWidget(uiDocument, 'checkbox', { name: 'RememberCheckbox', content: { label: 'Remember me' } }),
      buildWidget(uiDocument, 'button', { name: 'LoginButton', content: { label: 'Sign in' }, size: { width: 'fill', height: 36 } }),
    ] }) },
  iconToolbar: { label: 'Barre d\'outils (icônes)', icon: 'wrench', build: (uiDocument) => buildWidget(uiDocument, 'toolbar', {
    name: 'MainToolbar',
    children: ['mouse-pointer-2', 'move', 'rotate-cw', 'scaling', 'trash'].map((iconName) => buildWidget(uiDocument, 'button', {
      name: `${iconName.replace(/(^|-)(\w)/g, (unusedMatch, unusedDash, letter) => letter.toUpperCase()).replace(/\d/g, '')}Button`,
      content: { label: '', icon: `lucide:${iconName}`, iconPosition: 'only' }, size: { width: 32, height: 32 } })),
  }) },
  dataTable: { label: 'Tableau', icon: 'table', build: (uiDocument) => buildWidget(uiDocument, 'table', {
    name: 'AssetTable', size: { width: 'fill', height: 200 },
    content: { columns: [{ label: 'Name', width: 'fill' }, { label: 'Type', width: 90 }, { label: 'Size', width: 70 }, { label: 'Date', width: 100 }],
      rows: [['Robot.glb', 'Mesh', '12 MB', '2026-11-02'], ['Key light', 'Light', '1 KB', '2026-11-05'], ['Main camera', 'Camera', '2 KB', '2026-11-06'],
        ['Floor', 'Mesh', '300 KB', '2026-11-10'], ['Skybox.hdr', 'Image', '24 MB', '2026-11-12']] } }) },
  infoCard: { label: 'Carte', icon: 'square-user', build: (uiDocument) => buildWidget(uiDocument, 'container', {
    name: 'InfoCard', size: { width: 'fill', height: 'hug' },
    children: [
      buildWidget(uiDocument, 'icon', { name: 'CardIcon', content: { icon: 'lucide:package', size: 28 } }),
      buildWidget(uiDocument, 'text', { name: 'CardTitle', content: { text: 'Card title', textRole: 'subtitle' } }),
      buildWidget(uiDocument, 'text', { name: 'CardText', content: { text: 'Short description of the card content.', textRole: 'body' }, size: { width: 'fill', height: 'hug' } }),
      buildWidget(uiDocument, 'button', { name: 'CardButton', content: { label: 'Open' } }),
    ] }) },
  settingsGroup: { label: 'Groupe de réglages', icon: 'settings', build: (uiDocument) => buildWidget(uiDocument, 'container', {
    name: 'SettingsGroup', size: { width: 'fill', height: 'hug' }, content: { title: 'Settings' },
    children: [
      buildWidget(uiDocument, 'toggle', { name: 'AutoSaveToggle', content: { label: 'Auto save' } }),
      buildWidget(uiDocument, 'toggle', { name: 'SnapToggle', content: { label: 'Snap to grid' }, state: { on: false } }),
      buildWidget(uiDocument, 'slider', { name: 'QualitySlider', content: { value: 70 } }),
      buildWidget(uiDocument, 'dropdown', { name: 'UnitsDropdown', content: { options: ['Meters', 'Centimeters', 'Inches'] } }),
    ] }) },
};

/** Écrans types (ajoutés au projet). */
const SCREEN_TEMPLATES = {
  desktopApp: { label: 'App de bureau (menus, outils, 3 panneaux, barre d\'état)', icon: 'app-window', build: (uiDocument) => buildScreen(uiDocument, '16:9-small', 'DesktopMainWindow',
    () => buildSplitArea(uiDocument, 'Root', 'vertical', null, [
      buildLeafArea(uiDocument, 'MenuArea', { mode: 'fixed', size: 28 }, { ...HORIZONTAL_BAR, padding: [0, 0, 0, 0] },
        [buildWidget(uiDocument, 'menuBar', { name: 'MainMenuBar' })]),
      buildLeafArea(uiDocument, 'ToolbarArea', { mode: 'fixed', size: 40 }, { ...HORIZONTAL_BAR, padding: [0, 0, 0, 0] },
        [WIDGET_GROUP_TEMPLATES.iconToolbar.build(uiDocument)]),
      buildSplitArea(uiDocument, 'WorkArea', 'horizontal', { mode: 'fill' }, [
        buildLeafArea(uiDocument, 'OutlinerPanel', { mode: 'fixed', size: 240, min: 160, max: 400 }, VERTICAL_STACK, [
          buildWidget(uiDocument, 'text', { name: 'OutlinerTitle', content: { text: 'Outliner', textRole: 'subtitle' } }),
          buildWidget(uiDocument, 'textField', { name: 'OutlinerSearch', content: { placeholder: 'Search', inputKind: 'search' } }),
          buildWidget(uiDocument, 'list', { name: 'OutlinerList', size: { width: 'fill', height: 'fill' },
            content: { items: [{ label: 'Camera', icon: 'lucide:video' }, { label: 'Light', icon: 'lucide:lightbulb' }, { label: 'Cube', icon: 'lucide:box' }] } }),
        ], { resizableSplitter: true, styleOverrides: PANEL_LOOK }),
        buildLeafArea(uiDocument, 'ViewportArea', { mode: 'fill' }, { mode: 'free' }, [
          buildWidget(uiDocument, 'placeholder', { name: 'Viewport3D', placement: { anchor: 'stretch', x: 0, y: 0 }, content: { description: 'Vue 3D (codée plus tard)' } }),
        ]),
        buildLeafArea(uiDocument, 'PropertiesPanel', { mode: 'fixed', size: 280, min: 200, max: 420 }, VERTICAL_STACK, [
          buildWidget(uiDocument, 'tabs', { name: 'PropertiesTabs', content: { tabs: [{ label: 'Object', icon: '' }, { label: 'Material', icon: '' }] } }),
          buildWidget(uiDocument, 'textField', { name: 'ObjectNameField', content: { value: 'Cube' } }),
          buildWidget(uiDocument, 'slider', { name: 'ScaleSlider', content: { value: 50 } }),
          buildWidget(uiDocument, 'checkbox', { name: 'VisibleCheckbox', content: { label: 'Visible' } }),
          WIDGET_GROUP_TEMPLATES.dataTable.build(uiDocument),
        ], { styleOverrides: PANEL_LOOK }),
      ]),
      buildLeafArea(uiDocument, 'StatusBarArea', { mode: 'fixed', size: 24 }, { ...HORIZONTAL_BAR, padding: [0, 8, 0, 8] },
        [buildWidget(uiDocument, 'text', { name: 'StatusText', content: { text: 'Ready', textRole: 'caption' } })]),
    ])) },
  settingsWindow: { label: 'Fenêtre de réglages (barre latérale + formulaire)', icon: 'settings-2', build: (uiDocument) => buildScreen(uiDocument, 'custom', 'SettingsWindow',
    () => buildSplitArea(uiDocument, 'Root', 'horizontal', null, [
      buildLeafArea(uiDocument, 'SettingsSidebar', { mode: 'fixed', size: 200 }, VERTICAL_STACK, [
        buildWidget(uiDocument, 'list', { name: 'SettingsCategories', size: { width: 'fill', height: 'fill' },
          content: { items: [{ label: 'General', icon: 'lucide:settings' }, { label: 'Display', icon: 'lucide:monitor' }, { label: 'Audio', icon: 'lucide:volume-2' }] } }),
      ], { styleOverrides: PANEL_LOOK }),
      buildLeafArea(uiDocument, 'SettingsContent', { mode: 'fill' }, { ...VERTICAL_STACK, padding: [20, 20, 20, 20] }, [
        buildWidget(uiDocument, 'text', { name: 'SettingsTitle', content: { text: 'General', textRole: 'title' } }),
        WIDGET_GROUP_TEMPLATES.settingsGroup.build(uiDocument),
        buildWidget(uiDocument, 'container', { name: 'DialogButtons', size: { width: 'fill', height: 'hug' },
          widgetLayout: { mode: 'stack', direction: 'horizontal', gap: 8, padding: [0, 0, 0, 0], alignMain: 'end', alignCross: 'center' },
          styleOverrides: { borderWidth: 0 },
          children: [buildWidget(uiDocument, 'button', { name: 'CancelButton', content: { label: 'Cancel' }, styleOverrides: { background: '#3A3D45' } }),
            buildWidget(uiDocument, 'button', { name: 'SaveButton', content: { label: 'Save' } })] }),
      ]),
    ]), { platform: 'macos', size: { width: 900, height: 600 } }) },
  ipadSplit: { label: 'iPad : liste + détail', icon: 'tablet', build: (uiDocument) => buildScreen(uiDocument, 'ipad', 'IpadMainScreen',
    () => buildSplitArea(uiDocument, 'Root', 'horizontal', null, [
      buildLeafArea(uiDocument, 'ListColumn', { mode: 'fixed', size: 320 }, { ...VERTICAL_STACK, padding: [24, 16, 16, 16] }, [
        buildWidget(uiDocument, 'text', { name: 'ListTitle', content: { text: 'Projects', textRole: 'title' } }),
        buildWidget(uiDocument, 'textField', { name: 'ProjectSearch', content: { placeholder: 'Search', inputKind: 'search' } }),
        buildWidget(uiDocument, 'list', { name: 'ProjectList', size: { width: 'fill', height: 'fill' },
          content: { items: [{ label: 'Robot', icon: 'lucide:bot' }, { label: 'Spaceship', icon: 'lucide:rocket' }, { label: 'House', icon: 'lucide:house' }] } }),
      ], { styleOverrides: PANEL_LOOK }),
      buildLeafArea(uiDocument, 'DetailColumn', { mode: 'fill' }, { ...VERTICAL_STACK, padding: [24, 24, 24, 24] }, [
        buildWidget(uiDocument, 'text', { name: 'DetailTitle', content: { text: 'Robot', textRole: 'title' } }),
        buildWidget(uiDocument, 'placeholder', { name: 'DetailPreview', size: { width: 'fill', height: 'fill' }, content: { description: 'Aperçu (codé plus tard)' } }),
      ]),
    ])) },
  phoneApp: { label: 'Smartphone : barre de titre, liste, onglets', icon: 'smartphone', build: (uiDocument) => buildScreen(uiDocument, 'smartphone', 'PhoneHomeScreen',
    () => buildSplitArea(uiDocument, 'Root', 'vertical', null, [
      buildLeafArea(uiDocument, 'NavigationBarArea', { mode: 'fixed', size: 103 }, { ...VERTICAL_STACK, padding: [63, 16, 8, 16] }, [
        buildWidget(uiDocument, 'text', { name: 'ScreenTitle', content: { text: 'Home', textRole: 'title' } }),
      ], { styleOverrides: PANEL_LOOK }),
      buildLeafArea(uiDocument, 'ContentArea', { mode: 'fill' }, { ...VERTICAL_STACK, padding: [8, 16, 8, 16] }, [
        buildWidget(uiDocument, 'textField', { name: 'HomeSearch', content: { placeholder: 'Search', inputKind: 'search' } }),
        buildWidget(uiDocument, 'list', { name: 'HomeList', size: { width: 'fill', height: 'fill' },
          content: { items: ['Inbox', 'Today', 'Upcoming', 'Archive'].map((itemLabel) => ({ label: itemLabel, icon: '' })) } }),
      ]),
      buildLeafArea(uiDocument, 'TabBarArea', { mode: 'fixed', size: 83 }, { ...VERTICAL_STACK, padding: [4, 8, 34, 8] }, [
        buildWidget(uiDocument, 'tabs', { name: 'MainTabBar', size: { width: 'fill', height: 44 },
          content: { tabs: [{ label: 'Home', icon: 'lucide:house' }, { label: 'Search', icon: 'lucide:search' }, { label: 'Profile', icon: 'lucide:user' }] } }),
      ], { styleOverrides: PANEL_LOOK }),
    ])) },
  allWidgets: { label: 'Tous les widgets (grille)', icon: 'layout-grid', build: (uiDocument) => buildScreen(uiDocument, '16:9-small', 'AllWidgetsScreen',
    () => buildLeafArea(uiDocument, 'Root', { mode: 'fill' }, { mode: 'grid', columns: ['1fr', '1fr', '1fr', '1fr'], gap: 16, padding: [16, 16, 16, 16] },
      Object.keys(WIDGET_TYPES).map((widgetType) => {
        const widget = buildWidget(uiDocument, widgetType);
        if (widget.size?.height === 'fill') widget.size.height = 120;
        return widget;
      }))) },
};

/**
 * Ajoute (ou complète) des thèmes sombre et clair avec 6 variables de couleur courantes.
 * Si le projet n'a qu'un thème « Default » sans variable, il devient le thème sombre.
 * @param {object} uiDocument document
 * @returns {string} ID du thème sombre
 */
function addDarkLightThemes(uiDocument) {
  const themeIds = Object.keys(uiDocument.themes);
  const isUntouchedDefault = themeIds.length === 1 && uiDocument.themes[themeIds[0]].name === 'Default' && Object.keys(uiDocument.colorVariables).length === 0;
  const darkThemeId = isUntouchedDefault ? themeIds[0] : createId(uiDocument, 'H');
  const lightThemeId = createId(uiDocument, 'H');
  uiDocument.themes[darkThemeId] = { name: 'Dark' };
  uiDocument.themes[lightThemeId] = { name: 'Light' };
  const variableValues = [
    ['background', '#1C1D21', '#F4F5F7'], ['surface', '#26282E', '#FFFFFF'], ['textMain', '#ECEDEF', '#15171A'],
    ['textMuted', '#9A9EA6', '#646A73'], ['accent', '#4C8DFF', '#2563EB'], ['border', '#3A3D45', '#D5D8DE'],
  ];
  for (const [variableName, darkValue, lightValue] of variableValues) {
    const existingEntry = Object.values(uiDocument.colorVariables).find((colorVariable) => colorVariable.name === variableName);
    const colorVariable = existingEntry ?? (uiDocument.colorVariables[createId(uiDocument, 'V')] = { name: variableName, values: {} });
    for (const themeId of Object.keys(uiDocument.themes)) colorVariable.values[themeId] ??= darkValue;
    colorVariable.values[darkThemeId] = darkValue;
    colorVariable.values[lightThemeId] = lightValue;
  }
  uiDocument.project.defaultTheme = darkThemeId;
  return darkThemeId;
}

/** Liste des modèles par catégorie, pour la fenêtre de droite. */
export const TEMPLATE_CATEGORIES = [
  { key: 'screen', label: 'Écrans types (ajoute un écran)', templates: SCREEN_TEMPLATES },
  { key: 'widgets', label: 'Groupes de widgets (dans l\'area sélectionnée)', templates: WIDGET_GROUP_TEMPLATES },
  { key: 'theme', label: 'Thèmes', templates: { darkLight: { label: 'Sombre + clair (6 variables de couleur)', icon: 'sun-moon', build: addDarkLightThemes } } },
];

/**
 * Applique un modèle au document.
 * @param {object} uiDocument document
 * @param {string} categoryKey catégorie (screen, widgets, theme)
 * @param {string} templateKey modèle
 * @returns {object} { kind, createdNode } : écran ajouté, widget à insérer, ou ID de thème
 */
export function buildTemplate(uiDocument, categoryKey, templateKey) {
  const category = TEMPLATE_CATEGORIES.find((candidate) => candidate.key === categoryKey);
  const template = category?.templates[templateKey];
  if (!template) throw new Error(`Modèle inconnu : ${categoryKey}/${templateKey}`);
  return { kind: categoryKey, createdNode: template.build(uiDocument) };
}
