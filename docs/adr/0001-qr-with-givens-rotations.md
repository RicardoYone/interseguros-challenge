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

- **Costo:** mismo orden que Householder, O(mn²), con una constante mayor. El benchmark contra gonum mide la diferencia real.
- **Implementación propia:** el riesgo numérico se cubre con pruebas de propiedades, fuzzing y gonum como oráculo, solo
  en las pruebas.
- **Estabilidad:** cada rotación escala sus valores antes de dividir y usa `math.Hypot`. Esto evita desbordes y mantiene
  c² + s² = 1 con valores subnormales. El fuzzing encontró este caso: sin escalar, Q dejaba de ser ortogonal.
- **Determinismo:** la diagonal de R se normaliza a valores no negativos, así una entrada siempre da la misma salida.
