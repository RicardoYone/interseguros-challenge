# ADR 0003: QR reducida para matrices rectangulares

**Estado:** aceptada

**Decisión:** para A de m×n y k = min(m, n), la API devuelve Q de m×k y R de k×n.

## Contexto

El enunciado pide aceptar matrices rectangulares, y la QR tiene dos formas: completa (Q de m×m) y reducida (Q de m×k).

## Por qué la reducida

| Forma | Tamaño de Q para 1000×3 | Consecuencia |
|---|---|---|
| **Reducida (elegida)** | 1000×3 | Respuesta pequeña; contiene toda la información necesaria para reconstruir A |
| Completa | 1000×1000 | La mayor parte de Q no aporta a A = QR, y la respuesta crece mucho |

## Cómo se calcula de forma eficiente

Se guardan los pares (c, s) de cada rotación y se aplican en orden inverso sobre las primeras k columnas de la
identidad. Cada rotación toca solo k columnas, así que formar Q cuesta O(mk²) y no O(m²k).

## Consecuencias

- **Efecto en las estadísticas:** máximo, mínimo, promedio y suma se calculan sobre la Q reducida y la R reducida.
- **Propiedad de Q:** QᵀQ = I siempre se cumple, pero QQᵀ = I solo cuando m ≤ n. Las pruebas verifican la primera.
- **Matrices anchas (m < n):** R es trapezoidal superior, de k×n.
- **Rango incompleto:** la factorización sigue siendo válida. R tiene valores cercanos a cero en la diagonal y Q sigue
  siendo ortonormal, pero sus últimas columnas no son únicas: el ruido de redondeo decide su signo.
