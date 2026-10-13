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
- **Edge Function `slr-simular`** (Deno) con exactamente `js/slr/motor-v1.1.0.js`. pg_cron la invoca con pg_net; el secreto está en Supabase Vault (`slr_cron_secreto`) y en los secretos de la función (`SLR_CRON_SECRETO`), nunca en el repo. También simula los **amistosos** al instante con las alineaciones guardadas (sin puntos, dinero, lesiones ni cansancio posterior; no cuentan para el ojo clínico; se guardan para poder verlos). Idempotente.
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
- **Copia del motor:** la CLI solo empaqueta `supabase/functions`, así que la función importa `supabase/functions/_shared/motor-v1.1.0.js`, copiada con `node supabase/seed/copiar-motor.mjs`. `tests/slr/motor-copia.test.mjs` comprueba que es idéntica byte a byte y que la función importa esa versión.
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
