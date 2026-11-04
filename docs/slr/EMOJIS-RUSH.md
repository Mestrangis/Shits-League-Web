# Emojis y símbolos de Shits League Rush

Lista para decidir más adelante: **nada de esto se ha cambiado**. Sale del código de Rush (`js/slr/`, `css/slr.css`, `css/acabados/`, `supabase/functions/`), sin comentarios y sin las flechas de texto (→ ← ↑ ↓ ▾).

## Cuántas veces sale cada uno

▶ 14 · 🔁 8 · 🤖 6 · 🤝 6 · ✓ 5 · ★ 5 · ⚡ 5 · 🎲 5 · 🔨 5 · 🛡 4 · ✕ 4 · ⏱ 4 · ✎ 4 · 🚑 4 · ⏸ 4 · 🔒 3 · 📷 3 · 🏷 3 · 🎴 3 · 📦 3 · 🃏 3 · ⏭ 2 · 👤 2 · ✨ 2 · 💰 2 · 🔋 2 · ✚ 1 · 👆 1 · ⬆ 1 · 🔎 1 · 💥 1 · ⏳ 1 · 🙈 1 · 🧪 1 · ➕ 1 · ⏩ 1 · 🆕 1 · 🎬 1 · 🚀 1 · 📖 1 · 🗂 1 · 🧤 1 · 🎯 1 · 🔇 1 · 🔊 1 · ⚽ 1 · 📋 1 · 🏁 1 · 🏆 1 · 📅 1 · 🔔 1 · ☑ 1 · 🪫 1 · ✦ 1

## Dónde

### `css/slr.css`

| Línea | Emoji | Código |
|---|---|---|
| 2209 | ✓ | `.slr-hueco-hoja__fila.es-elegida .slr-hueco-hoja__marca::after { content: '✓'; color: #fff; font-weight: 900; ` |
| 2352 | ✚ | `.slr-pt-carta.es-lesionada::after { content: "✚"; position: absolute; right: -8px; top: -8px; width: 26px; hei` |

### `js/slr/carta.js`

| Línea | Emoji | Código |
|---|---|---|
| 182 | 🛡 | `blindada && '<span class="slr-carta__marca slr-carta__marca--blindada" title="Blindada">🛡</span>',` |

### `js/slr/pantallas/album.js`

| Línea | Emoji | Código |
|---|---|---|
| 100 | ★ | `${c.descubierta ? '<span class="slr-ficha__descubierta">★ Descubierta por ti</span>' : ''}` |
| 102 | ✓ | `<span class="${c.dueno === miEquipo ? 'slr-propio' : ''}">${c.dueno === miEquipo ? '✓ Tuya' : 'Ahora: ${esc(qu` |

### `js/slr/pantallas/alineacion.js`

| Línea | Emoji | Código |
|---|---|---|
| 192 | ✕ | `${bloqueada ? '' : '<button class="slr-cambio__quitar" type="button" data-quitar-cambio="${k}" aria-label="Qui` |
| 273 | ✓ | `else if (!j) estadoTexto = '<span class="slr-estado">✓ Guardada</span>';` |
| 274 | ✓ | `else if (confirmada) estadoTexto = '<span class="slr-estado slr-estado--ok">✓ Confirmada (J${j.numero})</span>` |
| 333 | ✓ | `${confirmada ? '✓ Confirmada' : 'Confirmar alineación'}</button>'}` |
| 358 | ▶ | `▶ <b>Tu partido de la J${ult.numero} ya se ha jugado</b> <small>Ver</small></button>';` |
| 477 | ★ | `<p class="slr-ficha-hueco__aporte"><span>En ${DONDE[l]}</span> ${aporte(c, l, i, porId)}${borrador.capitan ===` |
| 565 | ★ | `${borrador.capitan === actual ? '★ Es el capitán' : '★ Hacer capitán'}</button>' : ''}` |

### `js/slr/pantallas/apertura.js`

| Línea | Emoji | Código |
|---|---|---|
| 152 | 👆 | `<span class="slr-apertura__mano" aria-hidden="true">👆</span>` |
| 158 | ⏭ | `<button class="slr-apertura__saltar" type="button" data-saltar>Saltar ⏭</button>';` |
| 445 | ⏱ | `$('[data-cartas]').insertAdjacentHTML('beforebegin', '<p class="slr-apertura__cuenta">⏱ Te quedan <b data-cuen` |

