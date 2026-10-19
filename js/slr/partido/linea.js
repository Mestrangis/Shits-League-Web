/* ═══════════════════════════════════════════════
   SHITS LEAGUE RUSH — reproducción de partidos: línea de tiempo de una escena
   Lo que devuelve cada variante. Se arma entera antes de empezar (animaciones
   de la Web Animations API con su retraso, solo transform y opacity) y el
   reproductor la mueve con su reloj:
   · iniciar(velocidad): arranca todo a la vez
   · avanzar(ms): la mueve (lo llama el bucle del reproductor, ya × velocidad)
   · terminar(): salta al final (las animaciones a su último fotograma; se
     ejecutan los avisos de «estado», como el marcador, y no los de efectos,
     como el sonido o las chispas)
   · cancelar(): lo para todo y no deja nada a medias
   · velocidad(v): ×1 / ×2
   · pausar() / reanudar(): congela la escena donde está (muestrario, al cerrar)
   La duración es la de la animación o aviso que acabe más tarde (o la fijada).
═══════════════════════════════════════════════ */

export class Linea {
  constructor(duracion = 0) {
    this.anims = [];
    this.avisos = [];      // { t, fn, estado }
    this.t = 0;
    this.dur = duracion;
    this.estado = 'lista';   // lista · corriendo · terminada · cancelada
    this.vel = 1;
  }

  // Una animación de el: keyframes (transform/opacity), desde el ms `en`, durante `dur`
  anim(el, frames, { en = 0, dur = 300, easing = 'ease-out', fill = 'both', iter = 1, dir = 'normal' } = {}) {
    if (!el) return null;
    const a = el.animate(frames, { delay: en, duration: dur, easing, fill, iterations: iter, direction: dir });
    a.pause();
    this.anims.push(a);
    this.dur = Math.max(this.dur, en + dur * (iter === Infinity ? 1 : iter));
    return a;
  }

  // Un aviso en el ms t. estado: también se ejecuta al saltar al final (p. ej. el marcador)
  en(t, fn, { estado = false } = {}) {
    this.avisos.push({ t, fn, estado, hecho: false });
    this.dur = Math.max(this.dur, t);
    return this;
  }

  iniciar(vel = 1) {
    if (this.estado !== 'lista') return;
    this.estado = 'corriendo';
    this.velocidad(vel);
    for (const a of this.anims) a.play();
    this.avanzar(0);
  }

  velocidad(v) {
    this.vel = v;
    for (const a of this.anims) a.playbackRate = v;
  }

  // ms de reloj de la escena (ya multiplicados por la velocidad)
  avanzar(ms) {
    if (this.estado !== 'corriendo') return;
    this.t += ms;
    for (const a of this.avisos) {
      if (!a.hecho && a.t <= this.t) { a.hecho = true; try { a.fn(); } catch (e) { console.error(e); } }
    }
    if (this.t >= this.dur) this.terminar(false);
  }

  get terminada() { return this.estado === 'terminada' || this.estado === 'cancelada'; }

  terminar(saltando = true) {
    if (this.terminada) return;
    for (const a of this.avisos) {
      if (a.hecho) continue;
      a.hecho = true;
      if (!saltando || a.estado) { try { a.fn(); } catch (e) { console.error(e); } }
    }
    for (const a of this.anims) { try { a.finish(); } catch { /* infinita: se cancela */ a.cancel(); } }
    this.estado = 'terminada';
  }

  pausar() {
    if (this.estado !== 'corriendo') return;
    this.estado = 'pausada';
    for (const a of this.anims) a.pause();
  }

  reanudar() {
    if (this.estado !== 'pausada') return;
    this.estado = 'corriendo';
    for (const a of this.anims) a.play();
  }

  cancelar() {
    for (const a of this.anims) a.cancel();
    this.estado = 'cancelada';
  }
}
