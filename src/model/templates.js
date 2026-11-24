// Modèles pour essayer vite : écrans types, groupes de widgets, thèmes (PROTOTYPE).
// Chaque modèle fabrique ses éléments avec de nouveaux ID (aucun ID partagé avec le projet).
import { WIDGET_TYPES } from './catalog.js';
import { createId, createLeafArea, createPage, createScreen, createWidget } from './document.js';
import { createModuleInstance, saveNodeAsModule } from './modules.js';

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
  listWithContextMenu: { label: 'Liste avec menu contextuel', icon: 'mouse-pointer-click', build: buildListWithContextMenu },
  dataTable: { label: 'Tableau', icon: 'table', build: (uiDocument) => buildWidget(uiDocument, 'table', {
    name: 'AssetTable', size: { width: 'fill', height: 200 },
    content: { columns: [{ label: 'Name', width: 'fill' }, { label: 'Type', width: 64 }, { label: 'Size', width: 60 }],
      rows: [['Robot.glb', 'Mesh', '12 MB'], ['Key light', 'Light', '1 KB'], ['Main camera', 'Camera', '2 KB'],
        ['Floor', 'Mesh', '300 KB'], ['Skybox.hdr', 'Image', '24 MB']] } }) },
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

/**
 * Crée une page (conteneur qui remplit sa pile de pages) avec ses widgets.
 * @param {object} uiDocument document
 * @param {string} pageName nom anglais
 * @param {object[]} pageWidgets widgets de la page
 * @returns {object} page
 */
function buildPage(uiDocument, pageName, pageWidgets) {
  const page = createPage(uiDocument, pageName);
  page.widgetLayout = { mode: 'stack', direction: 'vertical', gap: 12, padding: [0, 0, 0, 0], alignMain: 'start', alignCross: 'stretch' };
  page.children = pageWidgets;
  return page;
}

/**
 * Fenêtre de réglages : la liste de gauche (General / Display / Audio) pilote une pile de 3 pages à droite.
 * Montre le lien « liste → pile de pages » (content.controlsPageStack).
 * @param {object} uiDocument document
 * @returns {object} écran
 */
function buildSettingsWindow(uiDocument) {
  const createTitle = (titleName, titleText) => buildWidget(uiDocument, 'text', { name: titleName, content: { text: titleText, textRole: 'title' } });
  const settingsPages = buildWidget(uiDocument, 'pageStack', { name: 'SettingsPages', content: { activeIndex: 0 } });
  settingsPages.children = [
    buildPage(uiDocument, 'GeneralPage', [
      createTitle('GeneralTitle', 'General'),
      buildWidget(uiDocument, 'toggle', { name: 'AutoSaveToggle', content: { label: 'Auto save' } }),
      buildWidget(uiDocument, 'toggle', { name: 'CheckUpdatesToggle', content: { label: 'Check for updates' }, state: { on: false } }),
      buildWidget(uiDocument, 'dropdown', { name: 'LanguageDropdown', content: { options: ['English', 'Français', 'Deutsch'] } }),
    ]),
    buildPage(uiDocument, 'DisplayPage', [
      createTitle('DisplayTitle', 'Display'),
      buildWidget(uiDocument, 'dropdown', { name: 'ResolutionDropdown', content: { options: ['1920 × 1080', '2560 × 1440', '3840 × 2160'] } }),
      buildWidget(uiDocument, 'text', { name: 'BrightnessLabel', content: { text: 'Brightness', textRole: 'caption' } }),
      buildWidget(uiDocument, 'slider', { name: 'BrightnessSlider', content: { value: 80 } }),
      buildWidget(uiDocument, 'toggle', { name: 'FullscreenToggle', content: { label: 'Full screen' }, state: { on: false } }),
      buildWidget(uiDocument, 'checkbox', { name: 'VsyncCheckbox', content: { label: 'Vertical sync' } }),
    ]),
    buildPage(uiDocument, 'AudioPage', [
      createTitle('AudioTitle', 'Audio'),
      buildWidget(uiDocument, 'text', { name: 'VolumeLabel', content: { text: 'Master volume', textRole: 'caption' } }),
      buildWidget(uiDocument, 'slider', { name: 'VolumeSlider', content: { value: 65 } }),
      buildWidget(uiDocument, 'dropdown', { name: 'OutputDropdown', content: { options: ['Speakers', 'Headphones', 'HDMI'] } }),
      buildWidget(uiDocument, 'toggle', { name: 'MuteToggle', content: { label: 'Mute' }, state: { on: false } }),
    ]),
  ];
  const categoryList = buildWidget(uiDocument, 'list', { name: 'SettingsCategories', size: { width: 'fill', height: 'fill' },
    content: { items: [{ label: 'General', icon: 'lucide:settings' }, { label: 'Display', icon: 'lucide:monitor' }, { label: 'Audio', icon: 'lucide:volume-2' }],
      selectedIndex: 0, controlsPageStack: settingsPages.id },
    notes: 'Choisir une catégorie affiche la page de même index dans SettingsPages.' });
  return buildScreen(uiDocument, 'custom', 'SettingsWindow',
    () => buildSplitArea(uiDocument, 'Root', 'horizontal', null, [
      buildLeafArea(uiDocument, 'SettingsSidebar', { mode: 'fixed', size: 200 }, VERTICAL_STACK, [categoryList], { styleOverrides: PANEL_LOOK }),
      buildLeafArea(uiDocument, 'SettingsContent', { mode: 'fill' }, { ...VERTICAL_STACK, gap: 16, padding: [20, 20, 20, 20] }, [
        settingsPages,
        buildWidget(uiDocument, 'container', { name: 'DialogButtons', size: { width: 'fill', height: 'hug' },
          widgetLayout: { mode: 'stack', direction: 'horizontal', gap: 8, padding: [0, 0, 0, 0], alignMain: 'end', alignCross: 'center' },
          styleOverrides: { borderWidth: 0 },
          children: [buildWidget(uiDocument, 'button', { name: 'CancelButton', content: { label: 'Cancel' }, styleOverrides: { background: '#3A3D45' } }),
            buildWidget(uiDocument, 'button', { name: 'SaveButton', content: { label: 'Save' } })] }),
      ]),
    ]), { platform: 'macos', size: { width: 900, height: 600 } });
}

