.PHONY: dev test train eval up smoke

dev:
	@echo "Starting dev servers..."
	@echo "Run services/ml, services/gateway, and apps/web in respective terminals."

test:
	pytest services/ml/tests -q
	npm --prefix services/gateway test
	npm --prefix apps/web test

train:
	python -m services.ml.training.build_manifest
	python -m services.ml.training.train_cnn
	python -m services.ml.training.calibrate
	python -m services.ml.training.compute_baselines

eval:
	python -m services.ml.training.evaluate

up:
	docker compose up --build

smoke:
	python scripts/e2e_smoke.py
