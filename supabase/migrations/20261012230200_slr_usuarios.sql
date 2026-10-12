-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — usuarios (paso 2)
-- GENERADO por supabase/seed/generar-usuarios.mjs: no editar a mano.
-- Los 18 jugadores de Shits League (hash del código y foto de js/session.js) y
-- dos bots de prueba. Solo hashes SHA-256: los códigos en claro no están aquí.
-- ═══════════════════════════════════════════════════════════════════════════

with datos (nombre, avatar_url, codigo_hash, es_bot) as (
  values
    ('Marcos', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/DALL_E_2022-08-29_14.48.06_-_A_Capibara_DJ_in_a_discotheque_ezgybe.png', '52e617dd6d2f75cb3bd76ca2eced4c582d83b6198ceb13a2ba6f6239164e51d2', false),
    ('Alberto', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/pepe-bordalas-efe_ti5q4z.jpg', '6ad5b293d45a59fb605bb5555c2f1abb80463cacd7046dee9fbd161fa0c3eb9e', false),
    ('Puebla', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741814/IMG_20220617_204510_tdek5a.jpg', 'a662bf96c60de6f68c3772bf36a5d922b2ff6d039d776fe1abafc65a8327785b', false),
    ('Carlos', null, '0d0b9410216b3406881bddffcefd6babb1f96aa19719769e8ae63eed86e24444', false),
    ('David', null, '23c069f629c80803552eb3e0f10a5481b1a41d09ddb7199d010accd1905c4bca', false),
    ('Enzo', null, '26c0b5509c547b71161a295bbd759fcb6b2ec0fb776af9b2600943ceb163c82c', false),
    ('Fernando', null, '43745fe52a3546971a01544920739623969434c9f9beaca11e8100d5ffd37f4c', false),
    ('Gonzalo', null, '173cd8246dfac4269ee0e673f26756a03501ee2ccf7400bf7479f491c31b3111', false),
    ('Hugo', null, '2b72d3756802cffd53fad1e07da805e541294bf4d03f35bea19ed1d4ac10d3d6', false),
    ('Nacho', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240508-WA0010_booqhn.jpg', '38579e0cb7462626ac97dce05058c92b1533d77e0f28ae984d52917f4fb7b8e0', false),
    ('Javier', null, 'a3d6d6994972d54c31de9c8e9a75b7412fbabd884ff93bfa17da4025f75c9644', false),
    ('Jorge', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/IMG-20240621-WA0008_mbjgmj.jpg', '45d09ae39c7cadf013dc1e6b8ec35cc61cae18c855110fbc04e724af62cdce8f', false),
    ('Luis', null, '85eb7d8e2ed8c2bef9c0fdd1834d8432ca86abe82f03bd170ed557a3503d4089', false),
    ('Mateo', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791749321/apps.56233.14149010387777920.1f9829d6-41d4-4e5f-9e1d-eca24b9a3e17_fkoiil.png', '373286b822b86542cdb57ef5d2920e6988e6846f38bf733ac978ae4a730252f7', false),
    ('Nicolás', 'https://res.cloudinary.com/dnd3g3zgm/image/upload/v1791741813/Captura_de_pantalla_2024-06-15_232610_jk5vm4.jpg', 'e76a092c92cc697a7f9b0783f6f00f8ec845f1d284f72d6f28da44ad02102013', false),
    ('Pablo', null, '88180852b6a0cfcd3094d1794f63892b4d0918defac49b3f3f6e8ffb51d0dbd2', false),
    ('Pelayo', null, '7b3762adf5389fc70848e60c00208af6768bd03877bc199549aec5254737d753', false),
    ('Víctor', null, '327bef5f4505da8ef5b97fed057a33a6c4376efc9b07daee6086cbe69f202af7', false),
    ('Bot Uno', null, '16dfaad22df2e466a25205ae654100799d2d799ff5c36774456f2b876ded766d', true),
    ('Bot Dos', null, '97dc14e284504fe59d6cf0ec764005c4c80e47aa4a775037a83aa935a7c526fc', true)
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
