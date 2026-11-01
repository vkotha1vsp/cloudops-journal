# VPC with three tiers across two AZs:
#   public  – ALB (and NAT gateway)
#   app     – ECS tasks (private; egress via NAT, or tasks run in public when nat_gateway = "none")
#   db      – RDS (private, no route to the internet at all)

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = local.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.name}-public-${local.azs[count.index]}", Tier = "public" }
}

resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.app_subnets[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name}-app-${local.azs[count.index]}", Tier = "app" }
}

resource "aws_subnet" "db" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.db_subnets[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name}-db-${local.azs[count.index]}", Tier = "db" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count  = var.nat_gateway == "single" ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${local.name}-nat" }
}

resource "aws_nat_gateway" "this" {
  count         = var.nat_gateway == "single" ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = local.name }
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "app" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-app" }
}

resource "aws_route" "app_nat" {
  count                  = var.nat_gateway == "single" ? 1 : 0
  route_table_id         = aws_route_table.app.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

# Database subnets: local routes only.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-db" }
}

resource "aws_route_table_association" "db" {
  count          = 2
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# Free gateway endpoint: S3 traffic (attachments, ECR image layers) stays inside AWS.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.app.id, aws_route_table.public.id]
  tags              = { Name = "${local.name}-s3" }
}

# ── Security groups ───────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTPS entry point"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS from the internet"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  description       = "HTTP, redirected to HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "Forward and health-check to app tasks"
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "ECS tasks: inbound only from the ALB"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  description                  = "App port from ALB only"
}

resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS APIs, ECR, Cognito"
}

resource "aws_vpc_security_group_egress_rule" "app_to_db" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL"
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "RDS: inbound only from app tasks"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from app tasks and migration tasks"
}
