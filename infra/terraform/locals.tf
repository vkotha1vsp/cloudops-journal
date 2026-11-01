locals {
  name       = "${var.project}-${var.environment}"
  app_domain = "${var.app_subdomain}.${trimsuffix(var.hosted_zone_name, ".")}"
  app_url    = "https://${local.app_domain}"
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  account_id = data.aws_caller_identity.current.account_id

  # Subnets: /20s carved out of the VPC CIDR.
  public_subnets  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 4, i)]
  app_subnets     = [for i in range(2) : cidrsubnet(var.vpc_cidr, 4, i + 4)]
  db_subnets      = [for i in range(2) : cidrsubnet(var.vpc_cidr, 4, i + 8)]
  tasks_in_public = var.nat_gateway == "none"
}
