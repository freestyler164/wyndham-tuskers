.PHONY: all build up down logs clean backend-install frontend-install

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
