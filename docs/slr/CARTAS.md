# Cartas de Shits League Rush: guía para crear y editar el catálogo

El catálogo está en la tabla **`disenos_carta`** de Supabase. Hay dos formas de crear o editar cartas:

- **El formulario de la app** (lo más cómodo): *Rush → Perfil → Modo pruebas → ➕ Nueva carta*. Para editar una carta que ya existe, ábrela y pulsa *✎ Editar carta*.
- **El Table Editor de Supabase** (*Table Editor → disenos_carta*): basta con nombre, tipo, tier y perfil; el resto se genera solo.

En los dos casos, un trigger de la base de datos:

- **Genera lo que falte:** las stats y los poderes que vengan vacíos, a partir del tier, el perfil y el tipo.
- **Calcula el valor:** con la misma fórmula del juego.
- **Revisa los poderes:** si algo está mal, la carta no se guarda y sale un mensaje que dice qué falla.
- **Crea un ejemplar:** cuando la carta es nueva, aparece libre en la liga.

## Crear una carta con el formulario

1. **Foto.** Pulsa *📷 Subir foto*: va directa a Cloudinary (ver "Cloudinary" más abajo). Sirven **PNG sin fondo** (se respeta la transparencia: detrás se ve el fondo de la carta) y JPG. También puedes pegar la URL de una foto que ya esté subida.
2. **Nombre, tipo, perfil, tier, colección, acabado y color.** El tier fija la rareza (el marco). La colección es opcional: *＋ Nueva* crea una sin salir del formulario. El color también es opcional: sin color, la carta usa el de su colección (o el neutro).
3. **Stats y poderes.** Salen solos del tier y el perfil. *🎲 Regenerar stats* y *🎲 Regenerar poderes* proponen otros. Se pueden cambiar a mano: las stats, y en cada poder el momento, el nombre (hay sugerencias, pero es libre), el nivel y las probabilidades.
4. Arriba se ve la carta en grande, tal como quedará (con el acabado y la inclinación), con su OVR, tier y valor.
5. **Crear carta** o **Crear y dar a…** (la da directamente a un equipo).

Para editar, el mismo formulario con los datos de la carta: se puede cambiar la foto, regenerar y guardar.

> En una **liga de prueba**, las cartas creadas con el formulario solo existen en esa liga (nacen inactivas para el resto) y se borran con ella. Desde una liga de prueba solo se pueden editar esas cartas, no las del catálogo.

## Crear una carta en el Table Editor

Rellena `nombre`, `tipo`, `tier` y `perfil` y deja **vacíos** `ata`, `def`, `con` y `poderes`: al guardar se generan. Si quieres una excepción, rellena lo que quieras fijar (por ejemplo, las tres stats) y se respeta. Para una carta **sin poderes**, escribe `[]` en `poderes` (vacío = generarlos).

Para regenerar una carta que ya existe, vacía sus stats o sus poderes y guarda. Cada vez se usa una semilla al azar (se guarda en `semilla_stats` y `semilla_poderes`); con la misma semilla sale siempre lo mismo.

## Columnas

