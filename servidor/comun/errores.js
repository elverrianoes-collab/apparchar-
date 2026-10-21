// Un solo formato de error para toda la API (esquema Error del contrato, D-08):
//   { "codigo": "aforo_excedido", "mensaje": "…", "detalles": [{ "campo", "problema" }] }
// Los servicios lanzan ErrorApi y el manejador de errores lo convierte en la respuesta.

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, detalles) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  cuerpo() {
    const cuerpo = { codigo: this.codigo, mensaje: this.message };
    if (this.detalles?.length) cuerpo.detalles = this.detalles;
    return cuerpo;
  }
}

// 400: la petición no cumple el esquema o se contradice a sí misma.
export const solicitudInvalida = (detalles, mensaje = 'La solicitud tiene datos inválidos.') =>
  new ErrorApi(400, 'solicitud_invalida', mensaje, detalles);
// 401: falta el token o no sirve.
export const noAutenticado = (mensaje = 'Inicia sesión para continuar: la petición no trae un token válido.') =>
  new ErrorApi(401, 'no_autenticado', mensaje);
// 403: el token sirve, pero el recurso es de otro organizador.
export const sinPermiso = (mensaje) => new ErrorApi(403, 'sin_permiso', mensaje);
// 404: el recurso no existe.
export const noEncontrado = (codigo, mensaje) => new ErrorApi(404, codigo, mensaje);
// 409: choca con el estado actual de un recurso (no se arregla cambiando los datos).
export const conflicto = (codigo, mensaje, detalles) => new ErrorApi(409, codigo, mensaje, detalles);
// 422: los datos están bien formados pero rompen una regla del negocio.
export const reglaDeNegocio = (codigo, mensaje, detalles) => new ErrorApi(422, codigo, mensaje, detalles);

// Si una restricción de PostgreSQL detiene algo que el código no anticipó (por
// ejemplo, dos peticiones simultáneas), se responde igual con el formato Error.
const RESTRICCIONES_UNICAS = {
  organizador_correo_key: ['correo_ya_registrado', 'Ya existe un organizador con ese correo.'],
  tipo_boleta_evento_id_nombre_key: ['tipo_boleta_nombre_repetido', 'El evento ya tiene un tipo de boleta con ese nombre.'],
  orden_referencia_pago_key: ['referencia_pago_repetida', 'Esa referencia de pago ya confirmó otra orden.'],
};

// «evento_nombre_check» → «nombre»: el nombre de la columna, no el de la restricción.
function campoDeLaRestriccion(error) {
  if (error.column) return error.column;
  const partes = (error.constraint || '').match(/^(organizador|evento|tipo_boleta|orden|item_orden|boleta|validacion)_(.+?)_(check|ck)$/);
  return partes ? partes[2] : '(cuerpo)';
}

function traducirErrorDePostgres(error) {
  switch (error.code) {
    case '23505': {
      const [codigo, mensaje] = RESTRICCIONES_UNICAS[error.constraint] || ['valor_repetido', 'Ese valor ya lo tiene otro registro.'];
      return new ErrorApi(409, codigo, mensaje);
    }
    case '23503':
      return new ErrorApi(409, 'registro_en_uso', 'Otro registro depende de este, así que no se puede cambiar ni borrar.');
    case '23514':
    case '22P02':
    case '22001':
    case '22007':
    case '22008':
      return new ErrorApi(400, 'solicitud_invalida', 'La solicitud tiene datos inválidos.', [
        { campo: campoDeLaRestriccion(error), problema: 'No cumple las reglas de este campo.' },
      ]);
    default:
      return null;
  }
}

export function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ErrorApi) return res.status(error.estado).json(error.cuerpo());

  // Errores de express.json(): JSON mal formado o cuerpo demasiado grande.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json(solicitudInvalida([
      { campo: '(cuerpo)', problema: 'El cuerpo no es JSON válido: revisa comas, comillas y llaves.' },
    ]).cuerpo());
  }
  if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
    return res.status(400).json(solicitudInvalida([
      { campo: '(cuerpo)', problema: 'Envía el JSON en UTF-8 (Content-Type: application/json).' },
    ]).cuerpo());
  }
  if (error.type === 'entity.too.large') {
    return res.status(400).json(solicitudInvalida([{ campo: '(cuerpo)', problema: 'El cuerpo supera los 100 kB.' }]).cuerpo());
  }

  const traducido = traducirErrorDePostgres(error);
  if (traducido) return res.status(traducido.estado).json(traducido.cuerpo());

  console.error('Error inesperado:', error);
  return res.status(500).json({ codigo: 'error_interno', mensaje: 'Ocurrió un error inesperado en el servidor.' });
}

export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    codigo: 'ruta_no_encontrada',
    mensaje: `No existe la ruta ${req.method} ${req.path}. La documentación de la API está en /docs.`,
  });
}
