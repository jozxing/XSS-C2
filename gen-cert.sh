#!/bin/bash
# 生成自签名证书（若已存在则不重复生成）
mkdir -p certs
if [[ ! -f certs/cert.pem || ! -f certs/key.pem ]]; then
  # CN=localhost，仅用于本地或受控环境测试
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout certs/key.pem -out certs/cert.pem \
    -days 365 -subj "/CN=localhost"
  echo "[✔] cert generated"
else
  echo "[✓] cert already generated"
fi