| Columna | ¿Rellenar? | Qué es |
|---|---|---|
| `nombre` | **Sí** | Nombre de la carta tal como se verá. Único **dentro de su colección** (y entre las que no tienen colección): puede haber un «Mateo» en *Dormidito* y otro en *Down*. Los nombres largos se ven enteros: la letra se hace más pequeña y, si hace falta, pasa a dos líneas. |
| `tipo` | **Sí** | `individual`, `duo`, `trio`, `grupo` o `especial` (ver "Tipos"). Solo describe la carta. |
| `coleccion_id` | Opcional | La colección (ver "Colecciones"). Vacío = sin colección. |
| `tier` | **Sí** (si no pones stats) | `S`, `A`, `B`, `C`, `D`, `E` o `F` (ver "Tiers"). Si pones las stats y no el tier, se calcula de su OVR. |
| `perfil` | **Sí** (si no pones stats) | `atacante`, `defensa`, `control`, `portero` o `equilibrado`. Si no lo pones, se deduce de las stats. |
| `ata`, `def`, `con` | Opcional | Ataque, defensa y control, de 1 a 101. Vacías = se generan. |
| `estamina` | Opcional | `alta`, `media` o `baja`: cuánta energía gasta en cada partido (ver "Estamina y táctica favorita"). Vacía = se genera. |
| `tactica_favorita` | Opcional | `posesion`, `contraataque`, `presion` o vacía (ninguna). Al crear la carta, si está vacía se genera según el perfil. |
| `poderes` | Opcional | Lista de poderes (ver abajo). Vacío = se generan; `[]` = sin poderes. |
| `color` | Opcional | Color de fondo de la carta (ver "Colores"). Vacío = el de su colección; si no tiene, el neutro. |
| `imagen_url` | Opcional | La foto (ver "Imagen"). Sin foto se pinta una silueta con las iniciales. |
| `acabado` | Opcional | `normal` (por defecto), `foil`, `brillante` o `plateada`. |
| `personas` | Opcional | Quiénes salen en la carta. Sirve para el dibujo sin foto de los dúos y tríos. Formato: `{"Marcos","Nacho"}`. |
| `texto` | Opcional | Una frase que sale en el detalle de la carta. |
| `activo` | Opcional | `true` por defecto. Ver "Desactivar una carta". |
| `beta` | Opcional | `false` por defecto. Las del catálogo de pruebas inicial van a `true`. |
| `semilla_stats`, `semilla_poderes` | **No** | Las semillas con las que se generaron. |
| `liga_prueba_id` | **No** | Solo en las cartas creadas desde una liga de prueba. |
| `id`, `creado_en` | **No** | Se rellenan solas. |
| `valor` | **No** | Se calcula solo cada vez que guardas, aunque escribas otro número. |
| `rareza` | **No** | Sale sola del tier (ver "Rareza"). |

El **OVR** no se guarda en ningún sitio: el juego lo calcula al vuelo con las tres stats. Cuenta el 60 % la mejor, el 25 % la del medio y el 15 % la peor.

El **valor** sale del OVR y de los poderes. Cada poder lo sube un 15 % (`simple`), un 35 % (`fuerte`) o un 60 % (`muy fuerte`).

## Tipos

El tipo **solo describe** la carta (cuántas personas salen); no da ninguna ventaja en el partido. En la carta es un icono pequeño debajo de la media.

| `tipo` | Quién sale | Icono |
|---|---|---|
| `individual` | 1 persona | una silueta |
| `duo` | 2 personas | dos siluetas |
| `trio` | 3 personas | tres siluetas |
| `grupo` | 4 o más | cinco siluetas pequeñas |
| `especial` | nadie: un objeto, un lugar… | una estrella |

Las plantillas iniciales se reparten con cartas `individual`.

## Rareza

La rareza dice **lo buena que es** una carta y es lo que marca el **marco**. Sale sola del tier, no se rellena:

| Tier | Rareza | Marco |
|---|---|---|
| F, E, D | **común** | gris metálico apagado |
| C, B | **rara** | azul |
| A | **épica** | morado |
| S | **legendaria** | dorado, con un brillo que lo recorre |

Los sobres y las subastas reparten **por rareza**: primero se sortea la rareza con los pesos completos (entre las que la progresión deja salir) y luego una carta de esa rareza al azar. Si no queda ninguna carta libre de esa rareza (por ejemplo, en la colección o el perfil del sobre), se baja a la inferior, y así sucesivamente; si no hay nada por debajo, la siguiente que quede. Así una colección pequeña nunca da lo bueno más a menudo de lo que dicen los pesos. Los pesos de los sobres están en la tabla `tipos_sobre` (se editan desde *Modo pruebas → Sobres*) y los de las subastas en `ligas.config.pesos_mercado`:

| | Común | Rara | Épica | Legendaria |
|---|---|---|---|---|
| Sobres sencillo y básico | 72 | 22 | 5 | 1 |
| Sobre de elección | 50 | 34 | 12 | 4 |
| Sobres de posición y de colección | 55 | 30 | 12 | 3 |
| Subastas (cada carta de la tanda) | 70 | 22 | 7 | 1 |

- **Sobre de elección:** si las dos primeras candidatas son comunes, la tercera es rara o superior.
- El sobre premium y su garantía ya no existen.
- Con pocas raras y épicas en el catálogo, esas cartas forzadas acaban siendo legendarias: conviene que haya raras y épicas.

### Progresión por jornadas

Durante una temporada real, lo que puede salir en sobres y subastas mejora con las jornadas (la referencia es la próxima jornada pendiente):

