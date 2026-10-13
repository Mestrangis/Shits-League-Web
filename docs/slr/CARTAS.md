# Cartas de Shits League Rush: guía para editar el catálogo

El catálogo está en la tabla **`disenos_carta`** de Supabase (*Table Editor → disenos_carta*). Se puede editar a mano con seguridad. Un trigger hace tres cosas:

- **Calcula el valor:** con la misma fórmula del juego.
- **Revisa los poderes:** si algo está mal, la fila no se guarda y el panel muestra un mensaje que dice qué falla.
- **Crea un ejemplar:** cuando la carta es nueva, aparece libre en la liga.

## Columnas

| Columna | ¿Rellenar? | Qué es |
|---|---|---|
| `nombre` | **Sí** | Nombre de la carta tal como se verá. |
| `tipo` | **Sí** | `individual`, `duo`, `trio` o `unica`. |
| `ata`, `def`, `con` | **Sí** | Ataque, defensa y control, de 1 a 101. |
| `personas` | Opcional | Quiénes salen en la carta. Sirve para el dibujo sin foto de los dúos y tríos. Formato: `{"Marcos","Nacho"}`. |
| `poderes` | Opcional | Lista de poderes (ver abajo). Por defecto `[]`, sin poderes. |
| `imagen_url` | Opcional | La foto (ver abajo). Sin foto se pinta una silueta con las iniciales. |
| `texto` | Opcional | Una frase que sale en el detalle de la carta. |
| `acabado` | Opcional | `normal` (por defecto), `foil`, `brillante` o `plateada`. |
| `activo` | Opcional | `true` por defecto. Ver "Desactivar una carta". |
| `beta` | Opcional | `false` por defecto. Las del catálogo de pruebas inicial van a `true`. |
| `id`, `creado_en` | **No** | Se rellenan solas. |
| `valor` | **No** | Se calcula solo cada vez que guardas, aunque escribas otro número. |

El **OVR** no se guarda en ningún sitio: el juego lo calcula al vuelo con las tres stats. Las 60 % la mejor, 25 % la del medio y 15 % la peor.

El **valor** sale del OVR y de los poderes. Cada poder lo sube un 15 % (`simple`), un 35 % (`fuerte`) o un 60 % (`muy fuerte`).

## Poderes

`poderes` es una lista JSON. Cada poder tiene cinco campos:

- `nombre`: el nombre que se verá.
- `momento`: cuándo actúa (uno de los seis de abajo).
- `probabilidad`: de 0 a 1 (`0.25` = 25 % de las veces), o `"siempre"`. Si la carta es el capitán, la probabilidad se multiplica por 1,5.
- `efecto`: un número mayor que 0. Normalmente es el aumento (`0.15` = +15 %). En `tirador` es un multiplicador (`2` = el doble de opciones).
- `nivel`: `simple`, `fuerte` o `muy fuerte`. Solo cuenta para el valor.

Un ejemplo de cada momento:

```json
[{"nombre": "Batuta",       "momento": "posesion",        "probabilidad": 0.25,      "efecto": 0.15, "nivel": "simple"}]
```
Al disputar cada balón: +15 % a la fuerza de posesión de su equipo, el 25 % de las veces.

```json
[{"nombre": "Desmarque",    "momento": "ocasion_ataque",  "probabilidad": 0.3,       "efecto": 0.2,  "nivel": "fuerte"}]
```
Cuando su equipo ataca: +20 % a la fuerza de ataque.

```json
[{"nombre": "Muro",         "momento": "ocasion_defensa", "probabilidad": 0.25,      "efecto": 0.2,  "nivel": "fuerte"}]
```
Cuando su equipo defiende: +20 % a la fuerza defensiva.

```json
[{"nombre": "Chupón",       "momento": "tirador",         "probabilidad": "siempre", "efecto": 2,    "nivel": "simple"}]
```
Al elegir quién chuta: el doble de opciones de ser él.

```json
[{"nombre": "Cañonero",     "momento": "chut",            "probabilidad": 0.3,       "efecto": 0.25, "nivel": "fuerte"}]
```
Cuando chuta él: +25 % a su ATA en ese chut.

```json
[{"nombre": "Manos de oro", "momento": "parada",          "probabilidad": 0.2,       "efecto": 0.3,  "nivel": "muy fuerte"}]
```
Cuando para de portero: +30 % a su DEF en esa parada.

Una carta puede tener varios poderes. Se ponen todos en la misma lista, separados por comas:

```json
[{"nombre": "Batuta", "momento": "posesion", "probabilidad": 0.25, "efecto": 0.15, "nivel": "simple"},
 {"nombre": "Cañonero", "momento": "chut", "probabilidad": 0.3, "efecto": 0.25, "nivel": "fuerte"}]
```

## Imagen

1. Sube la foto a **Cloudinary** (la cuenta de siempre de Shits League).
2. Copia la URL que termina en `.jpg`/`.png` y pégala en `imagen_url`.

La app pide a Cloudinary el tamaño justo para cada pantalla y recorta la foto a la carta (vertical **5:7**) sin deformarla. Lo ideal es una foto vertical de **1000 × 1400 píxeles** o más.

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
│ ░░  NOMBRE       ░░░ │  ← nombre
│ ░  ATA  DEF  CON  ░░ │  ← stats: el tercio de abajo queda tapado en parte
└──────────────────────┘
   deja un poco de margen en los bordes: el marco tapa unos píxeles
```

Funcionan bien:
- **Retratos:** cara entre el primer tercio y la mitad de la altura.
- **Cuerpo entero:** recortados para que la cabeza quede arriba.

Las fotos muy oscuras también se leen, porque el texto va sobre el degradado. Una foto horizontal también vale, pero se recorta mucho por los lados.

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
