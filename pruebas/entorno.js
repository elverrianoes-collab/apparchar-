// Se importa antes que todo lo demás en las pruebas: marca el entorno de pruebas
// (sin límite de intentos de inicio de sesión) con una clave JWT propia.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRETO = 'clave-de-pruebas-que-no-sirve-fuera-de-las-pruebas';
process.env.PASARELA_CLAVE = 'clave-pasarela-de-pruebas';
