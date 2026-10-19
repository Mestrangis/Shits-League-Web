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
- ~~Un equipo puede tener y alinear a la vez variantes distintas de un mismo diseño (Pichichi normal + Pichichi foil). Lo único que no se repite es el mismo ejemplar.~~ *Anulada: ver «Acabados».*
- ~~Las variantes vendidas al banco vuelven al bombo de subastas diarias y de sobres.~~ *Anulada: ver «Acabados». Cualquier carta vendida al banco vuelve al bombo.*
- Una carta que está en el mercado (subasta activa) no puede salir en un sobre. Solo vuelve al bombo de sobres cuando sale del mercado sin dueño.
- Sobre de elección: requiere 1 hueco libre en la plantilla.
- Para cualquier adquisición (sobre, subasta, compra, cláusula, intercambio) hace falta tener hueco libre en la plantilla. Si estás a 15, la app ofrece justo antes vender una carta al banco para hacer hueco. En las subastas, que se resuelven a las 00:00 sin el usuario, si el ganador tiene la plantilla llena al resolverse, su puja se anula y gana la siguiente (como dice el PDF); la app avisa de esto al pujar.
- Motor v1.1.0: la posesión se resuelve con duelo lineal A/(A+B) en vez de cuadrático. Motivo: con k = 2 un tercer medio daba demasiada posesión y las formaciones de 3 medios dominaban (diferencia de 0,50 puntos por partido entre la mejor y la peor formación; con el cambio ~0,2). Un equipo con +10 de media gana ~60 %.
- Arquitectura: todas las escrituras van por funciones de Postgres (`slr_*`, SECURITY DEFINER) que reciben el token de sesión, lo validan y hacen la operación en una sola transacción. Las Edge Functions quedan solo para simular partidos. RLS activado en todas las tablas. En el repo solo está la clave pública.
- Login: el mismo código de Shits League, comprobado en el servidor con su hash; sesiones con token.
- Catálogo beta: ~283 cartas genéricas sin imagen (marca `beta`) para probar el juego; se sustituirán o editarán cuando exista el catálogo real. Son cartas normales a todos los efectos.
- **Acabados (sustituyen a las variantes):** foil, brillante y plateada no son copias especiales de un diseño, sino el **acabado visual** del diseño, que decide Marcos al crear la carta, igual que su imagen («Supernova» es una carta foil; no existe un «Supernova normal»). Cada diseño tiene un solo acabado y un solo ejemplar por liga. El acabado no cambia stats, valor ni reglas: solo el aspecto. En la base de datos es `disenos_carta.acabado`; `cartas` y `album` ya no tienen variante (únicos por liga y diseño). Sobres y subastas sortean por ejemplar, que ahora equivale a por diseño.
- **Especificación complementaria:** las secciones **2.3** (unicidad de variantes en la liga) y **3.3** (probabilidades de variante en los sobres) quedan **anuladas**. Las secciones **2.1** y **2.2** (cómo se ve cada acabado: foil iridiscente que sigue el dedo, destello dorado, brillo plateado, estado de reposo) siguen valiendo para la interfaz.
- El mercado funciona en ligas en preparación y en curso.
- Una elección de sobre pendiente bloquea las demás operaciones de mercado de ese usuario.
- Con el catálogo beta, la economía (precios de sobres, saldo y salario) no es representativa; se ajustará con el catálogo real desde `ligas.config`.

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

## Decisiones de implementación de la base de datos (paso 2)

- **Qué es público:** desde la web (clave pública) se pueden leer `usuarios`, `disenos_carta`, `ligas` (sin el código de invitación), `equipos` (saldo incluido), `cartas`, `album`, `alineaciones`, `jornadas`, `subastas`, `ventas`, `historial` y la vista `clasificacion`. `partidos` solo cuando su jornada está publicada (antes no se ve ni la semilla ni el resultado).
- **Qué es privado:** `codigos`, `sesiones`, `pujas`, `ofertas`, `intercambios`, `movimientos`, `sobres_abiertos` y `notificaciones` no tienen ninguna lectura desde fuera; se consultarán con funciones `slr_*` que comprueban el token (de momento `slr_movimientos`).
- **Código de invitación:** está en `ligas`, pero con privilegio por columnas no se puede leer desde fuera; solo lo devuelve `slr_yo` a los miembros y al admin de la liga. Consecuencia: desde la web, `ligas` se lee indicando columnas (`select=id,nombre,…`), no con `select=*`.
- **Clave pública:** se usa la nueva `publishable` (`sb_publishable_…`), no la `anon` antigua. Va en la cabecera `apikey`.
- **Funciones internas** (`sesion_usuario`, `mover_dinero`, `asignar_plantilla_inicial`…) tienen el permiso de ejecución retirado: solo las `slr_*` se pueden llamar por `/rest/v1/rpc`.
- **Errores:** sesión o código no válidos → `errcode 28000` (HTTP 403); operación rechazada → `P0001` (HTTP 400). Siempre con un mensaje en castellano listo para mostrar.
- **Sesiones:** caducan tras 180 días sin uso; cada llamada renueva la fecha. `slr_logout` borra la sesión.
- **Parámetros de las RPC:** se llaman como en el encargo (`token`, `nombre`, `codigo_invitacion`, `nombre_equipo`, `equipo_id`, `formacion`, `huecos`, `banquillo`, `orden_manual`, `capitan_id`, `liga_id`); el JSON de la petición usa esos nombres.
- **Formato de `huecos`:** `{"por": id, "def": [ids], "med": [ids], "del": [ids]}`, la misma forma que la alineación que recibe el motor.
- **Plantilla inicial:** se eligen entre las individuales libres que no están reservadas ni en subasta. Objetivo = 11 × valor medio de esas cartas; se prueban hasta 40 muestras al azar y, si ninguna queda dentro del ±10 %, se hacen intercambios voraces (la pareja que más acerca cada vez). Si es imposible, se queda la mejor aproximación. Las altas en una liga se serializan (bloqueo de la fila de la liga) para que dos usuarios no reciban la misma carta.
- **Alineación por defecto:** 2-2-2; banquillo = las 3 siguientes por OVR; desempates por OVR y después por id. Si el equipo tiene menos de 7 cartas no se crea.
- **Configuración del sobre de elección:** el PDF no da sus pesos de aparición; de momento usa los del premium (provisional, pendiente de decidir).
- **Plantilla máxima:** además de comprobarlo cada función, un trigger impide que un equipo pase de `plantilla_maxima` cartas.
- **Bloqueo por jornada:** `liga_bloqueada(liga)` ya se consulta al guardar la alineación; hoy siempre devuelve `false` y en el paso 4 bloqueará entre el cierre y la publicación.
- **Borrar una liga** borra también las entradas de álbum de esa liga (solo se usa para pruebas).
- **Campos añadidos a la sección 11.2:** `usuarios.es_bot`, `ventas.comprador_id` y `resuelta_en`, `sobres_abiertos.elegida` y `estado` (sobre de elección), `notificaciones.liga_id`, `disenos_carta.beta`; vía de álbum `intercambio`. `usuarios` no tiene email (el login es por código).
- **Migraciones generadas:** `20261012230200_slr_usuarios.sql` (de `supabase/seed/generar-usuarios.mjs`, que lee `js/session.js`) y `20261012230300_slr_catalogo_beta.sql` (de `supabase/seed/generar-catalogo.mjs`, determinista con semilla 20261012). No se editan a mano.
- **Riesgo conocido:** los hashes de los códigos de los 18 jugadores ya son públicos en `js/session.js`, y los códigos siguen un patrón corto, así que alguien con interés podría sacarlos probando combinaciones sin tocar el servidor. Los bots usan códigos aleatorios de 96 bits, imposibles de adivinar.

## Decisiones de implementación del mercado (paso 3)

- **Orden de comprobaciones de toda operación:** sesión → liga de la carta → `preparar_operacion` (es miembro, la liga está en preparación o en curso, `liga_bloqueada()` es falso y no tiene una elección de sobre pendiente) → propiedad → hueco → dinero. Todo cambio de saldo pasa por `mover_dinero` y el banco no tiene cuenta: lo que se le paga desaparece.
- **Una elección de sobre pendiente ocupa un hueco de la plantilla.** Así la carta elegida siempre cabe, aunque mientras tanto se resuelva una subasta a favor de ese usuario.
- **Elecciones caducadas:** además de la tarea de cada 5 minutos, se resuelven en cuanto el usuario intenta otra operación de mercado (no tiene que esperar al cron).
- **Sobre de elección:** si las dos primeras candidatas son individuales, la tercera se fuerza a dúo o superior (si queda alguna libre). Si se elige fuera de plazo, se entrega la primera y la respuesta lo indica (`automatica: true`).
- **Garantía premium:** se aplica cuando `contador_garantia_premium` es ≥ `garantia_tras` (2 en la config).
- ~~**Variantes** y **efecto de reciclar especiales**~~: *anuladas con el cambio a acabados. Ya no hay tirada de variante ni ejemplares especiales; el reparto de tipos de los sobres coincide con el teórico (básico: 93,1 % individual, 6,7 % dúo, 0,2 % trío en 900 cartas, frente a 92,9 / 6,7 / 0,45 % calculado).*
- **Catálogo beta con acabados:** 6 dúos foil, 3 dúos plateados, 4 tríos brillantes, 2 tríos foil, la Única foil y 10 individuales (4 foil, 3 brillantes, 3 plateadas); el resto, normal. Van en su propia migración (`20261013010100_slr_catalogo_acabados.sql`), generada por `supabase/seed/generar-catalogo.mjs` con otra semilla para no alterar el catálogo base ya aplicado.
- **Subastas:** puja mínima = valor de la carta; una puja por equipo y subasta (se puede modificar o retirar); se puede pujar por encima del saldo. En empate gana el peor clasificado (puntos, diferencia de goles y goles a favor, de menos a más) y después la puja que llegó antes a ese importe (`actualizada_en`). Las pujas se publican en el historial al resolverse.
- **Tanda diaria:** se abre en la primera pasada del cron tras la medianoche local de la liga (la fecha se calcula con su zona horaria, así que el cambio de hora no la duplica ni la salta); dura 24 h desde que se abre. Una liga nueva tiene su primera tanda en la siguiente pasada del cron.
- **Ofertas:** la acepta siempre el destinatario; si la carta es suya vende y si es del que la envió (contraoferta del dueño) compra. Una oferta vencida que el cron aún no ha procesado se marca como caducada al intentar aceptarla y se devuelve `{error}` en lugar de lanzar, para que el cambio de estado no se pierda. Las ofertas y propuestas de intercambio no van al historial público hasta que se completan.
- **Intercambios:** al menos una carta por cada lado. Al aceptar, primero se cobran y después se pagan las monedas (si alguien acaba en negativo, no se hace nada); si alguna carta ya no es de quien la ofrecía, el intercambio se cancela. La comprobación de plantilla máxima se aplaza al final de la transacción porque en mitad del cambio un equipo puede tener una carta de más.
- **Venta al banco** de una carta en venta: se permite y cancela la venta.
- **Una carta que sale de un equipo puede seguir en su alineación guardada:** el hueco se resolverá en el cierre de jornada (paso 4, sección 4.6).
- **Funciones añadidas al encargo:** `slr_retirar_oferta`, `slr_retirar_intercambio` (el que propone puede retirarlos) y `slr_prueba_desblindar` (solo admin de liga de prueba; sin ella no se puede probar una cláusula sin esperar 7 días).
- **Tareas y ligas de prueba:** `slr_tareas_mercado` no se puede llamar desde fuera (excepción al prefijo `slr_`: la ejecuta el cron). Sin liga indicada procesa todas las ligas menos las de prueba; las de prueba solo avanzan con `slr_prueba_tareas`, para poder simular el tiempo sin que el cron real interfiera.
- **Migraciones aplicadas no se editan:** las correcciones van en migraciones nuevas (por ejemplo `20261013000400_slr_correcciones_paso3.sql`).

## Temporadas, jornadas y partidos (paso 4)

### Decisiones de Marcos (prevalecen sobre el PDF)

- **Sin copa:** la sección 6.3 no se implementa.
- **Calendario:** liga a una vuelta, N−1 jornadas con N equipos; con N impar, N jornadas y cada jornada descansa uno (el que descansa cobra el salario igual). Método del círculo con el orden barajado (jornadas, equipos y quién es local) a partir de una semilla guardada en `temporadas.semilla_calendario`.
- **Horario por defecto** (configurable por liga): cierre el domingo a las 20:00, simulación justo después y publicación a las 21:00, hora de Madrid. Las horas se calculan siempre como hora local de la liga, así que el cambio de hora no las mueve.
- **Solo el admin** controla la temporada: `slr_iniciar_temporada` (la jornada 1 es el primer domingo con el cierre al menos 24 h por delante), `slr_terminar_temporada` (en cualquier momento; solo cuentan las jornadas publicadas y las pendientes se cancelan), `slr_pausar` / `slr_reanudar` y `slr_aplazar_jornada` (la próxima jornada pendiente y todas las siguientes se mueven una semana). Al publicar la última jornada la temporada termina sola; la siguiente no empieza sola.
- **Altas:** nadie se puede unir con una temporada en marcha o en pausa; solo antes de la primera o entre temporadas.
- **Estados de la liga:** `preparacion` → `en_curso` ⇄ `pausada` → `entre_temporadas` → `en_curso`… Tabla `temporadas` (número, estado, semillas, iniciada/terminada, `terminada_antes`), referenciada por jornadas, partidos y clasificación. La clasificación es por temporada y la final se guarda en `temporadas.clasificacion_final`.
- **Mercado:** abierto en `preparacion` y `en_curso` salvo entre el cierre y la publicación de una jornada; cerrado en `pausada` y `entre_temporadas` (`liga_bloqueada()`). `slr_tareas_mercado` no abre subastas en una liga cerrada.
- **Pausa:** cancela las subastas abiertas sin coste y congela el calendario. **Reanudar:** los blindajes vigentes y las caducidades de ofertas e intercambios se alargan lo que duró la pausa; la próxima jornada pendiente pasa al primer domingo con 24 h por delante y las demás se recolocan semana a semana; las subastas vuelven la siguiente medianoche. Pausar y reanudar se apuntan en el historial y se notifican a todos.
- **Temporada nueva (2.ª en adelante), en una sola transacción:** todas las cartas quedan libres (sin dueño, sin blindaje, cláusula ×1,5, sin tocar); se cancelan ventas, ofertas, intercambios, subastas y sobres pendientes; el saldo vuelve a 5.000 (configurable) con un movimiento `reinicio_temporada`; cada equipo recibe 11 individuales **solo de su álbum en esa liga**: primero exclusivas al azar, luego compartidas con sorteo si hay conflicto, y las que sobran quedan libres (semilla guardada en `semilla_reparto`). Si un equipo no llega a 11 no se falla: se apunta en el historial. Blindaje de 7 días; el álbum no gana entradas. Alineación 2-2-2 por defecto, clasificación nueva y calendario nuevo. En la primera temporada las plantillas son las de unirse; el álbum es permanente.
- **Ciclo de jornada** (cron cada 5 min, estados idempotentes `programada` → `cerrada` → `simulada` → `publicada`):
  - *Cierre:* congela las alineaciones con estadísticas efectivas en `partidos.alineaciones_congeladas`. Carta tocada al 85 % redondeado. Carta que ya no es del equipo → el mejor suplente para ese hueco; si no hay, la mejor carta libre de la plantilla; si no, un Canterano 40/40/40. Con menos de 7 cartas se completa con Canteranos. Sin capitán si el capitán ya no está.
  - *Simulación:* semilla criptográfica (`gen_random_bytes`), 200 simulaciones de pronóstico (semilla+1…+200) y el partido real con el motor v1.1.0. Se guardan goles, p_local, p_visitante, PR, PR esperado, versión del motor y semilla; las lesiones dejan la carta tocada para la siguiente jornada de su equipo. Cobros: salario 1.000, participación 100 (si se guardó o confirmó la alineación desde la jornada anterior; `slr_confirmar_alineacion` solo marca `guardada_en`), bonus sorpresa (7.3) y ojo clínico (7.4: últimos 3 partidos oficiales con el mismo equipo, máximo 3 cartas por equipo).
  - *Publicación:* el resultado se hace visible, el mercado se reabre, historial y notificaciones. Si era la última jornada, la temporada termina y la liga pasa a `entre_temporadas`.
  - *Desempate:* puntos, diferencia de goles, goles a favor, enfrentamiento directo y sorteo con `temporadas.semilla_desempate`.
- **Edge Function `slr-simular`** (Deno) con copias exactas de los motores (`js/slr/motor-vX.Y.Z.js`; desde la v1.2.0, ver más abajo, elige versión por partido). pg_cron la invoca con pg_net; el secreto está en Supabase Vault (`slr_cron_secreto`) y en los secretos de la función (`SLR_CRON_SECRETO`), nunca en el repo. También simula los **amistosos** al instante con las alineaciones guardadas (sin puntos, dinero, lesiones ni cansancio posterior; no cuentan para el ojo clínico; se guardan para poder verlos). Idempotente.
- **Lecturas:** `slr_jornada`, `slr_partido` (solo publicado o amistoso), `slr_calendario`, `slr_clasificacion(token, liga, temporada)` y el pronóstico (~200 simulaciones contra el próximo rival).

### Plantillas iniciales baratas y equilibradas (añadido de Marcos)

- **Bombo:** las individuales del catálogo activo **sin el 20 % más caro** (`plantilla_inicial_excluir_top: 0.20` en la configuración; el corte son `round(n · 0,20)` cartas por valor descendente). Si no quedan bastantes libres se amplía con las siguientes más baratas, nunca empezando por las caras.
- **Objetivo común:** 11 × valor medio del bombo, con un margen de ±10 %. Todos los equipos buscan el mismo objetivo.
- **Primera temporada:** `slr_unirse_liga` reparte del bombo buscando el objetivo. **Temporadas siguientes:** se mantienen las prioridades del álbum (exclusivas, luego compartidas), pero dentro de cada nivel solo cartas del bombo y buscando el mismo objetivo; las caras solo si no hay otra forma de llegar a 11, de la más barata a la más cara.
- **Requisito para el catálogo real:** con 18 equipos hacen falta 18 × 11 = 198 individuales en el bombo, es decir, unas **250 individuales** en el catálogo (el bombo es el 80 %). Con menos, las últimas plantillas tendrán que tirar de cartas caras.
- Con el álbum el ±10 % no está garantizado (depende de lo que tenga cada uno): el reparto lo intenta con intercambios dentro del bombo y devuelve `dentro: false` si no lo consigue.

### Decisiones mías

