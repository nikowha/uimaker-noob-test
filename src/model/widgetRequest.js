// Demandes à donner à une session Claude : nouveau custom widget, ou widget existant à modifier (PROTOTYPE).
import { coerceParamValue, createCustomWidgetFileText, fillParams, installCustomWidget } from './customWidgets.js';
import { buildNodeIndex } from './document.js';
import { WIDGET_TYPES } from './catalog.js';

/** Séparateur des listes dans un réglage de type texte (les custom widgets n'ont pas de réglage « liste »). */
const LIST_SEPARATOR = ' | ';
const EXCLUDED_TYPES = new Set(['moduleInstance', 'repeat', 'menuBar', 'customWidget']);
const CODE_FENCE = '~~~~';

/**
 * Indique si un widget de base peut devenir un custom widget (pas un conteneur : son contenu serait perdu).
 * @param {object} widget widget
 * @returns {boolean} vrai si possible
 */
export function canBecomeCustomWidget(widget) {
  return Boolean(WIDGET_TYPES[widget.type]) && !WIDGET_TYPES[widget.type].isContainer && !widget.children && !EXCLUDED_TYPES.has(widget.type);
}

/**
 * Définitions qui remplacent un type de widget de base : celles du projet, puis celles de la bibliothèque.
 * @param {object} uiDocument document
 * @param {object[]} libraryEntries bibliothèque
 * @param {string} widgetType type du widget de base
 * @returns {object[]} définitions
 */
export function listReplacements(uiDocument, libraryEntries, widgetType) {
  const projectDefinitions = Object.values(uiDocument.customWidgets ?? {});
  const projectLibraryIds = new Set(projectDefinitions.map((definition) => definition.libraryId));
  return [...projectDefinitions, ...libraryEntries.filter((entry) => !projectLibraryIds.has(entry.libraryId))].filter((definition) => definition.basedOn === widgetType);
}

/**
 * Ramène une valeur de contenu à une valeur simple : une liste devient un texte « A | B ».
 * @param {any} value valeur
 * @returns {any} nombre, texte, oui / non, ou undefined
 */
export function simplifyContentValue(value) {
  if (Array.isArray(value)) {
    const labels = value.map((item) => (item && typeof item === 'object' ? item.label : item));
    return labels.every((label) => ['string', 'number'].includes(typeof label)) ? labels.join(LIST_SEPARATOR) : undefined;
  }
  return value !== null && typeof value === 'object' ? undefined : value;
}

/**
 * Remplace un widget de base par un custom widget : même ID, nom, taille, place, apparence et événements.
 * @param {object} uiDocument document, modifié sur place
 * @param {string} widgetId widget
 * @param {object} definition définition
 */
export function replaceWithCustomWidget(uiDocument, widgetId, definition) {
  const widget = buildNodeIndex(uiDocument).get(widgetId)?.node;
  if (!widget || !canBecomeCustomWidget(widget)) return;
  const customWidgetId = installCustomWidget(uiDocument, definition);
  const installedDefinition = uiDocument.customWidgets[customWidgetId];
  const oldValues = { ...widget.content, ...widget.state };
  const content = fillParams(installedDefinition);
  for (const param of installedDefinition.params) {
    const value = simplifyContentValue(oldValues[param.key]);
    if (value !== undefined) content[param.key] = coerceParamValue(param, value);
  }
  widget.type = 'customWidget';
  widget.customWidgetId = customWidgetId;
  widget.content = content;
  // L'app ne connaît pas le contenu d'un custom widget : « selon le contenu » devient une taille fixe.
  for (const dimension of ['width', 'height']) {
    if ((widget.size?.[dimension] ?? 'hug') === 'hug') widget.size = { ...widget.size, [dimension]: installedDefinition.size[dimension] };
  }
  if (widget.state) {
    const { enabled, visible } = widget.state;
    widget.state = { ...(enabled === undefined ? {} : { enabled }), ...(visible === undefined ? {} : { visible }) };
  }
  delete widget.displayColor;
}

/**
 * Bloc de code Markdown.
 * @param {string} language langage
 * @param {string} text contenu
 * @returns {string} bloc
 */
