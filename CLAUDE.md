## Cuánto probar según el cambio
- Cambio pequeño de aspecto (CSS, textos, un icono, un color, un margen): solo la prueba del banco de esa pantalla y una captura a 412 px (y en PC si afecta al PC). Nada de la batería completa ni medidas de rendimiento.
- Cambio de lógica en una pantalla: los tests unitarios y los bancos de esa pantalla y de las que dependan de ella.
- Batería completa y medidas de rendimiento: solo en cambios grandes (motor, servidor, service worker, carga de datos, cosas que afectan a toda la app) o cuando yo lo pida.
- Si dudas, prueba poco y dime qué no has probado.