- **Los cobros se calculan al simular pero se pagan al publicar** (`jornadas.cobros`). El saldo es público y, si se pagara al simular, el bonus sorpresa delataría el resultado antes de las 21:00. Lo mismo con las cartas tocadas por lesión: se marcan al publicar.
- **Amistoso y pronóstico son acciones de la Edge Function** (`{accion: 'amistoso', token, rival_equipo_id}` y `{accion: 'pronostico', token, equipo_id}`), no funciones de Postgres: el motor solo corre en Deno. La función habla con la base de datos a través de funciones `motor_*` que solo puede ejecutar la clave de servicio, y el token de sesión se valida ahí. Se despliega con `--no-verify-jwt` porque la web no usa JWT de Supabase Auth; autorizan el secreto (cron) o el token de sesión (web).
- **Copia del motor:** la CLI solo empaqueta `supabase/functions`, así que la función importa `supabase/functions/_shared/motor-vX.Y.Z.js` (todas las versiones), copiadas con `node supabase/seed/copiar-motor.mjs`. `tests/slr/motor-copia.test.mjs` comprueba que son idénticas byte a byte y que la función las importa.
- **Participación:** cuenta si la alineación se guardó o confirmó después de publicarse la jornada anterior (o del inicio de la temporada) y no es la automática.
- **`alineaciones_cerradas()` y `liga_bloqueada()` son distintas:** la primera es solo la ventana cierre→publicación (bloquea guardar alineaciones); la segunda añade pausa, entre temporadas y terminada (bloquea el mercado). Entre temporadas se puede tocar la alineación.
- **No se puede pausar ni terminar con una jornada en juego** (cerrada o simulada): hay que esperar a que se publique, para no dejar un partido a medias.
- **Al reanudar** se inserta una tanda vacía de hoy en `tandas_mercado`, para que las subastas vuelvan la siguiente medianoche y no en la siguiente pasada del cron.
- **Al terminar una temporada** también se cancelan las subastas abiertas (el mercado queda cerrado). Al empezar una nueva se reinicia `contador_garantia_premium`.
- **Canteranos:** id `canterano-<8 primeros caracteres del equipo>-<n>`; no son cartas, así que no cobran ojo clínico ni quedan tocados.
- **La clasificación de una temporada** solo incluye equipos creados antes de que empezara.
- **Funciones de prueba** (solo admin de liga de prueba): `slr_prueba_tareas(token, liga, ahora, simular)` corre también las tareas de jornada con la hora dada (con `simular = false` cierra sin pedir la simulación), `slr_prueba_pausar` / `slr_prueba_reanudar` con hora simulada, `slr_prueba_partidos` (partidos aún sin publicar) y `slr_prueba_fijar_semilla` (fuerza la semilla antes de simular, para provocar una lesión).
- **pg-safeupdate:** Supabase rechaza `DELETE` sin `WHERE` en las peticiones de la API, incluso sobre tablas temporales; por eso `20261013020400_slr_reparto_safeupdate.sql` usa `where true`.

## Interfaz base (paso 5, entrega 1)

### Decisiones de Marcos

- **Una única liga.** `usuarios.es_admin` (solo Marcos) y `slr_crear_liga` solo para él y solo si no existe otra liga que no sea de prueba. Los demás se unen con `slr_unirse_liga_principal(token, nombre_equipo)`, con las reglas de `slr_unirse_liga` (solo en preparación o entre temporadas). `slr_yo` devuelve `es_admin` y la liga principal aunque el usuario no tenga equipo.
- **Las ligas de prueba no cambian:** `slr_crear_liga_prueba` sigue abierta a cualquier usuario (los tests crean siempre sus ligas con ella). `api-paso2` comprueba además que un bot no puede crear la liga real.
- **Pestaña "Rush"** al final de la barra de Shits League, integrada en el swipe y el estado activo. Es ligera: nada del juego se carga hasta pulsar JUGAR (`import()` de `js/slr/rush.js` y `css/slr.css` inyectado en ese momento).
- **Login unificado:** el código de Shits League abre también la sesión de Rush (`SLR_TOKEN` en localStorage) sin bloquear el login si el servidor falla. ~~Quien ya tenía sesión confirma el código una vez; con un 403 se vuelve a pedir.~~ *Sustituido por "el código se pide una sola vez en la vida" (abajo).* En localhost (y solo ahí) el modal acepta los códigos de los bots validados contra el servidor; en localhost Rush usa la liga de prueba del bot si la tiene.
- **Liga única sin pasos** (cambio posterior): solo existe la liga de Marcos, «Shits League Rush», que él creó desde la interfaz el 13/10/2026 (se conserva tal cual; no hace falta migración que la cree). Nadie crea ligas ni invita a nadie: la interfaz ya no tiene pantalla de crear liga ni código de invitación (tampoco en el panel de admin). Al pulsar JUGAR sin equipo, con la liga en preparación o entre temporadas, sale una sola pantalla: "¿Cómo quieres llamar a tu equipo?", una casilla y un botón; al confirmar se crea el equipo (`slr_unirse_liga_principal`) y se entra a Inicio. Con la temporada en marcha: "Podrás unirte cuando termine la temporada". En Perfil se puede cambiar el nombre del equipo (`slr_renombrar_equipo`, mismas reglas que al unirse: 3–30 caracteres y sin repetir en la liga; queda en el historial). Las funciones antiguas (`slr_crear_liga`, `slr_unirse_liga` con código) se quedan en el servidor para los tests y las ligas de prueba.
- **El código se pide una sola vez en la vida** (cambio posterior): tras un login correcto, `session.js` guarda también el código (`SESSION_CODE`); el logout lo borra. Rush nunca pide el código: sin `SLR_TOKEN` al pulsar JUGAR, o ante un 403 en cualquier llamada, hace `slr_login` en silencio con `SESSION_CODE` y repite la llamada una vez. Si ese login falla por código incorrecto (o el usuario de Rush no es el de la sesión), se cierra la sesión y se entra de nuevo con el modal normal. Las sesiones de antes (`SESSION_PLAYER` sin `SESSION_CODE`) se cierran al arrancar sin ningún aviso: el jugador se identifica con el modal de siempre y ya no se le vuelve a pedir.
- **Modo Rush a pantalla completa** con safe areas, `history.pushState` para que atrás cierre primero hojas y detalles y después salga de Rush, barra inferior de 5 secciones (Mercado "Próximamente") y estilo de la sección 12 (fondo verde muy oscuro, verde neón propio, naranja rival, Anton para títulos y números).

### Decisiones mías

- **Archivos existentes tocados, lo mínimo:** `index.html` (pestaña, panel, el CSS de la portada y `js/rush-panel.js`), `js/session.js` (puente con Rush en `tryLogin` y `logout`, `SESSION_CODE` y el cierre de sesiones antiguas en `initSession`), `js/app.js` (`rush` en `TABS`, render del panel, el modo Rush excluido del swipe y del pull-to-refresh) y `sw.js` (`CACHE_NAME` v3). Todo lo demás es nuevo.
- **Puente con la sesión en un script clásico** (`js/rush-panel.js`), porque `session.js` y `app.js` no son módulos. Usa `import()` de `js/slr/config.js` para no duplicar la URL ni la clave pública.
- **Token del bot pendiente:** en localhost el token de un bot no se guarda hasta que el login de Shits League termina bien.
- **Renovación silenciosa:** las llamadas que reciben un 403 a la vez comparten un único `slr_login`. Si no hay conexión no se cierra la sesión: solo se avisa con un toast. En localhost, con un bot, la bienvenida une el equipo a su liga de prueba (con su código), nunca a la liga real.
- **El admin sin equipo** con la temporada en marcha ve su panel bajo "Podrás unirte cuando termine la temporada", para no quedarse sin poder gestionarla. En preparación, primero se crea su equipo como cualquiera.
- **Estado de la portada sin sesión:** se lee de las tablas públicas (liga principal y su próxima jornada); con sesión, de `slr_yo`.
- **Datos del juego:** la plantilla, las ventas activas, la alineación, la temporada y `publicada_en` de las jornadas se leen de las tablas públicas; el resto, de las funciones `slr_*`. "Confirmada para esta jornada" se calcula igual que el bonus de participación (guardada a mano después de publicarse la jornada anterior o de empezar la temporada).
- **Guardar también confirma:** guardar la alineación cuenta para el bonus de participación igual que `slr_confirmar_alineacion`, así que con cambios sin guardar solo se ofrece Guardar, y sin cambios, Confirmar.
- **La alineación se bloquea en la interfaz también con la liga en pausa** (el servidor solo la bloquea en la ventana de cierre).
- **"Rinde mal aquí":** la stat del hueco está 12 o más puntos por debajo de la mejor stat de la carta. Las fuerzas en vivo usan las stats efectivas (tocada al 85 %); el portero se muestra aparte con su DEF.
- **El pronóstico usa la alineación guardada** (la Edge Function la lee del servidor), así que con cambios sin guardar el botón pide guardar antes.
- **La carta** (`js/slr/carta.js` + `.slr-carta` en `css/slr.css`) es independiente de las pantallas: escala con `cqw` (container queries) a cualquier tamaño, marcador con iniciales y siluetas (una por persona en dúos y tríos) en el color del tipo (verde, azul, morado, oro), imagen de Cloudinary recortada 5:7 si existe. Foil: `linear-gradient` con el espectro (hsl 0–360) en `color-dodge` que sigue el dedo (pointermove) o la inclinación (deviceorientation; en iOS se pide permiso al tocar una carta foil), con una leve inclinación 3D y animación de 4 s en reposo. Con `prefers-reduced-motion` no hay animaciones ni inclinación (el dedo sigue moviendo el brillo).
- **Las notificaciones** de Inicio se marcan como leídas al mostrarse (siguen marcadas como nuevas hasta salir de la pantalla).

### Pulido (rendimiento de las cartas, hoja y arrastrar en la alineación)

- **Todas las cartas se inclinan en 3D** siguiendo el ratón (PC) o el giroscopio (móvil: todas las visibles a la vez). El brillo y el degradado siguen siendo solo de los acabados. Con `prefers-reduced-motion` no hay inclinación ni animaciones.
- **Rendimiento** (medido con `node tests/slr/banco/medir.mjs`, que graba la traza de DevTools, la del panel Performance, en Chrome con la CPU ×4 y 15 cartas):
  - los eventos solo guardan la posición y se aplica una vez por frame (rAF);
  - se escriben dos variables (`--x`, `--y`), registradas con `@property` como no heredables, solo en los elementos que se mueven: el marco y, en el foil, sus dos capas;
  - el CSS las convierte en `transform`; las capas de los acabados son hijos más grandes que la carta desplazados con `transform`, y las animaciones de reposo usan solo `transform` y `opacity`, nunca `background-position` ni sombras animadas;
  - `will-change` solo durante la interacción, más dos frames de "precalentamiento" cuando la carta aparece;
  - un único `deviceorientation` para toda la pantalla, suavizado en JS; solo se mueven las cartas visibles (IntersectionObserver) y las que no se ven pausan sus animaciones.
- **Lo que más pesaba y no era evidente:**
  - las animaciones de los acabados repintaban en cada frame (incluso sin tocar nada);
  - la transición del marco creaba una transición nueva en cada frame;
  - Blink recalcula el estilo del elemento inclinado y de sus hijos directos, por eso el aspecto de la carta va en `.slr-carta__cara`, hijo único del marco;
  - un selector universal (`… .slr-carta__marco *`) para pausar animaciones encarecía cada recálculo.
- **`DeviceOrientationEvent.requestPermission`** ya existe también en Chrome: se pide al montar (Chrome y Android lo conceden sin preguntar) y, si el navegador exige un gesto (iOS), al tocar una carta.
- **Hoja del hueco** en dos bloques: "Sin colocar" y "Ya colocadas" (indicando dónde está cada una: POR, DEF, MED, DEL o Banquillo; elegirla intercambia posiciones), los dos ordenados por la stat del hueco y con el aviso de "rinde mal aquí".
- **Arrastrar y soltar** (Pointer Events + `setPointerCapture`, sin librerías):
  - **Cómo se levanta:** con ratón, al moverla más de 5 px con el botón pulsado; con el dedo, manteniendo pulsado 250 ms. Si el dedo se mueve más de 8 px antes, es scroll y no arrastre.
  - **Durante el arrastre:** un `touchmove` no pasivo bloquea el scroll. La carta flota encima del dedo (o junto al cursor) para no tapar el destino, el destino se ilumina con la stat que tendría allí y la página se desplaza sola cerca de los bordes.
  - **Dónde se suelta:** en cualquier hueco (ocupado = intercambio; vacío = se mueve) o en la nueva franja "Sin colocar" de la pantalla (sale de la alineación). Las fuerzas se recalculan al soltar.
  - **Otros comportamientos:** el clic que llega tras soltar se ignora, así que un toque corto sigue abriendo la hoja de siempre. El botón atrás cancela el arrastre. Si el capitán sale del once (al banquillo o fuera), pierde la capitanía con un aviso.
  - **Prueba:** `node tests/slr/banco/alineacion.mjs` lo prueba en Chrome headless con ratón y táctil.

## Beta cerrada y modo pruebas

### Decisiones de Marcos

- **Rush solo para la beta.** Pueden usarlo quienes tengan `usuarios.beta = true` (al principio, Marcos y Nicolás), o cualquiera si el ajuste `rush_publico` es `true`. Sin sesión de Shits League, o con sesión pero sin acceso, la pestaña Rush no aparece y el swipe entre pestañas no cuenta con ella. Los bots de los tests y las ligas de prueba no se ven afectados.
- **Modo pruebas para el admin** (`ligas.config.modo_beta`, activado en la liga principal por ahora):
  - jugar la siguiente jornada al momento;
  - añadir y quitar equipos bot;
  - reiniciar la liga entera.
- **Amistosos** desde la clasificación, contra cualquier rival.
- **Crónica en texto** de cada partido jugado o amistoso, hasta que llegue el reproductor.
- **La hoja del hueco** muestra arriba la carta, sus stats, sus poderes y qué aporta en ese puesto; la lista para elegir muestra también las tres stats.

### Cómo dar acceso o abrir Rush a todos

- **Dar acceso a alguien:** en el panel de Supabase, *Table Editor → usuarios*, buscar su fila y poner la columna `beta` a `true`. La próxima vez que abra la app (o al iniciar sesión) le aparece la pestaña Rush.
- **Quitar el acceso:** poner `beta` a `false`. La pestaña desaparece la próxima vez que abra la app, y si la tenía abierta, Rush se cierra en cuanto haga cualquier acción.
- **Abrir Rush a todos:** *Table Editor → ajustes*, fila `rush_publico`, poner `valor` a `true`. Para volver a la beta cerrada, `false`.
- **El modo pruebas de la liga** se quita en *Table Editor → ligas → config*, cambiando `"modo_beta": true` por `false` o borrando la clave.
- Son cambios de datos, no de esquema, así que se hacen a mano en el panel sin migración.

### Decisiones mías

- **Acceso en el servidor:**
  - `tiene_acceso(usuario)` es `rush_publico` o `beta` o `es_bot`; así los bots de los tests y los del modo pruebas siempre entran.
  - Todas las `slr_*` lo exigen a través de `sesion_usuario`, con un código de error propio (`RUSH0`) para que la web lo distinga de una sesión caducada.
  - `slr_login` no da sesión sin acceso: devuelve `tiene_acceso: false`.
  - `slr_yo` responde siempre con una sesión válida (usa `sesion_sin_acceso`) para que la web sepa si mostrar la pestaña.
  - `ajustes` es legible por todos y solo se cambia desde el panel.
- **Acceso en la web:**
  - La pestaña arranca oculta en el HTML. `rush-panel.js` la muestra al instante si el último valor guardado (`RUSH_ACCESO`, ligado al nombre del jugador) era `true`, y luego lo confirma con `slr_yo` o con el login silencioso.
  - El login de Shits League ya no abre la sesión de Rush por su cuenta: lo hace esa verificación, que se lanza en cada cambio de sesión.
  - Si una llamada devuelve `RUSH0`, Rush se cierra y la pestaña desaparece, sin cerrar la sesión de Shits League.
  - Un enlace `#rush` solo abre la pestaña si es visible.
- **Bots del modo pruebas:**
  - Son usuarios internos (`usuarios.interno`, `es_bot`), sin código ni login. Se unen con `slr_unirse_liga` mediante una sesión temporal que se borra en el acto, así que reciben la misma plantilla inicial y la misma alineación que cualquiera.
  - Antes de cada cierre (en `cerrar_jornada`, el mismo código que el cron) su alineación se rehace con `crear_alineacion_por_defecto`. Como queda marcada `automatica`, no cobran el bonus de participación.
  - Quitar un bot borra su equipo y su usuario, y sus cartas quedan libres.
  - Nombres de equipo de una lista fija (Robots United, Atlético Silicio, Real Algoritmo…).
- **Jugar la jornada ahora:** la simulación la hace la Edge Function de forma asíncrona, así que `slr_admin_jugar_jornada` va por pasos y es idempotente:
  - programada → la cierra (igual que el cron) y pide la simulación, y devuelve `simulando`;
  - cerrada → vuelve a pedir la simulación si lleva más de 20 s esperando;
  - simulada → la publica con cobros, lesiones y bonus reales, y devuelve `publicada`.
  - La web la llama cada 1,5 s hasta `publicada`. Las fechas de las jornadas siguientes no cambian.
- **Reiniciar beta:**
  - Borra todas las filas con `liga_id` de esa liga (y en cascada lo que cuelga de ellas) y los usuarios de sus bots.
  - Vuelve a crear un ejemplar libre de cada diseño y deja la liga en preparación, temporada 1.
  - El historial empieza con el aviso del reinicio.
  - Las ligas de prueba nacen siempre en modo pruebas.
- **Amistosos:** sin temporada, la clasificación lista igualmente los equipos para poder jugarlos. Los últimos 8 aparecen en el calendario.
- **Crónica:** la crónica no guarda las jugadas. Se reproduce el partido en el navegador con `simularPartido(alineaciones congeladas, semilla)` y las jugadas salen de esos eventos. Si el marcador reproducido no es el guardado, o la versión del motor es otra, se avisa en la propia crónica.
- **Aporte en el puesto** (hoja del hueco):
  - MED: posesión con su CON, y ataque y defensa con el 30 % de su ATA y su DEF;
  - DEL: su ATA y la probabilidad de ser el tirador con los MED y DEL que hay en el campo en ese momento (`probabilidadesTirador`);
  - DEF y POR: su DEF;
  - banquillo: cuándo entraría.
  - Las cifras son las efectivas (tocada al 85 %).