| Jornadas | Pueden salir |
|---|---|
| 1–3 | comunes y raras |
| 4–5 | también épicas |
| 6 en adelante | también legendarias |

Además, las épicas y las legendarias **entran poco a poco**: desde la jornada 4 entran 6 épicas por jornada y desde la 6, 2 legendarias. Al empezar la temporada cada épica y legendaria libre recibe al azar su jornada de entrada (columna `cartas.libera_jornada`); hasta entonces no sale. Los pesos de cada sobre y de las subastas se aplican solo entre lo que puede salir.

Todo está en `ligas.config.progresion` (tramos, cupos y el interruptor `activa`: `auto` la enciende solo en temporada real, en curso y sin modo beta). Las cláusulas, las ventas y los intercambios no se ven afectados.

### Catálogo objetivo

Para una liga de 18 equipos, el catálogo final debería tener:

| Común | Rara | Épica | Legendaria |
|---|---|---|---|
| ~250 | ~80 | ~40 | 28 |

Con esto y la economía de la liga (saldo 5.000, salario 1.000), la simulación de temporada da 3–4 legendarias a los mejores equipos en la jornada 15 y varias épicas a los medianos (ver DECISIONES.md). El **contador del Modo pruebas** (Perfil) enseña el progreso del catálogo hacia estos números por rareza.

## Estamina y táctica favorita

Desde el motor v2.0.0 cada carta tiene dos rasgos más:

- **Estamina:** cuánta energía gasta en cada partido de liga: `alta` 22, `media` 30, `baja` 40 (×1,3 si su equipo presiona; la mitad si juega solo una parte). Tras cada jornada todas recuperan 20, y las que no jugaron, 20 más. Con poca energía rinde menos: desde 70 nada, de 50 a 69 −5 %, de 30 a 49 −12 % y por debajo de 30 −25 %.
- **Táctica favorita:** si su equipo juega con ella, sus stats suben un 5 %.

El generador propone:

| Perfil | Estamina | Táctica favorita |
|---|---|---|
| Portero | alta 50 %, media 35 %, baja 15 % | ninguna |
| Atacante | alta 20 %, media 52 %, baja 28 % | contraataque |
| Control | igual | posesión |
| Defensa | igual | presión |
| Equilibrado | igual | una al azar |

En total sale ~25 % alta, 50 % media y 25 % baja. Se cambian en el formulario (*Estamina* y *Táctica favorita*) o en la edición múltiple.

## Tiers

El tier fija el OVR de la carta y los poderes que propone el generador:

| Tier | OVR | Poderes propuestos | Cuántas tener (liga de 18 equipos) |
|---|---|---|---|
| **S** | 85–95 | 2 fuertes | 28 (legendarias) |
| **A** | 78–85 | 1 fuerte | 40 (épicas) |
| **B** | 72–78 | 1 simple | 30 |
| **C** | 66–72 | 1 simple el 40 % de las veces | 50 |
| **D** | 60–66 | ninguno | 85 |
| **E** | 54–60 | ninguno | 85 |
| **F** | 46–54 | ninguno | 80 |

Por qué tantas D, E y F:

- Cada equipo empieza con **11 individuales** sacadas del "bombo": las individuales **sin el 20 % más caro**.
- Con 18 equipos son **198 cartas** solo para las plantillas iniciales, y conviene que sobren para que el reparto tenga donde elegir (±10 % de valor entre equipos) y para los sobres y las subastas.
- Las S, A y B (y parte de las C) caen en ese 20 % caro: no entran en las plantillas iniciales, se consiguen en el mercado.
- Resumen: el catálogo objetivo (~400 cartas: ~250 comunes D, E y F, ~80 raras C y B, ~40 épicas A y 28 legendarias S), de cualquier tipo. El tipo ya no marca lo buena que es una carta: lo marca el tier, que da la rareza.

El catálogo beta inicial (283 cartas sin foto) se borró el 15 de octubre de 2026. El 16 de octubre hay 84 cartas, todas con foto: 82 comunes (D, E y F) y 2 legendarias (S); 48 individuales. Con 48 individuales el bombo da para 3 plantillas iniciales; para 18 equipos hacen falta unas 250. El contador de **Modo pruebas → Plantillas iniciales disponibles** dice cuántas salen ahora mismo.

