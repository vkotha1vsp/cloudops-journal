#!/usr/bin/env bash
# Deploy from your own machine (same steps as .github/workflows/deploy.yml).
# Prereqs: Docker with buildx, AWS CLI v2 logged in to the target account, jq, and
# `terraform apply` already run in infra/terraform.
#   ./scripts/deploy-manual.sh            # tag = current git commit
set -euo pipefail
cd "$(dirname "$0")/.."
tf() { terraform -chdir=infra/terraform output -raw "$1"; }

REGION=$(tf aws_region)
REPO=$(tf ecr_repository_url)
CLUSTER=$(tf ecs_cluster)
SERVICE=$(tf ecs_service)
APP_FAMILY=$(tf app_task_family)
MIGRATE_FAMILY=$(tf migrate_task_family)
SUBNETS=$(tf task_subnets)
SG=$(tf app_security_group)
PUBLIC_IP=$(tf assign_public_ip)
URL=$(tf app_url)
TAG=${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}

echo "→ Logging in to ECR"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"

echo "→ Building and pushing $REPO:$TAG (linux/amd64)"
docker buildx build --platform linux/amd64 --target runner -t "$REPO:$TAG" --push .
docker buildx build --platform linux/amd64 --target migrator -t "$REPO:migrate-$TAG" --push .

new_revision() { # family image → new task definition ARN
  aws ecs describe-task-definition --region "$REGION" --task-definition "$1" --query taskDefinition \
    | jq --arg img "$2" '.containerDefinitions[0].image = $img
        | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' > /tmp/td.json
  aws ecs register-task-definition --region "$REGION" --cli-input-json file:///tmp/td.json --query taskDefinition.taskDefinitionArn --output text
}

echo "→ Running database migrations"
MIG_TD=$(new_revision "$MIGRATE_FAMILY" "$REPO:migrate-$TAG")
TASK=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$MIG_TD" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=$PUBLIC_IP}" \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK"
CODE=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
[[ "$CODE" == "0" ]] || { echo "✘ Migration failed (exit $CODE). Check CloudWatch log group /ecs/…, stream prefix 'migrate'."; exit 1; }

echo "→ Deploying app"
APP_TD=$(new_revision "$APP_FAMILY" "$REPO:$TAG")
aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$APP_TD" >/dev/null
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"

echo "→ Checking $URL/api/health"
curl -sf "$URL/api/health" && echo && echo "✔ Deployed $TAG to $URL"
