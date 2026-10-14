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
2. **Nombre, tipo, perfil, tier, acabado y color.** El color es opcional: sin color, la carta usa el del tipo.
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
| `nombre` | **Sí** | Nombre de la carta tal como se verá. Los nombres largos se ven enteros: la letra se hace más pequeña y, si hace falta, pasa a dos líneas. |
| `tipo` | **Sí** | `individual`, `duo`, `trio` o `unica`. |
| `tier` | **Sí** (si no pones stats) | `S`, `A`, `B`, `C`, `D`, `E` o `F` (ver "Tiers"). Si pones las stats y no el tier, se calcula de su OVR. |
| `perfil` | **Sí** (si no pones stats) | `atacante`, `defensa`, `control`, `portero` o `equilibrado`. Si no lo pones, se deduce de las stats. |
| `ata`, `def`, `con` | Opcional | Ataque, defensa y control, de 1 a 101. Vacías = se generan. |
| `poderes` | Opcional | Lista de poderes (ver abajo). Vacío = se generan; `[]` = sin poderes. |
| `color` | Opcional | Color de la carta (ver "Colores"). Vacío = el del tipo. |
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

El **OVR** no se guarda en ningún sitio: el juego lo calcula al vuelo con las tres stats. Cuenta el 60 % la mejor, el 25 % la del medio y el 15 % la peor.

El **valor** sale del OVR y de los poderes. Cada poder lo sube un 15 % (`simple`), un 35 % (`fuerte`) o un 60 % (`muy fuerte`).

## Tiers

El tier fija el OVR de la carta y los poderes que propone el generador:

| Tier | OVR | Poderes propuestos | Cuántas tener (liga de 18 equipos) |
|---|---|---|---|
| **S** | 85–95 | 2 fuertes | 4–6 |
| **A** | 78–85 | 1 fuerte | 12–15 |
| **B** | 72–78 | 1 simple | 25–30 |
| **C** | 66–72 | 1 simple el 40 % de las veces | 40–50 |
| **D** | 60–66 | ninguno | 80 |
| **E** | 54–60 | ninguno | 80 |
| **F** | 46–54 | ninguno | 70 |

Por qué tantas D, E y F:

- Cada equipo empieza con **11 individuales** sacadas del "bombo": las individuales **sin el 20 % más caro**.
- Con 18 equipos son **198 cartas** solo para las plantillas iniciales, y conviene que sobren para que el reparto tenga donde elegir (±10 % de valor entre equipos) y para los sobres y las subastas.
- Las S, A y B (y parte de las C) caen en ese 20 % caro: no entran en las plantillas iniciales, se consiguen en el mercado.
- Resumen: unas **300 individuales**, casi todas D, E y F; los **dúos** (unos 25) entre C y A, los **tríos** (unos 8) entre A y S, y **1 o 2 únicas** en S.

Ahora mismo el catálogo beta tiene S 1 · A 6 · B 20 · C 31 · D 83 · E 69 · F 74 (calculado de sus stats).

**Perfil**, la forma de las stats:

| Perfil | Forma |
|---|---|
| `atacante` | ATA la más alta |
| `defensa` | DEF la más alta |
| `control` | CON la más alta |
| `portero` | DEF muy alta y ATA muy baja (en S, con la DEF al tope, el ATA no puede bajar tanto) |
| `equilibrado` | las tres parecidas |

Las stats nunca pasan de 97 en las individuales, 99 en los dúos, 100 en los tríos y 101 en las únicas.

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

| `color` | Cómo se ve |
|---|---|
| vacío | El color del tipo: verde (individual), azul claro (dúo), morado (trío), dorado (única). |
| `verde`, `morado`, `azul`, `rojo`, `naranja`, `dorado`, `plata`, `negro` | El fondo, el borde y los detalles de la carta en ese color. |

Se ven todos en *Rush → Perfil → Modo pruebas → ✨ Muestrario de cartas*.

## Imagen

Lo más fácil es subirla con el formulario. A mano:

1. Sube la foto a **Cloudinary** (la cuenta de siempre de Shits League, `dnd3g3zgm`).
2. Copia la URL que termina en `.jpg`/`.png` y pégala en `imagen_url`.

La app pide a Cloudinary el tamaño justo para cada pantalla (`f_auto`, que conserva la transparencia de los PNG) y recorta la foto a la carta (vertical **5:7**) sin deformarla. Lo ideal es una foto vertical de **1000 × 1400 píxeles** o más. Con un **PNG sin fondo**, detrás del jugador se ve el fondo de la carta (su color y su dibujo).

Zonas de la carta, de arriba abajo:

```
┌──────────────────────┐
│ 74 ·                 │  ← OVR arriba a la izquierda (no pongas aquí nada importante)
│                      │
│      ☺  CARA         │  ← lo importante: mitad de arriba y centrado
│     /|\              │
│                      │
│ ░░░░░░░░░░░░░░░░░░░░ │  ← desde aquí, degradado oscuro
│ ░░  INDIVIDUAL   ░░░ │  ← tipo
│ ░░  NOMBRE       ░░░ │  ← nombre (una o dos líneas)
│ ░  ATA  DEF  CON  ░░ │  ← stats: el tercio de abajo queda tapado en parte
└──────────────────────┘
   deja un poco de margen en los bordes: el marco tapa unos píxeles
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

## Desactivar una carta

Pon **`activo` = `false`**. A partir de ese momento:

- no sale en sobres, subastas ni plantillas nuevas;
- **quien ya la tiene la conserva** y puede seguir alineándola;
- si vuelves a ponerla a `true`, vuelve a salir. Si no existía en la liga, se le crea su ejemplar.

No borres filas de `disenos_carta`: las cartas de las ligas apuntan a ellas.

## Dar o quitar una carta a alguien (pruebas)

No toques las tablas `cartas` ni `equipos` a mano. Para eso está **Rush → Perfil → Modo pruebas → Plantillas**: buscas la carta por nombre y usas "Dar a…" o "Dejar libre". La herramienta se encarga de todo:
- respeta el límite de 15 cartas;
- la apunta en el álbum;
- la quita de la alineación del dueño anterior;
- cancela sus ventas, ofertas y subastas;
- lo deja en el historial.
