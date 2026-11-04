# ADR 0002: Node emite el JWT con firma asimétrica

**Estado:** aceptada

**Decisión:** un módulo `auth` en la API de Node firma los tokens con ES256. Go y Node los verifican con la clave pública.

## Contexto

El enunciado pide proteger las APIs con JWT y un frontend que "consuma ambas APIs". El flujo de datos, en cambio, va
de Go a Node: si el frontend solo le hablara a Go, el segundo punto no se cumpliría.

## Por qué esta opción

- **El frontend consume ambas APIs de forma natural:** inicia sesión en Node y pide la QR a Go.
- **Go no puede falsificar tokens:** solo tiene la clave pública. Comprometer Go no da poder para emitir identidades.
- **Sin credenciales entre servicios:** Go reenvía el token del usuario, y Node sabe quién originó la petición.

## Alternativas

| Opción | En contra |
|---|---|
| Node con HS256 (secreto compartido) | Cualquier servicio con el secreto puede falsificar tokens |
| Go como emisor | El frontend solo le hablaría a Go; consumir Node requeriría una llamada forzada |
| Proveedor externo (Entra ID) | Demasiada configuración para el alcance y dependencia externa en la demo |

## Controles

| Riesgo | Control |
|---|---|
| Confusión de algoritmo y `alg: none` | Algoritmo fijado a ES256 al verificar, con pruebas de ambos ataques |
| Token de otro sistema | Se validan `iss` y `aud` |
| Token robado | Vida de 15 minutos; en Angular vive solo en memoria, nunca en `localStorage` |
| Fuerza bruta | Límite de intentos en el login y contraseña con hash bcrypt |

## Consecuencias

- **Sin refresh token:** al vencer el token, el usuario vuelve a iniciar sesión. Es suficiente para este alcance.
- **Sin revocación:** un token válido sigue vigente hasta que vence, y por eso su vida es corta.
- **Usuario de demo en variables de entorno:** no hay gestión de usuarios (ver [ADR 0004](0004-stateless-no-database.md)).
- **Node tiene dos responsabilidades:** `auth` y `statistics` quedan en módulos separados, listos para separarse si hiciera falta.
