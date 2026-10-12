// Genera la migración de usuarios de SLR:
//   · los 18 jugadores de Shits League, con el hash de su código y su foto,
//     leídos de js/session.js (JUGADORES_CODIGOS y JUGADORES_FOTOS);
//   · bots de prueba ("Bot Uno", "Bot Dos" y, en una migración posterior,
//     "Bot Tres") con códigos aleatorios.
//
//   node supabase/seed/generar-usuarios.mjs
//
// Los códigos EN CLARO de los bots solo se guardan en .env.local (ignorado por
// git). Si ya existen allí, se reutilizan; a la migración solo van los hashes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const raiz = new URL('../../', import.meta.url);
const ruta = p => new URL(p, raiz);
const MIGRACION = 'supabase/migrations/20261012230200_slr_usuarios.sql';
// Los bots añadidos después van en su propia migración: las ya aplicadas no se tocan
const MIGRACION_BOT_TRES = 'supabase/migrations/20261013000000_slr_bot_tres.sql';

// ── Jugadores desde js/session.js ──────────────────────────────────────────
const session = readFileSync(ruta('js/session.js'), 'utf8');
const bloque = nombre => {
  const i = session.indexOf(`const ${nombre}`);
  if (i < 0) throw new Error(`No encuentro ${nombre} en js/session.js`);
  return session.slice(i, session.indexOf('};', i) + 2);
};
const codigos = [...bloque('JUGADORES_CODIGOS').matchAll(/"([0-9a-f]{64})":\s*"([^"]+)"/g)]
  .map(m => ({ hash: m[1], nombre: m[2] }));
const fotos = Object.fromEntries(
  [...bloque('JUGADORES_FOTOS').matchAll(/"([^"]+)":\s*"([^"]*)"/g)].map(m => [m[1], m[2]])
);
if (codigos.length !== 18) throw new Error(`Esperaba 18 jugadores y hay ${codigos.length}`);

// ── Bots: códigos en .env.local ────────────────────────────────────────────
const envRuta = ruta('.env.local');
let env = existsSync(envRuta) ? readFileSync(envRuta, 'utf8') : '';
const leerVar = k => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const BOTS = [
  { nombre: 'Bot Uno', variable: 'SLR_BOT_UNO_CODIGO', migracion: MIGRACION },
  { nombre: 'Bot Dos', variable: 'SLR_BOT_DOS_CODIGO', migracion: MIGRACION },
  { nombre: 'Bot Tres', variable: 'SLR_BOT_TRES_CODIGO', migracion: MIGRACION_BOT_TRES },
];
let nuevos = 0;
for (const bot of BOTS) {
  bot.codigo = leerVar(bot.variable);
  if (!bot.codigo) {
    bot.codigo = 'bot-' + randomBytes(12).toString('hex'); // 96 bits: no se puede adivinar
    env += `${env && !env.endsWith('\n') ? '\n' : ''}${bot.variable}=${bot.codigo}\n`;
    nuevos++;
  }
  bot.hash = createHash('sha256').update(bot.codigo.trim().toLowerCase()).digest('hex');
}
if (nuevos) writeFileSync(envRuta, env);

// ── SQL ────────────────────────────────────────────────────────────────────
const lit = v => (v ? `'${String(v).replace(/'/g, "''")}'` : 'null');
const filas = [
  ...codigos.map(c => ({ nombre: c.nombre, avatar: fotos[c.nombre] || null, hash: c.hash, bot: false })),
  ...BOTS.filter(b => b.migracion === MIGRACION).map(b => ({ nombre: b.nombre, avatar: null, hash: b.hash, bot: true })),
];

const sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — usuarios (paso 2)
-- GENERADO por supabase/seed/generar-usuarios.mjs: no editar a mano.
-- Los 18 jugadores de Shits League (hash del código y foto de js/session.js) y
-- dos bots de prueba. Solo hashes SHA-256: los códigos en claro no están aquí.
-- ═══════════════════════════════════════════════════════════════════════════

with datos (nombre, avatar_url, codigo_hash, es_bot) as (
  values
${filas.map(f => `    (${lit(f.nombre)}, ${lit(f.avatar)}, ${lit(f.hash)}, ${f.bot})`).join(',\n')}
),
nuevos as (
  insert into public.usuarios (nombre, avatar_url, es_bot)
  select d.nombre, d.avatar_url, d.es_bot from datos d
  on conflict (nombre) do update set avatar_url = excluded.avatar_url, es_bot = excluded.es_bot
  returning id, nombre
)
insert into public.codigos (usuario_id, codigo_hash)
select n.id, d.codigo_hash from nuevos n join datos d on d.nombre = n.nombre
on conflict (usuario_id) do update set codigo_hash = excluded.codigo_hash;
`;
writeFileSync(ruta(MIGRACION), sql);

// Bot Tres (paso 3)
const tres = BOTS.find(b => b.migracion === MIGRACION_BOT_TRES);
writeFileSync(ruta(MIGRACION_BOT_TRES), `-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — Bot Tres (paso 3)
-- GENERADO por supabase/seed/generar-usuarios.mjs: no editar a mano.
-- Tercer usuario de prueba. Solo el hash: el código en claro está en .env.local.
-- ═══════════════════════════════════════════════════════════════════════════

with nuevo as (
  insert into public.usuarios (nombre, avatar_url, es_bot)
  values (${lit(tres.nombre)}, null, true)
  on conflict (nombre) do update set es_bot = true
  returning id
)
insert into public.codigos (usuario_id, codigo_hash)
select id, ${lit(tres.hash)} from nuevo
on conflict (usuario_id) do update set codigo_hash = excluded.codigo_hash;
`);

console.log(`${MIGRACION}: ${codigos.length} jugadores (${Object.values(fotos).filter(Boolean).length} con foto) + 2 bots`);
console.log(`${MIGRACION_BOT_TRES}: Bot Tres`);
console.log(nuevos ? `Códigos nuevos de bots guardados en .env.local (${nuevos})` : 'Códigos de bots reutilizados de .env.local');
