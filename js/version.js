/* ═══════════════════════════════════════════════
   SHITS LEAGUE — versión de la app (service worker)
   · Registra sw.js cuando la Shits League ya ha cargado (evento «sl:cargada» de
     app.js): su descarga no compite con lo que se está viendo. Sin caché HTTP
     para él ni para precarga.js: así se nota enseguida una lista nueva.
   · Versiones nuevas: se descargan en segundo plano y se aplican solas la
     próxima vez que se abre la app (antes de arrancar, con una recarga), sin
     preguntar ni avisar. Nunca a mitad de una descarga de Rush.
   · Rush NO se descarga con la app: SLVersion.descargarRush() lo pide al pulsar
     JUGAR (la primera vez, o la primera tras una versión nueva de Rush), con el
     progreso real. Si Rush ya estaba descargado y hay versión nueva, se pone al
     día solo, en segundo plano y despacio.
   · SLVersion.forzarActualizacion(): si el código guardado es viejo y el
     servidor ya no lo entiende (una función de Supabase que ya no existe o ha
     cambiado), pantalla «Actualizando la app…», busca la versión nueva, la
     aplica y recarga. A los 15 s sin terminar, un mensaje con «Reintentar».
     Sola, como mucho una vez cada 2 minutos, para no entrar en bucle.
   Sin service worker (navegador viejo, modo privado…), todo funciona por la red.
═══════════════════════════════════════════════ */
(function () {
  const soportado = 'serviceWorker' in navigator;
  const oyentes = new Set();          // mensajes del service worker ({ tipo: 'precarga', version, … })
  let registro = null;
  let recargando = false;

  const SLVersion = {
    // Antes de arrancar la app: si hay una versión nueva esperando, se aplica (y la página se
    // recarga: esta promesa no se resuelve nunca). Si no, se resuelve enseguida
    alArrancar: Promise.resolve(),
    estado,
    descargarRush,
    forzarActualizacion,
    // Lo que dice el servidor y la marca como «la versión está vieja»
    esErrorDeVersion,
  };
  window.SLVersion = SLVersion;
  if (!soportado) return;

  // Mensajes del service worker (también antes de controlar la página)
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.tipo !== 'precarga') return;
    for (const cb of oyentes) { try { cb(e.data); } catch (err) { console.error(err); } }
  });
  navigator.serviceWorker.startMessages?.();
  // Al aplicar una versión (al abrir o en una actualización forzada): recargar una vez
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargando) location.reload(); });

  // Pregunta a un service worker cómo está su caché (null si no contesta: el antiguo no sabe)
  function preguntar(sw, ms = 1500) {
    return new Promise(res => {
      if (!sw) { res(null); return; }
      const canal = new MessageChannel();
      const t = setTimeout(() => res(null), ms);
      canal.port1.onmessage = e => { clearTimeout(t); res(e.data); };
      sw.postMessage({ tipo: 'estado' }, [canal.port2]);
    });
  }
  // { version, completa, rush: { lista, descargando, progreso, anterior } } del que manda, o null
  function estado() {
    return preguntar(navigator.serviceWorker.controller);
  }

  /* ── Versión nueva esperando: se aplica al abrir la app ──────────────────── */
  const CLAVE_APLICADA = 'SL_VERSION_APLICADA';
  SLVersion.alArrancar = (async () => {
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) return;
    const r = await Promise.race([navigator.serviceWorker.getRegistration(), new Promise(res => setTimeout(res, 500))]).catch(() => null);
    if (!r?.waiting) return;
    // Si hay una descarga de Rush en marcha (otra pestaña), termina antes; se aplica la próxima vez
    const e = await preguntar(ctrl, 300);
    if (e?.rush?.descargando) return;
    try {
      // Una vez por minuto como mucho: si algo falla, sin bucles de recargas
      if (Date.now() - Number(sessionStorage.getItem(CLAVE_APLICADA) || 0) < 60000) return;
      sessionStorage.setItem(CLAVE_APLICADA, String(Date.now()));
    } catch { /* sin sessionStorage: se intenta igual */ }
    // Se recarga cuando la nueva ya manda (controllerchange). El navegador puede tardar un poco en
    // activarla (p. ej. con fotos aún bajando por el worker viejo): se espera a que esté activa, y
    // si en 8 s no lo está, la app arranca como está (sin recargar luego a mitad de uso)
    const nuevo = r.waiting;
    recargando = true;
    const activa = new Promise(res => {
      if (nuevo.state === 'activated') res(true);
      nuevo.addEventListener('statechange', () => { if (nuevo.state === 'activated') res(true); if (nuevo.state === 'redundant') res(false); });
      setTimeout(() => res(false), 8000);
    });
    nuevo.postMessage({ tipo: 'activar' });
    if (await activa) {
      setTimeout(() => location.reload(), 1000);   // por si no llega controllerchange
      await new Promise(() => {});                   // la app no arranca: se va a recargar
    }
    recargando = false;
  })().catch(() => {});

  /* ── Registro (cuando la Shits League ya ha cargado) ─────────────────────── */
  let alRegistrar;
  const registrado = new Promise(res => { alRegistrar = res; });
  function registrar() {
    if (registrar.hecho) return registrado;
    registrar.hecho = true;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
      registro = r;
      alRegistrar(r);
      ponerRushAlDia();
      // Al volver a la app después de un rato, se mira si hay versión nueva (nunca a mitad de
      // una descarga de Rush: la nueva, en todo caso, esperaría)
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible' || descargando) return;
        r.update().catch(() => {});
      });
    }).catch(e => { alRegistrar(null); console.warn('[sw] No se pudo registrar:', e.message); });
    return registrado;
  }
  const enRatoLibre = f => (window.requestIdleCallback ?? (g => setTimeout(g, 500)))(f, { timeout: 3000 });
  document.addEventListener('sl:cargada', () => enRatoLibre(registrar), { once: true });
  // Por si la Shits League no llega a avisar (sin conexión con Sheets…)
  window.addEventListener('load', () => setTimeout(() => enRatoLibre(registrar), 15000), { once: true });

  // Rush estaba descargado y ha llegado una versión nueva que no lo trae entero: se pone al día
  // en segundo plano y despacio (sin esperar a JUGAR, que entonces entra directo)
  async function ponerRushAlDia() {
    const e = await estado();
    if (e?.rush?.anterior && !e.rush.descargando) navigator.serviceWorker.controller?.postMessage({ tipo: 'descargarRush', fondo: true });
  }

  /* ── Rush: se descarga al pulsar JUGAR ───────────────────────────────────── */
  // Resuelve true cuando Rush está entero en la caché; false si no hay service worker al
  // mando o la descarga falla (Rush entra igual, por la red). alProgreso({ bytes, totalBytes })
  let descargando = false;
  // JUGAR antes de que el service worker mande en la página (la primera visita): Rush entra por la
  // red y, en cuanto lo hay, se guarda en segundo plano (ya se ha pedido: la próxima, directo)
  let rushPedido = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (rushPedido && !recargando) navigator.serviceWorker.controller?.postMessage({ tipo: 'descargarRush', fondo: true });
  });
  async function descargarRush(alProgreso) {
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) { rushPedido = true; return false; }
    const e = await preguntar(ctrl);
    if (!e?.rush) return false;
    if (e.rush.lista) return true;
    descargando = true;
    return new Promise(res => {
      let ultimo = Date.now();
      const fin = ok => { clearInterval(vigia); oyentes.delete(oir); descargando = false; res(ok); };
      const oir = d => {
        if (d.version !== e.version || !d.rush) return;
        ultimo = Date.now();
        if (d.rush.lista) fin(true);
        else if (d.rush.error) fin(false);
        else alProgreso?.(d.rush);
      };
      oyentes.add(oir);
      // Si el navegador para el service worker a mitad, se le vuelve a pedir: sigue donde iba
      const vigia = setInterval(async () => {
        if (Date.now() - ultimo < 15000) return;
        ultimo = Date.now();
        const ahora = await preguntar(ctrl);
        if (ahora?.rush?.lista) fin(true);
        else ctrl.postMessage({ tipo: 'descargarRush' });
      }, 5000);
      if (e.rush.progreso) alProgreso?.(e.rush.progreso);
      ctrl.postMessage({ tipo: 'descargarRush' });
    });
  }

  /* ── Actualización forzada ──────────────────────────────────────────────── */
  // PGRST202: la función no existe (o ya no tiene esos parámetros); PGRST200/204: la
  // relación o la columna no existe; 42883 / 42703: función o columna inexistente en Postgres
  function esErrorDeVersion(status, datos) {
    const codigo = String(datos?.code ?? '');
    return ['PGRST202', 'PGRST200', 'PGRST204', '42883', '42703'].includes(codigo) || (status === 404 && /function|función/i.test(datos?.message ?? ''));
  }
  const CLAVE = 'SL_ACTUALIZACION_FORZADA';
  async function forzarActualizacion() {
    if (!soportado || recargando) return false;
    try {
      const antes = Number(sessionStorage.getItem(CLAVE) || 0);
      if (Date.now() - antes < 120000) return false;
      sessionStorage.setItem(CLAVE, String(Date.now()));
    } catch { /* sin sessionStorage: se intenta igual */ }
    capaActualizando();
    const lento = setTimeout(capaReintentar, 15000);
    const r = registro ?? await registrar();
    if (!r) { clearTimeout(lento); capaReintentar(); return false; }
    await r.update().catch(() => {});
    // Espera a que la versión nueva esté descargada (a los 15 s, «Reintentar»; sigue esperando)
    const nuevo = r.installing ?? r.waiting;
    if (nuevo && nuevo.state !== 'installed') {
      const ok = await new Promise(res => {
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' || nuevo.state === 'activated') res(true);
          if (nuevo.state === 'redundant') res(false);
        });
      });
      if (!ok) { clearTimeout(lento); capaReintentar(); return false; }
    }
    recargando = true;
    if (r.waiting) {
      r.waiting.postMessage({ tipo: 'activar' });
      setTimeout(() => location.reload(), 4000);   // por si no llega controllerchange
    } else {
      // No hay versión nueva que esperar: se recarga igual (vuelve a pedir todo lo que haga falta)
      location.reload();
    }
    return true;
  }
  function capaActualizando() {
    if (document.getElementById('versionActualizando')) return;
    const el = document.createElement('div');
    el.id = 'versionActualizando';
    el.className = 'version-actualizando';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="version-actualizando__giro" aria-hidden="true"></span><p>Actualizando la app…</p>';
    document.body.appendChild(el);
  }
  // Tarda demasiado (o ha fallado): un mensaje claro y «Reintentar» (vuelve a buscar la versión
  // nueva, espera a que esté y recarga)
  function capaReintentar() {
    const el = document.getElementById('versionActualizando');
    if (!el || el.querySelector('.version-actualizando__reintentar')) return;
    el.insertAdjacentHTML('beforeend', '<p class="version-actualizando__nota">Está tardando más de lo normal. Comprueba la conexión.</p>' +
      '<button type="button" class="version-actualizando__reintentar">Reintentar</button>');
    el.querySelector('button').addEventListener('click', () => {
      el.querySelector('.version-actualizando__nota')?.remove();
      el.querySelector('.version-actualizando__reintentar')?.remove();
      try { sessionStorage.removeItem(CLAVE); sessionStorage.removeItem(CLAVE_APLICADA); } catch { /* */ }
      forzarActualizacion();
    });
  }
})();
