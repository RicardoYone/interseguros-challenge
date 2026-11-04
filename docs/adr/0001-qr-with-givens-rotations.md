# ADR 0001: QR con rotaciones de Givens

**Estado:** aceptada

**Decisión:** la API en Go devuelve la factorización QR, calculada con rotaciones de Givens escritas a mano.

## Contexto

El enunciado se contradice:

| Sección | Qué pide |
|---|---|
| Funcionalidad requerida | "devuelva la factorización QR de dicha matriz" |
| Arquitectura, lógica y frontend | "rotación de la matriz" |
| Operación adicional | "matrices devueltas", "alguna matriz": varias matrices, no una |

Un giro de 90° devuelve una sola matriz, mientras que la QR devuelve dos. La sección de funcionalidad requerida es la
más específica, así que manda. El enunciado pide tomar una decisión informada y sustentarla.

## Por qué Givens

Una rotación de Givens es una rotación en un plano que anula un elemento de la matriz. Aplicar una secuencia de ellas
deja R triangular, y su producto forma Q. El cálculo de la QR **es** una secuencia de rotaciones, así que el texto
sobre "rotación" también tiene sentido dentro de esta solución.

## Alternativas

| Opción | A favor | En contra |
|---|---|---|
| **Givens a mano (elegida)** | Une las dos lecturas del enunciado; sin dependencias de producción; cada paso se puede explicar | Constante mayor que Householder en matrices densas |
| Householder con gonum | Estándar y más eficiente en matrices densas | "Rotación" queda sin explicación; la lógica central se delega a una librería |
| QR y además giro de 90° | Cubre ambas lecturas | Más superficie, y evita tomar la decisión que pide el enunciado |

## Consecuencias

- **Costo:** mismo orden que Householder, O(mn²), con una constante mayor en matrices densas grandes (ver la medición).
- **Implementación propia:** el riesgo numérico se cubre con pruebas de propiedades, fuzzing y gonum como oráculo, solo
  en las pruebas.
- **Estabilidad:** cada rotación escala sus valores antes de dividir y usa `math.Hypot`. Esto evita desbordes y mantiene
  c² + s² = 1 con valores subnormales. El fuzzing encontró este caso: sin escalar, Q dejaba de ser ortogonal.
- **Determinismo:** la diagonal de R se normaliza a valores no negativos, así una entrada siempre da la misma salida.

## Medición

Una corrida corta en un portátil con Intel i5-1235U. Sirve para ver el orden de magnitud, no como cifra exacta.
Se repite con `go test -run=^$ -bench=. -benchmem ./internal/factorization/`.

| Matriz | Givens | Householder (gonum) | Asignaciones de memoria (Givens / gonum) |
|---|---|---|---|
| 10×10 | 3.1 µs | 4.6 µs | 3 / 14 |
| 100×100 | 976 µs | 347 µs | 3 / 15 |
| 200×200 | 6.3 ms | 3.8 ms | 3 / 122 |
| 200×20 | 0.31 ms | 0.45 ms | 3 / 16 |

- **Lectura:** en matrices densas grandes Householder es más rápido, entre 1.6 y 2.8 veces en estas corridas. Con el
  máximo permitido de 200×200 el cálculo tarda unos 6 ms, así que la diferencia no afecta a la API.
- **Límite de la comparación:** en la fila 200×20, gonum forma la Q completa de 200×200 y Givens solo la reducida.
  Esa fila favorece a Givens y no prueba que sea más rápido en matrices altas.
