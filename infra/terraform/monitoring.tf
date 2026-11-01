resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alarms = {
    alb_5xx = {
      namespace   = "AWS/ApplicationELB"
      metric      = "HTTPCode_Target_5XX_Count"
      stat        = "Sum"
      threshold   = 10
      period      = 300
      comparison  = "GreaterThanThreshold"
      description = "App returned more than 10 5xx responses in 5 minutes"
      dimensions  = { LoadBalancer = aws_lb.this.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
    }
    unhealthy_targets = {
      namespace   = "AWS/ApplicationELB"
      metric      = "UnHealthyHostCount"
      stat        = "Maximum"
      threshold   = 0
      period      = 60
      comparison  = "GreaterThanThreshold"
      description = "A target is failing ALB health checks (GET /api/health)"
      dimensions  = { LoadBalancer = aws_lb.this.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
    }
    rds_cpu = {
      namespace   = "AWS/RDS"
      metric      = "CPUUtilization"
      stat        = "Average"
      threshold   = 80
      period      = 300
      comparison  = "GreaterThanThreshold"
      description = "Database CPU above 80%"
      dimensions  = { DBInstanceIdentifier = aws_db_instance.this.identifier }
    }
    rds_storage = {
      namespace   = "AWS/RDS"
      metric      = "FreeStorageSpace"
      stat        = "Minimum"
      threshold   = 2 * 1024 * 1024 * 1024
      period      = 300
      comparison  = "LessThanThreshold"
      description = "Database free storage below 2 GiB"
      dimensions  = { DBInstanceIdentifier = aws_db_instance.this.identifier }
    }
    ecs_memory = {
      namespace   = "AWS/ECS"
      metric      = "MemoryUtilization"
      stat        = "Average"
      threshold   = 85
      period      = 300
      comparison  = "GreaterThanThreshold"
      description = "App tasks using more than 85% memory"
      dimensions  = { ClusterName = aws_ecs_cluster.this.name, ServiceName = aws_ecs_service.app.name }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  threshold           = each.value.threshold
  period              = each.value.period
  evaluation_periods  = 2
  comparison_operator = each.value.comparison
  dimensions          = each.value.dimensions
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}