function createCodeBlock(language, text) {
  return `${CODE_FENCE}${language}\n${text}\n${CODE_FENCE}`;
}

/**
 * Couleurs du projet, par thème.
 * @param {object} uiDocument document
 * @returns {string} texte Markdown
 */
function describeThemeColors(uiDocument) {
  const colors = Object.fromEntries(Object.values(uiDocument.colorVariables ?? {}).map((colorVariable) => [colorVariable.name,
    Object.fromEntries(Object.entries(colorVariable.values).map(([themeId, color]) => [uiDocument.themes[themeId]?.name ?? themeId, color]))]));
  return `## Couleurs du projet (par thème)\n\n${createCodeBlock('json', JSON.stringify(colors, null, 1))}`;
}

/**
 * Décrit un widget de base : réglages, apparence, taille et rendu actuel.
 * @param {object} widget widget
 * @param {object} snapshot { width, height, html, css, appearance }
 * @returns {string} texte Markdown
 */
function describeBaseWidget(widget, snapshot) {
  const typeDefinition = WIDGET_TYPES[widget.type];
  const fields = typeDefinition.fields.filter((field) => field.target !== 'widget')
    .map(({ target, key, label, kind, options }) => ({ key, label, kind, options, value: widget[target]?.[key] }));
  return [
    `## Widget de base : ${typeDefinition.label} (\`${widget.type}\`)`,
    [`- \`basedOn\` : \`"${widget.type}"\` (l'app proposera alors de remplacer le widget). Nouveau \`libraryId\` (UUID), \`version\` 1.`,
      '- Garde les mêmes `key` quand c\'est possible : la valeur est reprise. Une liste devient un réglage `text`, éléments séparés par ` | `.',
      '- Le fond, la bordure, les coins et les marges de « Apparence » restent dessinés par l\'app autour de ton widget : ne les redessine pas. Le reste est à toi.',
      `- Nom : ${widget.name}. Taille actuelle : ${snapshot.width} × ${snapshot.height} px (réglage : ${JSON.stringify(widget.size ?? {})}).`,
      widget.notes ? `- Notes de l'utilisateur : ${widget.notes}` : ''].filter(Boolean).join('\n'),
    '### Réglages', createCodeBlock('json', JSON.stringify(fields, null, 1)),
    '### Apparence', createCodeBlock('json', JSON.stringify(snapshot.appearance, null, 1)),
    ...(snapshot.html ? ['### Rendu actuel dans UImaker_noob (pour partir du même dessin)', createCodeBlock('html', snapshot.html), createCodeBlock('css', snapshot.css),
      'Les variables CSS `--ui-xxx` ci-dessus s\'appellent `--xxx` dans un custom widget.'] : []),
  ].join('\n\n');
}

/**
 * Fabrique le fichier Markdown à donner à une session.
 * @param {object} uiDocument document
 * @param {object} request { name, description, widget, snapshot, definition }
 * @param {string} guideText guide des custom widgets
 * @returns {string} Markdown
 */
export function createRequestText(uiDocument, request, guideText) {
  const { name, description, widget, snapshot, definition } = request;
  const isUpdate = Boolean(definition);
  const sections = [
    `# ${isUpdate ? 'Modifier' : 'Écrire'} le custom widget « ${name} »`,
    'Cette demande vient de UImaker_noob. Lis-la, puis suis le guide à la fin. Rends **un seul fichier** '
      + `\`.uimwidget\`${isUpdate ? `, version **${definition.version + 1}**, avec le même \`libraryId\`` : ''}. Si une règle manque, demande avant de coder.`,
    `## Ce que l'utilisateur veut\n\n${description.trim()}`,
    isUpdate ? `## Fichier actuel (à modifier)\n\n${createCodeBlock('json', createCustomWidgetFileText(definition))}` : null,
    isUpdate && widget ? `## Réglages du widget ${widget.name} dans le projet\n\n${createCodeBlock('json', JSON.stringify(widget.content ?? {}, null, 1))}` : null,
    widget && !isUpdate ? describeBaseWidget(widget, snapshot) : null,
    describeThemeColors(uiDocument), '---', guideText,
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}