- **Pruebas:**
  - `node tests/slr/api-paso5.mjs`: acceso, bots, temporada completa a golpe de botón, amistoso contra un bot y reinicio.
  - La pestaña según el acceso, el modo pruebas en la interfaz, la crónica y la ficha del hueco se probaron en Chrome headless. Para el caso "con sesión pero sin beta" se usó Bot Tres como humano durante la prueba (`es_bot = false`) y se restauró al terminar.

## Ajustes tras la beta: Equipo, crónica, álbum y catálogo editable

### Decisiones de Marcos

- **Inicio = Alineación:**
  - La primera pestaña pasa a ser "Equipo", con icono de campo: el editor de alineación.
  - Encima del campo, una franja con el próximo rival (tocable: su ficha), la cuenta atrás al cierre, el último resultado y el estado de la alineación.
  - Los avisos van a una campana en la barra superior, con contador; al abrirla se marcan como leídos.
  - Se mantienen el saldo arriba y los avisos de pausa, cierre, preparación y entre temporadas.
- **Ficha de las cartas sin colocar:** la misma información que las del campo, más lo que aportarían en cada puesto (POR, DEF, MED, DEL), y las opciones "Colocar en…" y "Ver carta".
- **Pronóstico contra cualquier rival:** lista de rivales (por defecto el próximo), con la explicación y un aviso si hay cambios sin guardar. La acción `pronostico` de la Edge Function acepta `rival_equipo_id`.
- **Alineaciones en los partidos y ficha de rival:**
  - La crónica dibuja las dos alineaciones en un campo.
  - La ficha de un equipo muestra su posición, sus últimos resultados, su plantilla completa y la alineación de su **último partido oficial publicado**. Nunca su alineación guardada actual.
- **Amistosos:** en la beta siguen siendo instantáneos y sin aceptar. **Antes del lanzamiento tendrán que aceptarse por ambas partes**, porque un amistoso juega contra la alineación guardada del rival y su crónica la enseña: sin aceptación sirven para espiar alineaciones.
- **Álbum** (adelantado de la entrega 2): desde Perfil. Todas las cartas que has tenido en la liga, con "X de Y desbloqueadas", filtros por tipo y acabado, orden por fecha o valor, y cómo, cuándo y quién la tiene ahora.
- **Crónica más clara:**
  - colores por equipo (verde el del usuario o el local, naranja el otro) con leyenda;
  - cada jugada es un bloque con el minuto y quién saca, y una línea por suceso;
  - el % es siempre la probabilidad que tenía lo que ocurrió, junto a quien lo consiguió;
  - al final, un resumen por equipo.
- **Catálogo editable a mano** (guía: `docs/slr/CARTAS.md`):
  - un trigger recalcula `valor`, valida los poderes y crea un ejemplar libre en cada liga real al insertar o reactivar un diseño;
  - desactivar una carta la saca de sobres, subastas y plantillas nuevas sin quitársela a nadie;
  - valores por defecto para que una fila nueva solo necesite nombre, tipo y stats;
  - herramienta de plantillas en el modo pruebas para dar o quitar cartas sin tocar tablas.
- **Carta con foto:** vertical 5:7, la foto a sangre (cover, servida por Cloudinary al ancho real × DPR), con OVR, nombre, tipo y stats encima. Sin foto, el marcador de siempre.
- **Acabados ampliables:** un registro con un bloque CSS/JS por acabado y el mismo contrato, y un muestrario en el modo pruebas.
- **Shits League:** la rueda del pull-to-refresh gira al arrastrar y mientras recarga.

### Decisiones mías

- **Valor en SQL:**
  - `valor_diseno()` repite `js/slr/valor.js` en coma flotante doble y en el mismo orden de operaciones.
  - La migración pasó todo el catálogo por el trigger una vez, y `tests/slr/valor-sql.test.mjs` compara el valor guardado con el de `valor.js` en todas las cartas (283, todas iguales).
  - El trigger recalcula el valor en **cualquier** cambio de la fila, no solo de stats o poderes: así nunca puede quedar un valor escrito a mano.
- **Validación de poderes en el trigger:** los mensajes dicen qué poder y qué campo fallan (por ejemplo, «Poder 1 («Batuta»): "momento" tiene que ser posesion, ocasion_ataque…»). Las stats, el tipo y el acabado ya los validaban los `CHECK` y el enum.
- **Diseño nuevo o reactivado:** crea su ejemplar solo en las ligas que no son de prueba. Las de prueba nacen con todo el catálogo activo.
- **Cartas inactivas:** las funciones que eligen cartas libres (tanda de subastas, sorteo de sobres, comprar sobre y plantilla inicial) se copiaron de su última versión con `and d.activo` añadido. Las copias las genera un script a partir de las migraciones anteriores, que no se tocan.
- **Herramienta de plantillas** (`slr_admin_buscar_cartas`, `slr_admin_mover_carta`; admin y modo pruebas):
  - Para dar una carta usa `adquirir_carta`, que cancela ventas, ofertas e intercambios, aplica el blindaje de 7 días y apunta el álbum con la vía nueva `admin`.
  - Además cancela la subasta abierta de la carta y la quita de la alineación del dueño anterior: su hueco queda vacío y lo resuelve el cierre; si era el capitán, se queda sin capitán.
  - Avisa a los dos equipos y lo apunta en el historial.
  - Dejar libre quita también el blindaje y devuelve la cláusula a ×1,5.
- **Pronóstico contra un rival elegido:** se juega en casa del usuario, salvo que el elegido sea el del próximo partido: entonces se respeta quién es local. Las stats tocadas cuentan como en su próxima jornada.
- **Avisos:** se cargan al abrir Rush. Las pantallas ya no los marcan como leídos por su cuenta; solo la campana.
- **Fichas tocables:**
  - En el calendario, el nombre de cada equipo abre su ficha y el marcador abre la crónica. En la clasificación, el nombre abre la ficha.
  - En el campo de una crónica o ficha, cada carta abre su detalle; los Canteranos no, porque no son cartas.
- **Crónica:**
  - Los sucesos salen de los eventos del motor, en su orden.
  - El porcentaje de cada línea es el de lo que pasó: mantener o robar el balón, llegar al área o cortar, ser el tirador, marcar o parar.
  - Tocar el nombre de un poder abre su descripción.
  - El bloque de una jugada con gol toma el color del equipo que marca.
- **Fotos:**
  - Se piden a Cloudinary con `c_fill,ar_5:7,g_auto` cuando la carta entra en pantalla (el mismo IntersectionObserver del movimiento), al ancho medido × DPR redondeado a 100 px. Así cargan diferidas y del tamaño justo.
  - Con foto, el marco se pinta encima, en el degradado, y cada acabado puede cambiar su color (`--marco-carta`).
  - Las marcas de estado (capitán, tocada, blindada, en venta) van en una fila sobre el nombre, nunca sobre la cara.
- **Registro de acabados** (`js/slr/acabados/index.js`):
  - Contrato: clase `.slr-carta--<id>`, dos capas con un hijo `.slr-carta__capa`, `sigue: true` si las capas siguen el movimiento, y un hook opcional `alMover(carta, x, y)` que se llama en el rAF compartido.
  - Un acabado desconocido se pinta normal.
  - Para añadir uno: valor del enum (migración), su `.js` y su `.css`, registrarlo e importarlo en `css/slr.css`.
- **Pull-to-refresh:**
  - La rueda no giraba porque la animación iba de `transform: scale(1)` a `rotate(360deg)`. Con funciones distintas el navegador interpola matrices, y 0° y 360° son la misma matriz. Ahora el giro va en la propiedad `rotate`, aparte.
  - Al arrastrar, la rueda aparece, crece y gira 3° por píxel. Al soltar sin llegar al umbral desaparece, y al recargar gira en bucle hasta terminar. El gesto en sí no cambia.

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

## Motor v1.2.0: equilibrio y poderes

### Decisiones de Marcos

- Con la v1.1.0 el partido era casi una moneda: un equipo claramente mejor perdía demasiado y recibía muchos contraataques. Marcos simuló alternativas y eligió estas reglas (`js/slr/motor-v1.2.0.js`, constantes en `CONFIG`):
  - **Exponente 3** en los duelos de posesión, ocasión y chut: P = a³ / (a³ + b³) (`EXPONENTE_DUELO`). Se calcula como `a*a*a`, sin `Math.pow`. Los penaltis siguen con el cuadrático.
  - **Posesión** con los pesos 1,0 / 0,7 / 0,2 para el CON de los MED (`PESOS_LINEA_POSESION`). Ataque y defensa siguen con 1,0 / 0,7 / 0,5 y el 30 % de los MED.
  - **Ventaja de saque:** el equipo que saca multiplica su fuerza de posesión × 1,15 en el duelo, después de sus poderes (`BONUS_SAQUE`).
  - **Cada poder se activa como mucho una vez por partido** (`PODER_UNA_VEZ`). Una vez activado ya no se sortea y no consume número del PRNG. Los "siempre" (tirador) no tienen límite. El capitán sigue con ×1,5 sobre la probabilidad.
  - El resto de reglas y el orden del PRNG son los de la v1.1.0.
- **La v1.1.0 no se borra.** Cada partido guarda `version_motor` y se reproduce con esa versión. Los nuevos (liga y amistosos) usan la v1.2.0.
- **Catálogo beta:** probabilidad ~0,15 y efectos más altos (simple +0,20, fuerte +0,30, muy fuerte +0,40). Los de tirador "siempre" no cambian.
- **Amistosos sin notificación**, y se borran las que había.
- **Avisos que llevan a su sitio:**
  - carta recibida o perdida → detalle de la carta;
  - partido de liga → crónica;
  - dinero cobrado → movimientos en Perfil;
  - pausa, reanudación o temporada → estado de la liga.
- **Herramienta de plantillas:** todas las cartas con búsqueda, filtros y orden. En "Dar a…", nombres de equipo enteros, el dueño debajo y X/15.

### Decisiones mías

- **Registro de motores** `js/slr/motores.js` (`MOTORES`, `MOTOR_ACTUAL`, `motorDe(version)`):
  - La crónica reproduce con `motorDe(partido.version_motor)`. El aviso de "versión distinta" desaparece: ya no puede pasar.
  - La alineación usa la v1.2.0 para las fuerzas.
  - La Edge Function lleva las dos copias (`node supabase/seed/copiar-motor.mjs` copia todas). Simula cada jornada con la versión que tuvieran guardada sus partidos o, si no tienen, con la actual (`MOTOR_ACTUAL = '1.2.0'`). Amistosos y pronósticos usan siempre la actual.
  - `motor-copia.test.mjs` comprueba byte a byte cada copia y que la función importa todas.
- **Poder usado:** se marca en la copia interna de la carta (`usado`), nunca en la alineación de entrada. Un suplente entra con sus poderes sin usar.
- **Evento `posesion`:** `fuerzas` ya incluye el ×1,15 del que saca, así que `p` = duelo(fuerzas del que saca, fuerzas del rival).
- **`opciones.rng`** en `simularPartido`: un generador propio en lugar de mulberry32, solo para tests. Con un generador constante se cuentan los números consumidos y se demuestra que un poder ya usado no gasta ninguno. La web y el servidor no lo usan.
- **Transformación del catálogo** (migración `20261014000000_slr_motor_v120.sql`, solo `beta = true`):
  - Probabilidad nueva = 60 % de la anterior, entre 0,10 y 0,20, a dos decimales: 0,25 → 0,15 y 0,30 → 0,18.
  - El efecto va según el nivel. Los de tirador conservan su multiplicador.
  - El valor no cambia, porque el nivel tampoco.
  - Las alineaciones ya congeladas guardan sus poderes, así que los partidos jugados no cambian.
  - `tests/slr/catalogo-beta.mjs` hace el mismo cálculo en JS y `api-paso6.mjs` comprueba que la base de datos coincide.
- **Destino de los avisos** (`notificaciones.destino_tipo` / `destino_id`):
  - Lo pone un trigger `before insert` con `destino_notificacion()`, así que no hubo que tocar ninguna de las ~30 llamadas a `notificar`. Las antiguas se rellenaron en la migración.
  - Tipos: `carta`, `partido`, `movimientos` (id = equipo) y `liga` (id = liga).
  - Venta completada y cláusula cobrada van a movimientos (es dinero cobrado, aunque también se pierda la carta).
  - Ofertas, subastas, elección automática y las cartas de la herramienta van a la carta.
  - Jornada publicada va a la crónica del partido del equipo. Si descansó, a movimientos si cobró, y si no a la liga.
  - Los intercambios no tienen destino (aún no hay pantalla de intercambios) y salen sin flecha.
- **Panel de avisos:**
  - Tarjetas anchas con icono por tipo.
  - La carta y la crónica se abren encima de la lista (al cerrarlas se vuelve a los avisos).
  - Movimientos y liga cierran la lista, van a Perfil o Liga y resaltan el bloque un momento.
  - La pantalla Liga tiene ahora un bloque "Estado de la liga": estado, pausa o próxima jornada.
- **`slr_admin_cartas`:** devuelve todas las cartas de la liga y los equipos con dueño y cartas ocupadas (`plantilla_ocupada`, que cuenta también los sobres pendientes). Se filtra y ordena en el navegador (~300 cartas). Se pinta en páginas de 30 al acercarse al final, con "Ver más" de respaldo. `slr_admin_buscar_cartas` se queda por compatibilidad.
- **Nombres cortados:**
  - "Dar a…" usa una lista propia (`.slr-lista-equipos`) que parte las líneas.
  - La clasificación también cortaba los nombres con "…" y ahora los parte.
  - El resto de listas de equipos (miembros, ficha, franja del rival) ya partían línea.
  - El selector de rival del pronóstico es nativo y muestra el nombre entero al abrirlo.

## Balance de referencia (motor v1.2.0)

`node tests/slr/balance.mjs` (10.000 partidos por escenario). Entre paréntesis, lo que esperaba Marcos de sus simulaciones:

- **Cartas iguales, 2-2-2, 75 contra 65** (mitad en casa, mitad fuera): gana el mejor el 76,2 % (~75), empata el 14,9 % (~16) y pierde el 8,9 %.
  - Posesiones del mejor: 6,01 de 10 (~6).
  - Contraataques que recibe: 1,49 por partido (~1,5).
- **72 contra 68:** gana el mejor el 54,2 % (~55) y empata el 22,7 %.
- **Espejo 70 contra 70:** 2,70 goles por partido (~2,7) y 24,7 % de empates.
- **Equipos de prueba:**
  - Los del Fondo contra sí mismo: 2,25 goles.
  - Marcos FC contra sí mismo (un solo defensa): 4,35 goles.
  - Marcos FC contra Los del Fondo: 37,9 % / 22,2 % / 39,8 %.
  - Partidos con lesión: 6,7 %.
- **Poderes activados por partido** (los dos equipos, catálogo beta, alineación por defecto):

  | Escenario | Total | Sorteados |
  |---|---|---|
  | Plantillas iniciales (11 individuales) | 0,56 | 0,56 |
  | Con 1 dúo y 1 trío por equipo | 5,55 | 4,95 |
  | Con 2 dúos y 1 trío por equipo | 7,36 | 5,99 |

  - Marcos esperaba ~2–4: con dúos y tríos sale más.
  - Un poder de posesión al 15 % se activa en el 81 % de los partidos (10 sorteos hasta que sale). Uno de chut, en el 13 %.
  - Los dúos (1,6 poderes de media) y los tríos (2,5) llevan muchos, y casi la mitad de los poderes del catálogo son de posesión.
  - Para bajarlo basta con tocar el catálogo, sin motor nuevo: menos poderes por carta o menos de posesión.

`node tests/slr/formaciones.mjs`: diferencia de puntos por partido entre la mejor y la peor formación.

| | Plantilla neutra | Plantilla realista |
|---|---|---|
| v1.2.0 | 2-2-2 1,482 … 1-2-3 1,259 → 0,22 | 2-2-2 1,541 … 2-3-1 1,238 → 0,30 (~0,3) |

## Motor v1.3.0, cartas por tiers, formulario y pulido de las cartas

### Decisiones de Marcos

- **Motor v1.3.0: poderes repartidos** (`js/slr/motor-v1.3.0.js`). Sustituye al "una vez por partido" de la v1.2.0; el resto de reglas no cambia:
  - Cada poder puede activarse **1, 2 o 3 veces**, con `probabilidades: [p1, p2, p3]` decrecientes. Compatibilidad: con solo `probabilidad` p, se usa [p, p/2,5, p/6].
  - El capitán multiplica las tres × 1,5 (tope 0,95).
  - Todo se sortea **antes de la jugada 1**: cuántas activaciones y en qué jugadas (distintas, de 1 a 10).
  - Si el momento no ocurre en su jugada, la activación queda **pendiente** para la siguiente ocasión; lo que quede al final se pierde.
  - Como mucho **2 activaciones por jugada** entre los dos equipos.
  - Durante las jugadas, los poderes no gastan números del PRNG.
  - Los "siempre" de tirador no cambian.
  - Calibrado para ~5 activaciones por partido entre equipos típicos.
- **Cartas por tiers** (S…F, con su rango de OVR) y **perfil**:
  - Generador de stats y poderes en SQL y en JS (gemelos).
  - Lo que venga relleno se respeta (excepciones de Marcos).
  - La semilla se guarda para que "Regenerar" dé otra.
- **Formulario "Nueva carta" / "Editar carta"** (modo pruebas, admin):
  - Foto a Cloudinary (preset unsigned `slr_cartas`).
  - Vista previa grande, regenerar, edición a mano y "Crear y dar a…".
- **Colores** de una paleta fija (`color`; vacío = el del tipo) y **PNG sin fondo**: el fondo de la carta se ve detrás de la foto.
- **Nombres largos enteros:** letra más pequeña hasta un mínimo y, si no cabe, dos líneas.
- **Interacción con las cartas:**
  - Sin menú de "guardar imagen" ni arrastre del navegador.
  - Mantener pulsado (móvil) abre la carta.
  - En PC, arrastrar la carta la levanta, la inclina según la velocidad y la devuelve a su sitio con un rebote.
  - La alineación conserva su arrastre.
- **Partidos:**
  - Los tuyos en verde, rojo o naranja según el resultado; los demás en gris.
  - Marcador grande.
  - Foto de perfil del dueño junto a cada equipo.

### Decisiones mías

- **Programa de poderes** (orden exacto del PRNG, documentado en la cabecera del motor):
  - Orden de programación: equipo A y luego B; titulares por hueco (POR, DEF, MED, DEL) y después el banquillo; cada poder en su orden.
  - Por poder, un número decide cuántas activaciones y uno más por activación elige su jugada entre las libres (`splice` de la lista 1..10).
  - Después, cada jugada consume los mismos números que en la v1.2.0. Sin poderes, un partido de la v1.3.0 es idéntico al de la v1.2.0 (hay un test).
