// Azure infrastructure: both APIs in Container Apps, scaled to zero when idle, and the
// frontend in a Static Web App. Deployed by .github/workflows/deploy.yml.

@description('Region of the resources. It must be one that also offers Static Web Apps.')
param location string = 'eastus2'

@description('Prefix of the resource names.')
param namePrefix string = 'interseguros'

param qrApiImage string
param statisticsApiImage string

@secure()
param jwtPrivateKeyB64 string
param jwtPublicKeyB64 string

@secure()
param demoPasswordHashB64 string
param demoUsername string = 'demo'

param jwtIssuer string = 'interseguros-challenge-auth'
param jwtAudience string = 'interseguros-challenge-api'

// Each service runs on the server's local time.
var timeZone = {
  name: 'TZ'
  value: 'America/Lima'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-environment'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource web 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${namePrefix}-web'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

var corsAllowedOrigins = 'https://${web.properties.defaultHostname}'

resource statisticsApi 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-statistics-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
      secrets: [
        {
          name: 'jwt-private-key'
          value: jwtPrivateKeyB64
        }
        {
          name: 'demo-password-hash'
          value: demoPasswordHashB64
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'statistics-api'
          image: statisticsApiImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            timeZone
            {
              name: 'JWT_PRIVATE_KEY_B64'
              secretRef: 'jwt-private-key'
            }
            {
              name: 'JWT_PUBLIC_KEY_B64'
              value: jwtPublicKeyB64
            }
            {
              name: 'JWT_ISSUER'
              value: jwtIssuer
            }
            {
              name: 'JWT_AUDIENCE'
              value: jwtAudience
            }
            {
              name: 'DEMO_USERNAME'
              value: demoUsername
            }
            {
              name: 'DEMO_PASSWORD_HASH_B64'
              secretRef: 'demo-password-hash'
            }
            {
              name: 'CORS_ALLOWED_ORIGINS'
              value: corsAllowedOrigins
            }
            {
              // The ingress is one proxy in front of the service: the login rate
              // limit needs it to see the address of the real client.
              name: 'TRUST_PROXY_HOPS'
              value: '1'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

// qr-api never receives the private key: it can verify tokens but not forge them.
resource qrApi 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-qr-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
      }
    }
    template: {
      // Must exceed STATISTICS_TIMEOUT + 5 s, the time qr-api gives in-flight requests to finish.
      terminationGracePeriodSeconds: 40
      containers: [
        {
          name: 'qr-api'
          image: qrApiImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            timeZone
            {
              name: 'JWT_PUBLIC_KEY_B64'
              value: jwtPublicKeyB64
            }
            {
              name: 'JWT_ISSUER'
              value: jwtIssuer
            }
            {
              name: 'JWT_AUDIENCE'
              value: jwtAudience
            }
            {
              name: 'CORS_ALLOWED_ORIGINS'
              value: corsAllowedOrigins
            }
            {
              name: 'STATISTICS_API_URL'
              value: 'https://${statisticsApi.properties.configuration.ingress.fqdn}'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

output qrApiUrl string = 'https://${qrApi.properties.configuration.ingress.fqdn}'
output statisticsApiUrl string = 'https://${statisticsApi.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${web.properties.defaultHostname}'
output staticWebAppName string = web.name
