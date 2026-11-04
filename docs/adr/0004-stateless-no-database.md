# ADR 0004: Sin base de datos

**Estado:** aceptada

**Decisión:** el sistema no guarda estado. Cada petición contiene todo lo necesario para responderla.

## Por qué

- **El enunciado no la pide:** ningún requisito menciona guardar matrices ni resultados.
- **Las operaciones son puras:** una misma entrada siempre da la misma salida.
- **Simplifica el despliegue:** los servicios escalan a cero sin perder nada, y no hay costo de una base de datos.

## Consecuencias

- **Sin historial:** no se pueden consultar factorizaciones anteriores.
- **Un solo usuario de demo:** sus credenciales viven en variables de entorno, con la contraseña en hash bcrypt. No hay
  registro ni gestión de usuarios.

## Cuándo revisar esta decisión

Si aparece un requisito de historial, auditoría o varios usuarios reales. Los puertos del dominio permiten agregar
persistencia sin tocar el cálculo.
