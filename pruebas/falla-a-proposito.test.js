// Prueba que falla a propósito, solo para demostrar en el historial del flujo de
// CI/CD que una prueba roja detiene todo: no se construye el compose, no se
// publica la imagen y no se despliega. Esta rama no se integra.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('una prueba roja detiene el flujo', () => {
  assert.equal(1 + 1, 3, 'falla a propósito para la evidencia de la Entrega 4');
});
