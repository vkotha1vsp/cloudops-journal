# Uses your existing hosted zone. Nothing about domain registration changes.
data "aws_route53_zone" "this" {
  name         = var.hosted_zone_name
  private_zone = false
}

resource "aws_acm_certificate" "app" {
  domain_name       = local.app_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
  tags = { Name = local.app_domain }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.app.domain_validation_options : o.domain_name => {
      name   = o.resource_record_name
      type   = o.resource_record_type
      record = o.resource_record_value
    }
  }
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Route 53 alias → ALB. DNS resolution only; requests go straight from browser to ALB.
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = local.app_domain
  type    = "A"
  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
