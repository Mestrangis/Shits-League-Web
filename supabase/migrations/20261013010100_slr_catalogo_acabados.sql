-- ═══════════════════════════════════════════════════════════════════════════
-- SHITS LEAGUE RUSH — acabados del catálogo BETA
-- GENERADO por supabase/seed/generar-catalogo.mjs (semilla 20261013): no editar a mano.
-- 26 diseños con acabado especial para poder probar la interfaz; el resto, normal.
-- ═══════════════════════════════════════════════════════════════════════════

update public.disenos_carta d set acabado = v.acabado::public.acabado_carta
from (values
  ('2afd6b46-fa1c-457b-aa1c-d35d5a6010ae'::uuid, 'plateada'),  -- individual: Borja Mora
  ('093b703e-536c-4d58-9204-0d0056b68473'::uuid, 'brillante'),  -- individual: Roberto Peña
  ('2297a78a-d30b-4f32-95ce-c3da6a45b9f0'::uuid, 'plateada'),  -- individual: Guillermo Pastor
  ('66abbd32-92d6-4e19-a2b2-40462198e5ef'::uuid, 'brillante'),  -- individual: Rodrigo Rivas
  ('941c593e-30f8-4bbf-bc53-171270beb718'::uuid, 'foil'),  -- individual: Kike Aguado
  ('482fde07-4ed1-4603-8cab-8b7f4032e22c'::uuid, 'foil'),  -- individual: Manu Reyes
  ('44685097-f208-4d8b-9533-3f9d79c214e5'::uuid, 'brillante'),  -- individual: Cohete
  ('c7055c2b-874c-4f2a-afd9-6b5d9e92e7ed'::uuid, 'plateada'),  -- individual: Germán Prieto
  ('c8be8e34-dac3-43b0-91b2-8d562ac71d02'::uuid, 'foil'),  -- individual: Bruno Molina
  ('fb2a2e19-42ca-4272-bbc4-81ded037e53d'::uuid, 'foil'),  -- individual: El Tanque
  ('15b064a4-770f-4b8c-8c82-7d40d04b3b1e'::uuid, 'foil'),  -- duo: La Dupla Cohete
  ('04b454a8-a4a3-4e72-ade3-726e680ce069'::uuid, 'foil'),  -- duo: Los Primos Campos
  ('75952f24-68f3-4611-9f58-611df70997dc'::uuid, 'foil'),  -- duo: Los Gemelos Benítez
  ('ee5ac8ca-290d-4f1b-bd9e-4837298fb3c5'::uuid, 'plateada'),  -- duo: Esteve y Rojas
  ('d507bb62-d932-40f7-88b8-6fe78d28fe50'::uuid, 'foil'),  -- duo: Los Gemelos Ibáñez
  ('1ab9a556-84a6-4847-aa0f-ae637b89abe6'::uuid, 'plateada'),  -- duo: Vidal y Lorente
  ('a2dd90bf-b853-4f54-bdea-26e8759061ed'::uuid, 'foil'),  -- duo: Los Primos Santana
  ('d4c96452-9c83-4589-9d44-ce69e7ca2685'::uuid, 'foil'),  -- duo: La Dupla Tormenta
  ('247ea107-677e-44ed-b4ed-98175c0e4f4f'::uuid, 'plateada'),  -- duo: Los Primos Gallego
  ('0f21c066-ee90-4a46-9716-2ded49de44bb'::uuid, 'brillante'),  -- trio: Los Tres Tenores
  ('14b88023-ed81-4092-97cb-9c3b2e39f556'::uuid, 'foil'),  -- trio: Los Cuñados Gallego
  ('f6877cc9-2c6d-4e83-85c3-9b89be6e54ae'::uuid, 'brillante'),  -- trio: El Trío Maravilla
  ('02ae33b0-ff47-460b-9bbf-f79f7e562a48'::uuid, 'brillante'),  -- trio: Los Tres Caballeros
  ('79765dec-c784-4872-b3ea-0bb3231a7c64'::uuid, 'foil'),  -- trio: El Trío Dinamita
  ('23b4bc15-5d71-4376-a6fb-65a79573f226'::uuid, 'brillante'),  -- trio: Los Tres Reyes del Barrio
  ('5dc5c5c2-b00a-4f62-9188-c122805051e0'::uuid, 'foil')   -- unica: La Leyenda del Barrio
) as v(id, acabado)
where d.id = v.id;