### `js/slr/pantallas/catalogo.js`

| Línea | Emoji | Código |
|---|---|---|
| 177 | ✎ | `${puedeEditar ? '<button class="slr-btn slr-btn--pruebas slr-detalle__editar" type="button" data-editar-carta>` |

### `js/slr/pantallas/colecciones-admin.js`

| Línea | Emoji | Código |
|---|---|---|
| 98 | ⬆ | `<span class="slr-btn slr-btn--fantasma" role="button">⬆ Subir emblema</span>` |

### `js/slr/pantallas/cronica.js`

| Línea | Emoji | Código |
|---|---|---|
| 70 | 🔁 | `return '<li class="slr-suceso slr-suceso--tactica ${eq[e.equipo].clase}">🔁 ${quien(e.equipo)} activa el plan B` |
| 99 | ⚡ | `lineas.push('<li class="slr-suceso slr-suceso--poder ${eq[e.equipo].clase}">⚡ ${carta(e.carta, e.equipo)} <sma` |
| 127 | 🚑 | `lineas.push('<li class="slr-suceso slr-suceso--lesion">🚑 Se lesiona ${carta(e.carta, e.equipo)}${e.suplente ? ` |
| 190 | ⚡ | `? ' <i class="slr-pp__poder" title="${esc('Poder: ${g.poderes.join(', ')}')}">⚡</i>' : ''}</li>').join('')}</u` |
| 290 | ★ | `<span class="slr-pp__quien"><b>${esc(nombre[n.id] ?? '?')}</b><small>${NOMBRE_LINEA[n.linea] ?? ''}${n.mejor ?` |
| 374 | ▶ | `${sim ? '<button class="slr-btn slr-btn--grande slr-cronica__ver" type="button" data-ver-partido>▶ Ver partido` |
| 388 | 🚑 | `${(p.lesiones ?? []).length ? '<p class="slr-cronica__lesiones">🚑 Lesiones: ${p.lesiones.map(id => esc(nombre[` |

### `js/slr/pantallas/detalle.js`

| Línea | Emoji | Código |
|---|---|---|
| 68 | 🔎 | `? '<p class="slr-detalle__descubierta" data-descubierta>🔎 Descubierta por <b class="${info.descubrimiento.tuyo` |
| 112 | 🔒 | `${cerrado ? '<p class="slr-suave">🔒 El mercado está cerrado ahora mismo.</p>' : ''}` |
| 118 | 🛡 | `? '<p class="slr-suave slr-detalle__blindada">🛡 Blindada: no se puede pagar su cláusula hasta dentro de <b>${e` |
| 121 | ✎ | `${puedeEditar ? '<button class="slr-btn slr-btn--pruebas slr-detalle__editar" type="button" data-editar-carta>` |

### `js/slr/pantallas/edicion-multiple.js`

| Línea | Emoji | Código |
|---|---|---|
| 47 | 🎲 | `<label class="slr-interruptor"><input type="checkbox" name="regenerar_stats">🎲 Regenerar stats (semilla nueva)` |
| 48 | 🎲 | `<label class="slr-interruptor"><input type="checkbox" name="regenerar_poderes">🎲 Regenerar poderes (semilla nu` |

### `js/slr/pantallas/editor-carta.js`

| Línea | Emoji | Código |
|---|---|---|
| 103 | 📷 | `<span class="slr-btn slr-btn--fantasma" role="button">📷 Subir foto (PNG sin fondo o JPG)</span>` |
| 146 | 🎲 | `<button class="slr-btn slr-btn--fantasma" type="button" data-regenerar="stats">🎲 Regenerar stats</button>` |
| 154 | 🎲 | `<button class="slr-btn slr-btn--fantasma" type="button" data-regenerar="poderes">🎲 Regenerar poderes</button>` |
| 203 | ✕ | `<button class="slr-editor__quitar" type="button" data-quitar-poder aria-label="Quitar poder">✕</button>` |
| 385 | 🤖 | `<span class="slr-lista-equipos__texto"><b>${e.bot ? '🤖 ' : ''}${esc(e.nombre)}</b><small>${e.bot ? 'bot de pru` |