const SEQUENCER_COLORS = { background: '#121316', panel: '#1B1D22', raised: '#262930', muted: '#8B909A', border: '#33363E', accent: '#F2D24B',
  mute: '#D9534F', solo: '#4FA3D9', tweak: '#4FC3F7', play: '#2F6F3A', stop: '#8A2F2F', darkBeat: '#1F1F1F', lightBeat: '#383838' };
const SEQUENCER_HEADER_WIDTH = 210;
const SEQUENCER_BEAT_COUNT = 4;
const SEQUENCER_STEPS_PER_BEAT = 4;
/** Pistes de chaque machine : [nom, pas allumés (1 à 16) pour l'exemple]. */
const SEQUENCER_TRACKS = {
  808: [['Bass Drum', [1, 7, 9]], ['Snare', [5, 13]], ['Low Tom', []], ['Mid Tom', []], ['Hi Tom', [15]], ['Rim Shot', []], ['Clap', [13]],
    ['Cowbell', [4, 12]], ['Cymbal', []], ['Open Hat', [11]], ['Closed Hat', [1, 3, 5, 7, 9, 13, 15]]],
  909: [['Bass Drum', [1, 5, 9, 13]], ['Snare', [5, 13]], ['Low Tom', []], ['Mid Tom', []], ['Hi Tom', []], ['Rim Shot', [4]], ['Clap', [5, 13]],
    ['Closed Hat', [1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16]], ['Open Hat', [3, 7, 11, 15]], ['Crash', [1]], ['Ride', []]],
};

/**
 * Conteneur sans bord, en pile.
 * @param {object} uiDocument document
 * @param {string} name nom
 * @param {'horizontal'|'vertical'} direction sens
 * @param {object} size taille
 * @param {object[]} children widgets
 * @param {object} [layoutValues] autres réglages de placement
 * @param {object} [styleOverrides] apparence
 * @returns {object} conteneur
 */
function buildPlainStack(uiDocument, name, direction, size, children, layoutValues = {}, styleOverrides = {}) {
  return buildWidget(uiDocument, 'container', { name, size, children, styleOverrides: { borderWidth: 0, radius: 0, ...styleOverrides },
    widgetLayout: { mode: 'stack', direction, gap: 6, padding: [0, 0, 0, 0], alignMain: 'start', alignCross: direction === 'horizontal' ? 'center' : 'stretch', ...layoutValues } });
}

/**
 * Bouton à deux états (case à cocher affichée comme un bouton).
 * @param {object} uiDocument document
 * @param {string} name nom
 * @param {string} label texte
 * @param {object} size taille
 * @param {string} checkedColor couleur allumée
 * @param {object} [styleOverrides] apparence éteinte
 * @param {boolean} [isChecked] état de départ
 * @returns {object} widget
 */
function buildToggleButton(uiDocument, name, label, size, checkedColor, styleOverrides = {}, isChecked = false) {
  return buildWidget(uiDocument, 'checkbox', { name, content: { label, appearance: 'button', checkedColor }, state: { checked: isChecked }, size,
    styleOverrides: { background: SEQUENCER_COLORS.raised, ...styleOverrides } });
}

