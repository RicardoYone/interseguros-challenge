# Despliegue en Azure

Las APIs corren en Azure Container Apps con escala a cero y el frontend en Azure Static Web Apps. El workflow
`Deploy` publica las imágenes, aplica `infra/main.bicep` y sube el frontend. Se ejecuta solo a mano.

## Recursos y costo

| Recurso | Plan | Costo esperado |
|---|---|---|
| Container Apps (2) | Consumo, de 0 a 2 réplicas | Dentro de la capa gratuita con poco uso |
| Static Web Apps | Free | Sin costo |
| Log Analytics | Por GB ingerido, retención de 30 días | Muy bajo con poco uso |
| Imágenes en GitHub Container Registry | Paquetes públicos | Sin costo |

Consulta los precios vigentes de Azure antes de desplegar. Al terminar la evaluación, borra todo con:

```bash
az group delete --name <resource-group>
```

## Primera vez

1. **Crea el grupo de recursos:**

   ```bash
   az group create --name <resource-group> --location eastus2
   ```

2. **Da acceso a GitHub sin contraseñas (OIDC).** Crea una identidad con acceso al grupo y confía en el repositorio:

   ```bash
   az ad app create --display-name interseguros-deploy
   az ad sp create --id <app-id>
   az role assignment create --assignee <app-id> --role Contributor --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>
   az ad app federated-credential create --id <app-id> --parameters '{"name":"github-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:<owner>/<repo>:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}'
   ```

3. **Genera los secretos** en un archivo `.env` local, fuera del repositorio. El comando muestra la contraseña una sola vez:

   ```bash
   npm --prefix services/statistics-api run generate-env
   ```

4. **Configura el repositorio de GitHub** (*Settings → Secrets and variables → Actions*):

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `AZURE_CLIENT_ID` | `<app-id>` |
   | Secret | `AZURE_TENANT_ID` | Tu tenant |
   | Secret | `AZURE_SUBSCRIPTION_ID` | Tu suscripción |
   | Secret | `JWT_PRIVATE_KEY_B64` | Del archivo `.env` |
   | Secret | `JWT_PUBLIC_KEY_B64` | Del archivo `.env` |
   | Secret | `DEMO_PASSWORD_HASH_B64` | Del archivo `.env` |
   | Variable | `AZURE_RESOURCE_GROUP` | `<resource-group>` |

5. **Ejecuta el workflow:**

   ```bash
   gh workflow run deploy.yml --ref main
   ```

6. **Revisa la visibilidad de las imágenes.** Container Apps las descarga sin credenciales, así que los paquetes de
   GitHub Container Registry deben ser públicos. Si el despliegue no puede descargarlas, cámbialos a públicos en
   *GitHub → Packages → Package settings* y ejecuta el workflow otra vez.

## Verificación

Prueba el flujo completo contra Azure. La primera petición tarda más porque los servicios despiertan desde cero:

```bash
QR_API_URL=<qrApiUrl> STATISTICS_API_URL=<statisticsApiUrl> DEMO_PASSWORD=<password> node --test tests/e2e/flow.test.mjs
```

Resultado esperado: todas las pruebas pasan, salvo la que apaga servicios, que queda omitida.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| 504 en la primera petición | Un servicio tardó más de 30 s en despertar | Repite la petición, o sube `STATISTICS_TIMEOUT` |
| El navegador bloquea las llamadas a la API | El origen de CORS no coincide | Revisa `CORS_ALLOWED_ORIGINS` en la Container App |
| El login responde 429 detrás del proxy, para todos | `TRUST_PROXY_HOPS` incorrecto | Debe valer 1 en Container Apps |