### `js/slr/pantallas/ficha-equipo.js`

| Línea | Emoji | Código |
|---|---|---|
| 66 | 🤖 | `<p class="slr-suave">${eq.usuarios?.interno ? '🤖 bot de pruebas' : esc(eq.usuarios?.nombre ?? '')}</p>` |

### `js/slr/pantallas/liga.js`

| Línea | Emoji | Código |
|---|---|---|
| 39 | 👤 | `const avatar = nombre => '<span class="avatar slr-cruce__avatar" data-avatar="${esc(nombre ?? '')}" aria-hidde` |
| 72 | ▶ | `<button type="button" class="slr-cruce__marcador" data-partido="${esc(p.id)}" ${p.goles ? 'data-jugado="1"' : ` |
| 108 | 🏷💥🔁🔨🎴 | `const ICONO_FICHAJE = { compra: '🏷️', clausula: '💥', intercambio: '🔁', subasta: '🔨', sobre: '🎴' };` |
| 159 | ▶ | `<b>▶ Tu partido de la jornada ${clas.sin_ver.numero} ya se ha jugado</b><span>La clasificación no cuenta esa j` |

### `js/slr/pantallas/mercado.js`

| Línea | Emoji | Código |
|---|---|---|
| 46 | 🔒 | `return '<div class="slr-banner slr-banner--cierre" data-mercado-cerrado><b>🔒 Mercado cerrado · ${esc(t)}</b><s` |
| 52 | 🔒 | `${p.desbloqueadas.includes(r) ? '' : '🔒 '}${RAREZAS[r]}</span>').join('');` |
| 60 | ⏳ | `${sig ? '<p>⏳ ${esc(sig)}</p>' : ''}` |
| 61 | ✨ | `${entran.length ? '<p>✨ Esta jornada entran ${entran.join(' y ')} nuevas${quedan.length ? ' (quedan ${quedan.j` |
| 157 | ⏱ | `<span class="slr-mitem__tiempo" data-cuenta="${esc(s.cierra_en)}">⏱ ${faltan(s.cierra_en)}</span>` |
| 181 | 🙈 | `<li>🙈 <b>La puja es ciega:</b> nadie ve cuánto pujas hasta que se resuelve. Gana la más alta.</li>` |
| 182 | 📦 | `<li>📦 <b>Necesitarás hueco al resolverse:</b> ahora tienes ${tengo}/${max}. Si cuando cierre tienes la plantil` |
| 316 | ⏱ | `cont.querySelectorAll('[data-cuenta]').forEach(e => { e.textContent = (e.textContent.startsWith('⏱') ? '⏱ ' : ` |

### `js/slr/pantallas/muestrario-partido.js`

| Línea | Emoji | Código |
|---|---|---|
| 27 | ⏸ | `Toca la pantalla para saltar al final de la escena; ⏸ la congela.</p>` |
| 59 | ▶ | `<button class="slr-btn" type="button" data-jugada>▶ Una jugada entera</button>` |
| 60 | ▶ | `<button class="slr-btn" type="button" data-ejemplo>▶ Partido de ejemplo (con tus cartas)</button>` |
| 61 | ▶ | `<button class="slr-btn" type="button" data-ejemplo-planb>▶ Partido con plan B</button>` |

### `js/slr/pantallas/perfil.js`