/**
 * Crée le module « ligne de pas » : sélection, nom, M / S / T et 16 pas rangés par temps.
 * @param {object} uiDocument document
 * @returns {string} ID du module
 */
function createStepRowModule(uiDocument) {
  const squareButton = { width: 30, height: 32 };
  const header = buildPlainStack(uiDocument, 'TrackHeader', 'horizontal', { width: SEQUENCER_HEADER_WIDTH, height: 'fill' }, [
    buildToggleButton(uiDocument, 'SelectTrack', '', { width: 18, height: 18 }, SEQUENCER_COLORS.accent, { radius: 9, borderWidth: 2, borderColor: SEQUENCER_COLORS.muted }),
    buildWidget(uiDocument, 'button', { name: 'TrackName', content: { label: 'Track' }, size: { width: 'fill', height: 32 },
      styleOverrides: { background: SEQUENCER_COLORS.panel, padding: [0, 2, 0, 2], fontWeight: '400' }, notes: 'Touche = sélectionne la piste et joue son son.',
      action: { type: 'custom', description: 'Sélectionne la piste et joue son son' } }),
    buildToggleButton(uiDocument, 'MuteTrack', 'M', squareButton, SEQUENCER_COLORS.mute, { fontWeight: '700' }),
    buildToggleButton(uiDocument, 'SoloTrack', 'S', squareButton, SEQUENCER_COLORS.solo, { fontWeight: '700' }),
    buildToggleButton(uiDocument, 'TweakTrack', 'T', squareButton, SEQUENCER_COLORS.tweak, { fontWeight: '700' }),
  ], { gap: 4, padding: [0, 6, 0, 8] }, { background: SEQUENCER_COLORS.panel });
  header.children.at(-1).notes = 'Ouvre la ligne de réglages de la piste sous cette ligne (à coder).';
  header.children[0].notes = 'Une seule piste sélectionnée à la fois (à coder).';
  const beats = Array.from({ length: SEQUENCER_BEAT_COUNT }, (unusedBeat, beatIndex) => buildPlainStack(uiDocument, `Beat${beatIndex + 1}`, 'horizontal', { width: 'fill', height: 'fill' },
    Array.from({ length: SEQUENCER_STEPS_PER_BEAT }, (unusedStep, stepIndex) => buildToggleButton(uiDocument, `Step${String(beatIndex * SEQUENCER_STEPS_PER_BEAT + stepIndex + 1).padStart(2, '0')}`, '',
      { width: 'fill', height: 'fill' }, SEQUENCER_COLORS.accent,
      { background: beatIndex % 2 ? SEQUENCER_COLORS.lightBeat : SEQUENCER_COLORS.darkBeat, borderWidth: 1, borderColor: SEQUENCER_COLORS.border })),
    { gap: 6, padding: [3, 3, 3, 3], alignCross: 'stretch' }));
  const row = buildPlainStack(uiDocument, 'StepTrackRow', 'horizontal', { width: 'fill', height: 'fill' }, [header, ...beats], { gap: 0, alignCross: 'stretch' });
  const moduleId = saveNodeAsModule(uiDocument, row);
  Object.assign(uiDocument.modules[moduleId], { previewSize: { width: 900, height: 110 }, notes: 'Une piste du séquenceur. Chaque instance règle TrackName et les pas allumés (Step01 à Step16, state.checked).' });
  uiDocument.modules[moduleId].root.size = { width: 'fill', height: 44 };
  return moduleId;
}

/**
 * Crée une ligne du séquenceur : instance du module avec son nom et ses pas allumés.
 * @param {object} uiDocument document
 * @param {string} moduleId module de ligne
 * @param {string} trackName nom affiché
 * @param {number[]} activeSteps pas allumés (1 à 16)
 * @param {boolean} isSelected piste sélectionnée
 * @returns {object} instance
 */
function buildStepRow(uiDocument, moduleId, trackName, activeSteps, isSelected) {
  const moduleRoot = uiDocument.modules[moduleId].root;
  const instance = createModuleInstance(uiDocument, moduleId);
  Object.assign(instance, { name: `${trackName.replace(/\s+/g, '')}Row`, size: { width: 'fill', height: 'fill' } });
  instance.overrides[findWidgetByName(moduleRoot, 'TrackName').id] = { content: { label: trackName } };
  for (const stepNumber of activeSteps) instance.overrides[findWidgetByName(moduleRoot, `Step${String(stepNumber).padStart(2, '0')}`).id] = { state: { checked: true } };
  if (isSelected) instance.overrides[findWidgetByName(moduleRoot, 'SelectTrack').id] = { state: { checked: true } };
  return instance;
}