- **Cuándo "ocurre" cada momento:**
  - Posesión: siempre, para los dos equipos.
  - ocasion_ataque y ocasion_defensa: según quién tenga el balón.
  - Tirador: si su equipo llega y la carta es MED o DEL.
  - Chut: si esa carta chuta.
  - Parada: si ese portero recibe el chut.
  - Un poder de parada en una carta que no juega de portero nunca llega a activarse.
- **Detalles del programa:**
  - Un poder con varias pendientes se aplica una vez por momento; el resto espera.
  - El tope de 2 se reparte por orden cronológico dentro de la jugada y, en un mismo momento, por el orden fijo (A antes que B).
  - Un suplente que entra pierde lo programado para jugadas ya jugadas.
  - El evento `poder` lleva `programada` (la jugada prevista). La crónica avisa cuando se aplica más tarde ("le tocaba en la jugada 3").
- **Calibración:**
  - Probabilidades por defecto **[0,40, 0,18, 0,07]** para los tres niveles: unas 0,65 activaciones programadas por poder. La fuerza la da el efecto (+0,20 / +0,30 / +0,40), no la frecuencia.
  - Las cartas beta pasaron a ese formato (migración `20261015000000`).
  - Medido con `node tests/slr/balance.mjs`: ver el balance de referencia de abajo.
- **Generador (aritmética entera para que SQL y JS coincidan):**
  - Park-Miller (`s ← s·48271 mod 2³¹−1`) y `r(n) = s mod n`.
  - El tier da un OVR objetivo T en [mín, máx). Según el perfil, salen dos diferencias d1 (1.ª−2.ª stat) y d2 (2.ª−3.ª).
  - La stat principal es T + ⌈0,40·d1 + 0,15·d2⌉, así que el OVR cae en [T, T+1).
  - Si pasa del tope del tipo (97 / 99 / 100 / 101), se estrechan d2 y luego d1 (en el portero, al revés, para que la ATA siga siendo la más baja).
  - En un portero S de OVR alto, la ATA no puede quedar 30 por debajo de la DEF (está documentado y el test lo tiene en cuenta).
  - Poderes: el momento sale del perfil (equilibrado: posesión, ataque, defensa o chut; no parada, que solo sirve al portero). Los nombres salen de 6 por momento, sin repetir en la misma carta.
  - `tests/slr/generador-sql.test.mjs` compara 560 casos contra `slr_generar_cartas`.
- **Tier y perfil de las cartas existentes:**
  - Se calculan de sus stats con OVR en enteros (60·s1 + 25·s2 + 15·s3 ≥ 100·mín), sin errores de coma flotante en los límites.
  - Perfil: equilibrado si las tres stats están a 6 o menos; portero si DEF es la más alta, ATA la más baja y DEF−ATA ≥ 30; si no, el de la stat más alta.
  - Tier y perfil quedan `not null`: el trigger los deduce si faltan.
- **Vacío frente a `[]` en poderes:** vacío (null) = generarlos; `[]` = sin poderes. Para eso se quitó el valor por defecto de la columna.
- **Cartas creadas desde una liga de prueba:**
  - Nacen inactivas (no llegan a las ligas reales ni a sobres o plantillas), con `liga_prueba_id` y un ejemplar solo en esa liga.
  - Se borran con la liga (`on delete cascade`).
  - Desde una liga de prueba solo se editan esas cartas: los bots de los tests no pueden tocar el catálogo real.
  - `slr_admin_guardar_diseno` apunta en el historial cada alta o cambio.
- **Formulario:**
  - Mientras sube la foto, la vista previa la muestra al instante (URL `blob:`).
  - Si Cloudinary rechaza la subida, el mensaje dice qué revisar (preset, modo Unsigned, formatos) y se puede pegar la URL.
  - Al cambiar tier, perfil o tipo, se regenera con la misma semilla. "Regenerar" cambia la semilla.
  - El preset `slr_cartas` ya existía y la subida real funcionó en la prueba.
- **Cartas en pantalla:**
  - Colores: clases `slr-carta--color-*` que cambian `--c1/--c2` y mandan sobre el color del tipo.
  - Con foto, `.slr-carta__arte` lleva el mismo fondo (rayas y halo del color) y la `img` ya no tiene fondo opaco. Cloudinary ya usaba `f_auto`, que conserva la transparencia.
  - Nombres: `carta.js` calcula un largo visual `--n` (las letras estrechas cuentan menos y M, W y Ñ más). El CSS hace `font-size = max(mín, min(máx, 150cqw / n))` y permite 2 líneas con `line-clamp`. Va en `cqw`, así que vale para los tres tamaños.
- **Interacción** (`enlazarInteraccion` en `carta.js`):
  - `contextmenu` y `dragstart` bloqueados en las cartas, `-webkit-touch-callout: none` e `img draggable=false`.
  - Mantener pulsado (480 ms sin mover más de 10 px) hace `click()` en el elemento pulsable que contiene la carta, y anula el clic que llega al soltar.
  - Ratón: a partir de 5 px la carta se levanta (`is-levantada`, `setPointerCapture`), sigue al puntero y gira según la velocidad horizontal suavizada (tope ±18°). Al soltar vuelve con `cubic-bezier(.34, 1.56, .64, 1)` y el clic de después se anula.
  - Se excluyen `.slr-hueco`, `.slr-libre`, `.slr-campo-juego` y `.slr-quietas`, que tienen su propio arrastre o están quietas.
- **Partidos:**
  - Clases `es-ganado`, `es-perdido`, `es-empatado` y `es-ajeno` en el calendario y en los amistosos.
  - Avatares con `renderAvatar` de `session.js` (foto de `JUGADORES_FOTOS`; 👤 si no hay). Los bots no tienen foto.
  - El avatar va encima del nombre, para que los nombres largos no se partan a mitad de palabra; se usa `hyphens: auto`.
- **Supabase CLI:** `npx --no-install supabase` empezó a querer la 2.121 (sin red de npm no la instala). Mientras tanto se usa el binario 2.120 de la caché de npx directamente: `~/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase`.

## Balance de referencia (motor v1.3.0)

`node tests/slr/balance.mjs` (10.000 partidos por escenario).

**Sin poderes, igual que la v1.2.0** (mismas reglas y mismo PRNG):

- 75 contra 65: gana el mejor el 76,2 %, empata el 14,9 %; 6,01 posesiones de 10; recibe 1,49 contraataques.
- 72 contra 68: gana el mejor el 54,2 %.
- Espejo 70 contra 70: 2,70 goles.
- Formaciones: 0,22 (plantilla neutra) y 0,30 (realista).

**Activaciones programadas por partido** (los dos equipos, alineación por defecto):

| Escenario | Media | Desviación | Jugadas con 0 / 1 / 2 |
|---|---|---|---|
| Plantillas iniciales beta (11 individuales) | 0,50 | 0,95 | 95,1 % / 4,8 % / 0,1 % |
| Beta con 1 dúo y 1 trío por equipo | 5,11 | 2,61 | 58,3 % / 32,2 % / 9,5 % |
| Beta con 2 dúos y 1 trío por equipo | 6,01 | 2,77 | 52,9 % / 34,1 % / 13,0 % |
| Cartas generadas por tiers (A B B C C C D D D E E) | 4,76 | 2,40 | 60,4 % / 31,7 % / 8,0 % |

- Con dúo y trío, la mitad de los partidos tiene entre 3 y 6 activaciones.
- Las plantillas iniciales beta casi no tienen poderes: solo 20 de las 250 individuales tienen uno, y van en tiers bajos. Con el catálogo real por tiers pasará lo mismo, porque las plantillas iniciales son D, E y F. Los poderes llegan con las cartas del mercado.

## Ajustes de interfaz: Rush primero, PC integrado y arrastre en móvil

### Decisiones de Marcos

- **Pestaña Rush:**
  - Es la **primera** de la barra, a la izquierda de Inicio. Solo aparece con sesión y acceso beta.
  - La app sigue abriéndose en Inicio y el funcionamiento de Rush no cambia (panel con JUGAR).
  - El swipe respeta el orden: desde Inicio, deslizar hacia la derecha lleva a Rush.
  - En **móvil**, con Rush activa se oculta la cabecera grande (hero); se quedan la barra superior y las pestañas. En PC no cambia.
- **PC (≥ 900 px):** álbum, plantilla, muestrario, herramienta de plantillas, formulario de carta, crónica y ficha de equipo se ven como un **panel integrado y amplio**.
  - Centrado, de hasta 1180 px, con márgenes.
  - Un único scroll discreto, sin scroll horizontal.
  - Rejillas de 4 a 5 columnas.
  - Las hojas pequeñas, como diálogos centrados.
  - La carta arrastrada va en una capa encima de todo.
- **Arrastre en móvil:**
  - Mantener pulsada una carta (~300 ms) la levanta y se arrastra con inclinación; al soltar vuelve con un rebote.
  - Un toque corto abre la ficha.
  - En la alineación, la pulsación larga sigue colocando jugadores.
  - Nunca sale el menú de guardar o copiar imagen.

### Decisiones mías

- **Orden de pestañas:**
  - `TABS` en `app.js` empieza por `rush`, y en `index.html` su botón va el primero.
  - El swipe usa `tabsVisibles()`, así que respeta el orden solo. Sin acceso a Rush, Inicio vuelve a ser la primera.
- **Cabecera en móvil** (`max-width: 899px`, el mismo corte que el resto de Rush):
  - `switchTab` pone `body.en-rush` y el CSS oculta `.hero-section`.
  - Al entrar en Rush se sube arriba del todo. Se guarda el scroll que había **antes** de cambiar de panel: después ya está recortado por la altura de Rush, y ese fallo apareció en las pruebas.
  - Al salir se devuelve el scroll guardado, una vez que el panel nuevo ya ocupa su altura.
  - Si se entra con `#rush` en móvil, no se hace el salto al contenido (no hay hero que saltar).
- **Panel de PC:**
  - Las hojas completas pasan de "ventana de 760 px con scroll en el cuerpo" a una capa con `overflow-y: auto` y la caja con altura natural. Hace scroll toda la capa, como una página.
  - El fondo oscuro queda fijo y la cabecera del panel, pegada arriba (`sticky`).
  - Al abrir, aparece con un fundido en lugar de subir desde abajo.
  - Scrollbar fina en el verde de la app (`scrollbar-width: thin` y `::-webkit-scrollbar`).
  - `scrollDeHoja(el)` en `ui.js` devuelve el elemento que hace scroll (capa en PC, cuerpo en móvil). Lo usa el scroll infinito de la herramienta de plantillas.
- **Pantallas de la barra en PC:**
  - Plantilla, Liga y Mercado se ensanchan a 1180 px (`.slr-pantalla[data-seccion]`). Equipo y Perfil se quedan como estaban: el campo y los formularios no ganan nada estirándose.
  - Rejillas con `minmax(200px, 1fr)`, que da 5 columnas a 1180 px.
- **Distribución dentro del panel:**
  - El detalle y el formulario de carta, en dos columnas: carta fija a la izquierda, información o campos a la derecha. En el formulario, la vista previa y el resumen van dentro de `.slr-editor__lado`.
  - La herramienta de plantillas, con los filtros en una fila y los resultados a dos columnas.
- **Carta levantada:**
  - Una **copia** de la carta va a una capa `.slr-capa-arrastre` en `<body>` (`position: fixed`, z-index 450, por encima de Rush y sus hojas). La original deja su hueco invisible (`is-origen`), así la rejilla no se mueve.
  - Al soltar, la copia vuelve con rebote y desaparece.
  - En táctil se añade un `touchmove` no pasivo que bloquea el scroll solo mientras la carta está levantada. Si el dedo se mueve más de 10 px antes de los 300 ms, era un scroll y no se levanta.
  - El clic que llega al soltar se anula, así que una pulsación larga ya no abre la ficha (antes sí). Solo un toque corto la abre.
- **Probado** en el navegador a 375×812, 1280×800 y 1920×1080:
  - Ninguna pantalla tiene scroll interno ni horizontal.
  - La carta arrastrada sale del panel sin cortarse.
  - Swipe, `#rush` y la vuelta a otras pestañas con su scroll funcionan.

## Borrado del catálogo beta y bombo corto

### Decisiones de Marcos

- Borrar del catálogo las 283 cartas beta (sin foto y con nombres inventados) y quedarse solo con las nuevas, con foto.
- La función de admin `slr_admin_borrar_disenos(token, filtro)`, solo para el admin con el modo pruebas, borra en una transacción todo lo que depende de los diseños y devuelve un resumen. En el Modo pruebas, el botón "Borrar cartas beta (sin foto)" dice antes cuántas se borran y pide escribir BORRAR.
- Que unirse, reiniciar la beta y añadir un bot no fallen aunque el bombo no llegue: primero se completa con las caras y, si aun así no llega, el equipo empieza con las que haya y recibe un aviso claro (y el admin lo ve en el Modo pruebas).
- Contador "Plantillas iniciales disponibles: X equipos" en el Modo pruebas.
- Tras el borrado, reiniciar la beta para que CD Prostitutas reciba su plantilla con las cartas nuevas.

### Decisiones mías

- **Filtro de `slr_admin_borrar_disenos`** (jsonb):
  - `liga_id`, la liga desde la que actúa el admin (obligatoria);
  - `beta`, `sin_foto` e `ids`, que se suman;
  - hace falta `beta = true` o `ids`: un filtro vacío no borra el catálogo entero.
- **Alcance**, como en `slr_admin_guardar_diseno`:
  - Desde una liga de prueba solo llega a las cartas creadas en ella. Así los tests pueden probar el borrado sin tocar el catálogo real.
  - Desde una liga real llega al catálogo común, y el usuario tiene que ser admin con modo pruebas de **todas** las ligas reales, porque los ejemplares están en todas.
- **Tercer parámetro `solo_contar`:**
  - Hace el borrado completo dentro de un bloque que se deshace al final (`raise` con un SQLSTATE propio, `SLRSC`). El recuento que enseña el botón es exactamente lo que se borrará.
  - Comprobado: el recuento previo y el resumen real coinciden.
- **Orden del borrado:**
  1. Alineaciones: los ejemplares salen de los huecos, del banquillo y de la capitanía, con `quitar_de_alineacion`.
  2. Pujas, subastas, ventas, ofertas, intercambios y sobres que los contengan. Las demás cartas reservadas por un sobre de elección quedan libres.
  3. Historial y avisos: se borran los que mencionan un ejemplar o un diseño (cualquier uuid dentro de `datos`).
  4. Álbum, ejemplares y diseños.
  
  Además, avisa a los dueños que pierden cartas y lo apunta en el historial.
- **Los partidos jugados no se tocan:** guardan su copia congelada de las alineaciones y se siguen pudiendo reproducir.
- **Cómo se ejecutó en la liga principal:** como admin, con una sesión interna de un solo uso (como la de los bots) que se borró en la misma operación.
  - Resultado: 283 diseños, 283 ejemplares, 8 subastas abiertas (todas de cartas beta), 11 entradas del álbum, 11 del historial y 11 avisos. Coincide con el recuento previo.
  - Quedan 54 diseños, ninguno beta y todos con foto.
- **Reiniciar beta ya no borra a las personas:**
  - Antes borraba todos los equipos, así que CD Prostitutas habría desaparecido en vez de recibir plantilla.
  - Ahora vacía la liga igual que antes y quita los bots. Las personas vuelven a unirse con el mismo nombre y escudo y por orden de llegada, por el camino normal de `slr_unirse_liga` (con una sesión interna de un solo uso), con plantilla inicial, saldo y alineación nuevos.
  - Si alguien no puede volver (p. ej. ya no tiene acceso a la beta), se queda fuera y la respuesta dice por qué.
  - También recrea el ejemplar de las cartas creadas en esa liga de prueba, que nacen inactivas y antes se perdían.
  - Cada equipo recupera su `creado_en` original (migración `20261015000400`). Si no, todos salían con el mismo `now()` de la transacción y el orden de llegada quedaba al azar; los tests lo detectaron.
- **Bombo corto:**
  - `asignar_plantilla_inicial` ya completaba con las caras más baratas y nunca fallaba.
  - Lo que fallaba a medias era la alineación: con menos de 7 cartas no se creaba. Ahora `crear_alineacion_por_defecto` coloca las cartas que haya y deja vacíos los demás huecos (siempre 2 por línea); en el partido juegan Canteranos.
  - `slr_unirse_liga` devuelve `cartas` y `aviso`. Con plantilla incompleta deja el aviso en la campana del equipo (`plantilla_incompleta`) y en el historial de la liga.
  - La bienvenida dice las cartas reales y, si hace falta, muestra el aviso.
  - `slr_admin_anadir_bot` y `slr_admin_reiniciar_beta` devuelven las cartas y el aviso de cada equipo, y el Modo pruebas los enseña.
- **Contador del bombo:** `slr_admin_bombo` (y `bombo_plantillas`) cuenta las individuales **libres** del bombo y de las caras (sin las reservadas ni las que están en subasta).
  - Las plantillas completas son bombo / 11.
  - Debajo dice cuántas salen contando las caras y cuántas faltan para 18 equipos.
  - En rojo si no llega para 2.
- **Estado final de la liga principal:**
  - En preparación, con CD Prostitutas (Marcos), 11 cartas de valor 1.996, alineación 2-2-2 completa con capitán, 5.000 monedas y 11 entradas en el álbum.
  - Quedan 18 individuales libres en el bombo y 7 caras: 1 plantilla completa más (2 con las caras).
- **Tests:**
  - `tests/slr/api-paso8.mjs`, nuevo: borrado, permisos, alcance, `solo_contar`, reinicio con personas y bots, y bombo corto con bots y con una persona.
  - `banco/equipo.mjs`: el botón con el diálogo de BORRAR y el contador.
  - **Tests adaptados al catálogo corto:**
    - api-paso4 solo exige el ±10 % de valor y "ninguna cara" si el bombo llega para todos. Si no llega, exige 11 cartas y solo las caras imprescindibles.
    - api-paso5 comprueba el reinicio nuevo y que los bots que se quedan cortos llevan aviso.
    - api-paso6 y api-paso7 ya no exigen que el catálogo beta siga en la base, ni partidos v1.1.0: los amistosos se fueron con un reinicio anterior. Los partidos v1.1.0 se siguen comprobando con el dorado.
    - `valor-sql.test.mjs` exige un catálogo no vacío en vez de más de 100 cartas.

