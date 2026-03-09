#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Deploy CivicBridge to AWS (ECS Fargate + S3/CloudFront)

.DESCRIPTION
  Step 1: Deploy backend stack (ECR + ECS + ALB)
  Step 2: Build & push Docker image
  Step 3: Deploy frontend stack (S3 + CloudFront)
  Step 4: Build & upload React app

.EXAMPLE
  .\deploy.ps1
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$REGION = "ap-south-1"
$ACCOUNT = (aws sts get-caller-identity --query Account --output text).Trim()
$VPC_ID = (aws ec2 describe-vpcs --region $REGION --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text).Trim()
$SUBNETS = (aws ec2 describe-subnets --region $REGION --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text).Trim() -split '\s+'
$SUBNET_CSV = $SUBNETS -join ','

Write-Host "`n=== CivicBridge Deployment ===" -ForegroundColor Cyan
Write-Host "Account:  $ACCOUNT"
Write-Host "Region:   $REGION"
Write-Host "VPC:      $VPC_ID"
Write-Host "Subnets:  $SUBNET_CSV"

# ── Load secrets from backend/.env ──────────────────────
Write-Host "`n[1/8] Loading environment variables..." -ForegroundColor Yellow
$envFile = Join-Path $PSScriptRoot "backend\.env"
if (!(Test-Path $envFile)) {
    Write-Error "backend/.env not found. Copy backend/.env.example to backend/.env and fill in the values."
    exit 1
}
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $envVars[$Matches[1]] = $Matches[2].Trim()
    }
}
Write-Host "  Loaded $($envVars.Count) variables from backend/.env"

# ── Step 2: Deploy ECS stack ────────────────────────────
Write-Host "`n[2/8] Deploying ECS backend stack..." -ForegroundColor Yellow
$ecsStackName = "civicbridge-backend"
$ecsTemplate = Join-Path $PSScriptRoot "infra\ecs-stack.yaml"

