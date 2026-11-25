# Guide du format « spec UI » de UImaker_noob

> **Brouillon v0.4 — 2026-11-25.** Le format peut encore changer avant la V1 de UImaker_noob.
> Ce fichier s'adresse à **une autre session Claude** (ou à un humain) qui doit :
> - **A.** lire un export de UImaker_noob pour **coder l'application** correspondante ;
> - **B.** **générer** un `ui.json` que l'utilisateur ouvrira dans UImaker_noob pour l'ajuster.
>
> Les noms de champs sont en anglais ; les explications sont en français.

---

## 1. Le paquet exporté

UImaker_noob exporte un zip `<projet>_uispec.zip` :

```
ui.json              ← la description complète de l'UI (seul fichier obligatoire)
ui.schema.json       ← schéma JSON (Draft 2020-12) pour vérifier le fichier
UISPEC_GUIDE.md      ← ce guide (copie)
screens/S1.png       ← aperçu de chaque écran, dans le thème par défaut
screens/S1_H2.png    ← aperçu dans les autres thèmes (S1 = écran, H2 = thème)
modules/G1.png       ← aperçu de chaque module (thème par défaut)
modules/G1_E1.png    ← aperçu de chaque état de module
custom-widgets/X1.uimwidget ← chaque custom widget (code web de référence)
assets/icons/*.svg   ← icônes utilisées (SVG)
assets/images/*      ← images (après la V1)
```

Les images écran peuvent être limitées au thème par défaut, et manquer si l'appareil n'a pas pu les faire.
À l'import, UImaker_noob accepte ce zip (il n'y lit que `ui.json`) **ou un `ui.json` seul**. Un `.uimnoob` est un fichier de sauvegarde,
pas une spec : demander l'export `ui.json`.

---

## 2. Conventions générales

| Sujet | Règle |
|---|---|
| Unités | **Pixels logiques** (points à 1x) : un bouton de 32 de haut fait 32 pt sur iOS, 32 epx sur Windows |
| Origine | Coin **haut-gauche** ; `x` vers la droite, `y` vers le bas |
| Couleurs | `"#RRGGBB"` ou `"#RRGGBBAA"`, ou référence de variable `"$V3"` (voir § 4) |
| Noms (`name`) | **Anglais, PascalCase, explicites** (`LoginButton`, `Sidebar`). Ils deviennent les noms dans le code |
| Notes (`notes`) | Texte libre de l'utilisateur pour le développeur. **À lire et à respecter** |
| Champ inconnu | Ignoré à la lecture (avec un avertissement dans UImaker_noob) |

### Les ID

- Chaque objet a un **ID court qui ne change jamais** et qui n'est **jamais réutilisé**, même après suppression.
- Une lettre indique le type :

