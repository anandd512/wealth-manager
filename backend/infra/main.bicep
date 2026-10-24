// Artha cloud-sync backend — minimal-cost Azure infrastructure.
// Cosmos DB serverless + a Consumption Functions plan stay inside the Always-Free
// tiers at this app's scale (single/family user, small encrypted records), so the
// running cost should be ~$0, comfortably inside a $150/mo Azure-for-employees credit.
//
// Deploy with (see backend/README.md for the full walkthrough):
//   az group create --name artha-rg --location <region>
//   az deployment group create --resource-group artha-rg --template-file infra/main.bicep --parameters namePrefix=artha<yourinitials>

@description('Globally-unique-ish prefix for resource names (storage/Cosmos/KeyVault names must be globally unique).')
param namePrefix string

@description('Azure region for all resources.')
param location string = resourceGroup().location

var storageAccountName = toLower('${namePrefix}st')
var emailServiceName = toLower('${namePrefix}-email')
var communicationServiceName = toLower('${namePrefix}-acs')
var cosmosAccountName = toLower('${namePrefix}-cosmos')
var keyVaultName = toLower('${namePrefix}-kv')
var functionAppName = toLower('${namePrefix}-func')
var appInsightsName = toLower('${namePrefix}-ai')
var planName = toLower('${namePrefix}-plan')

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource filesBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource filesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: filesBlobService
  name: 'files'
  properties: {
    publicAccess: 'None'
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [{ name: 'EnableServerless' }]
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'artha'
  properties: {
    resource: { id: 'artha' }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

resource itemsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'items'
  properties: {
    resource: {
      id: 'items'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

// Pending email-verification OTPs (see verifyRequest.ts/verifyConfirm.ts). `defaultTtl:
// -1` means "items don't expire unless they set their own `ttl`" — every VerificationDoc
// does (15 minutes), so Cosmos garbage-collects stale/unused codes automatically
// instead of this needing a cleanup job.
resource verificationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'verifications'
  properties: {
    resource: {
      id: 'verifications'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      defaultTtl: -1
    }
  }
}

// Email Communication Service with a free "Azure Managed Domain" — Azure generates
// and owns a ready-to-send-from subdomain (no custom domain purchase or DNS records
// needed). Takes a few minutes to provision after the domain resource is created;
// see backend/README.md for how to read the resulting sender address.
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: emailServiceName
  location: 'global'
  properties: {
    dataLocation: 'United States'
  }
}

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServiceName
  location: 'global'
  properties: {
    dataLocation: 'United States'
    linkedDomains: [emailDomain.id]
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    reserved: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        // Deliberately a plain connection string, not a Key Vault reference: both
        // `func azure functionapp publish` and `az functionapp deployment source
        // config-zip` resolve AzureWebJobsStorage client-side to stage the deploy
        // package, and a KV reference's literal "@Microsoft.KeyVault(...)" string
        // isn't resolved outside the Functions runtime, so either tool fails to parse
        // it as a connection string. This setting is about the Functions runtime's
        // own internal queues/triggers storage, not app secrets — Microsoft's own
        // docs set it the same way. App secrets (Cosmos, JWT key) stay in Key Vault below.
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'ENABLE_ORYX_BUILD', value: 'true' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'COSMOS_DATABASE', value: 'artha' }
        // Not a secret — just the account name blobStorage.ts builds the blob
        // endpoint URL from; auth is via the managed identity role assignment below.
        { name: 'FILES_STORAGE_ACCOUNT_NAME', value: storage.name }
        // ACS_SENDER_ADDRESS isn't knowable until the managed domain finishes
        // provisioning (a few minutes after first deploy) — set via `az functionapp
        // config appsettings set` once you've read it back, see backend/README.md.
        { name: 'ACS_SENDER_ADDRESS', value: '' }
        // Populated post-deploy via `az keyvault secret set` + these Key Vault
        // references — secrets are never stored in this template or in source control.
        { name: 'COSMOS_CONNECTION_STRING', value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=cosmos-connection-string)' }
        { name: 'JWT_SIGNING_KEY', value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=jwt-signing-key)' }
        { name: 'ACS_CONNECTION_STRING', value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=acs-connection-string)' }
      ]
    }
  }
}

// Lets the Function App's managed identity read the two secrets above via Key Vault references.
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Identity-based access to the storage account backing AzureWebJobsStorage__accountName above.
var storageRoleIds = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
]

resource storageRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for roleId in storageRoleIds: {
    name: guid(storage.id, functionApp.id, roleId)
    scope: storage
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
      principalId: functionApp.identity.principalId
      principalType: 'ServicePrincipal'
    }
  }
]

output functionAppName string = functionApp.name
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output cosmosAccountName string = cosmos.name
output keyVaultName string = keyVault.name
output storageAccountName string = storage.name
output communicationServiceName string = communicationService.name
output emailDomainMailFromSenderDomain string = emailDomain.properties.mailFromSenderDomain