/**
 * Écran de séquenceur à pas, inspiré du projet STEP_SEQUENCER : barre du haut, pistes 808 / 909, outils, navigation.
 * Chaque ligne de pas est une instance du même module. Les onglets pilotent des piles de pages.
 * @param {object} uiDocument document
 * @returns {object} écran
 */
function buildStepSequencer(uiDocument) {
  const { raised, panel, muted, accent, background, border } = SEQUENCER_COLORS;
  const caption = (name, text, size) => buildWidget(uiDocument, 'text', { name, content: { text, textRole: 'caption' }, size: size ?? { width: 'hug', height: 'hug' }, styleOverrides: { textColor: muted } });
  const button = (name, label, size, styleOverrides = {}) => buildWidget(uiDocument, 'button', { name, content: { label }, size,
    styleOverrides: { background: raised, padding: [0, 4, 0, 4], fontWeight: '400', ...styleOverrides }, action: { type: 'custom', description: label } });
  const toolButton = (name, label, styleOverrides) => button(name, label, { width: 'fill', height: 34 }, styleOverrides);
  const stepper = (prefix, value) => [button(`${prefix}Minus`, '−', { width: 28, height: 32 }),
    buildWidget(uiDocument, 'textField', { name: `${prefix}Field`, content: { value, placeholder: '', inputKind: 'number' }, size: { width: 46, height: 32 } }),
    button(`${prefix}Plus`, '+', { width: 28, height: 32 })];
  const moduleId = createStepRowModule(uiDocument);

  const machinePages = buildWidget(uiDocument, 'pageStack', { name: 'MachinePages', size: { width: 'fill', height: 'fill' } });
  machinePages.children = Object.entries(SEQUENCER_TRACKS).map(([machineName, tracks]) => {
    const page = buildPage(uiDocument, `Page${machineName}`, tracks.map(([trackName, activeSteps], trackIndex) => buildStepRow(uiDocument, moduleId, trackName, activeSteps, trackIndex === 0)));
    page.widgetLayout.gap = 0;
    return page;
  });
  const patternPage = buildPage(uiDocument, 'PatternPage', [
    buildPlainStack(uiDocument, 'GridHeader', 'horizontal', { width: 'fill', height: 44 }, [
      buildPlainStack(uiDocument, 'TrackListHeader', 'horizontal', { width: SEQUENCER_HEADER_WIDTH, height: 'fill' }, [caption('TracksLabel', 'TRACKS'), caption('SwingLabel', 'Swing'),
        buildWidget(uiDocument, 'slider', { name: 'TrackSwingSlider', content: { value: 0 }, size: { width: 'fill', height: 24 } })], { padding: [0, 8, 0, 8] }, { background: panel }),
      buildWidget(uiDocument, 'tabs', { name: 'MachineTabs', size: { width: 'fill', height: 38 }, content: { tabs: [{ label: '808', icon: '' }, { label: '909', icon: '' }], controlsPageStack: machinePages.id } }),
    ], { gap: 0 }),
    buildPlainStack(uiDocument, 'BeatRuler', 'horizontal', { width: 'fill', height: 26 }, [
      buildPlainStack(uiDocument, 'RulerSpacer', 'horizontal', { width: SEQUENCER_HEADER_WIDTH, height: 'fill' }, [], {}, { background: panel }),
      ...Array.from({ length: SEQUENCER_BEAT_COUNT }, (unusedBeat, beatIndex) => buildPlainStack(uiDocument, `RulerBeat${beatIndex + 1}`, 'horizontal', { width: 'fill', height: 'fill' },
        [caption(`BeatLabel${beatIndex + 1}`, String(beatIndex + 1))], { padding: [0, 0, 0, 6] })),
    ], { gap: 0, alignCross: 'stretch' }),
    machinePages,
    buildPlainStack(uiDocument, 'NavigationBar', 'horizontal', { width: 'fill', height: 92 }, [
      buildPlainStack(uiDocument, 'NavigationOptions', 'vertical', { width: SEQUENCER_HEADER_WIDTH, height: 'fill' }, [caption('NavigationLabel', 'NAVIGATION OPTIONS'),
        buildWidget(uiDocument, 'dropdown', { name: 'SnapDropdown', content: { options: ['Step', 'Beat', '2 Beats', 'Pattern'], selectedIndex: 1 } })], { padding: [8, 8, 8, 8] }, { background: panel }),
      buildWidget(uiDocument, 'placeholder', { name: 'PatternOverview', displayColor: '#565A63', size: { width: 'fill', height: 'fill' },
        content: { description: 'Aperçu de tout le pattern, avec un rectangle de navigation à déplacer et à étirer' } }),
    ], { gap: 0, alignCross: 'stretch' }),
  ]);
  patternPage.widgetLayout.gap = 0;
  const modePages = buildWidget(uiDocument, 'pageStack', { name: 'ModePages' });
  modePages.children = [patternPage,
    buildPage(uiDocument, 'SongPage', [buildWidget(uiDocument, 'placeholder', { name: 'SongEditor', content: { description: 'Enchaînement des patterns' } })]),
    buildPage(uiDocument, 'SoundPage', [buildWidget(uiDocument, 'placeholder', { name: 'SoundEditor', content: { description: 'Réglages des sons de la 808 et de la 909' } })])];

  const topWidgets = [
    caption('TempoLabel', 'Tempo'), ...stepper('Tempo', '120'), caption('SignatureLabel', 'Mesure'),
    buildWidget(uiDocument, 'dropdown', { name: 'TimeSignatureDropdown', content: { options: ['4/4', '3/4', '6/8', 'Custom…'] }, size: { width: 90, height: 32 } }),
    buildWidget(uiDocument, 'separator', { name: 'SelectSeparator', content: { orientation: 'vertical' }, size: { width: 1, height: 32 } }), caption('SelectLabel', 'Select'),
    ...['Pattern', 'Line', 'Beat', 'Half', 'Step'].map((scopeName) => buildToggleButton(uiDocument, `Select${scopeName}`, scopeName, { width: scopeName === 'Pattern' ? 64 : 48, height: 32 }, '#7A6A20')),
    caption('BarsLabel', 'Mesures'), ...stepper('Bars', '1'),
    buildPlainStack(uiDocument, 'TopSpacer', 'horizontal', { width: 'fill', height: 1 }, []),
    buildWidget(uiDocument, 'tabs', { name: 'ModeTabs', size: { width: 'hug', height: 36 }, content: { tabs: ['Pattern', 'Song', 'Son'].map((label) => ({ label, icon: '' })), controlsPageStack: modePages.id } }),
  ];
  const toolWidgets = [caption('ToolsLabel', 'OUTILS'), toolButton('CopyButton', 'Copier'), toolButton('PasteButton', 'Coller'), toolButton('ShiftLeftButton', 'Décaler ←'), toolButton('ShiftRightButton', 'Décaler →'),
    toolButton('ClearButton', 'Effacer'), toolButton('ClearAllButton', 'Effacer tout', { borderWidth: 1, borderColor: SEQUENCER_COLORS.stop, textColor: '#FFB3B3' }),
    buildPlainStack(uiDocument, 'ToolsSpacerTop', 'vertical', { width: 'fill', height: 'fill' }, []),
    Object.assign(buildToggleButton(uiDocument, 'PlayButton', '▶ Play', { width: 'fill', height: 88 }, SEQUENCER_COLORS.stop, { background: SEQUENCER_COLORS.play, radius: 10, fontSize: 18, fontWeight: '700' }),
      { notes: 'Allumé = lecture en cours, le texte devient « ■ Stop » (à coder).' }),
    buildToggleButton(uiDocument, 'TupletButton', 'Tuplet', { width: 'fill', height: 34 }, SEQUENCER_COLORS.tweak),
    caption('PatternSwingLabel', 'Swing'), buildWidget(uiDocument, 'dropdown', { name: 'SwingDropdown', content: { options: ['50%', '54%', '58%', '62%', '66%'] } }),
    buildWidget(uiDocument, 'slider', { name: 'SwingSlider', content: { min: 50, max: 75, value: 50 } }),
    buildWidget(uiDocument, 'dropdown', { name: 'SwingPairsDropdown', content: { options: ['1/16', '1/8'] } }),
    buildPlainStack(uiDocument, 'ToolsSpacerBottom', 'vertical', { width: 'fill', height: 'fill' }, []),
    buildWidget(uiDocument, 'button', { name: 'SettingsButton', content: { label: 'Settings', icon: 'lucide:settings' }, size: { width: 'fill', height: 44 },
      styleOverrides: { background: raised, padding: [0, 4, 0, 4], fontWeight: '400' }, action: { type: 'custom', description: 'Ouvre les réglages' } })];
  const panelLook = { styleOverrides: { background: panel, borderWidth: 1, borderColor: border } };
  return buildScreen(uiDocument, 'ipad', 'StepSequencerScreen', () => buildSplitArea(uiDocument, 'Root', 'vertical', null, [
    buildLeafArea(uiDocument, 'TopBarArea', { mode: 'fixed', size: 52 }, { ...HORIZONTAL_BAR, gap: 6, padding: [0, 12, 0, 12] }, topWidgets, panelLook),
    buildSplitArea(uiDocument, 'MainArea', 'horizontal', { mode: 'fill' }, [
      buildLeafArea(uiDocument, 'EditorArea', { mode: 'fill' }, { ...VERTICAL_STACK, gap: 0, padding: [0, 0, 0, 0] }, [modePages], { styleOverrides: { background } }),
      buildLeafArea(uiDocument, 'ToolsArea', { mode: 'fixed', size: 120 }, { ...VERTICAL_STACK, padding: [8, 8, 8, 8] }, toolWidgets, panelLook),
    ]),
  ]), { notes: `Séquenceur à pas inspiré du projet STEP_SEQUENCER. Chaque ligne est une instance du module ${moduleId}. Les outils de droite dépendent du mode (à coder). Accent : ${accent}.` });
}