## Carga de las fotos, listas largas y reparto que completa desde el bombo

### Decisiones de Marcos

- Las fotos se precargan al abrir la pantalla, sin esperar al scroll: primero las visibles y luego el resto, con prioridad baja. Al paginar, también la página siguiente.
- Vista previa con los colores reales (blur-up): una versión diminuta de Cloudinary de fondo y la buena encima con un fundido de unos 250 ms cuando ha cargado y está decodificada.
- Esqueleto mientras tanto: marco, fondo, nombre y stats, y un brillo diagonal en la zona de la foto. Ni huecos ni saltos de tamaño.
- Si la foto falla: el esqueleto sin brillo y las iniciales.
- Caché para que volver a una pantalla sea instantáneo, sin que el service worker interfiera; sin brillo con `prefers-reduced-motion`.
- Pocos anchos fijos en Cloudinary (160, 240, 320, 480, 640, 960 × DPR), siempre con `f_auto` y `q_auto`.
- Herramienta de plantillas paginada: 24, 48 o 96 por página, o todas. Botones de página, total de resultados y la opción recordada.
- Álbum: con menos de unas 60 cartas, todas de golpe; con más, por bloques al hacer scroll, con el siguiente precargado. La plantilla, sin paginar.
- Reparto entre temporadas: si a un equipo le faltan cartas tras repartir desde los álbumes, se completa con individuales libres del bombo, las más baratas primero y respetando el ±10 %. Entran en su álbum. Si aun así no llega, se queda con las que haya y recibe aviso.

### Decisiones mías

- **Módulo propio:** `js/slr/imagenes.js`, al que llama `carta.js` cada vez que aparecen cartas en Rush (el `MutationObserver` que ya tenía).
  - El atributo pasa de `data-cld` a `data-foto`. `js/ui.js` (la web de Shits League) también usa `img[data-cld]` con su propio cargador, y así no se pisan.
- **Precarga:**
  - Cada carta pide su foto en cuanto se pinta. Las que están en pantalla, al momento y con `fetchpriority="high"`. Las demás, en un `requestIdleCallback` posterior con `fetchpriority="low"`.
  - `precargar(urls)` descarga y decodifica con `new Image()` (prioridad baja) las de la página o el bloque siguiente, al ancho de las que ya se ven: la URL es la misma y sale de la caché.
- **Ancho:** el de la carta en pantalla × DPR (máximo 3), redondeado al siguiente de la lista y con 960 como tope. Si la carta aún no tiene tamaño (una hoja que se está abriendo), se usa uno de reserva según el tamaño de la carta.
- **Vista previa:** `c_fill,ar_5:7,g_auto,w_24,f_auto,q_auto:low,e_blur:400`, más un `filter: blur()` suave en CSS para que el escalado no se vea pixelado.
  - Solo hay una por foto, de unos cientos de bytes.
  - `f_auto` conserva la transparencia de los PNG, así que el fondo de la carta sigue viéndose detrás.
- **Estados, con clases en la carta:**
  - Sin nada: esqueleto con brillo. El brillo es un `::after` que se mueve con `transform` y solo existe dentro de `prefers-reduced-motion: no-preference`.
  - `con-mini`: la vista previa.
  - `con-foto`: la foto buena, con fundido de opacidad de 250 ms tras `img.decode()`.
  - `slr-carta--sin-foto`: la foto falló.
- **Caché:**
  - El módulo recuerda las URLs ya decodificadas (y guarda las últimas 400 `Image` para que el navegador no las suelte). Al volver a una pantalla, esas cartas salen con `sin-fundido`, sin vista previa ni brillo.
  - El service worker deja pasar las peticiones a `res.cloudinary.com` sin tocarlas. Antes las pedía siempre a la red (network-first) y guardaba cada foto, opaca, en Cache Storage (Chrome cuenta varios MB por cada respuesta opaca). Ahora las cachea el navegador con las cabeceras de Cloudinary.
- **Rendimiento:**
  - Primero se miden todas las cartas que aparecen de una vez y luego se tocan. Medir y escribir carta a carta obligaba a recalcular la maquetación una vez por carta.
  - Probé `content-visibility: auto` en las filas de la herramienta y lo descarté: medir las cartas de una fila «saltada» obliga a maquetarla expresamente, y la tarea larga subió de 244 a 928 ms.
- **Herramienta de plantillas:**
  - 24 por página por defecto. La opción se guarda en `localStorage` (`SLR_PLANTILLAS_POR_PAGINA`).
  - Botones ‹ 1 … 4 5 [6] 7 8 … 14 › arriba y abajo, con «Página X de Y». Cambiar un filtro vuelve a la página 1; dar o quitar una carta deja la misma página.
- **Álbum:**
  - Con más de 60 cartas, bloques de 30, y se pinta el siguiente a 1,5 pantallas del final. Si un bloque no llena la pantalla (PC), se pinta otro sin esperar al scroll.
  - Los ejemplares se piden por liga en vez de con `diseno_id=in.(…)`: con cientos de entradas, la URL sería demasiado larga.
- **Medido** (`tests/slr/banco/listas.mjs`, Chrome headless a 390×844 con 335 cartas en la liga y 262 en el álbum):
  - Herramienta: se abre en unos 210 ms. «Todas» pinta las 335 filas en menos de 20 ms; la maquetación inicial es una tarea de unos 245 ms.
  - Álbum: 30 fichas al abrir y todas al bajar, sin tareas largas.
  - Plantilla con «Fast 3G» y sin caché: esqueleto, vista previa y fotos en unos 4 s. Sin saltos de tamaño y solo con anchos fijos.
- **Reparto entre temporadas** (`repartir_desde_album`, migración `20261015000500`):
  - Tras el reparto desde los álbumes y el ajuste de valor viene un paso más: las individuales libres sin el % caro que no se ha llevado nadie, incluidas las de algún álbum que han sobrado, se reparten por rondas entre los equipos cortos, una carta por equipo y ronda, en orden sorteado con la semilla.
  - En cada ronda va la más barata que deja el valor del equipo dentro del ±10 % del objetivo proporcional. Si ninguna lo deja dentro, la que más se acerca.
  - Entran en el álbum con la vía «inicial». El resultado de cada equipo dice cuántas vinieron `del_bombo`.
  - Si aun así falta, aviso `plantilla_incompleta`.
  - Las caras no se usan en este paso, como pediste.
- **Tests:**
  - `api-paso9.mjs`, nuevo (reparto). Bot Uno se une el último con el bombo casi vacío; al quitar el último bot, sus cartas quedan libres y fuera de los álbumes. En la temporada 2, Bot Uno se completa con ellas y, si no llega a 11, recibe aviso.
  - `banco/listas.mjs`, nuevo (carga de fotos y listas largas). Con `SALIDA=carpeta` graba los GIF.
  - `banco/equipo.mjs`: la herramienta ahora espera 24 por página.
  - `api-paso3`: con el catálogo corto, la garantía premium tardaba más sobres y el bucle acababa vendiendo la carta clausulada que la sección 10 vuelve a leer. `bajarA` ya no la vende y el bucle admite hasta 120 sobres.

## Catálogo de cartas para el admin

### Decisiones de Marcos

- **Acceso:** página «Catálogo de cartas» solo para el admin, desde Perfil y separada del Modo pruebas.
- **Contenido:** todas las cartas del juego como en el álbum, pero todas y sin herramientas de gestión: los diseños activos, con un interruptor para incluir los inactivos.
- **Carga:** la misma que el álbum.
- **Arriba:** total y recuento por tipo y por tier.
- **Filtros y orden:** filtros por tipo, tier, perfil, acabado, color y libre / con dueño; buscador; orden por valor, OVR, nombre, tier o fecha de creación.
- **Al tocar una carta:** se abre el detalle normal, con «Editar carta».

### Decisiones mías

- **Datos:** salen de `disenos_carta`, de lectura pública, como ya hace el álbum. No hace falta una función nueva.
  - Se incluyen los diseños del catálogo común y, en una liga de prueba, los creados en ella.
  - Se cruzan con el ejemplar de cada uno en la liga para saber el dueño.
- **Diseño sin ejemplar en la liga:** pasa con uno desactivado antes de un reinicio de la beta, porque el reinicio solo crea ejemplares de los activos. Abre una ficha del diseño con la carta grande, stats, valor, tier, poderes y «Editar carta», en vez del detalle de un ejemplar que no existe.
- **«Editar carta»:** sigue las reglas del detalle: admin y liga en modo pruebas.
- **Carga:** el pintado por bloques del álbum pasa a `js/slr/bloques.js` (`rejillaPorBloques`), que usan el álbum y el catálogo: todas hasta 60, y con más, bloques de 30 con el siguiente precargado. Con la vista previa y el esqueleto de `imagenes.js`.
- **Las inactivas:** se ven atenuadas y con la marca «Inactiva».
- **Filtro de color:** tiene la opción «El del tipo», para las cartas sin color propio.
- **Filtros y orden:** se recuerdan mientras dura la sesión.
- **Rejilla:** 2 columnas en móvil y unas 5 en PC (mínimo de 230 px por carta); filtros en 3 y 4 columnas.
- **Probado** en `banco/equipo.mjs` a 390×844:
  - total y recuentos;
  - pintado por bloques;
  - filtro por tier, orden por nombre y buscador;
  - interruptor de inactivas;
  - detalle con «Editar carta».

  Además, una captura a 1440×900.

## Modelo de cartas: tipo, rareza y colecciones

### Decisiones de Marcos

- **Tipo, solo descriptivo:** `individual`, `duo`, `trio`, `grupo` (4 o más) y `especial` (sin personas). Desaparece `unica`. En la carta, un icono pequeño, no el color del marco.
- **Rareza:** `comun` / `rara` / `epica` / `legendaria`, calculada del tier (F, E, D común; C, B rara; A épica; S legendaria).
  - El marco indica la rareza: común gris metálico, rara azul, épica morado, legendaria dorado con brillo. Tiene que verse también en miniatura.
  - Sobres y subastas reparten por rareza; la garantía premium pasa a ser «al menos una rara o superior».
- **Colecciones:**
  - Tabla `colecciones` (nombre único, color, emblema, descripción) y `disenos_carta.coleccion_id`.
  - El nombre de carta es único dentro de su colección.
  - Fondo del color de la colección; el color de la carta, como anulación manual.
  - Emblema tintado con `mask-image` en una esquina. El nombre de la colección sale en la carta grande y la ficha; en miniatura, solo el emblema.
  - En el admin: gestor de colecciones, selector en el formulario de carta (con «nueva al vuelo») y filtros en el catálogo, el álbum y la herramienta de plantillas. En el álbum, el progreso por colección.
- **Migración de las cartas actuales:** primero una lista de propuestas; no se aplica nada sin OK.
- Sin cambios en el motor ni en las reglas de partido.

### Decisiones mías

- **`unica`:** se admite todavía en el CHECK hasta aplicar la migración de tipos con el OK de Marcos. Después, una migración nueva la quita.
- **`rareza`:** columna **generada** (`generated always as … stored`) a partir de `tier`, que nunca es nulo. No puede desincronizarse y no necesita trigger. El cliente la calcula igual si una lectura no la trae (`rarezaDeTier`).
- **Sorteo por rareza** (`sortear_carta_libre`):
  - Primero la rareza, ponderada solo entre las que tienen alguna carta libre (así una rareza sin cartas no deja el hueco vacío ni reparte su peso al azar). Luego una carta de esa rareza, uniforme.
  - Las subastas sortean cada hueco de la tanda igual, sin repetir la tanda anterior.
  - Lo forzado (la garantía premium y la tercera del sobre de elección si las dos primeras son comunes) pide «rara o superior» con los mismos pesos.
  - Los pesos van en `ligas.config` (`sobres.*.pesos` y `pesos_mercado`, por rareza). La migración actualiza la configuración por defecto y la de las ligas que ya existen.
- **Simulación** (20.000 sobres por tipo y 5.000 tandas):

  | | Catálogo actual (82 comunes, 2 legendarias) | Catálogo objetivo de CARTAS.md (230 comunes, 73 raras, 13 épicas, 5 legendarias) |
  |---|---|---|
  | Básico | todo común | 84,8 / 13,1 / 2,0 / 0 |
  | Premium | 87 % comunes, 13 % legendarias | 59 / 31 / 8 / 2 |
  | Elección | 66 % comunes, 34 % legendarias | 42 / 37 / 16 / 5 |
  | Subastas | 98,7 % comunes, 1,3 % legendarias | 70 / 22 / 7 / 1 |

  Con el catálogo actual, como no hay raras ni épicas, lo forzado a «rara o superior» acaban siendo las 2 legendarias. Se acabará en cuanto alguien las tenga (un ejemplar por diseño), pero hace falta crear raras y épicas.
- **Marco:** un elemento propio (`.slr-carta__borde`), un anillo con `mask-composite: exclude`.
  - Más grueso en miniatura (4cqw) que en grande (1,8cqw) para que la rareza se lea en los huecos del campo.
  - Cada rareza es un degradado metálico de su color.
  - Legendaria: un brillo que recorre el marco con `transform` (sin repintar), en pausa fuera de pantalla y sin él con `prefers-reduced-motion`.
  - Los acabados ya no cambian el color del marco (`--marco-carta` desaparece): su efecto sigue en la superficie.
- **Fondo:** `carta.color` y, si no tiene, `colección.color` y, si no, el verde neutro. El color por tipo desaparece.
- **Composición:**
  - Arriba a la izquierda, la media con el icono del tipo debajo.
  - Arriba a la derecha, el emblema, con una sombra para que se lea sobre cualquier foto.
  - El nombre de la colección (solo en `tam: 'l'`), bajo el nombre de la carta, en el color de la colección.
  - Ya no hay píldora de tipo sobre el nombre.
- **Iconos de tipo:** SVG en línea (`ICONOS_TIPO`): 1, 2 y 3 siluetas; para `grupo`, cinco pequeñas; para `especial`, una estrella.
- **Tope de stats del generador:** el de `grupo` y `especial` es el de la antigua `unica` (101). Así la migración de tipos no cambia ninguna carta al regenerarla. Solo importa en el tier S. *(Marcos decidió después dejarlo en 101 para todos: ver la sección siguiente.)*
- **Colecciones creadas desde una liga de prueba:**
  - Son de esa liga (`liga_prueba_id`) y se borran con ella, como sus cartas.
  - No se pueden usar en cartas de otras ligas (lo valida el trigger).
  - Solo se editan desde su liga.
  - El nombre es único entre las globales y, aparte, dentro de cada liga de prueba.
- **Nombre de carta:** índice único por `(liga de prueba, colección, lower(nombre))`. El trigger lo comprueba antes con un mensaje claro: «Ya hay una carta «Mateo» en la colección Dormidito».
- **Borrar una colección:** sus cartas se quedan sin colección. Si eso dejara dos cartas sin colección con el mismo nombre, no se borra y dice cuál.
- **Emblema:**
  - Cloudinary `c_pad,ar_1:1,w_128,b_transparent,f_auto` (cuadrado, sin recortar y con la transparencia).
  - El muestrario usa un SVG incrustado como emblema de ejemplo: no hace falta subir nada.
- **Caché de colecciones** (`js/slr/colecciones.js`): se carga con la liga. La vista previa del gestor pasa la colección sin guardar directamente a la carta, sin tocar la caché.
- **En las ligas de prueba:** las cartas creadas en ellas (que nacen inactivas para no llegar a las reales) cuentan como activas en el álbum y el catálogo de esa liga.
- **Tests:**
  - `api-paso10.mjs`, nuevo: rareza, colecciones, nombres, tipos y sobres por rareza.
  - `banco/colecciones.mjs`, nuevo: marco, fondo, emblema, icono, detalle, muestrario, gestor, formulario, álbum y catálogo. Con `SALIDA=carpeta` saca las capturas.
- **Propuestas de migración:**
  - Colecciones por palabra común al final: Down (8), Dormidito (4), Seductor (4), Muerto (2) y Cazatiburones (2).
  - Tipos: las 8 «únicas», 7 a grupo y Cenicero de Mateo a especial (El Pozo, con duda); además, Inquina de trío a dúo (duda).
  - Las coincidencias al principio del nombre son nombres de persona y no se proponen.
  - Pendientes del OK de Marcos.

## Migración del catálogo al modelo nuevo y edición múltiple

### Decisiones de Marcos

- **Colecciones**, con estos colores: Down (naranja), Dormidito (morado), Seductor (rojo), Muerto (negro) y Cazatiburones (azul). Cada carta se queda con lo que va delante del sufijo.
- **Tipos:**
  - a grupo: Abisal, El Pozo, La Familia, La Obra, Los Feministas, Seguratas y Sísifo;
  - a especial: Cenicero de Mateo;
  - Inquina sigue siendo trío.
  - Se quita `unica`.
- **Tope de stats del generador:** 101 para todos los tipos.
- **Editor de colección:** desde la propia colección, añadir cartas (buscador con miniaturas) y quitarlas, viendo la lista. Si una carta está en otra colección, avisa y la mueve.
- **Edición múltiple** en el catálogo y la herramienta de plantillas:
  - selección con casillas, Ctrl/Cmd+clic, Mayús+clic y pulsación larga en el móvil (sin arrastre);
  - «todas las visibles», «quitar selección» y el contador;
  - cambiar colección, color, tipo, tier, perfil y acabado, activar o desactivar, y regenerar stats o poderes;
  - resumen y confirmación antes de aplicar, en una sola transacción y con los triggers;
  - si cambia el tier o el perfil, pregunta si regenerar las stats.

### Decisiones mías

- **Migración** (`20261016000200`):
  - Por nombres exactos y solo en el catálogo común. Si en alguna colección no salen exactamente las cartas esperadas, falla entera.
  - No cambia stats, valor ni rareza.
  - Se probó antes dentro de una transacción deshecha. Resultado: 20 cartas en 5 colecciones, 7 grupos y 1 especial, sin ninguna `unica`.
  - Las colecciones nacen sin emblema.
- **Generador:** `MAX_STAT_CARTA = 101` en JS y `cap := 101` en SQL. El parámetro del tipo se conserva en la firma para no romper llamadas. Las cartas guardadas no cambian; solo saldrían distintas al regenerar una de tier S que antes topaba.
- **`slr_admin_editar_disenos(token, liga_id, ids, cambios, solo_contar)`:**
  - **Cambios:** solo las claves que cambian. `coleccion_id` y `color` admiten `null` («sin colección», «el de la colección»).
  - **Regenerar:** se vacían las stats o los poderes y su semilla, y el trigger los genera con semilla nueva y el tier y perfil nuevos.
  - **Resumen:** el previo se calcula aplicando y deshaciendo (`SLRSC`, como en el borrado), así que ya trae el valor y la rareza recalculados. Lleva el recuento por campo y hasta 8 ejemplos.
  - **Alcance:** como el formulario (en una liga de prueba, solo sus cartas). Activar o desactivar desde una liga de prueba se rechaza, porque sus cartas son solo de esa liga.
  - **Errores:** cualquier error (como un nombre repetido en la colección destino, que el trigger dice con claridad) deshace todo.
