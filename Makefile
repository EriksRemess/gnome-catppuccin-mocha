SHELL := /bin/sh

BUILD_DIR ?= build
THEME_DIR := theme
BUILD_THEME_DIR := $(BUILD_DIR)/theme
THEME_NAME := catppuccin-mocha
THEME_RESOURCE := $(BUILD_DIR)/$(THEME_NAME).gresource
MANIFEST := $(THEME_DIR)/gnome-shell-theme.gresource.xml
COMPILED_CSS := $(BUILD_THEME_DIR)/gdm.css
SCSS_SOURCES := \
	$(THEME_DIR)/scss/_palette.scss \
	$(THEME_DIR)/scss/gdm.scss
STATIC_THEME_SOURCES := \
	$(THEME_DIR)/calendar-today-light.svg \
	$(THEME_DIR)/calendar-today.svg \
	$(THEME_DIR)/gnome-shell-dark.css \
	$(THEME_DIR)/gnome-shell-high-contrast.css \
	$(THEME_DIR)/gnome-shell-light.css \
	$(THEME_DIR)/gnome-shell-start.svg \
	$(THEME_DIR)/pad-osd.css \
	$(THEME_DIR)/workspace-placeholder.svg
RESOURCE_SOURCES := $(COMPILED_CSS) $(STATIC_THEME_SOURCES)

NODE ?= node

PREFIX ?= /usr/local
INSTALL_DIR ?= $(PREFIX)/share/gnome-shell
INSTALL_RESOURCE := $(INSTALL_DIR)/$(THEME_NAME).gresource
ALTERNATIVE_LINK ?= /usr/share/gnome-shell/gdm-theme.gresource
ALTERNATIVE_NAME ?= gdm-theme.gresource
ALTERNATIVE_PRIORITY ?= 50
LEGACY_ALTERNATIVE_NAME := gdm3-theme.gresource

.PHONY: all check install uninstall clean help

all: $(THEME_RESOURCE)

$(COMPILED_CSS): $(SCSS_SOURCES) scripts/build-theme.mjs package.json package-lock.json
	@command -v "$(NODE)" >/dev/null || { echo "error: Node.js is required" >&2; exit 1; }
	@test -d node_modules/sass || { echo "error: dependencies are missing; run: npm ci" >&2; exit 1; }
	@$(NODE) scripts/build-theme.mjs

$(THEME_RESOURCE): $(MANIFEST) $(RESOURCE_SOURCES) Makefile
	@command -v glib-compile-resources >/dev/null || { echo "error: glib-compile-resources is required" >&2; exit 1; }
	@mkdir -p "$(BUILD_DIR)"
	@set -eu; \
	resource_tmp="$(THEME_RESOURCE).tmp"; \
	trap 'rm -f "$$resource_tmp"' EXIT HUP INT TERM; \
	glib-compile-resources --sourcedir="$(BUILD_THEME_DIR)" --sourcedir="$(THEME_DIR)" --target="$$resource_tmp" "$(MANIFEST)"; \
	mv "$$resource_tmp" "$(THEME_RESOURCE)"; \
	trap - EXIT HUP INT TERM
	@echo "Built $(THEME_RESOURCE)"