/**
 * Crée un élément de menu.
 * @param {string} label texte
 * @param {string} shortcut raccourci (ex. « Ctrl+S »)
 * @param {string} iconName nom Lucide (sans préfixe) ou ''
 * @param {object} [action] action (perso décrite par défaut)
 * @returns {object} élément
 */
function buildMenuItem(label, shortcut, iconName, action) {
  return { label, shortcut, icon: iconName ? `lucide:${iconName}` : '', action: action ?? { type: 'custom', description: label } };
}

const MENU_SEPARATOR = { separator: true };

/**
 * Ajoute un menu réutilisable (barre de menus / clic droit) au document.
 * @param {object} uiDocument document
 * @param {string} name nom anglais
 * @param {object[]} items éléments
 * @returns {string} ID du menu (M…)
 */
function addMenu(uiDocument, name, items) {
  uiDocument.menus ??= {};
  const menuId = createId(uiDocument, 'M');
  uiDocument.menus[menuId] = { name, items };
  return menuId;
}

/**
 * Cherche un widget par son nom dans un arbre (pour relier un modèle à un autre).
 * @param {object} rootNode area ou widget
 * @param {string} widgetName nom cherché
 * @returns {object|null} widget
 */
function findWidgetByName(rootNode, widgetName) {
  for (const childNode of [...(rootNode.children ?? []), ...(rootNode.widgets ?? [])]) {
    if (childNode.name === widgetName) return childNode;
    const foundWidget = findWidgetByName(childNode, widgetName);
    if (foundWidget) return foundWidget;
  }
  return null;
}