- **Añadir y quitar en el editor de colección:** usan la misma función, así que el movimiento es una transacción y el aviso de nombre repetido es el mismo.
- **Selección** (`js/slr/seleccion.js`):
  - Vale para cualquier lista con `[data-sel-id]` (el id del diseño). Las marcas se reponen solas al repintar (filtros, páginas, bloques) con un `MutationObserver`.
  - El clic se intercepta en captura: en modo selección marca en vez de abrir. Los botones de cada fila (Dar a…, Dejar libre) siguen funcionando.
  - Pulsación larga de 450 ms, que se cancela si el dedo se mueve más de 10 px.
  - Las listas con selección llevan `.slr-seleccionable`, que `carta.js` trata como «arrastre propio»: ahí las cartas no se levantan ni con el ratón ni con el dedo.
  - Solo aparece con el modo pruebas activo.
- **Tests:**
  - `api-paso10`: edición múltiple, 44/44 en total.
  - `banco/colecciones`: añadir y mover, quitar, selección (rango, Ctrl, todas, quitar), edición con la pregunta de las stats y el resumen, y pulsación larga sin levantar. 33/33.
  - Ajustes: `generador-sql` (tope 101) y el nombre de prueba en `api-paso7`.
  - En `banco/colecciones`, la colección de prueba se llama «Siesta» para no confundirse con «Dormidito», que ya existe.

## Rendimiento de la apertura de Rush (pestaña Equipo)

### Qué pasaba

- **No era la app.** La pestaña Equipo no tardaba 20 s: el test `banco/equipo.mjs` (y los demás de `banco/`) tenía una carrera.
  - Navegaba a `#rush`, llamaba a `Page.reload` (que no espera) y buscaba el botón «Jugar». A veces lo encontraba en la página **anterior**, que se estaba recargando.
  - Pulsaba ese botón, la página se recargaba y Rush no llegaba a abrirse. Por eso fallaba al azar, y subir la espera a 45 s solo lo disimulaba.
- **Cómo se encontró:** reproduciendo el escenario del test cinco veces con el registro de peticiones. En las que fallaban, las peticiones eran las de una página que volvía a cargarse *después* del clic.
- **Arreglo:** antes de recargar se marca la página (`window.__paginaVieja`) y se espera al botón de la página **nueva**. La espera de la franja vuelve a 10 s.

### Medidas

`tests/slr/banco/rendimiento.mjs`: liga de prueba con 18 equipos y una temporada de 17 jornadas (16 jugadas y la última por jugar, o `--jugadas=N`). Chrome headless a 390×844, sin caché, desde el clic en «Jugar» hasta la franja y el campo pintados. Exige una mediana de menos de 2 s en 5 aperturas.

- **Antes:**
  - con la temporada terminada (17 jugadas): 973 / 524 / 433 ms;
  - con la temporada en curso (16 jugadas): 628 / 472 / 418 ms;
  - en ambos casos, 13 peticiones a Supabase de 0,1 a 0,2 s, en cuatro tandas (`slr_yo` → liga, cartas, ventas y alineación → temporada → calendario y jornadas) y después los avisos.
- **Mejora** (`cargarLiga` en `rush.js`): la liga, la temporada, el calendario, las jornadas y las colecciones se piden a la vez.
  - Antes iban en tres tandas, una detrás de otra.
  - Las jornadas se piden por liga, no por temporada, así que no esperan a saber la temporada.
  - Ahorra dos viajes al servidor.
- **Después:**
  - 15 aperturas en una liga ya creada: entre 243 y 763 ms (mediana de unos 300 ms; la primera, sin nada en la caché del navegador, unos 400-750 ms).
  - Cargar los ~40 módulos de Rush desde el servidor local son unos 60 ms.
- **Picos sueltos:** justo después de jugar 16 jornadas de golpe se vieron aperturas de 2,1 s, 2,3 s y una de 5,9 s (`slr_calendario` y una simple lectura de `jornadas` tardaron 4-6 s). No se reproducen: 24 lecturas seguidas desde Node justo después de jugarlas respondieron en 70-265 ms. Apuntan a variaciones de la red o de Supabase tras muchas escrituras seguidas. En una liga real se publica una jornada por semana.

## Barra de selección fija y nada de selección de texto

### Decisiones de Marcos

- **Barra de selección fija:** en el modo selección, la barra (contador, «Terminar», «Seleccionar todas», acciones) queda fija y visible siempre. En móvil va abajo, respetando la safe area; en PC, abajo o arriba fija. Tiene que dejar ver la última fila.
- **Salir del modo:** «Terminar» sale sin mover el scroll, y el botón atrás del móvil también sale del modo.
- **Sin selección de texto:** mantener pulsado (para arrastrar, seleccionar o abrir) no debe seleccionar texto ni sacar el menú de copiar, salvo en los campos de texto. Hay que revisar también la app general.

### Decisiones mías

- **Barra:** el último elemento del contenido de la hoja, con `position: sticky; bottom`.
  - Así funciona igual en móvil (hace scroll el cuerpo de la hoja) y en PC (hace scroll la capa entera). Como ocupa su propio sitio, no hace falta añadir margen para que se vea la última fila.
  - `sticky` se queda a la distancia del padding del contenedor con scroll (22 px más la safe area en el cuerpo de la hoja, 48 px en la capa de PC). El `bottom` negativo lo compensa para que quede pegada al borde. Lo detectó el test: la barra pisaba 6 px de la última fila.
  - Las hojas completas tapan la barra de navegación de Rush, así que la barra de selección va al borde de abajo, con la safe area.
- **Historial:**
  - El modo selección es una «capa virtual» (`abrirCapaVirtual` en `ui.js`, sin elemento): ocupa una entrada del historial, así que el botón atrás sale del modo antes de cerrar la hoja.
  - «Terminar» pasa por el historial (`cerrarCapa`) y recupera el scroll que había.
  - La ✕ y el fondo de una hoja usan `cerrarHasta(el)`, que cierra esa hoja y lo que tenga encima de una vez.
- **Selección de texto:**
  - `user-select: none` y `-webkit-touch-callout: none` en todo Rush (`.slr` y la capa de arrastre), con `user-select: text` en `input`, `textarea` y `contenteditable`. Es más seguro que ir elemento por elemento.
  - Mientras dura una pulsación larga o un arrastre (levantar carta, alineación, selección múltiple): `bloquearSeleccion()` pone `html.slr-sin-seleccion` (`user-select: none !important` en todo el documento salvo los campos) y limpia la selección que haya empezado (`selectionchange` → `removeAllRanges`). Lleva la cuenta, así que cada módulo libera solo lo suyo.
- **App general:** `.card-wrap` (cartas de la plantilla) ya tenía `user-select: none`. Se añaden `-webkit-touch-callout: none` y `-webkit-user-drag: none` en sus fotos y en las cartas de votación y de medios.
- **Probado** en `banco/colecciones.mjs`, en móvil (390×844) y en PC (1366×860):
  - la barra a media lista y al final, sin tapar la última fila;
  - «Terminar» sin mover el scroll;
  - el botón atrás sale del modo y deja el catálogo abierto;
  - la ✕ con el modo activo cierra el catálogo;
  - `user-select` de carta, título, chip y buscador;
  - durante una pulsación, la clase de bloqueo está puesta y la selección se limpia; al soltar, se quita.

  `-webkit-touch-callout` solo existe en iOS y no se puede comprobar en Chrome.

## Motor v2.0.0: tácticas, táctica favorita, sinergias, energía y cambios en el descanso (fase 1: motor)

### Decisiones de Marcos

- **Tácticas:** posesión, contraataque y presión, con los números de `CONFIG`.
  - Posesión: posesión ×1,06 y sus contraataques sin bonus.
  - Contraataque: sus contraataques ×1,25 y su defensa ×1,04.
  - Presión: posesión ×1,06 cuando saca el rival.
  - Cruce: posesión, ataque y defensa ×1,06 para quien lo gana.
  - Plan B al descanso.
- **Táctica favorita:** ×1,05 a las stats.
- **Sinergias de colección:** 2 cartas ×1,02, 3 ×1,04, 4 o más ×1,06.
- **Energía:** ≥70 ×1, 50–69 ×0,95, 30–49 ×0,88, <30 ×0,75, aplicada al congelar la alineación.
- **Cambios en el descanso:** gestión (reservón, normal, a tope) o cambios avanzados, dentro del máximo de 3.
- Motor nuevo, `js/slr/motor-v2.0.0.js`; las versiones anteriores se quedan.

### Decisiones mías

- **Partir de la v1.3.0:** poderes, duelos, saque, cansancio en el partido y lesiones, igual. El descanso no consume números del PRNG, así que el orden de sorteos es el de la v1.3.0.
- **Stats de cada carta:** se guarda su `base` (sin la táctica favorita). El cansancio (−4) y las lesiones (×0,7) van sobre la base, y las de juego se recalculan al cambiar de tramo o de carta.
- **Energía:** el motor no la aplica. `aplicarEnergia()` multiplica las stats al congelar (como «tocada»), y dentro del motor solo decide los cambios del descanso.
- **Orden del descanso:** primero el plan B de A y de B (con el marcador de ese momento) y después los cambios de A y de B.
  - **Reservón:** los 2 titulares con menos energía (en empate, por orden de hueco), por el mejor suplente libre según la stat de su hueco.
  - **Normal:** el titular con menos energía si está por debajo de 50.
  - **Cambios avanzados:** van en su orden. Uno se salta si su carta ya no está en el campo o el suplente ya se ha usado.
- **Sinergia:** se calcula en cada jugada con los titulares que hay en el campo (así cuenta también tras una lesión). En empate entre dos colecciones, la primera que aparece.
- **Eventos nuevos:**
  - `tacticas` (jugada 0: tácticas, cruce, sinergias);
  - `plan_b`;
  - `cambio` (sale, entra, hueco, motivo: reservón, cansado o programado, con su condición y la energía de la que sale);
  - `descanso` (tácticas, cruce y sinergias del segundo tramo).
- **Resultado:** añade `tacticas`, `cruce`, `plan_b`, `participacion` (completo y parcial por equipo) y `cambios_descanso`.
- **Validación:** rechaza tácticas, plan B, gestión, condiciones o energías no válidas, y más de 3 cambios avanzados.
- **Solo para el informe:** `opciones.sinCruce` quita el bonus del cruce, para medir cada táctica por sí sola. Los partidos de verdad no lo usan.
- **Aún no es el motor actual:** no está en `MOTORES` ni en la Edge Function, porque el servidor todavía no guarda tácticas ni energía. Entra en la fase 2.
  - `generar-dorado.mjs` carga del archivo una versión que no esté registrada.
  - El dorado de la v2 usa `marcosFCv2` y `losDelFondoV2` (con contraataque, plan B, reservón, favoritas, dos colecciones y energías) y da 2-2, con 3 cambios al descanso.
- **Tests:** `motor-v2.0.0.test.mjs` (15), además de los de las versiones anteriores sin cambios. El informe sale con `node tests/slr/balance-v2.mjs`.

### Informe de balance (20.000 partidos por caso; equipos de 70 sin poderes con suplentes de 66)

| Caso | Resultado | Objetivo |
|---|---|---|
| Quien gana el cruce | gana 48,5 % · empata 24,1 % · pierde 27,4 % | ~49 / 24 |
| Misma táctica | 37,8 / 25,3 / 36,9 % | ~37 / 26 / 37 |
| Cada táctica por sí sola, sin cruce | mayor diferencia 1,6 puntos | ≤ ±3 |
| +6 de media, misma táctica | gana 60,3 % | ~62 % |
| +6 de media, perdiendo el cruce | gana 50,0 % | ~50 % |
| Goles por partido | 2,51 (posesión contra posesión) · 2,68 (contraataque) · 2,74 (presión) · 2,64 de media en los 9 cruces | ~3 |
| Temporada de 17 jornadas: rota contra siempre los mismos | rota gana 48–51 %, empata ~28 %, pierde ~22 % | ~55 % |

- **Sinergias** (contra el mismo equipo sin colección):
  - 2 cartas: gana 41,0 %, pierde 33,2 %;
  - 3 cartas: 44,6 % / 30,2 %;
  - 4 o más: 48,0 % / 27,2 %.
- **Cambios al descanso de media**, con energías entre 30 y 100: reservón 2,00 · normal 0,90 · a tope 0.
  - En la temporada, el que rota con gestión normal hace 0,56 cambios por partido, y el que pone siempre a los mismos, 0,78 (sus titulares acaban a 31 de energía).
- **Plan B** (al descanso, entre equipos iguales): «ganando» se cumple el 31 % de las veces, «empatando» el 37 % y «perdiendo» el 31 %.
- **Dos desviaciones, sin tocar nada hasta que Marcos decida:**
  - **Goles:** la v1.3.0 da 2,71 con los mismos equipos, y la v2 baja a 2,51 cuando los dos juegan posesión, porque sus contraataques pierden el bonus (×1,0). Con contraataque o presión queda igual (2,68–2,74).
  - **Temporada con cansancio:** quien rota gana el 48–51 % (no el 55 %) con plantillas de 15 hechas con el generador (tiers D/E/F, estamina 25/50/25). Pero solo pierde el 22 %, y los titulares fijos acaban a 31 de energía. La cifra depende mucho de lo buenos que sean los suplentes: con estas plantillas, el que rota pone a menudo cartas F.

- **Marcos (tras el informe):** se quedan las dos como están. El motor no se toca.

## Motor v2.0.0 (fase 2: servidor)

### Decisiones de Marcos

- **Estamina** (`alta`, `media`, `baja`) y **táctica favorita** en `disenos_carta`:
  - las genera el servidor (estamina ~25/50/25, los porteros con más alta);
  - la táctica favorita sale del perfil: atacante → contraataque, control → posesión, defensa → presión, portero → ninguna, equilibrado → al azar;
  - se pueden editar en el formulario y en la edición múltiple.
- **Energía** en cada ejemplar (`cartas.energia`, 0–100, empieza en 100):
  - al publicar cada jornada de liga, cada carta gasta según su estamina (alta 22, media 30, baja 40), ×1,3 si su equipo presionaba y la mitad si jugó solo una parte;
  - después todas recuperan 20, y las que no jugaron, 20 más;
  - quien descansa recupera como si no jugase nadie;
  - los amistosos la usan, pero no la gastan ni la recuperan;
  - al cambiar de dueño se conserva, y en cada temporada nueva vuelve a 100.
- **Bots:** táctica al azar, gestión normal, y rotan con la alineación por defecto (2-2-2 por stats y energía; el botón «Sugerir alineación» se quitó después).
- **Privacidad:** la táctica de un partido solo se ve cuando está publicado; la guardada para el próximo, nunca.

### Decisiones mías

- **Las tácticas guardadas van en una tabla aparte, `alineaciones_tacticas`, sin lectura pública.** `alineaciones` se lee desde la web con `select *`, y ocultar columnas habría roto esas lecturas. El dueño las lee con `slr_mis_tacticas` y las guarda con `slr_guardar_tacticas` o junto con la alineación (`slr_guardar_alineacion`, parámetro nuevo `tacticas`).
- **Validación:**
  - táctica, gestión y condiciones, de las listas del motor;
  - el plan B tiene que ser otra táctica;
  - como mucho 3 cambios programados: sale un titular de la alineación guardada, entra uno de su banquillo, y ninguna carta sale ni entra dos veces;
  - el umbral (entero de 1 a 99) solo existe en el cambio «energía menor que».
  - Si después cambias la alineación y un cambio programado deja de cuadrar, el motor se lo salta (como ya hacía con las lesiones).
- **Al motor, los cambios programados vacíos le llegan como `null`.** Con una lista vacía el motor entiende que hay cambios programados y no aplica la gestión (migración `…0200`).
- **Lo que ve el motor del rival en un pronóstico o un amistoso:** su última táctica publicada (la del primer tramo; posesión si aún no jugó), gestión normal, sin plan B ni cambios. Así la simulación no filtra su táctica guardada. En el pronóstico de otro equipo, tampoco entran sus tácticas guardadas.
- **La crónica de un amistoso solo la ve quien lo jugó:** lleva sus tácticas guardadas para el próximo partido. Los demás siguen viendo el resultado en la lista.
- **Cartas para el motor (`carta_motor`):** las stats van con la tocada y después con la energía (redondeo al entero, mínimo 1). Además lleva `energia`, `estamina`, `tactica_favorita` y `coleccion_id`.
- **Funciones envueltas:** `congelar_alineacion`, `cerrar_jornada`, `motor_guardar_jornada` y `publicar_jornada` se renombran (`…_cartas` / `…_base`), y la nueva añade lo de la v2 y llama a la anterior. Así no se copian funciones de cientos de líneas.
- **Gasto con dos tramos:** quien juega entero gasta la base × la media de los factores de sus dos tramos (presión en uno = ×1,15). El titular sustituido gasta la mitad con la táctica del primer tramo, y el que entra, con la del segundo.
- **Cartas sin dueño:** también recuperan tras cada jornada (40), para que no se queden cansadas para siempre.
- **`partidos`:**
  - `tacticas`: tácticas por tramo, cruce, plan B y cambios del descanso;
  - `participacion`: quién jugó entero o una parte;
  - `energia`: por equipo, energía antes del partido y gasto de cada carta que jugó, para la crónica.
- **Alineación por defecto** (equipos nuevos, bots y quien no guardó): la de «Sugerir» con la energía. Ordena por la stat del hueco × factor, desempata por OVR × factor y por id. El gemelo de la web está en `js/slr/energia.js`, en enteros (factor × 100) para que coincida con el SQL.
- **Rasgos:** `generar_rasgos` en SQL y `generarRasgos` en `js/slr/generador.js`, gemelos con el mismo Park-Miller (semilla de stats + 7919).
  - Las cartas actuales se rellenaron con su semilla.
  - Sin estamina, el trigger los genera. La táctica favorita, solo al crear la carta.
- **Nueva temporada:** un trigger al crear la temporada pone la energía a 100, sea cual sea el camino (temporada nueva o reinicio de la beta).
- **Motor actual: 2.0.0**, en `motores.js` y en la Edge Function (que guarda además tácticas y participación).
- **Tests:** `api-paso11.mjs` (~54 comprobaciones). Entre otras cosas, recalcula la energía de todas las cartas de la liga tras dos jornadas y comprueba que la alineación de los bots es la de «Sugerir» de la web. `generador-sql.test.mjs` compara también los rasgos.

