// Paginación de los listados: ?pagina=1&por_pagina=20 (1 a 50). El total de
// registros que cumplen el filtro viaja en la cabecera X-Total-Count.
export function leerPaginacion(consulta) {
  const pagina = consulta.pagina ?? 1;
  const porPagina = consulta.por_pagina ?? 20;
  return { limite: porPagina, desplazamiento: (pagina - 1) * porPagina };
}

export function enviarLista(res, filas, total) {
  res.set('X-Total-Count', String(total));
  res.json(filas);
}