/**
 * App de bureau avec une vraie barre de menus (File / Edit / View / Help), des menus contextuels au clic droit
 * et « Edit → Options… » qui ouvre la fenêtre de réglages en dialogue. Ajoute 2 écrans.
 * @param {object} uiDocument document
 * @returns {object[]} [écran principal, fenêtre de réglages]
 */
function buildMenuApp(uiDocument) {
  const settingsScreen = buildSettingsWindow(uiDocument);
  settingsScreen.name = 'OptionsDialog';
  for (const buttonName of ['CancelButton', 'SaveButton']) {
    const dialogButton = findWidgetByName(settingsScreen.root, buttonName);
    if (dialogButton) dialogButton.action = { type: 'closeDialog' };
  }
  const openOptions = { type: 'openDialog', target: settingsScreen.id };
  const fileMenuId = addMenu(uiDocument, 'FileMenu', [
    buildMenuItem('New', 'Ctrl+N', 'file-plus'), buildMenuItem('Open…', 'Ctrl+O', 'folder-open'),
    { ...buildMenuItem('Open recent', '', ''), submenu: [buildMenuItem('Robot.glb', '', ''), buildMenuItem('House.blend', '', '')] },
    MENU_SEPARATOR, buildMenuItem('Save', 'Ctrl+S', 'save'), buildMenuItem('Save as…', 'Ctrl+Shift+S', ''),
    MENU_SEPARATOR, buildMenuItem('Quit', 'Ctrl+Q', 'log-out'),
  ]);
  const editMenuId = addMenu(uiDocument, 'EditMenu', [
    buildMenuItem('Undo', 'Ctrl+Z', 'undo-2'), buildMenuItem('Redo', 'Ctrl+Y', 'redo-2'), MENU_SEPARATOR,
    buildMenuItem('Cut', 'Ctrl+X', 'scissors'), buildMenuItem('Copy', 'Ctrl+C', 'copy'), buildMenuItem('Paste', 'Ctrl+V', 'clipboard-paste'),
    MENU_SEPARATOR, buildMenuItem('Options…', 'Ctrl+,', 'settings', openOptions),
  ]);
  const workspaceContextMenuId = addMenu(uiDocument, 'WorkspaceContextMenu', [
    buildMenuItem('Cut', 'Ctrl+X', 'scissors'), buildMenuItem('Copy', 'Ctrl+C', 'copy'), buildMenuItem('Paste', 'Ctrl+V', 'clipboard-paste'),
    MENU_SEPARATOR, buildMenuItem('Delete', 'Del', 'trash'), MENU_SEPARATOR, buildMenuItem('Options…', '', 'settings', openOptions),
  ]);
  const outlinerContextMenuId = addMenu(uiDocument, 'OutlinerContextMenu', [
    buildMenuItem('Rename', 'F2', 'pencil'), buildMenuItem('Duplicate', 'Ctrl+D', 'copy'), MENU_SEPARATOR, buildMenuItem('Delete', 'Del', 'trash'),
  ]);
  const outlinerList = buildWidget(uiDocument, 'list', { name: 'OutlinerList', size: { width: 'fill', height: 'fill' },
    content: { items: [{ label: 'Camera', icon: 'lucide:video' }, { label: 'Light', icon: 'lucide:lightbulb' }, { label: 'Cube', icon: 'lucide:box' }] },
    events: [{ trigger: 'rightClick', action: { type: 'openContextMenu', menuId: outlinerContextMenuId } }] });
  const viewMenuId = addMenu(uiDocument, 'ViewMenu', [
    buildMenuItem('Zoom in', 'Ctrl++', 'zoom-in'), buildMenuItem('Zoom out', 'Ctrl+-', 'zoom-out'), MENU_SEPARATOR,
    { ...buildMenuItem('Show outliner', '', '', { type: 'toggleVisibility', target: outlinerList.id }), checked: true },
  ]);
  const helpMenuId = addMenu(uiDocument, 'HelpMenu', [buildMenuItem('Documentation', 'F1', 'book-open'), buildMenuItem('About', '', 'info')]);
  const mainScreen = buildScreen(uiDocument, '16:9-small', 'MenuAppMainWindow',
    () => buildSplitArea(uiDocument, 'Root', 'vertical', null, [
      buildLeafArea(uiDocument, 'MenuArea', { mode: 'fixed', size: 28 }, { ...HORIZONTAL_BAR, padding: [0, 0, 0, 0] }, [
        buildWidget(uiDocument, 'menuBar', { name: 'MainMenuBar', content: { menus: [
          { label: 'File', menuId: fileMenuId }, { label: 'Edit', menuId: editMenuId }, { label: 'View', menuId: viewMenuId }, { label: 'Help', menuId: helpMenuId },
        ] } }),
      ]),
      buildSplitArea(uiDocument, 'WorkArea', 'horizontal', { mode: 'fill' }, [
        buildLeafArea(uiDocument, 'OutlinerPanel', { mode: 'fixed', size: 220, min: 160, max: 360 }, VERTICAL_STACK, [
          buildWidget(uiDocument, 'text', { name: 'OutlinerTitle', content: { text: 'Outliner', textRole: 'subtitle' } }), outlinerList,
        ], { resizableSplitter: true, styleOverrides: PANEL_LOOK }),
        buildLeafArea(uiDocument, 'WorkspaceArea', { mode: 'fill' }, { mode: 'free' }, [
          buildWidget(uiDocument, 'placeholder', { name: 'Workspace', placement: { anchor: 'stretch', x: 0, y: 0 },
            content: { description: 'Zone de travail — clic droit (ou appui long) : menu contextuel' },
            events: [{ trigger: 'rightClick', action: { type: 'openContextMenu', menuId: workspaceContextMenuId } }] }),
        ]),
      ]),
      buildLeafArea(uiDocument, 'StatusBarArea', { mode: 'fixed', size: 24 }, { ...HORIZONTAL_BAR, padding: [0, 8, 0, 8] },
        [buildWidget(uiDocument, 'text', { name: 'StatusText', content: { text: 'File / Edit / View / Help : menus · clic droit : menu contextuel · Edit › Options… : dialogue', textRole: 'caption' } })]),
    ]));
  return [mainScreen, settingsScreen];
}