check: $(THEME_RESOURCE)
	@$(NODE) scripts/build-theme.mjs --check
	@set -eu; \
	extracted=$$(mktemp); \
	trap 'rm -f "$$extracted"' EXIT HUP INT TERM; \
	set -- $(RESOURCE_SOURCES); \
	actual_count=$$(gresource list "$(THEME_RESOURCE)" | wc -l); \
	test "$$actual_count" -eq "$$#" || { echo "error: compiled resource contains an unexpected number of files" >&2; exit 1; }; \
	for source do \
		case "$$source" in \
			$(BUILD_THEME_DIR)/*) relative=$${source#$(BUILD_THEME_DIR)/} ;; \
			$(THEME_DIR)/*) relative=$${source#$(THEME_DIR)/} ;; \
			*) echo "error: unexpected theme source: $$source" >&2; exit 1 ;; \
		esac; \
		gresource extract "$(THEME_RESOURCE)" "/org/gnome/shell/theme/$$relative" > "$$extracted"; \
		cmp -s "$$source" "$$extracted" || { echo "error: compiled $$relative differs from its source" >&2; exit 1; }; \
	done; \
	css="$(COMPILED_CSS)"; \
	grep -Fq 'Catppuccin Mocha GDM theme' "$$css" || { echo "error: gdm.css is missing the theme marker" >&2; exit 1; }; \
	grep -Fq '#1e1e2e' "$$css" || { echo "error: gdm.css is missing the Mocha base color" >&2; exit 1; }; \
	grep -Fq '#cba6f7' "$$css" || { echo "error: gdm.css is missing the Mocha mauve accent" >&2; exit 1; }; \
	grep -Fq '#cdd6f4' "$$css" || { echo "error: gdm.css is missing the Mocha text color" >&2; exit 1; }; \
	if grep -Eq '#(ffffff|fafafb|222226|2e2e33|36363a|38383b|47474c)|-st-accent-(fg-)?color' "$$css"; then \
		echo "error: gdm.css still contains an unrecolored core default color" >&2; \
		exit 1; \
	fi
	@echo "Validated $(THEME_RESOURCE)"

install:
	@if ! $(MAKE) --no-print-directory -q all; then \
		echo "error: build is missing or stale; run as your normal user: make check" >&2; \
		exit 1; \
	fi
	@test -r "$(THEME_RESOURCE)" || { echo "error: cannot read $(THEME_RESOURCE)" >&2; exit 1; }
	@if test -z "$(DESTDIR)" && test "$$(id -u)" -ne 0; then \
		echo "error: system installation requires root; run: sudo make install" >&2; \
		exit 1; \
	fi
	@if test -z "$(DESTDIR)"; then \
		command -v update-alternatives >/dev/null || { echo "error: update-alternatives is required" >&2; exit 1; }; \
	fi
	@install -D -m 0644 "$(THEME_RESOURCE)" "$(DESTDIR)$(INSTALL_RESOURCE)"
	@if test -n "$(DESTDIR)"; then \
		echo "Staged $(DESTDIR)$(INSTALL_RESOURCE)"; \
	else \
		if update-alternatives --list "$(LEGACY_ALTERNATIVE_NAME)" 2>/dev/null | grep -Fxq "$(INSTALL_RESOURCE)"; then \
			update-alternatives --remove "$(LEGACY_ALTERNATIVE_NAME)" "$(INSTALL_RESOURCE)"; \
		fi; \
		update-alternatives --install "$(ALTERNATIVE_LINK)" "$(ALTERNATIVE_NAME)" "$(INSTALL_RESOURCE)" "$(ALTERNATIVE_PRIORITY)"; \
		update-alternatives --set "$(ALTERNATIVE_NAME)" "$(INSTALL_RESOURCE)"; \
		active_resource=$$(readlink -f "$(ALTERNATIVE_LINK)"); \
		test "$$active_resource" = "$(INSTALL_RESOURCE)" || { echo "error: GDM theme link resolves to $$active_resource" >&2; exit 1; }; \
		echo "Installed and selected $(THEME_NAME). Save your work and reboot to display it."; \
	fi

uninstall:
	@if test -z "$(DESTDIR)" && test "$$(id -u)" -ne 0; then \
		echo "error: system removal requires root; run: sudo make uninstall" >&2; \
		exit 1; \
	fi
	@if test -n "$(DESTDIR)"; then \
		rm -f "$(DESTDIR)$(INSTALL_RESOURCE)"; \
		echo "Removed $(DESTDIR)$(INSTALL_RESOURCE)"; \
	else \
		if update-alternatives --list "$(ALTERNATIVE_NAME)" 2>/dev/null | grep -Fxq "$(INSTALL_RESOURCE)"; then \
			update-alternatives --remove "$(ALTERNATIVE_NAME)" "$(INSTALL_RESOURCE)"; \
		fi; \
		if update-alternatives --list "$(LEGACY_ALTERNATIVE_NAME)" 2>/dev/null | grep -Fxq "$(INSTALL_RESOURCE)"; then \
			update-alternatives --remove "$(LEGACY_ALTERNATIVE_NAME)" "$(INSTALL_RESOURCE)"; \
		fi; \
		rm -f "$(INSTALL_RESOURCE)"; \
		echo "Removed $(THEME_NAME). Save your work and reboot to display the default theme."; \
	fi

clean:
	@case "$(abspath $(BUILD_DIR))" in \
		/|"$(CURDIR)") echo "error: refusing to remove unsafe BUILD_DIR=$(BUILD_DIR)" >&2; exit 1 ;; \
		*) rm -rf -- "$(BUILD_DIR)" ;; \
	esac

help:
	@printf '%s\n' \
		'npm ci          Install the pinned Sass compiler dependency' \
		'make            Compile SCSS and the self-contained theme resource' \
		'make check      Verify generated CSS and the theme resource' \
		'sudo make install    Install and select the GDM theme' \
		'sudo make uninstall  Remove it and return to the remaining alternative' \
		'make clean      Remove generated files'
