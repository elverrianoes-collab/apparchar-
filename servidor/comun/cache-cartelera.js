// Caché de la cartelera pública (GET /eventos). Es la lectura más frecuente y la
// misma para todos: no depende de quién la pide. Cada respuesta se guarda por
// CACHE_CARTELERA_SEGUNDOS (30 por defecto) bajo una clave que incluye una
// «versión» de la cartelera; cualquier escritura exitosa en la API (salvo iniciar
// sesión) sube esa versión, así que después de crear, publicar o comprar nadie
// ve datos viejos.
// Lo único que puede tardar hasta 30 s en verse es lo que cambian las tareas
// programadas (por ejemplo, un evento que pasa a finalizado).
export const CLAVE_VERSION = 'cartelera:version';
const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);
// Iniciar sesión (POST /sesiones) es la escritura más frecuente y no cambia la cartelera.
const NO_CAMBIAN_LA_CARTELERA = /^\/sesiones(\/|$)/;

export function cachearCartelera(cache, segundos) {
  return async (req, res, next) => {
    if (!cache.disponible()) return next();
    const version = (await cache.obtener(CLAVE_VERSION)) || '0';
    const clave = `cartelera:${version}:${req.originalUrl}`;
    const guardado = await cache.obtener(clave);
    if (guardado) {
      const { total, cuerpo } = JSON.parse(guardado);
      if (total !== undefined) res.set('X-Total-Count', total);
      res.set('X-Cache', 'HIT');
      return res.json(cuerpo);
    }
    res.set('X-Cache', 'MISS');
    const enviar = res.json.bind(res);
    res.json = (cuerpo) => {
      if (res.statusCode === 200) {
        cache.guardar(clave, JSON.stringify({ total: res.get('X-Total-Count'), cuerpo }), segundos);
      }
      return enviar(cuerpo);
    };
    next();
  };
}

// La versión sube antes de enviar la respuesta de la escritura: cuando el cliente
// recibe el 201 o el 200, la siguiente lectura ya no puede tocar la caché vieja.
export function invalidarCartelera(cache) {
  return (req, res, next) => {
    if (cache.disponible() && !METODOS_DE_LECTURA.has(req.method) && !NO_CAMBIAN_LA_CARTELERA.test(req.path)) {
      const terminar = res.end.bind(res);
      res.end = (...argumentos) => {
        if (res.statusCode >= 400) return terminar(...argumentos);
        cache.incrementar(CLAVE_VERSION).finally(() => terminar(...argumentos));
        return res;
      };
    }
    next();
  };
}