| Línea | Emoji | Código |
|---|---|---|
| 81 | 🤖 | `<li><b>${m.usuarios?.interno ? '🤖 ' : ''}${esc(m.nombre)}</b><span>${m.usuarios?.interno ? 'bot de pruebas' : ` |
| 89 | 🧪 | `<div class="slr-tarjeta__cabeza"><span>🧪 Modo pruebas</span><span>${bots.length} ${bots.length === 1 ? 'bot' :` |
| 93 | ▶ | `${estado === 'en_curso' && j ? '<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="jugar">▶ ` |
| 96 | ➕ | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="nueva-carta">➕ Nueva carta</button>` |
| 97 | 🏷 | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="colecciones">🏷 Colecciones</button>` |
| 98 | 📦 | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="sobres">📦 Sobres</button>` |
| 99 | ⏩ | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="resolver-subastas">⏩ Resolver subastas ah` |
| 100 | 🆕 | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="tanda-nueva">🆕 Abrir tanda nueva ahora</b` |
| 101 | 🃏 | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="plantillas">🃏 Plantillas: dar o quitar ca` |
| 102 | ✨ | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="muestrario">✨ Muestrario de cartas</butto` |
| 103 | 🎬 | `<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="escenas-partido">🎬 Escenas de partido</bu` |
| 104 | 🚀 | `${temporadaProxima() ? '<button class="slr-btn slr-btn--pruebas" type="button" data-pruebas="empezar-temporada` |
| 280 | 🤖 | `if (r.aviso) toast('🤖 ${r.nombre} se une con solo ${r.cartas} cartas: no quedan individuales libres para una p` |
| 281 | 🤖 | `else toast('🤖 ${r.nombre} se une a la liga', 'ok');` |
| 323 | ✎ | `<button class="slr-perfil__editar" type="button" data-renombrar aria-label="Cambiar el nombre del equipo">✎</b` |
| 328 | 📖 | `<button class="slr-btn slr-btn--fantasma slr-btn--album" type="button" data-album>📖 Mi álbum</button>` |
| 329 | 🗂 | `${datos.liga.es_admin ? '<button class="slr-btn slr-btn--fantasma slr-btn--album" type="button" data-catalogo>` |
| 353 | 👤 | `else av.textContent = '👤';` |

### `js/slr/pantallas/plantilla.js`

| Línea | Emoji | Código |
|---|---|---|
| 19 | 🛡 | `if (c.blindada_hasta) chips.push('<span class="slr-chip slr-chip--blindada">🛡 Hasta ${esc(fechaCorta(c.blindad` |

### `js/slr/pantallas/plantillas-admin.js`

| Línea | Emoji | Código |
|---|---|---|
| 187 | 🤖 | `<span class="slr-lista-equipos__texto"><b>${e.bot ? '🤖 ' : ''}${esc(e.nombre)}</b><small>${e.bot ? 'bot de pru` |

### `js/slr/pantallas/sobres-admin.js`

| Línea | Emoji | Código |
|---|---|---|
| 46 | ▶ | `<button class="slr-btn slr-btn--pruebas" type="button" data-vista-previa>▶ Ver apertura</button>` |
| 67 | 🎲 | `<button class="slr-btn slr-btn--fantasma" type="button" data-col-sortear>🎲 Sortear otra (con la regla)</button` |
| 74 | 📷 | `<span class="slr-btn slr-btn--fantasma" role="button">📷 Subir dorso</span></label>` |
| 92 | 📷 | `<label class="slr-editor__subir"><input type="file" accept="image/png,image/webp,image/jpeg" data-subir-sobre ` |

### `js/slr/pantallas/tienda.js`

| Línea | Emoji | Código |
|---|---|---|
| 44 | 🧤🛡🎯⚡ | `const PERFIL = { portero: ['🧤', 'Portero'], defensa: ['🛡️', 'Defensa'], control: ['🎯', 'Control'], atacante: [` |
| 73 | 🎴 | `<b>🎴 Tienes una elección pendiente</b><span>Elige tu carta antes de que se acabe el tiempo (si no, te llevas l` |

### `js/slr/partido/ajustes.js`

| Línea | Emoji | Código |
|---|---|---|
| 128 | ⚡ | `poder: ['⚡ PODER'],` |
| 139 | 🚑 | `lesion: ['🚑 LESIÓN'],` |

### `js/slr/partido/config.js`

| Línea | Emoji | Código |
|---|---|---|
| 47 | ⚡ | `vs: t('VS'), ataca: t('ATACA'), poder: t('⚡ PODER'), control: t('Control del balón'), robo: t('¡ROBO!'), contr` |
| 49 | 🚑 | `estirada: t('¡PARADÓN!'), lesion: t('🚑 LESIÓN'), descanso: t('DESCANSO'), final: t('FINAL'), mejor_carta: t('M` |

### `js/slr/partido/escenas/pausas.js`

| Línea | Emoji | Código |
|---|---|---|
| 32 | 🔁 | `${d.planB.map(p => '<p class="slr-pt-panel__fila" style="--c:${ctx.color(p.equipo)}">🔁 <b>${esc(ctx.equipo(p.e` |

### `js/slr/partido/reproductor.js`

| Línea | Emoji | Código |
|---|---|---|
| 65 | ▶ | `<div class="slr-pt-rapido" data-rapido aria-hidden="true">▶▶ ×2</div>` |
| 69 | ⏸ | `${opts.soloEscenas ? '<button type="button" class="slr-pt-boton" data-pausa>⏸</button>' : ''}` |
| 71 | ⏭ | `<button type="button" class="slr-pt-boton slr-pt-boton--saltar" data-saltar>${opts.soloEscenas ? 'Cerrar' : 'S` |
| 225 | 🔇🔊 | `const pintarSilencio = () => { const b = $('[data-silencio]'); b.textContent = silenciado() ? '🔇' : '🔊'; b.set` |
| 258 | ▶⏸ | `if (b) b.textContent = linea?.estado === 'pausada' ? '▶' : '⏸';` |

### `js/slr/rush.js`

| Línea | Emoji | Código |
|---|---|---|
| 226 | ⚽💰 | `jornada_publicada: '⚽', venta_completada: '💰', clausula_recibida: '💰',` |
| 227 | 🔨 | `subasta_ganada: '🔨', subasta_perdida: '🔨', puja_anulada: '🔨', subasta_cancelada: '🔨',` |
| 228 | 🤝 | `oferta_recibida: '🤝', oferta_aceptada: '🤝', oferta_rechazada: '🤝', contraoferta: '🤝',` |
| 229 | 🤝🏷 | `oferta_caducada: '🤝', oferta_cancelada: '🤝', venta_cancelada: '🏷️',` |
| 230 | 🔁 | `intercambio_recibido: '🔁', intercambio_aceptado: '🔁', intercambio_rechazado: '🔁',` |
| 231 | 🔁 | `intercambio_caducado: '🔁', intercambio_cancelado: '🔁',` |
| 232 | 🃏📋 | `eleccion_automatica: '🃏', admin_carta: '🃏', alineacion_completada: '📋',` |
| 233 | ⏸▶🏁🏆📅 | `liga_pausada: '⏸️', liga_reanudada: '▶️', temporada_iniciada: '🏁', temporada_terminada: '🏆', jornada_aplazada:` |
| 254 | ▶ | `const texto = oculto ? 'Jornada ${datos.sinVer.numero}: tu partido ya se ha jugado · ▶ Ver' : (n.datos?.texto ` |
| 256 | 🔔 | `<span class="slr-aviso__icono" aria-hidden="true">${ICONOS_AVISO[n.tipo] ?? '🔔'}</span>` |
| 476 | ✕ | `<button class="slr-barra__salir" type="button">✕ Salir</button>` |
| 565 | 📦 | `const b = crear('<button class="slr-pendiente-global slr-pendiente-global--hueco" type="button" data-hueco-glo` |
| 572 | 🎴 | `const b = crear('<button class="slr-pendiente-global" type="button" data-pendiente-global>🎴 Tienes una elecció` |

### `js/slr/seleccion.js`

| Línea | Emoji | Código |
|---|---|---|
| 58 | ✎ | `<button class="slr-btn slr-btn--mini slr-btn--pruebas" type="button" data-sel="editar" ${n ? '' : 'disabled'}>` |
| 63 | ☑ | `<button class="slr-btn slr-btn--mini slr-btn--fantasma" type="button" data-sel="entrar">☑ Seleccionar</button>` |

### `js/slr/tactica.js`

| Línea | Emoji | Código |
|---|---|---|
| 35 | 🔋 | `alta: { nombre: 'Alta', icono: '🔋', gasto: GASTO_ESTAMINA.alta },` |
| 36 | 🔋 | `media: { nombre: 'Media', icono: '🔋', gasto: GASTO_ESTAMINA.media },` |
| 37 | 🪫 | `baja: { nombre: 'Baja', icono: '🪫', gasto: GASTO_ESTAMINA.baja },` |
| 69 | ✦ | `✦ Sinergia ${esc(col?.nombre ?? 'colección')} ×${s.cartas} (+${pct(s.mult)})</span>';` |

### `js/slr/ui.js`

| Línea | Emoji | Código |
|---|---|---|
| 142 | ✕ | `<button class="slr-hoja__cerrar" type="button" aria-label="Cerrar">✕</button>` |