Si el bombo no llega, nadie se queda sin poder unirse: el reparto tira de las individuales caras más baratas y, si aun así faltan, el equipo empieza con las que haya y recibe un aviso. Los huecos vacíos los juegan Canteranos.

**Perfil**, la forma de las stats:

| Perfil | Forma |
|---|---|
| `atacante` | ATA la más alta |
| `defensa` | DEF la más alta |
| `control` | CON la más alta |
| `portero` | DEF muy alta y ATA muy baja (en S, con la DEF al tope, el ATA no puede bajar tanto) |
| `equilibrado` | las tres parecidas |

El generador nunca pasa de 101 en ninguna stat, sea cual sea el tipo.

## Poderes

`poderes` es una lista JSON. Cada poder tiene estos campos:

- `nombre`: el nombre que se verá.
- `momento`: cuándo actúa (uno de los seis de abajo).
- `probabilidades`: `[p1, p2, p3]`, la probabilidad de que se active **al menos 1, 2 y 3 veces** en el partido. Cada una no puede ser mayor que la anterior. Lo que propone el generador: `[0.4, 0.18, 0.07]`. En los poderes de tirador, en su lugar, `"probabilidad": "siempre"`.
- `efecto`: un número mayor que 0. Normalmente es el aumento (`0.2` = +20 %). En `tirador` es un multiplicador (`2` = el doble de opciones). Lo normal: `0.2` si es simple, `0.3` si es fuerte y `0.4` si es muy fuerte.
- `nivel`: `simple`, `fuerte` o `muy fuerte`. Cuenta para el valor.

### Cómo se activan (motor v1.3.0)

1. **Antes de empezar el partido**, el motor decide cuántas veces se activará cada poder (0, 1, 2 o 3, con las probabilidades de arriba) y en qué jugadas (al azar, sin repetir; el partido tiene 10).
2. **En su jugada**, el poder actúa en su momento: un poder de posesión, al disputar ese balón; uno de chut, si esa carta chuta en esa jugada; uno de parada, si ese portero tiene que parar.
3. **Si su momento no llega** (su equipo no ataca, esa carta no chuta…), el poder queda **pendiente** y actúa en la siguiente ocasión. Lo que quede pendiente al final del partido se pierde.
4. **Como mucho 2 activaciones por jugada** entre los dos equipos; las demás esperan a la siguiente.
5. Si la carta es el **capitán**, sus tres probabilidades se multiplican por 1,5 (máximo 95 %).
6. Los poderes `"siempre"` (tirador) actúan en todas las ocasiones y no cuentan para el tope.

Con los valores del generador, entre dos equipos con dúos y tríos salen unas 5 activaciones por partido. En la crónica, un poder que actúa más tarde de lo previsto lo indica ("le tocaba en la jugada 3").

Un ejemplo de cada momento:

```json
[{"nombre": "Batuta",       "momento": "posesion",        "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.2, "nivel": "simple"}]
```
Al disputar un balón: +20 % a la fuerza de posesión de su equipo.

```json
[{"nombre": "Desmarque",    "momento": "ocasion_ataque",  "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.3, "nivel": "fuerte"}]
```
Cuando su equipo ataca: +30 % a la fuerza de ataque.

```json
[{"nombre": "Muro",         "momento": "ocasion_defensa", "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.3, "nivel": "fuerte"}]
```
Cuando su equipo defiende: +30 % a la fuerza defensiva.

```json
[{"nombre": "Chupón",       "momento": "tirador",         "probabilidad": "siempre",           "efecto": 2,   "nivel": "simple"}]
```
Al elegir quién chuta: el doble de opciones de ser él, en todas las ocasiones.

```json
[{"nombre": "Cañonero",     "momento": "chut",            "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.3, "nivel": "fuerte"}]
```
Cuando chuta él: +30 % a su ATA en ese chut.

```json
[{"nombre": "Manos de oro", "momento": "parada",          "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.4, "nivel": "muy fuerte"}]
```
Cuando para de portero: +40 % a su DEF en esa parada.

Una carta puede tener varios poderes. Se ponen todos en la misma lista, separados por comas:

```json
[{"nombre": "Batuta", "momento": "posesion", "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.2, "nivel": "simple"},
 {"nombre": "Cañonero", "momento": "chut", "probabilidades": [0.4, 0.18, 0.07], "efecto": 0.3, "nivel": "fuerte"}]
```

