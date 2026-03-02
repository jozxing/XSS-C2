#!/bin/bash
# 使用 uvicorn 启动 FastAPI 服务，并启用 TLS（证书位于 certs/）
uvicorn main:app \
  --host 0.0.0.0 \
  --port 8443 \
  --ssl-keyfile certs/key.pem \
  --ssl-certfile certs/cert.pem
