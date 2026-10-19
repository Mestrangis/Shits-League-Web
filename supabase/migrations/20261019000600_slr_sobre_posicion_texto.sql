-- SHITS LEAGUE RUSH — sobre de posición: la descripción dice cómo se decide la posición
-- (solo se cambia la que no ha editado nadie)
update public.tipos_sobre
   set descripcion = 'Eliges portero, defensa, control o ataque y te llevas una carta cuya stat más alta es la de esa posición.',
       editado_en = now()
 where tipo = 'posicion'
   and descripcion = 'Eliges portero, defensa, control o atacante y te llevas una carta de ese perfil.';
