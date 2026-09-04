.PHONY: all build up down logs clean backend-install frontend-install mytuskers-up mytuskers-verify package-lambda build-frontend build-pilot-assets

all: up

build:
	docker compose build

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

clean:
	docker compose down --volumes --remove-orphans

backend-install:
	cd backend && npm install

frontend-install:
	cd frontend && npm install

mytuskers-up:
	docker compose up -d --build localstack mytuskers-api mytuskers-web

mytuskers-verify:
	npm run mytuskers:verify

package-lambda:
	docker compose -f docker-compose.deploy.yml run --rm node "apk add --no-cache zip >/dev/null && rm -rf /tmp/backend-lambda /workspace/build/backend-lambda.zip && mkdir -p /tmp/backend-lambda /workspace/build && cp /workspace/backend/package*.json /tmp/backend-lambda/ && cd /tmp/backend-lambda && npm ci --omit=dev && cp -R /workspace/backend/src /tmp/backend-lambda/src && zip -qr /workspace/build/backend-lambda.zip ."

build-frontend:
	docker compose -f docker-compose.deploy.yml run --rm node "rm -rf /tmp/frontend-build /workspace/frontend/dist && mkdir -p /tmp/frontend-build && cp /workspace/frontend/package*.json /tmp/frontend-build/ && cp /workspace/frontend/index.html /tmp/frontend-build/ && cp /workspace/frontend/vite.config.* /tmp/frontend-build/ 2>/dev/null || true && cp -R /workspace/frontend/src /tmp/frontend-build/src && cd /tmp/frontend-build && npm ci && npm run build && cp -R dist /workspace/frontend/dist"

build-pilot-assets: build-frontend package-lambda