/**
 * App de dessin iPad : outils, toile, calques. Double tap du Pencil = changer d'outil, squeeze = palette d'outils,
 * appui long sur la toile = menu contextuel.
 * @param {object} uiDocument document
 * @returns {object} écran
 */
function buildDrawingApp(uiDocument) {
  const canvasMenuId = addMenu(uiDocument, 'CanvasContextMenu', [
    buildMenuItem('Undo', '', 'undo-2'), buildMenuItem('Redo', '', 'redo-2'), MENU_SEPARATOR, buildMenuItem('Clear canvas', '', 'trash'),
  ]);
  const toolPaletteMenuId = addMenu(uiDocument, 'ToolPaletteMenu', [
    buildMenuItem('Brush', '', 'brush'), buildMenuItem('Pencil', '', 'pencil'), buildMenuItem('Eraser', '', 'eraser'), buildMenuItem('Lasso', '', 'lasso'),
    MENU_SEPARATOR, buildMenuItem('Colors…', '', 'palette'),
  ]);
  const toolButton = (iconName, toolName) => buildWidget(uiDocument, 'button', { name: `${toolName}ToolButton`,
    content: { label: '', icon: `lucide:${iconName}`, iconPosition: 'only' }, size: { width: 44, height: 44 },
    action: { type: 'custom', description: `Outil : ${toolName}` } });
  const screen = buildScreen(uiDocument, 'ipad', 'DrawingScreen',
    () => buildSplitArea(uiDocument, 'Root', 'horizontal', null, [
      buildLeafArea(uiDocument, 'ToolsArea', { mode: 'fixed', size: 64 }, { ...VERTICAL_STACK, alignCross: 'center', padding: [24, 8, 8, 8] },
        [toolButton('brush', 'Brush'), toolButton('eraser', 'Eraser'), toolButton('lasso', 'Lasso'), toolButton('undo-2', 'Undo')], { styleOverrides: PANEL_LOOK }),
      buildLeafArea(uiDocument, 'CanvasArea', { mode: 'fill' }, { mode: 'free' }, [
        buildWidget(uiDocument, 'placeholder', { name: 'DrawingCanvas', placement: { anchor: 'stretch', x: 0, y: 0 },
          content: { description: 'Toile de dessin (codée plus tard) — appui long : menu ; double tap Pencil : pinceau ↔ gomme ; squeeze : palette' },
          events: [{ trigger: 'longPress', action: { type: 'openContextMenu', menuId: canvasMenuId } }] }),
      ]),
      buildLeafArea(uiDocument, 'LayersArea', { mode: 'fixed', size: 220 }, { ...VERTICAL_STACK, padding: [24, 12, 12, 12] }, [
        buildWidget(uiDocument, 'text', { name: 'LayersTitle', content: { text: 'Layers', textRole: 'subtitle' } }),
        buildWidget(uiDocument, 'list', { name: 'LayerList', size: { width: 'fill', height: 'fill' },
          content: { items: [{ label: 'Sketch', icon: '' }, { label: 'Ink', icon: '' }, { label: 'Colors', icon: '' }] } }),
      ], { styleOverrides: PANEL_LOOK }),
    ]));
  screen.events = [
    { trigger: 'pencilDoubleTap', action: { type: 'custom', description: 'Basculer pinceau ↔ gomme' } },
    { trigger: 'pencilSqueeze', action: { type: 'openContextMenu', menuId: toolPaletteMenuId } },
  ];
  return screen;
}