# Build parameters
$ecsParams = @(
    "ParameterKey=VpcId,ParameterValue=$VPC_ID",
    "ParameterKey=SubnetIds,ParameterValue=`"$SUBNET_CSV`"",
    "ParameterKey=ImageUri,ParameterValue=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/civicbridge:latest",
    "ParameterKey=JwtSecret,ParameterValue=$($envVars['JWT_SECRET'])",
    "ParameterKey=SarvamApiKey,ParameterValue=$($envVars['SARVAM_API_KEY'])",
    "ParameterKey=BedrockApiKey,ParameterValue=$($envVars['BEDROCK_API_KEY'])",
    "ParameterKey=BedrockModelId,ParameterValue=$($envVars['BEDROCK_MODEL_ID'])",
    "ParameterKey=BedrockApiRegion,ParameterValue=$($envVars['BEDROCK_API_REGION'])",
    "ParameterKey=TwilioAccountSid,ParameterValue=$($envVars['TWILIO_ACCOUNT_SID'])",
    "ParameterKey=TwilioAuthToken,ParameterValue=$($envVars['TWILIO_AUTH_TOKEN'])",
    "ParameterKey=TwilioPhoneNumber,ParameterValue=$($envVars['TWILIO_PHONE_NUMBER'])",
    "ParameterKey=GoogleClientId,ParameterValue=$($envVars['GOOGLE_CLIENT_ID'])",
    "ParameterKey=GoogleClientSecret,ParameterValue=$($envVars['GOOGLE_CLIENT_SECRET'])",
    "ParameterKey=CognitoUserPoolId,ParameterValue=$($envVars['COGNITO_USER_POOL_ID'])",
    "ParameterKey=CognitoClientId,ParameterValue=$($envVars['COGNITO_CLIENT_ID'])",
    "ParameterKey=CognitoDomain,ParameterValue=$($envVars['COGNITO_DOMAIN'])"
)

aws cloudformation deploy `
    --template-file $ecsTemplate `
    --stack-name $ecsStackName `
    --parameter-overrides $ecsParams `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $REGION `
    --no-fail-on-empty-changeset

if ($LASTEXITCODE -ne 0) {
    Write-Error "ECS stack deployment failed!"
    exit 1
}

# Get outputs
$backendUrl = (aws cloudformation describe-stacks --stack-name $ecsStackName --region $REGION --query "Stacks[0].Outputs[?OutputKey=='BackendURL'].OutputValue" --output text).Trim()
$ecrUri = (aws cloudformation describe-stacks --stack-name $ecsStackName --region $REGION --query "Stacks[0].Outputs[?OutputKey=='ECRRepository'].OutputValue" --output text).Trim()
Write-Host "  Backend URL: $backendUrl" -ForegroundColor Green
Write-Host "  ECR URI:     $ecrUri" -ForegroundColor Green

# ── Step 3: Build & push Docker image ───────────────────
Write-Host "`n[3/8] Logging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

Write-Host "`n[4/8] Building Docker image..." -ForegroundColor Yellow
docker build -t civicbridge:latest .

Write-Host "`n[5/8] Pushing to ECR..." -ForegroundColor Yellow
docker tag civicbridge:latest "${ecrUri}:latest"
docker push "${ecrUri}:latest"

# Force new deployment to pick up new image
Write-Host "  Triggering ECS service update..."
aws ecs update-service --cluster civicbridge --service civicbridge-api --force-new-deployment --region $REGION --output text | Out-Null

# ── Step 4: Deploy frontend stack ────────────────────────
Write-Host "`n[6/8] Deploying frontend stack (S3 + CloudFront)..." -ForegroundColor Yellow
$feStackName = "civicbridge-frontend"
$feTemplate = Join-Path $PSScriptRoot "infra\frontend-stack.yaml"

aws cloudformation deploy `
    --template-file $feTemplate `
    --stack-name $feStackName `
    --parameter-overrides "ParameterKey=BackendURL,ParameterValue=$backendUrl" `
    --region $REGION `
    --no-fail-on-empty-changeset

if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend stack deployment failed!"
    exit 1
}

$frontendUrl = (aws cloudformation describe-stacks --stack-name $feStackName --region $REGION --query "Stacks[0].Outputs[?OutputKey=='FrontendURL'].OutputValue" --output text).Trim()
$frontendBucket = (aws cloudformation describe-stacks --stack-name $feStackName --region $REGION --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text).Trim()
$cfDistId = (aws cloudformation describe-stacks --stack-name $feStackName --region $REGION --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text).Trim()
Write-Host "  Frontend URL:    $frontendUrl" -ForegroundColor Green
Write-Host "  S3 Bucket:       $frontendBucket" -ForegroundColor Green
Write-Host "  Distribution ID: $cfDistId" -ForegroundColor Green

# ── Step 5: Build & upload React app ────────────────────
Write-Host "`n[7/8] Building React frontend..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "frontend")

# Write the backend URL into the build
$buildEnv = "VITE_API_URL=$backendUrl"
$buildEnv | Set-Content ".env.production"

npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "Frontend build failed!"
    exit 1
}

Write-Host "`n[8/8] Uploading to S3 + invalidating CloudFront..." -ForegroundColor Yellow
aws s3 sync dist/ "s3://$frontendBucket" --delete --region $REGION
aws cloudfront create-invalidation --distribution-id $cfDistId --paths "/*" --region us-east-1 --output text | Out-Null

Pop-Location
Remove-Item (Join-Path $PSScriptRoot "frontend\.env.production") -Force -ErrorAction SilentlyContinue

# ── Done ────────────────────────────────────────────────
Write-Host "`n" -NoNewline
Write-Host "======================================" -ForegroundColor Green
Write-Host "  CivicBridge Deployed Successfully!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend: $frontendUrl" -ForegroundColor Cyan
Write-Host "  Backend:  $backendUrl" -ForegroundColor Cyan
Write-Host "  API Docs: $backendUrl/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "To update after code changes:" -ForegroundColor Yellow
Write-Host "  Backend:  docker build -t civicbridge . ; docker tag civicbridge:latest ${ecrUri}:latest ; docker push ${ecrUri}:latest ; aws ecs update-service --cluster civicbridge --service civicbridge-api --force-new-deployment --region $REGION"
Write-Host "  Frontend: cd frontend ; npm run build ; aws s3 sync dist/ s3://$frontendBucket --delete ; aws cloudfront create-invalidation --distribution-id $cfDistId --paths '/*'"
Write-Host ""
