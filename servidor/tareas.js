// Tareas que el sistema hace solo, sin que nadie llame a la API (por ejemplo,
// marcar como finalizados los eventos que ya pasaron). El servidor las corre cada
// minuto; las pruebas las llaman a demanda. Cada módulo agrega aquí las suyas.
export const tareas = [];

export async function ejecutarTareas(db) {
  for (const tarea of tareas) await tarea(db);
}
