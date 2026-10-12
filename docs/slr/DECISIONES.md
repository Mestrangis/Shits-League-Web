# Shits League Rush (SLR) — Decisiones

Decisiones que prevalecen sobre los documentos «Liga de Bolsillo — Especificación del juego» y «SLR — Especificación complementaria».

## Decisiones de diseño

- SLR vive dentro de este repo como sección nueva ("Rush"): código en `js/slr/`, estilos en `css/slr.css`, assets en `assets/slr/`. Backend en Supabase, independiente de Google Sheets. Identificación de usuarios con el login por código ya existente.
- Test de regresión en dos partes: fórmulas de la sección 14 + test dorado con semilla 12345. El partido narrado de la sección 14 está hecho a mano.
- Las cartas actuales son de prueba; el catálogo real se diseñará más adelante.
- Poder Batuta: posesion, 25 %, +15 %, simple.
- Los poderes "tirador" con probabilidad se sortean justo antes de la ruleta.
- Las stats se redondean (`Math.round`); fuerzas y probabilidades no.
- Lesión: 0,05 % por carta y jugada (el PDF decía 0,1 %).
- Un equipo puede tener y alinear a la vez variantes distintas de un mismo diseño (Pichichi normal + Pichichi foil). Lo único que no se repite es el mismo ejemplar.
- Las variantes vendidas al banco vuelven al bombo de subastas diarias y de sobres.
- Una carta que está en el mercado (subasta activa) no puede salir en un sobre. Solo vuelve al bombo de sobres cuando sale del mercado sin dueño.
- Sobre de elección: requiere 1 hueco libre en la plantilla.
- Para cualquier adquisición (sobre, subasta, compra, cláusula, intercambio) hace falta tener hueco libre en la plantilla. Si estás a 15, la app ofrece justo antes vender una carta al banco para hacer hueco. En las subastas, que se resuelven a las 00:00 sin el usuario, si el ganador tiene la plantilla llena al resolverse, su puja se anula y gana la siguiente (como dice el PDF); la app avisa de esto al pujar.
- Motor v1.1.0: la posesión se resuelve con duelo lineal A/(A+B) en vez de cuadrático. Motivo: con k = 2 un tercer medio daba demasiada posesión y las formaciones de 3 medios dominaban (diferencia de 0,50 puntos por partido entre la mejor y la peor formación; con el cambio ~0,2). Un equipo con +10 de media gana ~60 %.

## Decisiones de implementación del motor (v1.0.0, vigentes en v1.1.0)

Puntos que ni la especificación ni el encargo fijaban del todo y que el motor resuelve así. Cambiar cualquiera de ellos es una versión nueva del motor.

- **Capitán lesionado sin suplente:** sigue en el campo, así que conserva el ×1,5 en sus poderes. El brazalete solo se pierde cuando sale (lesión con cambio) y no pasa a nadie.
- **Chut con poderes:** la ATA del tirador × poderes "chut" y la DEF del portero × poderes "parada" se tratan como fuerzas: decimales, sin redondear. Las stats de la carta no cambian.
- **Poderes "siempre":** emiten su evento `poder` igual que los sorteados, en su lugar del orden (sin consumir número).
- **Ruleta del tirador:** el número `u` se compara con las probabilidades acumuladas en orden de hueco (MED y luego DEL); si por redondeo flotante no cae en ninguno, sale el último candidato.
- **Estadísticas:** `ocasiones` cuenta las ocasiones logradas (siempre acaban en tiro); `cortes` se apunta al equipo que defiende; `paradas` al equipo del portero que para.
- **PR:** se incluyen todos los titulares (aunque acaben con 0) y los suplentes que entran. Los repartos (posesión y corte) dejan decimales; no se redondean.
- **Lesión sin suplente:** las tres stats pasan a `round(stat × 0,7)` sobre su valor en ese momento (ya cansado), con mínimo 1. Una segunda lesión de esa carta consume el número de lesión y no consume el de cansancio.
- **Penaltis:** sus eventos llevan `jugada: null` y `minuto: 90`. Los lanzadores se ordenan al empezar la tanda, con las stats que tengan en ese momento. El `fin_partido` siempre va con `jugada: 10`.
- **Validación de entrada:** el motor rechaza formaciones fuera de las cinco permitidas, huecos que no cuadran con la formación, stats que no sean enteros ≥ 1 y cartas repetidas en la alineación.
- **Determinismo:** el PRNG mulberry32 usa `Math.imul` y operadores de bits, que son operaciones enteras exactas e idénticas en cualquier motor JS. El resto del motor solo usa `+ - * /`, `Math.floor`, `Math.round`, `Math.min` y `Math.max` (un test lo comprueba leyendo el código).
- **Comando de tests:** en Node ≥ 21, `node --test` recibe patrones de fichero y no recorre carpetas, así que el comando es `node --test "tests/slr/*.test.mjs"` (o `node --test` sin argumentos desde la raíz).

- **Versiones:** la v1.0.0 se retiró sin haberse jugado ningún partido con ella (por eso se borró). A partir de la v1.1.0, un archivo de motor publicado no se modifica: cada cambio de reglas es un archivo nuevo con su propio test dorado.

## Balance de referencia (motor v1.1.0)

`node tests/slr/balance.mjs`, 10.000 partidos por escenario:

- Los del Fondo contra sí mismo (2-2-2): 2,31 goles por partido, 27 % de empates.
- Marcos FC contra sí mismo (1-3-2, un solo defensa): 3,99 goles por partido, 20 % de empates.
- Marcos FC contra Los del Fondo: 38,2 % / 23,0 % / 38,8 % (con la v1.0.0 era 45,6 % / 22,8 % / 31,6 %).
- Partidos con alguna lesión: 6,7 %.
- Equipo con +10 de media (75 contra 65, misma formación, plantilla neutra): gana el 58,6 %, empata el 22,5 %.

`node tests/slr/formaciones.mjs` (puntos por partido de cada formación contra las otras cuatro):

| | Plantilla neutra | Plantilla realista |
|---|---|---|
| v1.0.0 (posesión k = 2) | 1-3-2 1,644 … 1-2-3 1,162 → diferencia 0,48 | 1-3-2 1,634 … 3-2-1 1,179 → diferencia 0,46 |
| v1.1.0 (posesión lineal) | 1-3-2 1,453 … 1-2-3 1,288 → diferencia 0,17 | 2-2-2 1,494 … 3-2-1 1,280 → diferencia 0,21 |

Los goles dependen mucho de la formación (con un solo defensa la ocasión llega el 70 % de las veces). Cuando exista el catálogo real conviene volver a medir con alineaciones típicas.
