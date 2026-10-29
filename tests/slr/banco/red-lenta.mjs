// Proxy HTTP local que simula una red de móvil para TODO el navegador (la página y el
// service worker por igual; la emulación de red de CDP solo frena la página).
//   const red = await redLenta({ rtt: 150, bajada: 1.6e6, subida: 750e3 });
//   chromium.launch({ proxy: { server: red.url, bypass: '<-loopback>' } })
// · Cada trozo que pasa espera medio RTT en su sentido: cada petición cuesta un RTT y
//   el TLS de una conexión nueva, los suyos (va por un túnel CONNECT, de verdad).
// · El ancho de banda (bits/s) se reparte entre todas las conexiones, en orden.
// · Lo de localhost (la web) se sirve con las cabeceras de caché de GitHub Pages
//   (Cache-Control: max-age=600), para que el navegador se porte como en producción.
// · red.offline = true: rechaza todo (sin conexión).
// · red.retener = ruta => promesa | null: esa petición de la web espera a la promesa (para
//   probar descargas que se quedan colgadas o cosas que pasan a mitad).
// · red.cdnViejo = Map(ruta → contenido): como la caché de GitHub Pages (Fastly) justo después
//   de un despliegue: una URL SIN parámetros de esas rutas devuelve lo de antes (con
//   parámetros, como ?v=… o ?t=…, es otra URL para la caché: llega lo nuevo).
// · red.cacheWeb = 'no-cache': lo que se sirva desde ahí, el navegador lo tiene que
//   revalidar cada vez (como pasados los 10 minutos de GitHub Pages).
import http from 'node:http';
import net from 'node:net';

const tipoDe = p => ({ js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', png: 'image/png' })[p.split('.').pop()] ?? 'application/octet-stream';

export async function redLenta({ rtt = 150, bajada = 1.6e6, subida = 750e3, cacheWeb = 'max-age=600' } = {}) {
  const libre = { bajada: 0, subida: 0 };
  // offline = true corta también las conexiones ya abiertas (un túnel abierto seguiría funcionando)
  const abiertas = new Set();
  let sinRed = false;
  const red = {
    url: '', cacheWeb, retener: null, cdnViejo: new Map(),
    get offline() { return sinRed; },
    set offline(v) { sinRed = !!v; if (sinRed) { for (const s of abiertas) s.destroy(); abiertas.clear(); } },
  };
  // (una conexión que se reutiliza para varias peticiones se vigila una sola vez)
  const vigilar = s => { if (abiertas.has(s)) return; abiertas.add(s); s.once('close', () => abiertas.delete(s)); };
  // Hora a la que sale un trozo de n bytes en ese sentido para ese canal (respeta el orden del canal)
  const turno = (sentido, n, canal) => {
    const ahora = Date.now();
    const bps = sentido === 'bajada' ? bajada : subida;
    libre[sentido] = Math.max(ahora, libre[sentido]) + (n * 8 * 1000) / bps;
    const sale = Math.max(libre[sentido] + rtt / 2, canal.ultimo ?? 0);
    canal.ultimo = sale;
    return sale - ahora;
  };
  // Copia de origen a destino a la velocidad de la red, en trozos de 16 KB y EN ORDEN
  // (una cola por canal: dos temporizadores que vencen a la vez no garantizan su orden)
  const canalizar = (origen, destino, sentido) => {
    const canal = { cola: Promise.resolve() };
    const encolar = (sale, hacer) => {
      canal.cola = canal.cola.then(() => new Promise(r => setTimeout(r, Math.max(0, sale - Date.now())))).then(hacer);
    };
    origen.on('data', trozo => {
      for (let i = 0; i < trozo.length; i += 16384) {
        const parte = trozo.subarray(i, i + 16384);
        encolar(Date.now() + turno(sentido, parte.length, canal), () => { if (!destino.destroyed) destino.write(parte); });
      }
    });
    origen.on('end', () => encolar(Date.now() + turno(sentido, 0, canal), () => destino.end()));
    origen.on('error', () => destino.destroy());
  };

  const servidor = http.createServer((pet, res) => {
    vigilar(pet.socket);
    if (red.offline) { res.socket.destroy(); return; }
    // Petición normal (la web en localhost): se reenvía y la respuesta baja frenada
    const destino = new URL(pet.url);
    const viejo = destino.search ? undefined : red.cdnViejo.get(decodeURIComponent(destino.pathname));
    if (viejo !== undefined && ['localhost', '127.0.0.1'].includes(destino.hostname)) {
      setTimeout(() => { res.writeHead(200, { 'content-type': tipoDe(destino.pathname), 'cache-control': red.cacheWeb, 'x-cache': 'HIT (viejo)' }); res.end(viejo); }, rtt);
      return;
    }
    const espera = red.retener?.(destino.pathname);
    if (espera) { espera.then(() => servidor.emit('request', pet, res)); return; }
    const salida = http.request({ host: destino.hostname, port: destino.port || 80, path: destino.pathname + destino.search, method: pet.method,
      headers: { ...pet.headers, host: destino.host } }, r => {
      const cab = { ...r.headers };
      delete cab['content-disposition'];   // `serve` pone ahí el nombre con tildes sin codificar
      if (['localhost', '127.0.0.1'].includes(destino.hostname) && r.statusCode === 200) cab['cache-control'] = red.cacheWeb;
      setTimeout(() => {
        try { res.writeHead(r.statusCode, cab); } catch { res.destroy(); return; }
        canalizar(r, res, 'bajada');
      }, rtt / 2);
    });
    salida.on('error', () => res.destroy());
    setTimeout(() => canalizar(pet, salida, 'subida'), rtt / 2);
  });
  // HTTPS (Supabase, Cloudinary, Google…): túnel con la red frenada en los dos sentidos
  servidor.on('connect', (pet, cliente, cabeza) => {
    if (red.offline) { cliente.destroy(); return; }
    vigilar(cliente);
    const [host, puerto] = pet.url.split(':');
    const remoto = net.connect(Number(puerto) || 443, host, () => {
      setTimeout(() => {
        cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (cabeza?.length) remoto.write(cabeza);
        canalizar(cliente, remoto, 'subida');
        canalizar(remoto, cliente, 'bajada');
      }, rtt);
    });
    vigilar(remoto);
    remoto.on('error', () => cliente.destroy());
    cliente.on('error', () => remoto.destroy());
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  red.url = `http://127.0.0.1:${servidor.address().port}`;
  red.cerrar = () => new Promise(r => { servidor.closeAllConnections?.(); servidor.close(() => r()); });
  return red;
}
