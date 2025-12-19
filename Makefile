.PHONY: help serve serve-drafts build clean install update-theme deploy dev lint check preview thumbnails descriptions

# Project variables
GIT_ROOT := $(shell git rev-parse --show-toplevel)
HUGO := hugo
HUGO_PORT := 1313

# Default target
.DEFAULT_GOAL := help

## help: Show this help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Development targets:"
	@echo "  serve          - Start Hugo development server (auto-reload)"
	@echo "  dev            - Alias for serve"
	@echo ""
	@echo "Build targets:"
	@echo "  build          - Build the static site for production"
	@echo "  clean          - Remove generated files and caches"
	@echo ""
	@echo "Deployment targets:"
	@echo "  deploy         - Commit and push changes"
	@echo ""
	@echo "Maintenance targets:"
	@echo "  install        - Install Hugo, themes, and npm dependencies"
	@echo "  update         - Update themes and npm dependencies"
	@echo "  check          - Check Hugo configuration and content"
	@echo "  lint           - Validate content and links"

## serve: Start Hugo development server
serve:
	@echo "Starting Hugo development server on http://localhost:$(HUGO_PORT)..."
	$(HUGO) server --buildDrafts=false --buildFuture=false --disableFastRender --config config.yaml,config.local.yaml --baseURL http://localhost:$(HUGO_PORT)/ --appendPort=false

## dev: Alias for serve
dev: serve

## build: Build the static site locally
build: clean thumbnails descriptions
	@echo "Building Hugo site..."
	$(HUGO) --minify
	@echo "Build complete! Output in public/"

## preview: Build the static site for local preview (relative URLs)
preview: clean thumbnails descriptions
	@echo "Building Hugo site for local preview..."
	$(HUGO) --minify --config config.yaml,config.local.yaml --baseURL http://localhost:$(HUGO_PORT)/
	@echo "Preview build complete! Output in public/"

## thumbnails: Generate cached README thumbnails for featured projects
thumbnails:
	@echo "Generating project thumbnails (cached)..."
	@npm run thumbnails

## descriptions: Refresh featured project descriptions from GitHub
descriptions:
	@echo "Refreshing project descriptions..."
	@npm run descriptions

## clean: Remove generated files
clean:
	@echo "Cleaning generated files..."
	@rm -rf public/
	@rm -rf resources/_gen/
	@rm -f .hugo_build.lock
	@echo "Clean complete!"

## install: Install Hugo modules and update theme
install:
	@echo "Checking for Hugo installation..."
	@if ! command -v hugo &> /dev/null; then \
		echo "Hugo not found. Installing Hugo..."; \
		if command -v brew &> /dev/null; then \
			brew install hugo; \
		elif command -v apt-get &> /dev/null; then \
			sudo apt-get update && sudo apt-get install -y hugo; \
		elif command -v snap &> /dev/null; then \
			sudo snap install hugo; \
		else \
			echo "Error: Could not detect package manager. Please install Hugo manually from https://gohugo.io/installation/"; \
			exit 1; \
		fi; \
	else \
		echo "Hugo is already installed: $$(hugo version)"; \
	fi
	@echo "Installing Hugo modules..."
	@if [ -f go.mod ]; then $(HUGO) mod get -u; fi
	@git submodule update --init --recursive
	@echo "Installing npm dependencies..."
	@npm install
	@echo "Installation complete!"

## update: Update dependencies
update:
	@echo "Updating PaperMod theme..."
	@git submodule update --remote --merge themes/PaperMod
	@echo "Updating npm dependencies..."
	@npm update
	@echo "Dependencies updated!"

## check: Check Hugo configuration
check:
	@echo "Checking Hugo configuration..."
	$(HUGO) config
	@echo ""
	@echo "Checking Hugo environment..."
	$(HUGO) env

## lint: Validate content and check for broken links
lint:
	@echo "Validating content..."
	@$(HUGO) --renderToMemory --quiet || (echo "Content validation failed!" && exit 1)
	@echo "Content validation passed!"

## deploy: Commit and push changes (uses commitlint prompt)
deploy:
	@echo "Preparing to deploy..."
	@git status --short
	@echo ""
	@echo "Creating commit with commitlint prompt..."
	@git add .
	@npm run commit
	@git push origin main
	@echo ""
	@echo "Changes pushed!"
	@git log --oneline -n 5
