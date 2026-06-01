# Azure Setup — TestForge API

Step-by-step `az` CLI commands to provision the TestForge backend in Everstory's existing Azure subscription. Run from a shell with `az login` already completed and the correct subscription selected (`az account set --subscription <id>`).

Variables used below — set once at the top of your shell:

```bash
export RG=rg-testforge-prod
export LOC=eastus
export DB_SERVER=testforge-db
export DB_ADMIN=testforge_admin
export DB_PASSWORD='<strong-random>'         # also store in Key Vault
export APP_PLAN=plan-testforge
export APP_NAME=testforge-api
export STORAGE=testforgestorage              # 3-24 chars, lowercase, globally unique
```

## 1. Resource group

```bash
az group create --name "$RG" --location "$LOC"
```

## 2. Azure Database for PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group "$RG" \
  --name "$DB_SERVER" \
  --location "$LOC" \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user "$DB_ADMIN" \
  --admin-password "$DB_PASSWORD" \
  --public-access None \
  --high-availability Disabled

az postgres flexible-server db create \
  --resource-group "$RG" \
  --server-name "$DB_SERVER" \
  --database-name testforge

# Allow Azure services (App Service) — replace with VNet integration before go-live.
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" \
  --name "$DB_SERVER" \
  --rule-name AllowAllAzure \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```

## 3. App Service Plan + Web App (Node 20 LTS)

```bash
az appservice plan create \
  --name "$APP_PLAN" --resource-group "$RG" --location "$LOC" \
  --sku B2 --is-linux

az webapp create \
  --name "$APP_NAME" --resource-group "$RG" --plan "$APP_PLAN" \
  --runtime "NODE|20-lts"
```

### App settings (environment variables)

Set every required env var on the Web App. Generate strong values for `TESTFORGE_INTERNAL_SECRET` (`openssl rand -hex 32`) and rotate quarterly.

```bash
az webapp config appsettings set --resource-group "$RG" --name "$APP_NAME" --settings \
  NODE_ENV=production \
  PORT=8080 \
  DATABASE_URL="postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_SERVER}.postgres.database.azure.com:5432/testforge?sslmode=require" \
  ANTHROPIC_API_KEY="<from console.anthropic.com>" \
  ANTHROPIC_MODEL="claude-sonnet-4-6" \
  ANTHROPIC_MODEL_CHEAP="claude-haiku-4-5" \
  AI_MONTHLY_BUDGET_USD="150" \
  JIRA_BASE_URL="https://everstory.atlassian.net" \
  JIRA_SERVICE_ACCOUNT_EMAIL="testforge-bot@everstory.com" \
  JIRA_SERVICE_ACCOUNT_TOKEN="<from id.atlassian.com>" \
  JIRA_DEFAULT_PROJECT_KEY="DS" \
  JIRA_PROBLEM_ISSUE_TYPE="Problem" \
  TESTFORGE_INTERNAL_SECRET="<openssl rand -hex 32>" \
  ALLOWED_FORGE_APP_ID="<from forge.app.ari after first forge deploy>" \
  TEAMS_WEBHOOK_IT_APPLICATIONS="<from Teams admin>" \
  TEAMS_WEBHOOK_REPORTING="<from Teams admin>" \
  JIRA_PUBLIC_BASE_URL="https://everstory.atlassian.net" \
  FORGE_APP_ROUTE_BASE="https://everstory.atlassian.net/jira/apps"
```

Secrets like `ANTHROPIC_API_KEY`, `JIRA_SERVICE_ACCOUNT_TOKEN`, and `TESTFORGE_INTERNAL_SECRET` belong in Azure Key Vault; reference them with `@Microsoft.KeyVault(...)` syntax in App Service settings once the vault is provisioned.

## 4. Blob Storage (attachments, exports, audit archive)

```bash
az storage account create \
  --name "$STORAGE" --resource-group "$RG" --location "$LOC" \
  --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false

az storage container create --account-name "$STORAGE" --name attachments --auth-mode login --public-access off
az storage container create --account-name "$STORAGE" --name exports     --auth-mode login --public-access off
az storage container create --account-name "$STORAGE" --name audit-archive --auth-mode login --public-access off
# Audit archive uses cool tier (set per blob upload).
```

## 5. GitHub Actions deploy secrets

```bash
az webapp deployment list-publishing-profiles \
  --name "$APP_NAME" --resource-group "$RG" --xml > publish-profile.xml
```

Add to the GitHub repo secrets:

| Secret name | Value |
|---|---|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | contents of `publish-profile.xml` |
| `AZURE_WEBAPP_NAME` | `testforge-api` |
| `FORGE_EMAIL` | Atlassian account email used for `forge login` |
| `FORGE_API_TOKEN` | from `id.atlassian.com` |

## 6. After first deploy

1. Run migrations against the production DB:
   ```bash
   DATABASE_URL="<prod url>" npm --workspace api run db:migrate:deploy
   ```
2. Update `ALLOWED_FORGE_APP_ID` with the ARI emitted by the first `forge deploy`.
3. Tighten the Postgres firewall — replace `AllowAllAzure` with App Service outbound IPs or move to private VNet integration before pilot.
4. Confirm `/health` returns `{"status":"ok","db":"connected"}` against `https://${APP_NAME}.azurewebsites.net/health`.

Estimated monthly cost (PRD §9.2): **$80–110/mo** (B1ms Postgres ~$13 + B2 App Service ~$30 + Blob + networking).