| Préfixe | Objet |
|---|---|
| `S` | écran (screen) |
| `A` | area (zone de l'écran) |
| `W` | widget |
| `E` | état d'un module |
| `D` | variable de test |
| `G` | module (agencement réutilisable ; `C` dans les anciens fichiers) |
| `X` | custom widget (widget codé) |
| `T` | style partagé |
| `V` | variable de couleur |
| `H` | thème |
| `M` | menu (barre de menus, menu contextuel) |

- `path` donne le chemin du parent jusqu'à l'objet : `"S1 > A1 > A3 > W7"`. C'est une information en plus,
  recalculée par UImaker_noob à chaque export. **La référence, c'est l'ID**, pas le chemin.

---

## 3. Structure de `ui.json`

```jsonc
{
  "format": "uimaker-noob-uispec",      // toujours cette valeur
  "formatVersion": "0.4",
  "generator": "UImaker_noob 0.1",       // ou le nom de la session / de l'outil qui a généré le fichier
  "project": {
    "name": "MyApp",
    "notes": "…",
    "defaultTheme": "H1",
    "idCounters": { "S": 1, "A": 5, "W": 12 },  // dernier numéro utilisé par préfixe (facultatif)
    "defaults": {                          // valeurs par défaut des areas, réglables dans le projet
      "areaSizing": { "mode": "proportional" },
      "resizableSplitter": false
    }
  },
  "themes":         { "H1": { … } },       // § 4
  "colorVariables": { "V1": { … } },       // § 4
  "styles":         { "T1": { … } },       // § 5
  "icons":          { "lucide:house": { … } },  // § 8
  "modules":        { "G1": { … } },       // § 9
  "variables":     { "D1": { … } },
  "customWidgets":  { "X1": { … } },       // § 9 bis
  "menus":          { "M1": { … } },       // § 10
  "screens":        [ { … } ]              // § 6
}
```

---

## 4. Thèmes et variables de couleur

L'UI peut avoir **plusieurs thèmes** (sombre, clair…). Une **variable de couleur** a une valeur par thème.
Les styles et les éléments utilisent la variable (`"$V1"`), et la couleur change avec le thème.

```json
"themes": {
  "H1": { "name": "Dark" },
  "H2": { "name": "Light" }
},
"colorVariables": {
  "V1": { "name": "background", "values": { "H1": "#1E1E1E", "H2": "#FFFFFF" } },
  "V2": { "name": "textMain",   "values": { "H1": "#EDEDED", "H2": "#111111" } },
  "V3": { "name": "accent",     "values": { "H1": "#4C8DFF", "H2": "#2563EB" } }
}
```

Une variable a **une valeur pour chaque thème** du projet.

---

## 5. Styles partagés (liés)

Un style est un ensemble de paramètres partagé par plusieurs areas ou widgets. Si on le change, tous les
éléments qui l'utilisent changent.

```json
"styles": {
  "T1": {
    "name": "PanelStyle",
    "appliesTo": "area",
    "background": "$V1",
    "borderWidth": 1,
    "borderColor": "#00000033",
    "borderSides": ["right"],
    "radius": 0
  },
  "T2": {
    "name": "PrimaryButtonStyle",
    "appliesTo": "button",
    "background": "$V3",
    "textColor": "#FFFFFF",
    "radius": 6,
    "fontFamily": "system",
    "fontSize": 14,
    "fontWeight": "600",
    "padding": [6, 14, 6, 14],
    "opacity": 1
  }
}
```

Clés d'apparence (toutes facultatives, à plat) : `background`, `textColor`, `borderWidth`, `borderColor`,
`borderSides` (liste parmi `top`, `right`, `bottom`, `left` ; toutes par défaut), `radius`, `fontFamily`,
`fontSize`, `fontWeight`, `padding`, `opacity`.

- `appliesTo` : `"area"`, `"any"` ou un type de widget (§ 7).
- `padding` (marges) suit l'ordre CSS : `[haut, droite, bas, gauche]`. Pour une area, les marges viennent de
  `widgetLayout.padding`.
- `fontFamily: "system"` = police système de la plateforme (Segoe UI, SF Pro, Cantarell…).
- **Apparence par défaut** (sans style ni valeur propre) : neutre, et elle utilise les variables de couleur
  dont le **nom** est `background`, `surface`, `textMain`, `textMuted`, `accent` ou `border` si elles existent
  (ex. un bouton a pour fond `accent`). Garder ces noms permet à l'IA qui code de reproduire le rendu.
- Un élément utilise un style avec `"style": "T2"`. Il peut changer certaines valeurs pour lui seul avec
  `"styleOverrides": { "radius": 12 }`.
  Ordre de priorité : valeurs par défaut du type < style < `styleOverrides`.

---

## 6. Écrans et areas

### Écran

```json
{
  "id": "S1",
  "name": "MainScreen",
  "platform": "windows",
  "preset": "16:9",
  "orientation": "landscape",
  "size": { "width": 1920, "height": 1080 },
  "safeArea": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
  "notes": "",
  "root": { /* area racine, voir ci-dessous */ }
}
```

- `platform` : `windows`, `macos`, `linux`, `ios`, `ipados`, `web` ou `any`.
- `preset` : `16:9`, `ipad`, `smartphone`, `custom`… La taille réelle est toujours donnée dans `size`.
- `safeArea` : zones à éviter (encoche, barre d'accueil iOS).

### Area

L'écran est **découpé** en areas collées, sans trou, comme les areas de Blender.
Une area est **soit découpée** en sous-areas (`split` + `children`), **soit une feuille** qui contient des
widgets (`widgetLayout` + `widgets`). Jamais les deux à la fois.

```json
{
  "id": "A1", "name": "Root", "path": "S1 > A1",
  "split": "horizontal",
  "children": [
    {
      "id": "A2", "name": "Sidebar", "path": "S1 > A1 > A2",
      "style": "T1",
      "sizing": { "mode": "fixed", "size": 280, "min": 200, "max": 400 },
      "resizableSplitter": true,
      "widgetLayout": { "mode": "stack", "direction": "vertical", "gap": 8,
                        "padding": [12, 12, 12, 12], "alignMain": "start", "alignCross": "stretch" },
      "widgets": [ /* § 7 */ ],
      "frame": { "x": 0, "y": 0, "width": 280, "height": 1080 },
      "notes": ""
    },
    {
      "id": "A3", "name": "MainView", "path": "S1 > A1 > A3",
      "sizing": { "mode": "fill" },
      "widgetLayout": { "mode": "free" },
      "widgets": [ ]
    }
  ]
}
```

| Champ | Valeurs |
|---|---|
| `split` | `"horizontal"` (enfants côte à côte, de gauche à droite) ou `"vertical"` (empilés, de haut en bas) |
| `sizing.mode` | `"fixed"` (`size` en px dans le sens du découpage), `"proportional"` (`ratio`, ex. 0.3), `"fill"` (prend le reste) |
| `sizing.min` / `max` | Bornes en px, facultatives |
| `resizableSplitter` | `true` = l'utilisateur de l'app peut déplacer le séparateur **après** cette area |
| `frame` | Position et taille **calculées** pour la taille d'écran donnée (absolues dans l'écran). Information en plus |

Si `sizing` ou `resizableSplitter` manquent, on prend `project.defaults`.

### `widgetLayout` : placement des widgets dans une area (ou un conteneur)

| `mode` | Champs | Équivalents courants |
|---|---|---|
| `"stack"` | `direction` (`vertical` / `horizontal`), `gap`, `padding`, `alignMain` (`start`, `center`, `end`, `spaceBetween`), `alignCross` (`start`, `center`, `end`, `stretch`), `scroll` (`none`, `auto`) | CSS flex, SwiftUI VStack / HStack, WinUI StackPanel, Qt QVBoxLayout / QHBoxLayout |
| `"grid"` | `columns` (liste : `120`, `"1fr"`, `"auto"`), `rows` (idem), `gap`, `padding` | CSS grid, WinUI Grid, SwiftUI Grid, QGridLayout |
| `"free"` | — (chaque widget a `placement.anchor` + décalages) | Canvas / position absolue avec ancrage |

---

## 7. Widgets

### Champs communs

```json
{
  "id": "W1", "name": "OpenButton", "path": "S1 > A1 > A2 > W1",
  "type": "button",
  "style": "T2",
  "styleOverrides": {},
  "size": { "width": "hug", "height": 32, "minWidth": 80 },
  "placement": {},
  "content": { "label": "Open", "icon": "lucide:folder-open", "iconPosition": "start" },
  "state": { "enabled": true, "visible": true },
  "action": { "type": "navigate", "target": "S2" },
  "notes": "",
  "frame": { "x": 12, "y": 12, "width": 96, "height": 32 }
}
```

- `size.width` / `height` : un nombre (px), `"fill"` (remplit la place disponible) ou `"hug"` (s'ajuste au
  contenu). `minWidth`, `maxWidth`, `minHeight`, `maxHeight` facultatifs.
- `placement` dépend du mode du parent :
  - `stack` : rien, ou `{ "alignSelf": "center" }` ;
  - `grid` : `{ "column": 0, "row": 1, "columnSpan": 2, "rowSpan": 1 }` ;
  - `free` : `{ "anchor": "topLeft", "x": 20, "y": 20 }`. Valeurs de `anchor` : `topLeft`, `top`, `topRight`,
    `left`, `center`, `right`, `bottomLeft`, `bottom`, `bottomRight`, `stretch`.
    `x` / `y` sont des décalages depuis le point d'ancrage.
- `action` : `{ "type": "none" }`, `{ "type": "navigate", "target": "S2" }` ou
  `{ "type": "custom", "description": "Ouvre le sélecteur de fichier" }`.

### Catalogue des types (V1)

| `type` | Champs de `content` / `state` |
|---|---|
| `button` | `label`, `icon`, `iconPosition` (`start` / `end` / `only`) |
| `text` | `text`, `textRole` (`title`, `subtitle`, `body`, `caption`), `align` (`start` / `center` / `end`), `maxLines` |
| `textField` | `placeholder`, `value`, `inputKind` (`text`, `email`, `password`, `number`, `search`), `multiline` |
| `checkbox` | `label`, `appearance` (`box` = case ; `button` = tout le widget est un bouton qui reste allumé), `checkedColor` (couleur ou `$V…`) ; état : `checked` |
| `toggle` | `label` ; état : `on` |
| `slider` | `min`, `max`, `step`, `value`, `orientation` |
| `dropdown` | `options` (liste de textes), `selectedIndex` |
| `list` | `items` (liste de `{ "label", "icon" }`), `selectedIndex`, `scroll`, `controlsPageStack` (ID d'une `pageStack`, facultatif) |
| `image` | `asset` (chemin dans `assets/images`), `fit` (`contain` / `cover`) — après la V1 |
| `icon` | `icon` (ex. `"lucide:settings"`), `size` |
| `table` | `columns` (liste de `{ "label", "width" }`, `width` = px ou `"fill"`), `rows` (liste de lignes, chaque ligne = liste de textes), `headerVisible`, `striped`, `selectedRow` (-1 = aucune) |
| `tabs` | `tabs` (liste de `{ "label", "icon" }`), `selectedIndex`, `controlsPageStack` (ID d'une `pageStack`, facultatif) |
| `menuBar` | `menus` : liste de `{ "label", "menuId" }` — chaque libellé (« File »…) ouvre le menu `M` indiqué (§ 10) |
| `toolbar` | conteneur horizontal de boutons / icônes : `widgetLayout` + `children` |
| `separator` | `orientation` (`horizontal` / `vertical`) |
| `container` | **widget conteneur** (panneau, groupe) : `title` facultatif, `widgetLayout` + `children` |
| `pageStack` | **pile de pages** : conteneur dont **une seule** page (enfant, en général un `container`) est visible : `activeIndex`. Pilotée par une `list` ou des `tabs` dont `controlsPageStack` vaut son ID : choisir l'élément n° i affiche la page n° i. Équivalents : WinUI `NavigationView` + `Frame`, SwiftUI `NavigationSplitView` / `TabView`, Qt `QStackedWidget`, web : contenu affiché selon l'onglet |
| `repeat` | **répétition** d'un module, nombre décidé par l'app (§ 9) : `itemModuleId`, `previewCount`, `countVariableId`, `countSource`, `minCount`, `maxCount` (0 = sans limite), `direction`, `distribution`, `itemSize`, `itemMinSize`, `crossSize`, `gap`, `positionSource`, `alternateColor`, `alternateEvery`, `itemOverrides` |
| `placeholder` | `description` : réserve la place d'une vue **codée plus tard**, sans équivalent dans le catalogue (vue 3D, graphique, lecteur vidéo, timeline, éditeur de nœuds…). Champ en plus : `displayColor` |
| `customWidget` | widget codé (§ 9 bis) : `customWidgetId`, `content` = un champ par réglage (`params`) |
| `moduleInstance` | utilisation d'un module de widgets : `moduleId`, `overrides` (§ 9) |

---

## 8. Icônes

- Icônes **vectorielles** issues d'une bibliothèque libre, référencées par `"source:nom"` (`"lucide:house"`).
- Le SVG est fourni dans `assets/icons/<source>_<nom>.svg` (export zip), et **aussi dans `svg`**
  (seul présent dans un export `ui.json` seul). Il est listé dans `icons` :

```json
"icons": {
  "lucide:house": { "svg": "<svg …>…</svg>", "file": "assets/icons/lucide_house.svg",
                    "license": "ISC", "source": "lucide 1.77.0",
                    "tags": { "en": ["home", "house"], "fr": ["accueil", "maison"] } }
}
```

- `icons` est **recalculé à chaque export** (seulement les icônes utilisées). Pour un fichier généré à la main,
  il peut rester vide : UImaker_noob retrouve les icônes Lucide par leur nom.

- La couleur d'une icône suit `textColor` (ou `iconColor`) du style ; le SVG utilise `currentColor`.

---

## 9. Modules

Un **module** est un **agencement réutilisable** de widgets, d'areas et/ou d'autres modules. Il n'a pas de code propre.
(Un **custom widget**, widget codé ou au code modifié, est autre chose : § 9 bis.)

```json
"modules": {
  "G1": { "name": "PanelHeader", "kind": "widget", "libraryId": "…uuid…", "version": 1, "notes": "",
    "root": { "id": "W100", "name": "Header", "type": "container",
      "widgetLayout": { "mode": "stack", "direction": "horizontal", "gap": 6 },
      "children": [ { "id": "W101", "name": "Title", "type": "text", "content": { "text": "Layers" } } ] } },
  "G2": { "name": "LayersPanel", "kind": "area", "libraryId": "…uuid…", "version": 1,
    "root": { "id": "A20", "name": "Panel", "widgetLayout": { "mode": "stack" },
      "widgets": [ { "id": "W110", "name": "Header", "type": "moduleInstance", "moduleId": "G1" } ] } }
}
```

- `kind: "widget"` : utilisé par un widget `{ "type": "moduleInstance", "moduleId": "G1", "size": …, "overrides": {} }`.
- `kind: "area"` : utilisé par une area `{ "id": "A3", "sizing": …, "moduleId": "G2" }`, **sans** `split`, `children`,
  `widgets` ni `widgetLayout`. La taille dans le découpage vient de l'instance, le reste de `root`.
- Un module peut contenir d'autres modules, jamais lui-même (même indirectement).
- `overrides` : `{ "W101": { "content": { "text": "Calques" } } }`, ce qui change pour cette instance (clé = ID interne).
  `content`, `state`, `styleOverrides` sont **fusionnés** avec ceux du module (`null` = valeur effacée) ; `style`, `action`,
  `events` les **remplacent**. Élément d'un module imbriqué : on passe par l'instance interne,
  `{ "W110": { "overrides": { "W101": { … } } } }`. Un ID qui n'existe plus est à ignorer.
- L'instance ajoute aussi ses `size`, `placement`, `state`, `action` ; ses `events` passent avant ceux du module.
- **États** d'un module : `"states": [ { "id": "E1", "stateKey": "…", "name": "Muted", "description": "La piste est muette", "variableId": "D3",
  "overrides": { "W101": { "styleOverrides": { "opacity": 0.35 } } } } ]`. `description` = quand l'app l'utilise. Une instance (ou un
  élément de `itemOverrides`) les active avec `"activeStates": ["E1"]`. Ordre : module, états (ordre de la liste), puis `overrides`.
  Dans le code : variantes d'apparence du composant. `stateKey` est géré par l'app.
- **Répétition** (`type: "repeat"`) : un composant par module, répété par le code.
  - `countSource` (donnée qui donne le nombre), `minCount`, `maxCount` : **la règle**. `previewCount` : nombre dessiné, **à ne pas
    écrire en dur**. `itemOverrides` : `{ "0": { "overrides": { … } } }`, valeurs **d'exemple** par élément (même format que `overrides`).
  - `distribution` : `share` (parts égales, jamais sous `itemMinSize` : on défile), `fixed` (`itemSize`, on défile), `wrap` (`itemSize`,
    retour à la ligne), `position` (chaque élément placé par `positionSource` ; l'aperçu le dessine à parts égales).
  - `crossSize` : `fill` ou `module` (taille du module). `alternateColor` : fond d'un groupe de `alternateEvery` éléments sur deux.
  - Répétitions imbriquées : une ligne répète des temps, un temps répète des pas. Jamais un module qui se contient.
- Gérés par l'app, à garder tels quels et sans effet sur le code : `previewSize` (cadre d'édition), `hasLocalChanges`,
  `libraryUpdatedAt`, `moduleNodeKey` (clé d'un élément d'un projet à l'autre). À ne pas inventer dans un fichier généré.
- `libraryId` identifie le module entre projets (UUID, à garder) ; `version` augmente à chaque modification.
- Dans le code : un module = un composant / une vue réutilisable ; `overrides` = ses paramètres.
- Anciens fichiers : `components` / `componentInstance` / `componentId` (`C1`…) sont convertis à l'import, ID gardés.

### 9 bis. Custom widgets

`"customWidgets": { "X1": { "name": "Knob", "description", "libraryId", "version", "params": [ … ], "events": [ … ], "size", "html", "css", "js",
"previewSvg", "nativeNotes" } }` (format complet : CUSTOM_WIDGET_GUIDE.md). Un widget `{ "type": "customWidget", "customWidgetId": "X1",
"content": { "value": 50 } }` l'utilise ; ses couleurs peuvent être `"$V3"`.
- **Dans le code** : un composant natif par custom widget, avec `params` comme propriétés et `events` comme événements. `html` / `css` / `js`
  sont la **référence de comportement et de dessin**, à ne pas mettre tels quels dans une vue web. Lire `nativeNotes`.
- `events` d'un widget : déclencheurs `widget:change` (un réglage a changé) et `widget:<événement>`. Dans `changeVariable`,
  `"amount": "{value}"` = valeur du réglage `value` de ce widget.
- **Générer un ui.json** : ne pas inventer de custom widget ; utiliser un `placeholder` décrit.

### Variables de test

`"variables": { "D1": { "name": "pattern.beats", "kind": "number", "value": 4, "min": 1, "max": 64, "description": "…" } }` ;
`kind` : `number`, `boolean`, `text`. Données d'**exemple** : `name` dit à quelle vraie donnée les relier, `value` n'est pas à écrire en dur.
Liens : `countVariableId` (répétition, entre `minCount` et `maxCount`), `variableId` d'un état (actif si vrai), `{nom}` dans un `text`,
`label` ou `value`, et l'action `{ "type": "changeVariable", "variableId": "D1", "operation": "set" | "add" | "toggle", "amount": "1" }`.

## 10. Menus (barre de menus et menus contextuels)

```json
"menus": {
  "M1": { "name": "FileMenu", "items": [
    { "label": "New", "shortcut": "Ctrl+N", "icon": "lucide:file-plus", "action": { "type": "custom", "description": "Nouveau document" } },
    { "label": "Open recent", "submenu": [ { "label": "Robot.glb", "action": { "type": "none" } } ] },
    { "separator": true },
    { "label": "Options…", "shortcut": "Ctrl+,", "action": { "type": "openDialog", "target": "S2" } },
    { "label": "Show outliner", "checked": true, "action": { "type": "toggleVisibility", "target": "W5" } },
    { "label": "Export", "enabled": false }
  ] }
}
```

- Un même menu peut servir à une barre de menus (`menuBar.content.menus[].menuId`) et à un menu contextuel
  (action `openContextMenu`).
- `shortcut` : texte affiché **et** raccourci clavier de l'app (Ctrl = Cmd sur macOS).
- Équivalents : WinUI `MenuBar` / `MenuFlyout`, SwiftUI `.commands` / `.contextMenu` / `Menu`, Qt `QMenuBar` / `QMenu`,
  web : menus personnalisés (clic droit = `contextmenu`).

## 11. Événements et actions

Un widget, une area ou un écran peut avoir `events` : liste de `{ "trigger", "action" }`. Le champ `action` d'un widget
reste l'action du clic / tap (raccourci de `{ "trigger": "click" }`).

```json
"events": [
  { "trigger": "rightClick", "action": { "type": "openContextMenu", "menuId": "M5" } },
  { "trigger": "doubleClick", "action": { "type": "custom", "description": "Renommer" } }
]
```

| `trigger` | Sens | Où |
|---|---|---|
| `click` | clic gauche / tap | widget, area |
| `doubleClick` | double clic | widget, area |
| `rightClick` | clic droit — **sur iPad natif : appui long** | widget, area |
| `middleClick` | clic du milieu | widget, area |
| `hoverEnter` / `hoverLeave` | survol souris (iPad : pointeur / survol du Pencil) | widget |
| `wheel` | molette / défilement | widget, area |
| `tap` / `doubleTap` / `longPress` | gestes au doigt (si absents : `click` / `doubleClick` / `rightClick`) | widget, area |
| `pencilTap` | tap du Pencil (si absent : `tap`, puis `click`) | widget, area |
| `pencilDoubleTap` | double tap **sur** l'Apple Pencil (UIPencilInteraction) | écran |
| `pencilSqueeze` | squeeze de l'Apple Pencil Pro | écran |
| `keyShortcut` | raccourci clavier : champ `key` (ex. `"Ctrl+S"`) | écran |

Ordre de recherche : du widget touché vers ses parents (conteneur, area…), puis l'écran ; le premier qui a le
déclencheur gagne.

| `action.type` | Champs | Effet |
|---|---|---|
| `none` | — | rien |
| `navigate` | `target` (S) | change d'écran |
| `openDialog` | `target` (S) | ouvre un écran en fenêtre modale par-dessus |
| `closeDialog` | — | ferme la fenêtre modale du dessus |
| `openContextMenu` | `menuId` (M) | ouvre le menu au point touché |
| `showPage` | `target` (W d'une `pageStack`), `page` (index) | affiche une page |
| `toggleVisibility` | `target` (W) | affiche / cache un widget |
| `custom` | `description` | comportement à coder, décrit en clair |

## A. Lire un export pour coder l'app

Ordre conseillé :

1. Lire `project.notes`, puis regarder **les PNG de `screens/` et `modules/`** pour avoir le rendu attendu en tête.
2. **Thèmes** : créer le système de thèmes de la plateforme à partir de `themes` + `colorVariables`
   (ressources XAML ThemeDictionaries, Asset Catalog / `Color` SwiftUI, variables CSS, palette Qt…).
   Une variable `$V3` nommée `accent` → une couleur nommée `accent` dans le code.
3. **Styles** : un style `T` → un style réutilisable (Style XAML, `ViewModifier` / `ButtonStyle` SwiftUI,
   classe CSS, feuille QSS…). Ne pas recopier les valeurs en dur dans chaque élément.
4. **Modules** : chaque `G` → un composant réutilisable, avec ses `overrides` comme paramètres.
5. **Écrans** : chaque `S` → une vue / page / fenêtre. Respecter `platform` et `safeArea`.
6. **Areas** : reproduire le découpage avec le conteneur natif adapté :
   - `split` → Grid à colonnes / lignes, `HSplitView` / `VSplitView`, `QSplitter`, flex CSS ;
   - `resizableSplitter: true` → séparateur déplaçable (GridSplitter, `NavigationSplitView`, `QSplitter`…) ;
   - `sizing` → largeur / hauteur fixe, proportion (`*` en XAML, `flex-grow`, `layoutPriority`), `min` / `max`.
7. **Widgets** : le contrôle **natif** qui correspond au `type` sur la plateforme cible (un `toggle` = ToggleSwitch
   sur Windows, `Toggle` en SwiftUI, …). Garder les **`name` comme noms de variables / contrôles**.
8. **Placeholders** : créer une vue vide nommée d'après `name`, à la bonne taille, avec un commentaire
   `TODO` qui reprend `description` et `notes`. Ne pas inventer son contenu.
9. **Traçabilité** : mettre l'ID dans un commentaire à côté de chaque élément (`// UImaker: W12`) pour qu'on
   puisse retrouver l'élément quand le `ui.json` change.
10. `frame` sert à vérifier ; la mise en page doit venir de `split` / `sizing` / `widgetLayout` / `size`, pas des
    coordonnées absolues (sauf en mode `free`).
11. Si un renseignement manque ou est contradictoire : **demander à l'utilisateur**, ne pas deviner.

Quand le `ui.json` est mis à jour plus tard : comparer les ID, pas les noms. Un ID nouveau = élément ajouté,
un ID absent = élément supprimé, même ID avec un autre `name` = renommage.

---

## B. Générer un `ui.json` pour UImaker_noob

But : produire un fichier que l'utilisateur ouvre dans UImaker_noob pour l'ajuster (par exemple d'après une
app existante, une capture d'écran ou une description).

Règles :

1. Commencer par `"format": "uimaker-noob-uispec"`, `"formatVersion": "0.4"` et remplir `"generator"`.
2. **ID** : uniques dans tout le fichier, avec le bon préfixe, numérotés à partir de 1 (`S1`, `A1`, `W1`…).
   Les ID internes aux `modules` sont aussi uniques dans le fichier.
3. Chaque area est **soit découpée** (`split` + `children`), **soit une feuille** (`widgetLayout` + `widgets`).
   Les tailles des enfants d'un découpage doivent tenir dans le parent (au plus une area `fill` par découpage
   est le plus simple).
4. Toutes les références doivent exister : `style` → `T`, `$V` → `V`, `moduleId` → `G`, `action.target` → `S`,
   `defaultTheme` → `H`. Chaque variable de couleur a une valeur pour **chaque** thème.
5. `type` uniquement pris dans le catalogue du § 7. Un élément qui n'y entre pas devient un **`placeholder`**
   avec une `description` claire.
6. Icônes : de préférence des noms **Lucide** existants (`lucide:<nom>`). Sinon, un `placeholder` ou un
   `icon` avec une `notes` qui décrit l'icône voulue.
7. `path` et `frame` sont **facultatifs** : UImaker_noob les recalcule à l'import.
8. Noms en anglais PascalCase, textes visibles (`label`, `text`) dans la langue de l'app.
9. Mettre des `notes` partout où une intention n'est pas évidente.
10. Vérifier le fichier avec `ui.schema.json` avant de le donner à l'utilisateur.

À l'import, UImaker_noob garde les ID tels quels et reprend la numérotation au-dessus du plus grand ID de
chaque préfixe.

### Exemple minimal valide

```json
{
  "format": "uimaker-noob-uispec",
  "formatVersion": "0.4",
  "generator": "Claude session — example",
  "project": { "name": "TinyApp", "defaultTheme": "H1" },
  "themes": { "H1": { "name": "Dark" } },
  "colorVariables": { "V1": { "name": "background", "values": { "H1": "#202020" } } },
  "styles": {},
  "icons": {},
  "modules": {},
  "screens": [
    {
      "id": "S1", "name": "MainScreen", "platform": "windows", "preset": "16:9",
      "orientation": "landscape", "size": { "width": 1280, "height": 720 },
      "root": {
        "id": "A1", "name": "Root", "split": "horizontal",
        "children": [
          { "id": "A2", "name": "Tools", "sizing": { "mode": "fixed", "size": 240 },
            "styleOverrides": { "background": "$V1" },
            "widgetLayout": { "mode": "stack", "direction": "vertical", "gap": 8, "padding": [12, 12, 12, 12] },
            "widgets": [
              { "id": "W1", "name": "RunButton", "type": "button", "content": { "label": "Run" } }
            ] },
          { "id": "A3", "name": "Viewport", "sizing": { "mode": "fill" },
            "widgetLayout": { "mode": "free" },
            "widgets": [
              { "id": "W2", "name": "SceneView", "type": "placeholder",
                "size": { "width": "fill", "height": "fill" }, "displayColor": "#444444",
                "content": { "description": "Vue 3D de la scène, codée plus tard" } }
            ] }
        ]
      }
    }
  ]
}
```

---

## Historique du format

- **0.4** (2026-11-25) — `customWidgets` (`X`), `customWidget`, déclencheurs `widget:…`, `amount: "{réglage}"`.
- **0.3** (2026-11-24) — `repeat`, `states` / `activeStates` (`E`), `variables` (`D`), action `changeVariable`, `checkbox.appearance`.
- **0.2** (2026-11-23) — `modules` (`G`) remplacent `components` ; modules d'area ; modules imbriqués ; `libraryId`, `version`.
- **0.1** (2026-11-21) — ajout de `menus` (M), `events` (déclencheurs souris / tactile / Pencil / clavier) et des actions
  `openDialog`, `closeDialog`, `openContextMenu`, `showPage`, `toggleVisibility` ; `menuBar.content.menus` = `{ label, menuId }`.
- **0.1** (2026-11-21) — ajout de `pageStack` et `controlsPageStack` (remplace `targetArea` des onglets).
- **0.1** (2026-11-20) — premier brouillon. Ajusté pendant le prototype : apparence en clés à plat,
  `project.idCounters`, `svg` inline dans `icons`, `exportedAt`, apparence par défaut liée aux noms de variables.
