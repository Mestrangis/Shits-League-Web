/* ═══════════════════════════════════════════════
   SHITS LEAGUE — versión de la app
   La etiqueta version.json (la genera el despliegue: versión, commit, fecha y la
   huella de cada archivo) se pide SIEMPRE sin caché (no-store y ?t=…, para
   saltarse también la de GitHub Pages): al abrir la app, al pulsar JUGAR y al
   volver a la app tras un rato en segundo plano. El service worker (sw.js)
   instala lo que se le pide, comprobado archivo a archivo.
   · Al abrir: si hay versión nueva, se instala la Shits League normal (solo lo
     que ha cambiado) y se aplica con una recarga rápida antes de pintar nada
     (la rueda si tarda). Sin red o si tarda más de ~4 s, se abre la que había
     (y la nueva, que sigue bajando, se aplica la próxima vez).
   · Al pulsar JUGAR (prepararRush): si Rush no es el de version.json, «Descargando
     Shits League Rush…» con el porcentaje (solo de lo que ha cambiado). Si la
     Shits League también es vieja, se instalan las dos, se recarga y se entra.
     Con red, nunca se entra en Rush con otra versión que la de version.json.
   · Red de seguridad: una versión a medias, archivos que no cuadran o un error al
     arrancar el código → reparar(): se borran las cachés de código y se instala
     todo de nuevo, sola (como mucho una vez cada 5 minutos) o con «Reparar la
     app». Después de arrancar, el worker vuelve a comprobar lo guardado.
   · forzarActualizacion(): el servidor ya no entiende el código guardado (una
     función de Supabase que ya no existe): se busca la versión nueva y se aplica.
   Sin service worker (navegador viejo, modo privado…), todo funciona por la red.
═══════════════════════════════════════════════ */
(function () {
  const soportado = 'serviceWorker' in navigator;
  const oyentes = new Set();   // mensajes del worker ({ tipo: 'version', evento, … })
  let registro = null;
  let recargando = false;
  let instalada = null;        // { version, commit, fecha } de la versión activa
  let rushPedido = false;      // JUGAR antes de que mande el worker (la primera visita)
  const ESPERA_ABRIR = 4000;

  const SLVersion = {
    alArrancar: Promise.resolve(),
    estado, instalada: () => instalada, leerRemota, prepararRush, reparar, forzarActualizacion, esErrorDeVersion,
  };
  window.SLVersion = SLVersion;
  if (!soportado) return;

  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.tipo !== 'version') return;
    for (const cb of oyentes) { try { cb(e.data); } catch (err) { console.error(err); } }
  });
  navigator.serviceWorker.startMessages?.();
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargando) location.reload(); });

  /* ── Hablar con el worker y con el servidor ──────────────────────────────── */
  const URL_VERSION = new URL('version.json', document.baseURI).href;
  // La etiqueta de lo desplegado, sin ninguna caché (null si no hay red o tarda más de ms)
  async function leerRemota(ms = 5000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(`${URL_VERSION}?t=${Date.now()}`, { cache: 'no-store', signal: c.signal });
      if (!r.ok) return null;
      const v = await r.json();
      return v?.version && v.app && v.rush ? v : null;
    } catch { return null; } finally { clearTimeout(t); }
  }
  function preguntar(sw, datos, ms = 3000) {
    return new Promise(res => {
      if (!sw) { res(null); return; }
      const canal = new MessageChannel();
      const t = setTimeout(() => res(null), ms);
      canal.port1.onmessage = e => { clearTimeout(t); res(e.data); };
      sw.postMessage(datos, [canal.port2]);
    });
  }
  // { activa: { version, commit, fecha } | null, app, rush, instalando } del worker que manda
  async function estado() {
    const e = await preguntar(navigator.serviceWorker.controller, { tipo: 'estado' });
    if (e?.activa !== undefined) instalada = e.activa;
    return e?.activa !== undefined ? e : null;
  }
  // Instala esas partes de la versión m. Resuelve { ok } al terminar, { ok: false, error } si
  // falla, o { ok: false, tarde: true } si pasan ms (la instalación sigue). alProgreso(d)
  function instalar(m, partes, { ms = 0, fondo = false, alProgreso } = {}) {
    const ctrl = navigator.serviceWorker.controller;
    const clave = `${m.version}|${partes.join(',')}`;
    return new Promise(res => {
      let ultimo = Date.now(), plazo = 0;
      const fin = r => { clearInterval(vigia); clearTimeout(plazo); oyentes.delete(oir); res(r); };
      const oir = d => {
        if (d.partes !== clave) return;
        ultimo = Date.now();
        if (d.evento === 'lista') fin({ ok: true });
        else if (d.evento === 'error') fin({ ok: false, error: d.error, huella: d.huella });
        else alProgreso?.(d);
      };
      oyentes.add(oir);
      // Si el navegador para el worker a mitad, se le vuelve a pedir: sigue donde iba
      const vigia = setInterval(() => { if (Date.now() - ultimo > 15000) { ultimo = Date.now(); ctrl.postMessage({ tipo: 'instalar', manifiesto: m, partes, fondo }); } }, 5000);
      if (ms) plazo = setTimeout(() => fin({ ok: false, tarde: true }), ms);
      ctrl.postMessage({ tipo: 'instalar', manifiesto: m, partes, fondo });
    });
  }
  // Activa esa versión y recarga (la página no sigue: esta promesa no se resuelve)
  async function activarYRecargar(version) {
    const r = await preguntar(navigator.serviceWorker.controller, { tipo: 'activar', version }, 10000);
    if (!r?.ok) return false;
    recargando = true;
    location.reload();
    await new Promise(() => {});
  }

  /* ── Al abrir la app ─────────────────────────────────────────────────────── */
  SLVersion.alArrancar = (async () => {
    // Un worker nuevo esperando (cambió sw.js): se aplica ya, antes de arrancar
    const ctrl = navigator.serviceWorker.controller;
    const r = await Promise.race([navigator.serviceWorker.getRegistration(), new Promise(res => setTimeout(res, 500))]).catch(() => null);
    if (r?.waiting && ctrl && unaVez('SL_WORKER_APLICADO', 60000)) {
      recargando = true;
      r.waiting.postMessage({ tipo: 'activar_worker' });
      await Promise.race([new Promise(() => {}), new Promise(res => setTimeout(res, 8000))]);
      recargando = false;
    }
    if (!ctrl) return;   // la primera vez: por la red (se instala al terminar de cargar)
    const t0 = Date.now();
    const rueda = setTimeout(() => capa('Actualizando la app…'), 400);
    try {
      const [remota, e] = await Promise.all([leerRemota(ESPERA_ABRIR), estado()]);
      if (!e || !remota) return;   // sin red (o un worker antiguo): la que había
      if (e.activa?.version === remota.version) {
        // A medias (falta algo de la Shits League): se repara
        if (!e.app) { if (await reparar({ auto: true })) await new Promise(() => {}); return; }
        if (e.activa.commit !== remota.commit) preguntar(ctrl, { tipo: 'etiqueta', version: remota.version, commit: remota.commit, fecha: remota.fecha });
        return;
      }
      // Versión nueva: lo que ha cambiado de la Shits League, y a recargar (si da tiempo)
      const res = await instalar(remota, ['app'], { ms: Math.max(500, ESPERA_ABRIR - (Date.now() - t0)) });
      if (res.ok) await activarYRecargar(remota.version);
      else if (res.huella && await reparar({ auto: true })) await new Promise(() => {});
    } finally {
      clearTimeout(rueda);
      quitarCapa();
    }
  })().catch(() => {});

  /* ── Registro (cuando la Shits League ya ha cargado) ─────────────────────── */
  let alRegistrar;
  const registrado = new Promise(res => { alRegistrar = res; });
  function registrar() {
    if (registrar.hecho) return registrado;
    registrar.hecho = true;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(async r => {
      registro = r;
      alRegistrar(r);
      // La primera vez: en cuanto el worker manda, se instala la versión de version.json (sin recargar)
      // (el worker puede tomar el mando antes de que se escuche controllerchange: se mira, no se espera al evento)
      await navigator.serviceWorker.ready;
      for (let k = 0; k < 100 && !navigator.serviceWorker.controller; k++) await new Promise(res => setTimeout(res, 100));
      if (!navigator.serviceWorker.controller) return;
      const e = await estado();
      if (!e?.activa) {
        const remota = await leerRemota();
        if (remota && (await instalar(remota, ['app'], { fondo: true })).ok) {
          await preguntar(navigator.serviceWorker.controller, { tipo: 'activar', version: remota.version }, 10000);
          // Si ya se ha pulsado JUGAR (por la red), Rush también: la próxima vez, directo
          if (rushPedido) await instalar(remota, ['rush'], { fondo: true });
        }
        await estado();
      } else {
        // Ya instalada: se vuelve a comprobar lo guardado (lo que no cuadre se repara solo), pasado
        // un rato y en un momento libre: no compite con lo primero que se hace en la app
        setTimeout(() => enRatoLibre(() => preguntar(navigator.serviceWorker.controller, { tipo: 'verificar' }, 120000)), 30000);
      }
    }).catch(e => { alRegistrar(null); console.warn('[sw] No se pudo registrar:', e.message); });
    return registrado;
  }
  const enRatoLibre = f => (window.requestIdleCallback ?? (g => setTimeout(g, 500)))(f, { timeout: 3000 });
  document.addEventListener('sl:cargada', () => enRatoLibre(registrar), { once: true });
  window.addEventListener('load', () => setTimeout(() => enRatoLibre(registrar), 15000), { once: true });

  /* ── Al volver a la app tras un rato ─────────────────────────────────────── */
  let oculta = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { oculta = Date.now(); return; }
    if (!oculta || Date.now() - oculta < 60000 || !navigator.serviceWorker.controller) return;
    oculta = 0;
    registro?.update().catch(() => {});
    const [remota, e] = await Promise.all([leerRemota(), estado()]);
    if (!remota || !e?.activa || e.activa.version === remota.version) return;
    // Dentro de Rush no se recarga: se deja bajando (Rush también) y se aplica al salir y pulsar JUGAR
    if (document.querySelector('.slr')) { instalar(remota, e.rush ? ['app', 'rush'] : ['app'], { fondo: true }); return; }
    // En la Shits League, como al abrir: lo nuevo y una recarga rápida
    capa('Actualizando la app…');
    const res = await instalar(remota, ['app'], { ms: 8000 });
    if (res.ok) await activarYRecargar(remota.version);
    quitarCapa();
  });

  /* ── Al pulsar JUGAR ─────────────────────────────────────────────────────── */
  // Resuelve { ok: true } si se puede entrar en Rush (con la versión de version.json) o
  // { ok: false, mensaje }. Si hay que recargar (la Shits League también era vieja), recarga
  // y entra sola después (sessionStorage SL_ENTRAR_RUSH): la promesa no se resuelve.
  async function prepararRush(alProgreso, intento = 0) {
    const ctrl = navigator.serviceWorker.controller;
    // Sin worker al mando (la primera visita): por la red, y Rush se guarda en cuanto lo haya
    if (!ctrl) { rushPedido = true; return { ok: true }; }
    const [remota, e] = await Promise.all([leerRemota(), estado()]);
    // Si algo no cuadra con su huella porque a mitad se ha publicado otra versión: a por esa
    const otraVez = async res => {
      if (res.huella && intento < 2) {
        const r2 = await leerRemota();
        if (r2 && r2.version !== remota.version) return prepararRush(alProgreso, intento + 1);
      }
      return fallo(res);
    };
    if (!e) return { ok: true };                     // un worker antiguo
    if (!remota) {
      // Sin red: con lo que haya, si está entero
      return e.activa && e.rush ? { ok: true } : { ok: false, mensaje: 'Sin conexión: hace falta red para descargar Rush la primera vez' };
    }
    if (!e.activa || e.activa.version !== remota.version) {
      const res = await instalar(remota, ['app', 'rush'], { alProgreso });
      if (!res.ok) return otraVez(res);
      try { sessionStorage.setItem('SL_ENTRAR_RUSH', '1'); } catch { /* */ }
      await activarYRecargar(remota.version);
      return { ok: false, mensaje: 'No se pudo aplicar la versión nueva' };
    }
    if (!e.app) { reparar({ auto: true, entrarRush: true }); await new Promise(() => {}); }
    if (!e.rush) {
      const res = await instalar(remota, ['rush'], { alProgreso });
      if (!res.ok) return otraVez(res);
    }
    return { ok: true };
  }
  function fallo(res) {
    if (res.huella) reparar({ auto: true, entrarRush: true });
    return { ok: false, mensaje: res.huella ? 'Reparando la app…' : 'No se pudo descargar Rush: revisa la conexión' };
  }

  /* ── Reparar: borrar las cachés de código e instalarlo todo de nuevo ─────── */
  const CLAVE_REPARADA = 'SL_REPARADA';
  function unaVez(clave, ms) {
    try {
      if (Date.now() - Number(sessionStorage.getItem(clave) || 0) < ms) return false;
      sessionStorage.setItem(clave, String(Date.now()));
    } catch { /* sin sessionStorage: se intenta igual */ }
    return true;
  }
  let reparando = null;
  function reparar({ auto = false, entrarRush = false } = {}) {
    if (reparando) return reparando;
    // Sola, como mucho una vez cada 5 minutos (nada de bucles); a mano, siempre
    if (auto && !unaVez(CLAVE_REPARADA, 300000)) return Promise.resolve(false);
    return (reparando = (async () => {
      capa('Reparando la app…');
      const ctrl = navigator.serviceWorker.controller;
      const antes = await estado();
      await preguntar(ctrl, { tipo: 'reparar' }, 15000);
      const remota = await leerRemota(15000);
      if (remota && ctrl) {
        const partes = antes?.rush || entrarRush ? ['app', 'rush'] : ['app'];
        const res = await instalar(remota, partes, { alProgreso: d => capaProgreso(d) });
        if (res.ok) {
          if (entrarRush) try { sessionStorage.setItem('SL_ENTRAR_RUSH', '1'); } catch { /* */ }
          await activarYRecargar(remota.version);
        }
      }
      // Sin red o sin worker: se recarga igual (vuelve a pedirlo todo a la red)
      recargando = true;
      location.reload();
      return true;
    })());
  }
  // Un error al arrancar el código (un archivo roto en la caché): se repara sola
  let arrancada = false;
  document.addEventListener('sl:cargada', () => { arrancada = true; }, { once: true });
  window.addEventListener('error', e => {
    if (arrancada || !navigator.serviceWorker.controller) return;
    const archivo = e.filename || e.target?.src || e.target?.href || '';
    if (archivo.startsWith(new URL('./', document.baseURI).href)) reparar({ auto: true });
  }, true);

  /* ── Actualización forzada (el servidor ya no entiende el código guardado) ── */
  // PGRST202: la función no existe (o ya no tiene esos parámetros); PGRST200/204: la
  // relación o la columna no existe; 42883 / 42703: función o columna inexistente en Postgres
  function esErrorDeVersion(status, datos) {
    const codigo = String(datos?.code ?? '');
    return ['PGRST202', 'PGRST200', 'PGRST204', '42883', '42703'].includes(codigo) || (status === 404 && /function|función/i.test(datos?.message ?? ''));
  }
  const CLAVE_FORZADA = 'SL_ACTUALIZACION_FORZADA';
  async function forzarActualizacion() {
    if (recargando) return false;
    if (!unaVez(CLAVE_FORZADA, 120000)) return false;
    capa('Actualizando la app…');
    const lento = setTimeout(capaReintentar, 15000);
    const ctrl = navigator.serviceWorker.controller;
    const remota = await leerRemota(15000);
    const e = await estado();
    if (remota && ctrl && e?.activa?.version !== remota.version) {
      const res = await instalar(remota, e?.rush ? ['app', 'rush'] : ['app'], { alProgreso: d => capaProgreso(d) });
      clearTimeout(lento);
      if (res.ok) await activarYRecargar(remota.version);
      capaReintentar();
      return false;
    }
    // Sin versión nueva que aplicar (o sin worker): se recarga igual
    clearTimeout(lento);
    recargando = true;
    location.reload();
    return true;
  }

  /* ── La versión instalada, a la vista (pie y Perfil de Rush) ─────────────── */
  const FECHA = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // raiz: donde buscar, además de la página (Rush pinta cada pantalla antes de ponerla)
  async function pintarEtiqueta(raiz) {
    if (!instalada && navigator.serviceWorker.controller) await estado();
    const texto = instalada
      ? `Versión ${instalada.commit} · ${FECHA.format(new Date(instalada.fecha))}`
      : 'Versión sin instalar (por la red)';
    for (const el of [...document.querySelectorAll('[data-version-app]'), ...(raiz?.querySelectorAll('[data-version-app]') ?? [])]) el.textContent = texto;
  }
  SLVersion.pintarEtiqueta = pintarEtiqueta;
  document.addEventListener('sl:cargada', () => setTimeout(pintarEtiqueta, 2000), { once: true });
  // «Reparar la app», donde esté (pie de la Shits League y Perfil de Rush)
  document.addEventListener('click', e => {
    if (!e.target.closest?.('[data-reparar-app]')) return;
    if (confirm('¿Reparar la app? Se borra lo descargado y se vuelve a descargar todo (la sesión y tus datos no se tocan).')) reparar({ entrarRush: !!document.querySelector('.slr') });
  });

  /* ── La capa «Actualizando la app…» / «Reparando la app…» ────────────────── */
  function capa(texto) {
    let el = document.getElementById('versionActualizando');
    if (!el) {
      el = document.createElement('div');
      el.id = 'versionActualizando';
      el.className = 'version-actualizando';
      el.setAttribute('role', 'status');
      el.innerHTML = '<span class="version-actualizando__giro" aria-hidden="true"></span><p class="version-actualizando__texto"></p><p class="version-actualizando__pct"></p>';
      (document.body ?? document.documentElement).appendChild(el);
    }
    el.querySelector('.version-actualizando__texto').textContent = texto;
  }
  function capaProgreso(d) {
    const p = document.querySelector('#versionActualizando .version-actualizando__pct');
    if (p && d.totalBytes) p.textContent = `${Math.min(100, Math.round(100 * d.bytes / d.totalBytes))} %`;
  }
  function quitarCapa() { if (!recargando && !reparando) document.getElementById('versionActualizando')?.remove(); }
  // Tarda demasiado: un mensaje claro y «Reintentar»
  function capaReintentar() {
    const el = document.getElementById('versionActualizando');
    if (!el || el.querySelector('.version-actualizando__reintentar')) return;
    el.insertAdjacentHTML('beforeend', '<p class="version-actualizando__nota">Está tardando más de lo normal. Comprueba la conexión.</p>' +
      '<button type="button" class="version-actualizando__reintentar">Reintentar</button>');
    el.querySelector('.version-actualizando__reintentar').addEventListener('click', () => {
      el.querySelector('.version-actualizando__nota')?.remove();
      el.querySelector('.version-actualizando__reintentar')?.remove();
      try { sessionStorage.removeItem(CLAVE_FORZADA); } catch { /* */ }
      forzarActualizacion();
    });
  }
})();
