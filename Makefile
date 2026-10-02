# LiveClass — reproducible WebSocket load test.
#
#   make load-test STUDENTS=250
#
# Requires Postgres + Redis, the uv venv (`uv sync`), and pnpm install.
# Writes a machine-readable JSON result under tests/load/results/ and prints a
# human-readable summary. Exits non-zero unless the run passes
# (100% connection + sync success, 0 failed operations).

STUDENTS ?= 250
DOCUMENTS ?= 8
DURATION ?= 20

.PHONY: help load-test load-test-smoke

help:
	@echo "make load-test STUDENTS=250   # 1 teacher + N students WebSocket load test"
	@echo "make load-test-smoke          # quick 25-student smoke run"

load-test:
	pnpm exec tsx tests/load/loadtest.ts --students $(STUDENTS) --documents $(DOCUMENTS) --duration $(DURATION)

load-test-smoke:
	pnpm exec tsx tests/load/loadtest.ts --students 25 --documents 4 --duration 8