/**
 * Liste avec menu contextuel au clic droit / appui long (groupe de widgets).
 * @param {object} uiDocument document
 * @returns {object} widget
 */
function buildListWithContextMenu(uiDocument) {
  const listMenuId = addMenu(uiDocument, 'FileListContextMenu', [
    buildMenuItem('Open', 'Enter', 'folder-open'), buildMenuItem('Rename', 'F2', 'pencil'), buildMenuItem('Duplicate', 'Ctrl+D', 'copy'),
    MENU_SEPARATOR, buildMenuItem('Delete', 'Del', 'trash'),
  ]);
  return buildWidget(uiDocument, 'list', { name: 'FileList', size: { width: 'fill', height: 160 },
    content: { items: ['Robot.glb', 'House.blend', 'Spaceship.fbx'].map((itemLabel) => ({ label: itemLabel, icon: 'lucide:file' })) },
    events: [{ trigger: 'rightClick', action: { type: 'openContextMenu', menuId: listMenuId } }],
    notes: 'Clic droit (ou appui long) sur la liste : menu contextuel FileListContextMenu.' });
}

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
  menuApp: { label: 'App avec menus (barre File / Edit…, clic droit, dialogue Options)', icon: 'square-menu', build: buildMenuApp },
  drawingApp: { label: 'App de dessin iPad (événements du Pencil)', icon: 'brush', build: buildDrawingApp },
  settingsWindow: { label: 'Fenêtre de réglages (la liste change la page de droite)', icon: 'settings-2', build: buildSettingsWindow },
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
  stepSequencer: { label: 'iPad : séquenceur à pas (ligne = module)', icon: 'drum', build: buildStepSequencer },
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
