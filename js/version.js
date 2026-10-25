/* ═══════════════════════════════════════════════
   SHITS LEAGUE — versión de la app (service worker)
   · Registra sw.js (sin caché HTTP para él ni para precarga.js: así se nota
     enseguida una lista nueva).
   · Versión nueva descargada → aviso discreto «Hay una versión nueva ·
     Actualizar»; si no se toca, se aplica la próxima vez que se abra la app.
   · SLVersion.rushListo(): ¿está la app entera en la caché? (la primera vez se
     descarga en segundo plano; Rush enseña una pantalla con el progreso).
   · SLVersion.forzarActualizacion(): si el código guardado es viejo y el
     servidor ya no lo entiende (una función de Supabase que ya no existe o ha
     cambiado), busca la versión nueva, la aplica y recarga. Como mucho una vez
     cada 2 minutos, para no entrar en bucle.
   Sin service worker (navegador viejo, modo privado…), todo funciona por la red.
═══════════════════════════════════════════════ */
(function () {
  const soportado = 'serviceWorker' in navigator;
  const oyentes = new Set();          // progreso de la precarga: { hechos, total, bytes, totalBytes } | { lista } | { error }
  let registro = null;
  let recargando = false;
  // Se resuelve cuando sw.js está registrado (se registra al terminar de cargar la página,
  // para no quitarle red): hasta entonces no se sabe si hay algo descargándose
  let alRegistrar;
  const registrado = new Promise(res => { alRegistrar = res; });

  const SLVersion = {
    // Progreso de la descarga (para la pantalla de Rush). Devuelve la función para dejar de oír.
    alProgreso(cb) { oyentes.add(cb); return () => oyentes.delete(cb); },
    rushListo,
    estado,
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
  // Al cambiar de versión (tras «Actualizar» o una actualización forzada): recargar una vez
  let controlAntes = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // La primera instalación también cambia de controlador: ahí no se recarga
    if (controlAntes && recargando) location.reload();
    controlAntes = true;
  });

  // Se registra al terminar de cargar la página (para no quitarle red); si se entra directo a
  // Rush, en cuanto está el HTML: Rush la necesita para funcionar
  const registrar = () => {
    if (registrar.hecho) return;
    registrar.hecho = true;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
      registro = r;
      alRegistrar(r);
      if (r.waiting && navigator.serviceWorker.controller) avisoVersionNueva(r.waiting);
      r.addEventListener('updatefound', () => {
        const nuevo = r.installing;
        nuevo?.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller && r.waiting === nuevo) avisoVersionNueva(nuevo);
        });
      });
      // Al volver a la app después de un rato, se mira si hay versión nueva
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); });
    }).catch(e => { alRegistrar(null); console.warn('[sw] No se pudo registrar:', e.message); });
  };
  if (location.hash === '#rush') document.addEventListener('DOMContentLoaded', registrar);
  window.addEventListener('load', registrar);

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
  // { lista: true } si la versión que manda en la página está entera en la caché;
  // si no, { lista: false, progreso } (se está descargando)
  async function estado() {
    if (!soportado) return { lista: true };
    const ctrl = await preguntar(navigator.serviceWorker.controller);
    if (ctrl?.completa) return { lista: true, rush: ctrl.rush };
    const r = registro ?? await registrado;
    const instalando = r?.installing ?? (!navigator.serviceWorker.controller ? r?.waiting : null);
    if (instalando) {
      const e = await preguntar(instalando);
      // Lo que necesita Rush ya está (aunque lo demás siga bajando en segundo plano)
      if (e?.critico) return { lista: true, rush: e.rush };
      return { lista: false, progreso: e?.progreso ?? null };
    }
    // Sin nada que descargar (o sin poder registrarse): se sigue por la red
    return { lista: true, rush: ctrl?.rush ?? null };
  }

  // Espera a que la app esté entera en la caché. Con alProgreso, avisa mientras tanto.
  // Si la descarga falla, no se bloquea: se sigue por la red.
  async function rushListo() {
    if (!soportado) return true;
    const e = await estado();
    if (e.lista) return true;
    return new Promise(res => {
      const listo = () => { quitar(); navigator.serviceWorker.removeEventListener('controllerchange', alControl); res(true); };
      const quitar = SLVersion.alProgreso(d => { if (d.critico || d.lista || d.error) listo(); });
      const alControl = () => listo();
      navigator.serviceWorker.addEventListener('controllerchange', alControl);
    });
  }

  /* ── Aviso «Hay una versión nueva · Actualizar» ─────────────────────────── */
  function avisoVersionNueva(sw) {
    if (document.getElementById('versionNueva')) return;
    const el = document.createElement('div');
    el.id = 'versionNueva';
    el.className = 'version-nueva';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>Hay una versión nueva</span><button type="button">Actualizar</button>';
    el.querySelector('button').addEventListener('click', () => {
      el.querySelector('button').disabled = true;
      el.querySelector('span').textContent = 'Actualizando…';
      recargando = true;
      sw.postMessage({ tipo: 'activar' });
    });
    document.body.appendChild(el);
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
    const r = registro ?? await registrado;
    if (!r) return false;
    capaActualizando();
    await r.update().catch(() => {});
    // Espera a que la versión nueva esté descargada (como mucho 60 s)
    const nuevo = r.installing ?? r.waiting;
    if (nuevo && nuevo.state !== 'installed') {
      await new Promise(res => {
        const t = setTimeout(res, 60000);
        nuevo.addEventListener('statechange', () => { if (nuevo.state === 'installed' || nuevo.state === 'activated' || nuevo.state === 'redundant') { clearTimeout(t); res(); } });
      });
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
    el.innerHTML = '<span class="version-actualizando__giro" aria-hidden="true"></span><p>Actualizando Shits League…</p>';
    document.body.appendChild(el);
  }
})();
