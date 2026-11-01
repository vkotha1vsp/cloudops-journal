#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 24.04 EC2 instance (run as a sudo-capable user).
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git unzip
# Docker Engine + Compose plugin from Docker's official repository
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
# AWS CLI v2 (used by backup.sh)
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip
unzip -q /tmp/awscli.zip -d /tmp && sudo /tmp/aws/install --update
# Unattended security updates
sudo apt-get install -y unattended-upgrades && sudo dpkg-reconfigure -f noninteractive unattended-upgrades
echo "Done. Log out and back in so the docker group applies."