Los poderes antiguos con `"probabilidad": 0.25` siguen valiendo: el motor lo toma como `[0.25, 0.10, 0.04]` (p, p/2,5, p/6).

## Colores

El **fondo** de la carta usa, por orden:
1. el `color` de la carta, si tiene (sirve para anular a mano el de la colección);
2. si no, el color de su **colección**;
3. si tampoco, el verde neutro.

El **marco** no depende del color: es la rareza.

Colores de la paleta: `verde`, `morado`, `azul`, `rojo`, `naranja`, `dorado`, `plata` y `negro`. Se ven todos en *Rush → Perfil → Modo pruebas → ✨ Muestrario de cartas*, junto con las rarezas, los tipos y una colección de ejemplo.

## Colecciones

Una colección agrupa cartas con algo en común (por ejemplo, *Dormidito*: «Mateo», «Jorge», «Nico»…). Cada una tiene:

| Campo | Qué es |
|---|---|
| `nombre` | Único (no distingue mayúsculas). |
| `color` | De la paleta. Es el fondo de sus cartas (salvo las que tengan color propio) y el color de su emblema. |
| `emblema_url` | El emblema, en Cloudinary (ver abajo). |
| `descripcion` | Opcional. |

- **En la carta:** el emblema va en la esquina de arriba a la derecha, sin tapar la cara ni la media.
- **En la carta grande y en la ficha:** además, el nombre de la colección en pequeño, debajo del nombre de la carta.
- **En miniatura:** solo el emblema.
- **El álbum** enseña el progreso de cada colección («Dormidito 3/5») y, al tocarla, filtra por ella. El catálogo y la herramienta de plantillas tienen filtro por colección.

**Gestor:** *Rush → Perfil → Modo pruebas → 🏷 Colecciones*:
- crear y editar (nombre, color, emblema y descripción), con vista previa en una carta grande y en miniatura;
- **sus cartas**: la lista, con *Quitar* en cada una, y *＋ Añadir cartas* con un buscador de miniaturas. Si una carta ya está en otra colección, avisa y la mueve;
- borrar: sus cartas se quedan sin colección. Si eso dejara dos cartas sin colección con el mismo nombre, no se borra y avisa.

Colecciones actuales (16 de octubre de 2026): *Down* (naranja, 8), *Dormidito* (morado, 4), *Seductor* (rojo, 4), *Muerto* (negro, 2) y *Cazatiburones* (azul, 2). Todavía no tienen emblema.

### Emblemas

- **Formato:** **PNG transparente monocromo** (un solo color, da igual cuál, sobre fondo transparente) o **SVG** de un solo color.
- **Forma:** cuadrado, de unos **256 × 256** píxeles, con un poco de margen alrededor del dibujo.
- **Cómo se pinta:** la app usa la silueta del dibujo como máscara y la pinta con el color de la colección. Un mismo emblema sirve en cualquier color. Lo que no es transparente sale de un solo color plano, así que no sirven fotos ni degradados.
- **Subida:** con *⬆ Subir emblema* en el gestor (preset `slr_cartas`, como las fotos), o pegando la URL.

## Imagen

Lo más fácil es subirla con el formulario. A mano:

1. Sube la foto a **Cloudinary** (la cuenta de siempre de Shits League, `dnd3g3zgm`).
2. Copia la URL que termina en `.jpg`/`.png` y pégala en `imagen_url`.

La app pide a Cloudinary el tamaño justo para cada pantalla (`f_auto`, que conserva la transparencia de los PNG) y recorta la foto a la carta (vertical **5:7**) sin deformarla. Lo ideal es una foto vertical de **1000 × 1400 píxeles** o más. Con un **PNG sin fondo**, detrás del jugador se ve el fondo de la carta (su color y su dibujo).

Zonas de la carta, de arriba abajo:

```
┌──────────────────────┐
│ 74               ☾  │  ← OVR (con el icono del tipo debajo) y emblema de la colección
│                      │
│      ☺  CARA         │  ← lo importante: mitad de arriba y centrado
│     /|\              │
│                      │
│ ░░░░░░░░░░░░░░░░░░░░ │  ← desde aquí, degradado oscuro
│ ░░  NOMBRE       ░░░ │  ← nombre (una o dos líneas)
│ ░░  COLECCIÓN    ░░░ │  ← solo en la carta grande
│ ░  ATA  DEF  CON  ░░ │  ← stats: el tercio de abajo queda tapado en parte
└──────────────────────┘
   deja un poco de margen en los bordes: el marco (la rareza) tapa unos píxeles
```