## Motor v2.0.0 (fase 3: interfaz)

### Decisiones de Marcos

- Lo básico, a la vista; lo avanzado, plegado. Quien no toque nada juega con posesión, gestión normal y su once guardado.
- **Pestaña Equipo:** táctica (3 botones grandes, con icono, qué hace y a qué gana y pierde), gestión, «Avanzado» (plan B y cambios programados) y «Sugerir alineación».
- **Energía** en la carta, la ficha, la alineación, la plantilla y las listas para elegir, con avisos («Cansado: −12 %»).
- **Táctica favorita** con icono en la carta y en la ficha; en la alineación se resaltan las que encajan.
- **Sinergias:** chip en la alineación y en la crónica.
- **Crónica:** tácticas y cruce al principio, plan B y cambios del descanso con su motivo, y energía gastada al final.
- **Ficha del rival:** tácticas de sus últimos partidos publicados.
- **Ayuda:** «¿Cómo funciona?», desde la pestaña Equipo.

### Decisiones mías

- **Iconos de táctica:** 🔄 posesión, 🏹 contraataque y 🔥 presión. Los textos y los números salen de `CONFIG` del motor, en `js/slr/tactica.js`, que también tiene los chips, la barra de energía y la ayuda.
- **Colores de energía** por tramo del motor: verde (≥70), lima (50–69), naranja (30–49) y rojo (<30). En la carta va una barra fina abajo; en las fichas y las listas, la barra con el número y el aviso.
- **Las tácticas se guardan con la alineación** (un solo botón «Guardar»), con el parámetro `tacticas` de `slr_guardar_alineacion`. Cambiarlas deja la pantalla en «Cambios sin guardar», igual que mover una carta.
- **En el móvil**, los botones de táctica enseñan solo el icono, el nombre, el cruce y cuántas favoritas hay en el once. La frase de la elegida va debajo. En PC, cada botón lleva su frase.
- **«Avanzado»:** la fila plegada resume lo que hay dentro (p. ej. «plan B · 1 cambio») y sigue abierta al repintar.
  - Con cambios programados, la gestión avisa de que no se aplica, porque el motor los usa en su lugar.
  - Al guardar se quitan, avisando, los cambios que ya no cuadran con la alineación; si falta quién sale o quién entra, no se guarda.
- **«Sugerir alineación»** (quitado después, ver «Cambios pequeños: mercado, alineación, posición e iconos») usaba la misma función que el servidor para los bots (`sugerirAlineacion`, en `js/slr/energia.js`). No guarda: queda como «Cambios sin guardar».
- **Stats en la alineación:** el valor de cada hueco y las fuerzas de línea ya incluyen la tocada, la energía, la táctica favorita y la sinergia. Los bonus de táctica no, porque dependen del momento del partido.
- **Crónica:** el descanso es un bloque propio entre las jugadas 5 y 6, con el plan B, los cambios (con la energía de quien sale y el motivo: reservón, cansado o programado con su condición) y las tácticas y el cruce de la segunda parte. Al final, por equipo: energía antes → después del partido (sin la recuperación) y el gasto.
- **Amistosos de otros:** en la lista de la pestaña Liga se ve el resultado, pero no se abre la crónica: el servidor no la da, porque lleva las tácticas guardadas de quien lo jugó.
- **Plantilla:** se puede ordenar por energía.
- **Formulario de carta:** estamina y táctica favorita, propuestas por el generador mientras no se toquen a mano (siguen al perfil y a la semilla de stats). La edición múltiple las cambia también.
- **Tests:** `tests/slr/banco/tacticas.mjs` (30 comprobaciones, con las capturas de la entrega). `banco/alineacion.mjs` ahora coloca el scroll en el campo, porque la táctica va encima; `banco/equipo.mjs` no cuenta el bloque del descanso como jugada.

## Mercado, sobres y progresión: economía (fase 0)

### Decisiones de Marcos

- **Calibrar con el catálogo final objetivo**, no con el provisional: ~250 comunes, ~80 raras, ~40 épicas y 28 legendarias, con los valores medios medidos (común 189, rara 614, épica 1.906, legendaria 3.749).
- **Objetivo de diseño:** el mercado mejora con la temporada; en la jornada ~15 los mejores equipos tienen 3–4 legendarias y los medios varias épicas, sin que el dinero sobre tanto como para que todos lo tengan todo.
- **Economía: se queda la actual** (saldo 5.000, salario 1.000, participación 100, sorpresa 600/300, ojo clínico 300).
- **Progresión con dosificación 6/2** (6 épicas por jornada desde la J4 y 2 legendarias por jornada desde la J6).
- **Precios de los sobres por tramo** (J1–3 / J4–5 / J6+), editables desde el admin, y los pesos propuestos.
- **Sin vibraciones** del dispositivo en ningún sitio: todo el impacto es visual.

### Informe (simulación de 40 temporadas, 18 equipos, bots buenos, medios y flojos)

- **El límite lo pone la oferta, no el dinero.** Sin dosificar, las épicas libres se acaban hacia la J7 y las legendarias hacia la J10–11, con cualquier salario. Subir el salario solo concentra más en los de arriba y vacía antes el bombo; limitar los sobres por jornada casi no cambia nada.
- **Con la economía actual y la dosificación 6/2**, en la jornada 15: 1.º 4,3 legendarias, 3.º 3,1, 5.º 1,8, 6.º 1,3, 9.º 0,8 (y ~1–2 épicas los del medio). Los buenos acaban con ~2.900 de saldo: gastan casi todo.
- Con 20 legendarias, que 4–6 equipos tengan 3–4 era imposible sin dejar al resto sin ninguna: por eso el objetivo sube a **28 legendarias**.
- Precios por tramo calculados para ~70 % de valor esperado con el catálogo objetivo (ver CARTAS.md).

## Progresión por jornadas (fase 1)

### Decisiones mías

- **Dosificación por turnos:** cada épica y legendaria libre recibe, al azar, su jornada de entrada (`cartas.libera_jornada`, `libera_temporada`). Se asigna la primera vez que se sortea algo en la temporada (`asignar_cupos`, llamado desde el sorteo), y también a las que vuelven libres sin turno a mitad de temporada (van a la cola). Así es determinista y la tienda puede decir cuántas entran esta jornada.
- **Interruptor:** `progresion.activa` = `auto` (encendida solo con la liga `en_curso` y sin `modo_beta`), `true` o `false`. `progresion.jornada_prueba` fuerza la jornada de referencia; las dos se cambian con `slr_admin_progresion` (Modo pruebas).
- **Jornada de referencia:** la de prueba, o la próxima pendiente (programada, cerrada o simulada) de la temporada actual; si no queda ninguna, la siguiente a la última.
- **Sorteo único** `sortear_carta` (con progresión y filtros de perfil y colección para los sobres nuevos). `sortear_carta_libre` lo llama, así que las tandas de subastas y los sobres ya respetan la progresión. Los pesos se aplican entre las rarezas que pueden salir y tienen cartas (renormalizados).
- **Contador del Modo pruebas:** además de las plantillas iniciales, el progreso del catálogo hacia el objetivo por rareza (`bombo_plantillas.catalogo_rarezas`).
- **Vibraciones quitadas** (levantar una carta, arrastrar en la alineación y entrar en modo selección).
- **Tests:** `api-paso12.mjs` (tramos, turnos de entrada, tandas que solo sacan lo que puede salir e interruptor).

## Sobres nuevos (fase 2)

### Decisiones de Marcos

- Fuera el sobre premium y su garantía. Cinco tipos (sencillo, básico, elección, de posición y de colección) en una tabla editable por el admin, con precios por tramo y los pesos propuestos.
- Solo cartas libres y con progresión; si un sobre no se puede llenar, AGOTADO.

### Decisiones mías

- **`tipos_sobre` por liga:** filas por defecto (`liga_id` nulo) y, al editar desde el Modo pruebas, una fila propia de la liga para ese tipo (`tipos_sobre_liga` da la propia o la de por defecto). Así un administrador de una liga de prueba no cambia los sobres de la liga principal.
- **Precio por tramo:** `precios` son tres enteros (J1–3, J4–5, J6+); `tramo_precio` cuenta cuántos tramos de la progresión ha alcanzado la jornada de referencia. Sin progresión, el último.
- **De posición:** la carta tiene que ser del perfil elegido o equilibrada. **De colección:** de la colección de la semana (`colecciones_semana`, una fila por liga y lunes; la elige `coleccion_semana()` la primera vez que hace falta y las tareas del mercado cada lunes).
- **Probabilidades en la tienda:** las de la primera carta, con los pesos renormalizados entre las rarezas que pueden salir y tienen cartas para ese sobre.
- **Agotado:** con menos cartas disponibles que las del sobre; el de posición, solo si no queda ninguna de ningún perfil (cada perfil sin cartas sale deshabilitado al elegir).
- **Respuesta de la compra:** cada carta con `nueva` (si no estaba en tu álbum) y el progreso de su colección (`tengo`/`total`), y `mejor_rareza` para la animación.
- **Elección pendiente:** `slr_sobre_pendiente` y la tienda la devuelven con las candidatas, para que reaparezca en cualquier pantalla al recargar. El plazo queda fijo en 10 minutos.
- **Dorso de las cartas:** `ajustes.dorso_carta_url` (global) o `ligas.config.dorso_url` (la liga, desde el Modo pruebas).
- **Historial:** solo los sobres (y las elecciones) en los que sale una épica o una legendaria.
- `equipos.contador_garantia_premium` queda sin uso (no se borra: lo toca el reinicio de temporada).
- **Tests:** `api-paso12.mjs` amplía la progresión con los cinco sobres; `api-paso3` y `api-paso10` dejan el premium y la garantía.

## Pestaña Mercado (fase 3)

### Decisiones de Marcos

- Sub-pestañas Subastas · En venta · Ofertas · Sobres; pujar, comprar, ofertar, intercambiar y clausular desde el detalle; cada carta con lo que importa para decidir; filtros y orden por precio; mercado cerrado con banner y todo deshabilitado; «Haz hueco» antes de cualquier adquisición.

### Decisiones mías

- **`slr_mercado`** añade la plantilla ocupada, el motivo de cierre (`pausa`, `jornada`, `entre_temporadas`), el estado de la progresión, el impuesto y el porcentaje del banco: una sola llamada para pintar la pestaña.
- **Hoja de puja:** puja mínima (el valor), saldo, cierre, botones rápidos (mínima, +10, +25 y +50 %) y los dos avisos (ciega y hueco al resolverse). Se marcan solo tus subastas (el servidor no da pujas ajenas).
- **«Haz hueco»** (`hueco.js`) cuenta tus cartas más la elección de sobre pendiente. Se pide al pujar por primera vez en una subasta, comprar, ofertar, clausular, proponer o aceptar un intercambio que te deje con más cartas, y abrir un sobre. Tras vender, la operación sigue sola.
- **Hojas encadenadas:** las que devuelven un valor (perfil, importe, haz hueco) lo resuelven al cerrarse (cuando el historial ya ha vuelto), no al tocar el botón; si no, la hoja siguiente se cerraba con el `popstate` de la anterior.
- **Intercambio:** dos listas (tus cartas y las suyas, con la que miras ya marcada) y monedas por cada lado; el resumen dice cuánto le llega a cada uno tras el impuesto del 5 %.
- **Sinergia en las listas:** «te daría sinergia ×N» si ya tienes N−1 cartas de esa colección.
- **Filtros** plegados en el móvil (con cuántos hay activos) y abiertos en PC.
- **Tienda:** el arte provisional de cada sobre se genera con CSS (colores y dibujo por tipo; el de colección con su emblema y su color). Los perfiles sin cartas del de posición salen deshabilitados.
- **Tests:** `banco/mercado.mjs` (26 comprobaciones en móvil y PC, con capturas).

## Apertura de sobres (fase 4)

### Decisiones de Marcos

- Pantalla completa también en PC: flotar con brillo laminado, cargar con 3 toques (temblor creciente, grietas de luz y color de la mejor rareza), rasgar deslizando el dedo por la línea, explosión, cartas boca abajo en abanico con giro 3D (épicas y legendarias más lentas y con más luz), «¡NUEVA!», resumen con colección y valor; elección con cuenta atrás que reaparece al recargar; «Saltar» siempre; movimiento reducido; sin sonidos todavía pero con puntos de enganche; sin vibraciones.
- Admin: pantalla «Sobres» (editar tipos, subir imagen y dorso, colección de la semana y vista previa de apertura).

### Decisiones mías

- **Un solo bucle** (`requestAnimationFrame`) mueve el balanceo, el temblor (en la escena entera) y las partículas (un `canvas` a pantalla completa, con mezcla aditiva y un tope de 420 partículas). Al cerrar se cancela el bucle y se quitan los temporizadores y los escuchadores.
- **Color de la luz:** blanco (común), azul (rara), morado (épica) y dorado (legendaria), según la mejor carta del sobre (en la elección, la mejor candidata).
- **Rasgado:** se empieza cerca de la línea (15 % de la altura) y de donde se quedó el corte. Cada movimiento a la derecha añade un punto que sigue la altura del dedo (dentro de una franja) con dientes alternos (zigzag). Al llegar al 96 %, las dos piezas del sobre se recortan con `clip-path` siguiendo ese mismo corte y salen despedidas.
- **Revelado:** al girarse, el abanico se abre un poco (las cartas se ven enteras) y se enderezan. El giro dura 0,65 s (común), 0,75 s (rara), 1,15 s (épica) y 1,6 s (legendaria). Las épicas y legendarias se «cargan» antes de girar y sueltan partículas, temblor y destello a mitad del giro.
- **Elección pendiente:** botón flotante dorado en cualquier pantalla de Rush (`rush.js` lo comprueba al entrar y tras cada apertura); tocándolo se abre directa en las candidatas.
- **Sonidos:** `SONIDOS.alSonar(nombre, datos)` en `apertura.js` recibe `aparece`, `toque`, `grieta`, `rasgar_inicio`, `rasgando`, `rasgado`, `explosion`, `reparto`, `carta_gira`, `carta_revelada`, `elegida`, `resumen` y `cerrar`.
- **Vista previa (admin):** usa cartas reales de la liga (la mejor, de la rareza elegida si existe) sin llamar al servidor para comprar ni elegir.
- **Capas:** la apertura es una capa más (el botón atrás la cierra). `[hidden]` se fuerza dentro de la apertura: el resumen, invisible pero con `display: flex`, tapaba los toques.
- **Tests:** `banco/apertura.mjs` (31 comprobaciones, móvil y PC; con `VIDEO=1` guarda los fotogramas de una apertura completa).

## Notificaciones, historial y pruebas del mercado (fase 5)

### Decisiones de Marcos

- Avisos con enlace de: subasta ganada o perdida, oferta recibida, aceptada o rechazada, intercambio, cláusula pagada por tu carta y carta vendida.
- Historial público de la liga para el pique: fichajes, cláusulas, subastas resueltas y sobres con épica o legendaria.
- Modo pruebas: «Resolver subastas ahora», «Abrir tanda nueva ahora» y simular una jornada concreta para la progresión.

### Decisiones mías

- **Los avisos ya existían:** se añade el destino `mercado` (con la sub-pestaña). Ofertas, contraofertas e intercambios llevan a Mercado → Ofertas; subastas perdidas, pujas anuladas y subastas canceladas, a Mercado → Subastas. Las ganadas y las ofertas aceptadas o rechazadas siguen yendo a la carta; las cláusulas y ventas cobradas, a los movimientos. Los avisos ya guardados se actualizaron.
- **Historial público:** nueva vista **Liga → Fichajes** con compras, cláusulas, intercambios, subastas resueltas y sobres con épica (borde morado) o legendaria (borde dorado). Lee la tabla `historial`, que ya era pública.
- **«Abrir tanda nueva ahora»** usa la siguiente fecha libre (una tanda por fecha) y no abre nada con el mercado cerrado. **«Resolver subastas ahora»** resuelve todas las abiertas como si hubieran cerrado.
- **Simular una jornada:** en *Modo pruebas → Sobres → Progresión (pruebas)* (encendida, apagada o automática, y la jornada de referencia).
- **Tests sin dependencias del catálogo:** `api-paso8` y `api-paso9` ya no dan por hecho que las individuales libres dejen un equipo a medias (con el catálogo del 17 de octubre salen 6 plantillas exactas). `api-paso4` tiene un margen de ±10 % en el reparto que de vez en cuando falla por azar, y `banco/listas` una comprobación de precarga que depende de la red.
- **Tests:** `api-paso13.mjs` (avisos, historial y herramientas del Modo pruebas); `banco/mercado.mjs` (33) y `banco/apertura.mjs` (31), con capturas en móvil y PC.

## Arreglos de los sobres: rendimiento, giro y plantilla llena

### Decisiones de Marcos

- La apertura tiene que ir fluida en un móvil medio (60 fps o 30 estables): solo transform y opacity, temblor en un único contenedor, rasgado sin recalcular recortes, un solo canvas con DPR ≤ 1,5 y 60–80 partículas, calidad adaptativa y precarga antes de animar.
- El giro de las cartas: dos caras montadas desde el principio; al tocar solo se anima el giro.
- Los sobres se compran y se abren aunque la plantilla pase de 15; después, «Haz hueco» con todas las cartas. Mientras sobren, nada más en el mercado ni en la alineación; al cierre de la jornada, venta automática de las de menos valor. El resto de adquisiciones mantiene el «Haz hueco» previo.

### Rendimiento de la apertura

Medido con `tests/slr/banco/rendimiento-apertura.mjs`: Chrome a 390×844 (DPR 2,75, táctil) con la CPU ×6, vista previa de un básico con una legendaria, recorrida con toques y arrastres reales. «Paint» es el tiempo de pintado del hilo principal en la fase.

| Fase | Antes: fps · p95 · máx · tareas largas · Paint | Después |
|---|---|---|
| Aparición (preparación) | 43 · 33 ms · 350 ms · 1 (107 ms) · 187 ms | 49–55 · 17 ms · 133–167 ms · 2 · 31–36 ms (con el sobre aún oculto: precarga y montaje) |
| Toques | 54 · 33 ms · 67 ms · 0 · 258 ms | 55–58 · 17–33 ms · 83–100 ms (un frame, GPU emulada) · 0 · 19–28 ms |
| Rasgado | **33** · 33 ms · 67 ms · 0 · 259 ms | **60** · 17 ms · 17–33 ms · 0 · 8–11 ms |
| Explosión | 52 · 17 ms · 117 ms · 1 (99 ms) · 109 ms | 55–59 · 17–33 ms · 33–50 ms · 0–1 · 37–50 ms |
| Abanico | 60 · 17 ms · 17 ms · 0 · 227 ms | 60 · 17 ms · 17 ms · 0 · 7–11 ms |
| Giro | 57 · 17 ms · 117 ms · 0 · 381 ms | 59–60 · 17 ms · 17–33 ms · 0 · 12–18 ms |

