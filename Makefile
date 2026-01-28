SHELL := bash

.PHONY: sync lint format format_check lint_deno fmt_deno fmt_deno_check check_deno bump_patch bump_minor bump_major

default: lint

publish: ; deno task publish
# Combined linting targets
sync: ./repo_sync.sh
	$(SHELL) ./repo_sync.sh

# Note: lint also runs formatting to ensure code is properly formatted before linting
lint: format check_deno lint_deno
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "✅ Lint check complete"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

format: fmt_deno
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "✅ Formatting complete"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

format_check: fmt_deno_check
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "✅ Format check complete"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Deno workspace commands
lint_deno:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "🔎 Linting Deno workspace..."
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@deno task lint || (echo ""; echo "❌ Deno lint failed. Check output above for errors."; exit 1)

fmt_deno:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "✨ Formatting Deno workspace..."
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@deno task fmt

fmt_deno_check:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "🔍 Checking Deno formatting..."
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@deno task fmt:check || (echo ""; echo "❌ Deno format check failed. Run 'make format' to fix formatting issues."; exit 1)

check_deno:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "✅ Running full Deno checks (fmt + lint + typecheck)..."
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@deno task check

# Version bumping targets
bump_patch:
	@current=$$(grep -o '"version": "[^"]*"' deno.json | cut -d'"' -f4); \
	major=$$(echo $$current | cut -d'.' -f1); \
	minor=$$(echo $$current | cut -d'.' -f2); \
	patch=$$(echo $$current | cut -d'.' -f3); \
	new_version="$${major}.$${minor}.$$((patch + 1))"; \
	sed -i '' "s/\"version\": \"$$current\"/\"version\": \"$$new_version\"/" deno.json; \
	echo "Bumped version from $$current to $$new_version"

bump_minor:
	@current=$$(grep -o '"version": "[^"]*"' deno.json | cut -d'"' -f4); \
	major=$$(echo $$current | cut -d'.' -f1); \
	minor=$$(echo $$current | cut -d'.' -f2); \
	new_version="$${major}.$$((minor + 1)).0"; \
	sed -i '' "s/\"version\": \"$$current\"/\"version\": \"$$new_version\"/" deno.json; \
	echo "Bumped version from $$current to $$new_version"

bump_major:
	@current=$$(grep -o '"version": "[^"]*"' deno.json | cut -d'"' -f4); \
	major=$$(echo $$current | cut -d'.' -f1); \
	new_version="$$((major + 1)).0.0"; \
	sed -i '' "s/\"version\": \"$$current\"/\"version\": \"$$new_version\"/" deno.json; \
	echo "Bumped version from $$current to $$new_version"