Funcionan bien:
- **Retratos:** cara entre el primer tercio y la mitad de la altura.
- **Cuerpo entero:** recortados para que la cabeza quede arriba.

Las fotos muy oscuras también se leen, porque el texto va sobre el degradado. Una foto horizontal también vale, pero se recorta mucho por los lados.

### Cloudinary: el preset de subida

El formulario sube las fotos sin contraseña con un **upload preset sin firma**. Ya está creado; si algún día falla la subida, revisa esto en Cloudinary (cuenta `dnd3g3zgm`):

1. *Settings → Upload → Upload presets*.
2. Tiene que existir uno llamado **`slr_cartas`** con *Signing mode* = **Unsigned**.
3. Recomendado: carpeta `slr/cartas`, formatos permitidos `png, jpg, jpeg, webp` y un tamaño máximo (10 MB).
4. No actives transformaciones que conviertan a JPG (se perdería la transparencia): la app ya pide el formato adecuado al mostrarla.

Si la subida falla, el formulario lo dice y explica qué revisar. Mientras tanto, se puede pegar la URL de la foto.

## Acabados

| `acabado` | Cómo se ve |
|---|---|
| `normal` | Sin efecto. |
| `foil` | Brillo iridiscente que sigue el dedo, el ratón o la inclinación del móvil. |
| `brillante` | Borde dorado que late y un destello que cruza la carta. |
| `plateada` | Tono metálico plateado con un brillo que la recorre. |

Puedes verlos todos lado a lado, con y sin foto: **Rush → Perfil → Modo pruebas → Muestrario de acabados**.

**Un acabado nuevo** (oro, purpurina…) se pide a quien programe. Hay que añadirlo a la base de datos y crear su efecto. Cada acabado es un archivo independiente, así que no toca a los demás: `js/slr/acabados/` y `css/acabados/`.

## Edición múltiple

En el **catálogo de cartas** y en la **herramienta de plantillas** (con el modo pruebas activo) se pueden cambiar varias cartas a la vez.

**Seleccionar:**
- con el botón *☑ Seleccionar*: cada carta muestra su casilla y tocarla la marca;
- en PC, **Ctrl/Cmd+clic** añade o quita una y **Mayús+clic** marca el rango desde la última, como en el explorador de archivos;
- en el móvil, **mantener pulsada** una carta entra en modo selección (en estas listas las cartas no se levantan);
- *Seleccionar todas las visibles* marca todas las que pasan los filtros, aunque estén en otra página;
- *Quitar selección* las desmarca, y el contador dice cuántas hay marcadas.

**Editar:** en *✎ Editar* se elige qué cambiar; lo que se deje en «Sin cambios» no se toca. Se puede cambiar:
- colección (o «Sin colección»);
- color (o «El de la colección»);
- tipo, tier, perfil y acabado;
- estamina y táctica favorita (o «Ninguna»);
- activar o desactivar (no desde una liga de prueba);
- regenerar stats o regenerar poderes, con semilla nueva.

Si cambias el tier o el perfil sin regenerar las stats, pregunta si regenerarlas también: si no, cada carta conserva las suyas.

Antes de aplicar sale un **resumen**: cuántas cartas cambian, qué cambia y algunos ejemplos («Mateo: tier C→A, rara→épica»), con el valor y la rareza ya recalculados. Se aplica todo de una vez: si algo falla (por ejemplo, un nombre repetido en la colección destino), no cambia ninguna.

## Desactivar una carta

Pon **`activo` = `false`**. A partir de ese momento:

- no sale en sobres, subastas ni plantillas nuevas;
- **quien ya la tiene la conserva** y puede seguir alineándola;
- si vuelves a ponerla a `true`, vuelve a salir. Si no existía en la liga, se le crea su ejemplar.

No borres filas de `disenos_carta` en el Table Editor: las cartas de las ligas apuntan a ellas y Supabase no te dejará.

## Borrar cartas del catálogo