- El pintado baja entre 6 y 30 veces: en un móvil real (donde rasterizar filtros y mezclas es lo caro) es lo que se notaba como tirones.
- El frame suelto de ~80–100 ms del primer toque es trabajo de GPU (`GPUTask`) en el Chrome sin pantalla, que emula la GPU por software; no hay tareas largas en el hilo principal.
- Con la CPU ×20, la calidad adaptativa baja sola al nivel 2 (mínimas partículas, sin rayos, lienzo a DPR 1).

### Decisiones mías

- **Qué se animaba mal:** `filter`/`drop-shadow` y `brightness` del sobre, el brillo laminado con `mix-blend-mode` y `background-position` (repintado en cada movimiento), el fondo con un degradado que cambiaba de color, grietas con `stroke-dashoffset` y filtro, la línea de corte repintada (SVG con `drop-shadow`) en cada movimiento, rayos con máscara en una capa de 170vmax, el dorso con `box-shadow` y `background-position`, y los avisos dorados con `box-shadow`.
- **Ahora:** halo, luz del sobre, fondo de color, grietas (un SVG por tanda, con su halo como trazo ancho) y destello son capas ya pintadas que cambian de opacidad o escala; empiezan en opacidad 0,01 para estar rasterizadas antes del primer toque. El laminado es un degradado que solo se desplaza. Los rayos se dibujan en el canvas desde una imagen hecha una vez. Las animaciones puntuales (golpe del sobre, destello) van con la Web Animations API, sin `offsetWidth` para reiniciarlas.
- **Rasgado:** el zigzag se calcula al empezar y las dos piezas se recortan entonces (un solo `clip-path` fijo); durante el arrastre solo se mueven, con transform, una ventana que descubre la línea de luz ya pintada y la chispa de la punta. El arrastre solo actualiza el objetivo y lo pinta el bucle; el rectángulo del sobre se mide una vez.
- **Partículas:** sprites de 32 px dibujados una vez por color, mezcla aditiva, topes de 80 / 45 / 20 según la calidad y lienzo a DPR ≤ 1,5 (1 en el nivel más bajo). El lienzo se «calienta» antes del primer toque.
- **Calidad adaptativa:** media de los últimos 30 frames; por encima de 26 ms baja un nivel (menos partículas y sin rayos; después, mínimas y DPR 1).
- **Precarga:** antes de enseñar el sobre se descargan y decodifican su imagen, el dorso y las fotos de las cartas (`asegurarFotos`, con tope de 2,5 s), y se montan las cartas ocultas; «Saltar» funciona también durante esa preparación.
- **Giro (bug de la carta que se veía dos veces):** al «cargar» una épica o legendaria se ponía un `filter` en el elemento que gira; un `filter` aplana el 3D (`preserve-3d`) y `backface-visibility` deja de funcionar, así que el frente se veía al instante. Ahora el elemento que gira no lleva ni filter ni opacity (el brillo es un halo detrás), las dos caras están montadas desde el principio y solo se anima `rotateY`. Épicas y legendarias se cargan 0,32 s y giran con una curva pausada: el frente asoma a ~0,8 s del toque (la común, a ~0,3 s). Un test muestrea el ángulo en cada frame y comprueba que nada aplana el 3D.
- **Plantilla llena tras un sobre:** el «exceso» no se guarda: son las cartas por encima del máximo (sin contar la elección pendiente). `preparar_operacion` lo comprueba (salvo al vender al banco), y también guardar o confirmar la alineación y las tácticas. `slr_hacer_hueco` vende varias de una vez (al menos las que sobran) y `slr_hueco_pendiente` dice cuántas sobran y cuáles son las del último sobre. El trigger del máximo de plantilla deja pasar las cartas que entran por un sobre. Al cierre de la jornada se venden las de menos valor, con el aviso `hueco_automatico`.
- **Envoltorios:** primero se envolvieron las funciones de alineación renombrándolas a `_base`, pero sus cuerpos cualifican los parámetros con el nombre de la función y fallaban; se deshizo y la comprobación va dentro (migración `…0700`).
- **Interfaz:** tras la apertura, si sobran cartas se abre «Haz hueco» con todas, las nuevas primero y marcadas; se pueden descartar las nuevas. Si se cierra, un aviso rojo flotante la reabre, y al volver a entrar en Rush se abre sola.

### Rarezas de los sobres de la liga principal

- En `sobres_abiertos` de la liga principal solo hay 3 sobres (de Nicolás, a partir de las 18:15 del 18 de octubre): elección (común, común, **rara** elegida), básico (3 comunes) y colección (común). Cuadran con los pesos.
- **Los de Marcos no se pueden comprobar:** la liga se reinició en modo pruebas a las 18:07 del 18 de octubre, y el reinicio borra sobres, movimientos, álbum e historial. No queda ningún registro de esos sobres.
- **Con los pesos actuales y la progresión apagada** (beta), una legendaria por carta sale un 1 % (sencillo y básico), un 4 % (elección: ~11 % de que haya una entre las 3 candidatas, y te la quedas), un 3 % (posición y colección). Con 3 legendarias en todo el catálogo, sacar varias seguidas sería muy improbable.
- **Hay dos cosas raras que pueden explicarlo:**
  1. **La vista previa de apertura** del Modo pruebas (admin) fuerza la rareza que se elija, enseña cartas reales y las marca «¡NUEVA!», sin gastar nada. Si Marcos la usó, ahí es fácil ver varias legendarias.
  2. **Los sobres de colección y de posición** renormalizan los pesos entre las rarezas que quedan en su filtro. Si a una colección solo le queda una legendaria (o una épica), el sobre la da siempre. Hoy, «Moon» solo tiene una épica libre: como colección de la semana, daría una épica el 100 % de las veces por 900. «Down» tiene una común y una legendaria: un 5 % de legendaria (3 de 58). **Decidido después** (ver «Sorteo de rareza con los pesos completos»): que la rareza se sortee con los pesos completos y, si no queda de esa, baje a la siguiente inferior (así nunca sube la probabilidad de lo bueno), o no elegir como colección de la semana las que solo tienen cartas raras o mejores.
- **Tests:** `api-paso14.mjs` (plantilla llena, bloqueos, venta por lotes y venta automática), `banco/apertura.mjs` (34, con el muestreo del giro), `banco/mercado.mjs` (41), `banco/rendimiento-apertura.mjs` (medidas); `api-paso3` y `api-paso12` ya no esperan el rechazo por falta de hueco en los sobres.

## Sorteo de rareza con los pesos completos

### Decisiones de Marcos

- La rareza se sortea con los pesos completos del sobre. Si no queda ninguna carta libre de esa rareza en esa colección o posición, se baja a la inferior, y así sucesivamente. Si no queda ninguna carta de ninguna rareza, el sobre sale AGOTADO.
- Lo mismo en cualquier otro sitio donde se renormalizaran los pesos de esa forma.

### Decisiones mías

- **Un solo sitio:** todo pasa por `sortear_carta` (los cinco sobres, la candidata forzada «rara o mejor» del de elección y las tandas de subastas), así que la regla vale para todos.
- **Qué se sortea:** las rarezas con peso mayor que 0 que la progresión deja salir (y, en la candidata forzada, de rara para arriba), con sus pesos. La progresión sigue renormalizando entre las desbloqueadas, como se decidió en la fase 1: lo que no está desbloqueado no cuenta, pero lo que está desbloqueado y no queda, ya no reparte su peso hacia arriba.
- **Si no queda nada por debajo:** se sube a la siguiente rareza que quede. Solo pasa en grupos sin nada inferior (por ejemplo, una colección a la que solo le queda una épica): el sobre no está agotado y da esa carta. Es la única forma de cumplir que «AGOTADO» sea solo cuando no queda ninguna carta.
- **Probabilidades de la tienda:** se calculan con la misma regla (`probabilidades_sobre` con las rarezas desbloqueadas). Con «Down» (una común y una legendaria): común 97 % y legendaria 3 %, en vez de 94,8 % y 5,2 %.
- **Más rápido:** `sortear_carta` calcula la progresión una vez por sorteo, en lugar de por cada carta libre.
- **Modo pruebas:** `slr_prueba_sorteo` sortea n veces (de 1 a 20.000; mejor por lotes de 1.000) sin dar ninguna carta y cuenta las rarezas.
- **Cartas creadas desde una liga de prueba:** nacen inactivas en el catálogo y el sorteo no las saca (ya era así). Por eso el test usa las colecciones reales.
- **Tests:** `api-paso15.mjs` calcula la regla para cada composición real (colecciones y perfiles) y la compara con el sorteo, con las probabilidades de la tienda, con la candidata forzada y con la progresión.

## Colección de la semana y progresión

### Decisiones de Marcos

- Se mantiene la regla del sorteo de rareza: si no queda nada de la rareza sorteada ni de las inferiores, se sube a la siguiente que quede.
- Una colección solo puede salir como colección de la semana si la rareza más alta de **todas** sus cartas (libres o no) está desbloqueada por la progresión en ese momento. Con la progresión activa: una colección con alguna legendaria no sale antes de la jornada 6 y una con épicas, antes de la 4. Las que no tienen cartas altas pueden salir desde el principio.
- Si el admin la elige a mano desde el Modo pruebas, se le avisa si no cumple la regla, pero se aplica.
- Con la progresión apagada (beta), cualquier colección vale.

### Decisiones mías

- **Qué cartas cuentan:** los diseños activos de la colección (del catálogo, o de esa liga de prueba). Da igual que estén libres, en un equipo o en subasta. `rareza_maxima_coleccion(liga, colección)` y `coleccion_desbloqueada(liga, colección)`.
- **Cuándo se mira:** al elegirla (la primera vez que hace falta en la semana o en las tareas del lunes), con la jornada de progresión de ese momento. Una vez elegida, no se cambia aunque avance la jornada.
- **Además** tiene que tener alguna carta que pueda salir, como antes. Si ninguna colección cumple las dos cosas, esa semana no hay colección (el sobre de colección sale agotado).
- **Aviso al admin:** `slr_admin_coleccion_semana` devuelve `aviso` («Esta colección tiene cartas legendarias, que aún no están desbloqueadas (jornada 2; llegan en la jornada 6)…»), que la pantalla «Sobres» enseña. Queda apuntado en el historial.
- **Sortear otra:** con `coleccion_id` vacío, borra la de esta semana y sortea otra con la regla. Botón «🎲 Sortear otra (con la regla)» en la pantalla «Sobres».
- **Tests:** `api-paso16.mjs` sortea 30 veces en las jornadas 2, 4 y 6 y sin progresión, comprueba el tope de rareza de lo que sale y los avisos al elegir a mano.

## Apertura en Android y compras con mala conexión

### Decisiones de Marcos

- En un Android real (unos 412 px) la apertura salía desplazada a la derecha y el botón «Genial» se salía de la pantalla. Todo tiene que quedar centrado y nada debe salirse en ninguna fase.
- Con mala conexión, tocar «Comprar» varias veces abría y cobraba varios sobres. Ahora:
  - al confirmar sale **al momento** la pantalla negra de la apertura con un «Preparando sobre…» discreto, y cuando llega la respuesta sigue la animación normal;
  - si falla o tarda más de unos 15 s, se sale con «No se ha podido comprar el sobre, no se te ha cobrado nada», salvo que la compra sí se hubiera hecho: entonces se abre ese sobre;
  - cada intento de compra lleva un identificador del cliente; si llega dos veces, no se cobra otra vez y se devuelve el resultado del primero. Lo mismo al elegir la carta del sobre de Elección;
  - mientras hay una compra en curso, todos los botones de comprar quedan desactivados.

### Decisiones mías

- **Causa del descentrado:** el halo de detrás del sobre mide `min(120vw, 620px)`. En el móvil son 120vw, más que la pantalla, y la escena era una rejilla con una columna `auto`: la columna se ensanchaba hasta el halo y todo lo que va en ella (sobre, abanico y resumen) se centraba en esa columna, un 10 % del ancho más a la derecha. En PC el tope de 620 px lo escondía. Ahora la escena y la capa tienen una sola celda del tamaño de la pantalla (`grid-template: minmax(0, 1fr) / minmax(0, 1fr)`): el halo la desborda por los dos lados por igual y se recorta.
- **Prueba en el navegador:** `banco/apertura-android.mjs` emula Android a 360 y 412 px con la barra de direcciones (agente de usuario de Android, alto sin la barra) y en cada fase (sobre, abanico, carta girada, todas reveladas y resumen arriba y abajo) comprueba que la capa mide lo que la pantalla, que nada se sale y que todo está centrado (±2 px).
- **Servidor:** tabla privada `intentos_sobre` (intento, equipo, compra o elección, respuesta, anulada). `slr_comprar_sobre(…, intento)` y `slr_elegir_carta_sobre(…, intento)` guardan su respuesta; si el intento ya está, la devuelven (con `repetida: true`). Un candado por intento (`pg_advisory_xact_lock`) ordena las peticiones que llegan a la vez. El repetido se responde antes de las comprobaciones de la compra (si el primer sobre dejó la plantilla con cartas de más, el repetido no falla por eso). Sin intento, las funciones se comportan como antes. Los intentos se borran a los 7 días.
- **Anular:** `slr_anular_intento(token, liga, intento)`. Si la compra ya se hizo, devuelve su sobre; si no, deja el intento anulado y la petición que llegue tarde se rechaza («se anuló… no se te ha cobrado nada»). Así el aviso de «no se te ha cobrado nada» es siempre verdad.
- **Cliente:**
  - sin conexión (`navigator.onLine` falso), el aviso sale al momento y no se envía nada;
  - si el servidor dice que no (agotado, saldo…), no se ha cobrado: aviso con el motivo;
  - si falla la red o pasan 15 s, se pregunta por el intento (y vale también la respuesta de la compra si llega mientras tanto);
  - si ni eso se puede saber, se avisa («Si llegó a hacerse, se abrirá cuando vuelvas a la tienda con conexión»), el intento se guarda en el navegador y, al volver a la tienda, se resuelve: si se hizo, «Tu compra sí llegó a hacerse» y se abre ese sobre.
- **La pantalla de espera** es la misma capa (y la misma entrada del historial) que luego usa la apertura. Si el jugador la cierra con el botón atrás antes de que llegue el sobre, el sobre se abre en una capa nueva al llegar.
- **Elección:** un intento por sobre; mientras va la petición, ningún «Elegir» responde, y si falla por la red se puede volver a tocar con el mismo intento.
- **Tests:**
  - `api-paso17.mjs`: dos veces y cuatro a la vez con el mismo intento (un cobro, el mismo sobre), anular antes y después de comprar, intentos de otro jugador y la elección repetida;
  - `banco/apertura-android.mjs`: red lenta con toques repetidos (un sobre, un cobro), compra que tarda más de la espera pero se hizo, sin conexión, y compra que queda sin saber y se abre al volver a la tienda.

## Cambios pequeños: mercado, alineación, posición e iconos

### Decisiones de Marcos

- **Mercado:** las pestañas van en este orden: Subastas, Sobres, En venta, Ofertas.
- **Fuera «Sugerir alineación»**, con su código.
- **Sobre de posición:** la posición de una carta es solo su stat más alta: Ataque si es ATA, Control si es CON, y Portero y Defensa si es DEF. Portero y Defensa usan exactamente las mismas cartas, pero siguen siendo dos opciones. Si empatan las stats más altas, la carta vale para las dos posiciones. El número de cartas de cada opción se calcula igual. (Antes salía en un sobre de ataque una carta con más CON que ATA: iba por el perfil y las «equilibradas» valían para cualquiera.)
- **Test del sorteo** en los sobres de posición y de colección: primero la rareza con sus pesos, luego la carta dentro de esa rareza, con los fallbacks de siempre (inferior; si no hay, superior). Unas 10.000 veces.
- **Iconos de tácticas:** `img/slr/tacticas/tactica-posesion.svg`, `tactica-contraataque.svg` y `tactica-presion.svg` (de un color) sustituyen a todos los emojis de las tácticas y toman el color del texto.

### Decisiones mías

- **Posición en el servidor:** `encaja_posicion(posición, ata, def, con)`, usada en `sortear_carta` y en `disponibles_sobre` (de ahí salen el recuento de la tienda y el «agotado»). El `perfil` de la carta ya no interviene en el sobre (sigue usándose para la táctica favorita y el generador). La descripción por defecto del sobre de posición se actualiza (si nadie la había cambiado) y la hoja de elegir posición lo explica; «Atacante» pasa a llamarse «Ataque».
- **«Sugerir alineación»:** fuera el botón, su función (`sugerirAlineacion` de `energia.js`), sus estilos y la mención en la ayuda. Los bots siguen alineándose con `crear_alineacion_por_defecto` en el servidor; el gemelo en JS vive ahora solo en `api-paso11.mjs`, que comprueba que el servidor lo hace bien.
- **Iconos:** una máscara CSS (como los emblemas) pintada con `currentColor`: `<i class="slr-ico-tac slr-ico-tac--presion">`, a 1,25 em del texto (unos 16 px en textos de 13 px), a 28 px en los botones de táctica y al tamaño de la cabeza en la carta (en blanco, con sombra). Están en la alineación, la táctica favorita de las cartas (carta, ficha, listas y mercado), la crónica, la ficha del rival, la ayuda y el editor del admin (vista previa). En los desplegables (`<option>`, que no admiten iconos) queda solo el nombre. El de Posesión es el más fino de los tres: a 16 px se distingue, pero por debajo pierde detalle.
- **Tests:**
  - `api-paso18.mjs`: el recuento de la tienda por stats, 10.000 sorteos por posición y por colección comparados con la regla (y con lo que saldría «carta a carta»), y 20 sobres de posición comprados de verdad (todas de su stat más alta). Ejemplo: «Down» (7 cartas, 1 legendaria) da la legendaria un 3,2 %, su peso (3 %), no 1 de cada 7 (14,3 %).
  - `banco/tacticas.mjs`: sin «Sugerir», iconos en SVG y ningún emoji de táctica (alineación, crónica, ayuda).
  - `banco/mercado.mjs`: el orden de las pestañas.
  - `api-paso12` y `api-paso15` siguen la regla nueva de posición.