Solo mientras la liga esté en modo pruebas. **Rush → Perfil → Modo pruebas → Borrar cartas beta (sin foto)** borra las que tengan `beta` = `true` y no tengan foto:
- primero dice cuántas se borran (por tipo), cuántas quedan y qué equipos pierden cartas;
- para confirmar hay que escribir BORRAR;
- borra también todo lo que depende de ellas: sus ejemplares en todas las ligas, sus huecos en las alineaciones, subastas, pujas, ventas, ofertas, intercambios, sobres, álbum, historial y avisos. Los partidos ya jugados no se tocan.

Para borrar otras cartas concretas, la función es `slr_admin_borrar_disenos` con `{"liga_id": …, "ids": [...]}`. Si solo quieres que dejen de salir, mejor desactívalas.

## Dar o quitar una carta a alguien (pruebas)

No toques las tablas `cartas` ni `equipos` a mano. Para eso está **Rush → Perfil → Modo pruebas → Plantillas**: buscas la carta por nombre y usas "Dar a…" o "Dejar libre". La herramienta se encarga de todo:
- respeta el límite de 15 cartas;
- la apunta en el álbum;
- la quita de la alineación del dueño anterior;
- cancela sus ventas, ofertas y subastas;
- lo deja en el historial.

## Sobres

Hay cinco tipos (tabla `tipos_sobre`). Cada liga usa los de por defecto hasta que su administrador edita alguno desde *Modo pruebas → Sobres*: entonces esa liga tiene su propia fila para ese tipo y los demás no cambian.

| Sobre | Cartas | Precio J1–3 / J4–5 / J6+ |
|---|---|---|
| Sencillo | 1 al azar | 500 / 600 / 650 |
| Básico | 3 al azar | 1.500 / 1.800 / 2.000 |
| Elección | 3 candidatas (al menos una rara o mejor); te quedas con una en 10 minutos | 950 / 1.600 / 2.100 |
| De posición | 1 de la posición que elijas (portero, defensa, control o ataque): la de su stat más alta (portero y defensa: DEF; con empate, vale para las dos) | 550 / 850 / 950 |
| De colección | 1 de la colección de la semana | 600 / 850 / 900 |

- El precio va por tramo de la progresión (~70 % de valor esperado con el catálogo objetivo). Sin progresión (modo beta o preparación) se cobra el del último tramo.
- **Colección de la semana:** cada lunes a las 00:00 (hora de la liga) se elige al azar una colección con cartas que puedan salir. Con la progresión activa, solo entran las colecciones cuya carta más alta (contando todas, libres o no) ya está desbloqueada: con épicas, desde la jornada 4; con legendarias, desde la 6. Sin progresión, cualquiera. El administrador la cambia a mano desde el Modo pruebas (con aviso si no cumple la regla) o sortea otra con la regla.
- Solo salen cartas libres (sin dueño, fuera de subasta y no reservadas) y que la progresión deja salir. Si un sobre no se puede llenar, sale **AGOTADO** y no se puede comprar; la tienda dice cuántas quedan cuando importa («Quedan 3 cartas de Dormidito»).
- El sobre se abre aunque la plantilla pase de 15. Al terminar, si sobran cartas, «Haz hueco» enseña todas (las nuevas marcadas) para elegir cuáles vender al banco; mientras sobren no se puede hacer nada más en el mercado ni tocar la alineación, y si llega el cierre de la jornada el banco se queda con las de menos valor.
- Al historial público solo van los sobres en los que sale una épica o una legendaria.

### Imágenes de los sobres y del dorso

- **Sobre:** PNG vertical de unos **600 × 1000 px** (proporción 3:5), en `tipos_sobre.imagen_url`. Si el sobre tiene forma propia (bordes rasgados, esquinas recortadas…), con **fondo transparente**. La app pone encima el brillo laminado y el rasgado, así que la imagen va sin efectos. Sin imagen, la app dibuja un diseño provisional distinto por tipo. El de colección usa una plantilla con el emblema y el color de la colección de la semana.
- **Dorso de las cartas:** PNG o JPG de proporción **5:7** (p. ej. 500 × 700 px), en `ajustes.dorso_carta_url` (o el de la liga, `ligas.config.dorso_url`). El color de la rareza lo añade la app. Sin imagen, un dorso provisional generado por código.
- Se suben desde *Modo pruebas → Sobres* a Cloudinary con el preset `slr_cartas`, como las fotos de las cartas.
