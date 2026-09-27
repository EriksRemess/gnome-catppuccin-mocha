SHELL := /bin/sh

BUILD_DIR ?= build
THEME_DIR := theme
UPSTREAM_DIR := vendor/gnome-shell-theme
BUILD_THEME_DIR := $(BUILD_DIR)/theme
THEME_NAME := catppuccin-mocha
THEME_RESOURCE := $(BUILD_DIR)/$(THEME_NAME).gresource
USER_THEME_CSS := $(BUILD_DIR)/user-theme/$(THEME_NAME)/gnome-shell/gnome-shell.css
GTK3_CSS := $(BUILD_DIR)/desktop/gtk-3.0/gtk.css
GTK4_CSS := $(BUILD_DIR)/desktop/gtk-4.0/gtk.css
MANIFEST := $(THEME_DIR)/gnome-shell-theme.gresource.xml
RESOURCE_CSS := \
	$(BUILD_THEME_DIR)/gdm.css \
	$(BUILD_THEME_DIR)/gnome-shell-dark.css \
	$(BUILD_THEME_DIR)/gnome-shell-high-contrast.css \
	$(BUILD_THEME_DIR)/gnome-shell-light.css
GENERATED_CSS := $(RESOURCE_CSS) $(USER_THEME_CSS) $(GTK3_CSS) $(GTK4_CSS)
SCSS_SOURCES := \
	$(THEME_DIR)/scss/_mocha.scss \
	$(THEME_DIR)/scss/_catppuccin.scss \
	$(THEME_DIR)/scss/_lock-screen.scss \
	$(THEME_DIR)/scss/gnome-shell.scss \
	$(THEME_DIR)/scss/gtk-3.0.scss \
	$(THEME_DIR)/scss/gtk-4.0.scss \
	$(shell find $(UPSTREAM_DIR) -type f -name '*.scss' -print)
STATIC_THEME_SOURCES := \
	$(UPSTREAM_DIR)/calendar-today-light.svg \
	$(UPSTREAM_DIR)/calendar-today.svg \
	$(UPSTREAM_DIR)/gnome-shell-start.svg \
	$(UPSTREAM_DIR)/pad-osd.css \
	$(UPSTREAM_DIR)/workspace-placeholder.svg
RESOURCE_SOURCES := $(RESOURCE_CSS) $(STATIC_THEME_SOURCES)

NODE ?= node

PREFIX ?= /usr/local
INSTALL_DIR ?= $(PREFIX)/share/gnome-shell
INSTALL_RESOURCE := $(INSTALL_DIR)/$(THEME_NAME).gresource
ALTERNATIVE_LINK ?= /usr/share/gnome-shell/gdm-theme.gresource
ALTERNATIVE_NAME ?= gdm-theme.gresource
ALTERNATIVE_PRIORITY ?= 50
LEGACY_ALTERNATIVE_NAME := gdm3-theme.gresource

.PHONY: all check update-upstream install-user uninstall-user enable-user-theme disable-user-theme install uninstall clean help

all: $(THEME_RESOURCE) $(USER_THEME_CSS) $(GTK3_CSS) $(GTK4_CSS)

$(GENERATED_CSS) &: $(SCSS_SOURCES) scripts/build-theme.js package.json package-lock.json upstream.json
	@command -v "$(NODE)" >/dev/null || { echo "error: Node.js is required" >&2; exit 1; }
	@test -d node_modules/sass || { echo "error: dependencies are missing; run: npm ci" >&2; exit 1; }
	@$(NODE) scripts/build-theme.js

$(THEME_RESOURCE): $(MANIFEST) $(RESOURCE_SOURCES) Makefile
	@command -v glib-compile-resources >/dev/null || { echo "error: glib-compile-resources is required" >&2; exit 1; }
	@mkdir -p "$(BUILD_DIR)"
	@set -eu; \
	resource_tmp="$(THEME_RESOURCE).tmp"; \
	trap 'rm -f "$$resource_tmp"' EXIT HUP INT TERM; \
	glib-compile-resources --sourcedir="$(BUILD_THEME_DIR)" --sourcedir="$(UPSTREAM_DIR)" --target="$$resource_tmp" "$(MANIFEST)"; \
	mv "$$resource_tmp" "$(THEME_RESOURCE)"; \
	trap - EXIT HUP INT TERM
	@echo "Built $(THEME_RESOURCE)"

check: $(THEME_RESOURCE) $(USER_THEME_CSS) $(GTK3_CSS) $(GTK4_CSS)
	@npm run check
	@cmp -s "$(BUILD_THEME_DIR)/gdm.css" "$(USER_THEME_CSS)" || { echo "error: GDM and user Shell stylesheets differ" >&2; exit 1; }
	@grep -Fq 'Managed by gnome-catppuccin-mocha' "$(GTK3_CSS)" || { echo "error: GTK 3 override is missing its managed marker" >&2; exit 1; }
	@grep -Fq 'Managed by gnome-catppuccin-mocha' "$(GTK4_CSS)" || { echo "error: GTK 4 override is missing its managed marker" >&2; exit 1; }
	@grep -Fq '#313244' "$(GTK3_CSS)" && grep -Fq '#cdd6f4' "$(GTK3_CSS)" || { echo "error: GTK 3 override is missing Catppuccin colors" >&2; exit 1; }
	@grep -Fq '#1e1e2e' "$(GTK4_CSS)" && grep -Fq '#89b4fa' "$(GTK4_CSS)" || { echo "error: GTK 4 override is missing Catppuccin colors" >&2; exit 1; }
	@set -eu; \
	extracted=$$(mktemp); \
	trap 'rm -f "$$extracted"' EXIT HUP INT TERM; \
	set -- $(RESOURCE_SOURCES); \
	actual_count=$$(gresource list "$(THEME_RESOURCE)" | wc -l); \
	test "$$actual_count" -eq "$$#" || { echo "error: compiled resource contains an unexpected number of files" >&2; exit 1; }; \
	for source do \
		case "$$source" in \
			$(BUILD_THEME_DIR)/*) relative=$${source#$(BUILD_THEME_DIR)/} ;; \
			$(UPSTREAM_DIR)/*) relative=$${source#$(UPSTREAM_DIR)/} ;; \
			*) echo "error: unexpected theme source: $$source" >&2; exit 1 ;; \
		esac; \
		gresource extract "$(THEME_RESOURCE)" "/org/gnome/shell/theme/$$relative" > "$$extracted"; \
		cmp -s "$$source" "$$extracted" || { echo "error: compiled $$relative differs from its source" >&2; exit 1; }; \
	done; \
	css="$(BUILD_THEME_DIR)/gdm.css"; \
	grep -Fq 'Catppuccin Mocha GNOME Shell theme' "$$css" || { echo "error: gdm.css is missing the theme marker" >&2; exit 1; }; \
	grep -Fq '#1e1e2e' "$$css" || { echo "error: gdm.css is missing the Mocha base color" >&2; exit 1; }; \
	grep -Fq '#cba6f7' "$$css" || { echo "error: gdm.css is missing the Mocha mauve accent" >&2; exit 1; }; \
	grep -Fq '#cdd6f4' "$$css" || { echo "error: gdm.css is missing the Mocha text color" >&2; exit 1; }; \
	if grep -Eq '#(ffffff|fafafb|222226|2e2e33|36363a|38383b|47474c)|-st-accent-(fg-)?color' "$$css"; then \
		echo "error: gdm.css still contains an unrecolored core default color" >&2; \
		exit 1; \
	fi
	@echo "Validated $(THEME_RESOURCE)"

update-upstream:
	@npm run upstream:update $(if $(strip $(UPSTREAM_REF)),-- --ref "$(UPSTREAM_REF)")

install-user: check
	@$(NODE) scripts/manage-user-theme.js install $(if $(strip $(USER_INSTALL_HOME)),--home "$(USER_INSTALL_HOME)")
	@if test -z "$(USER_INSTALL_HOME)"; then \
		command -v gjs >/dev/null || { echo "error: gjs is required to enable the Shell extension" >&2; exit 1; }; \
		gjs -m scripts/configure-extension.js enable; \
	fi

uninstall-user:
	@if test -n "$(USER_INSTALL_HOME)"; then \
		$(NODE) scripts/manage-user-theme.js uninstall --home "$(USER_INSTALL_HOME)"; \
	else \
		command -v gjs >/dev/null || { echo "error: gjs is required to disable the Shell extension" >&2; exit 1; }; \
		gjs -m scripts/configure-extension.js disable; \
		if ! $(NODE) scripts/manage-user-theme.js uninstall; then \
			gjs -m scripts/configure-extension.js enable || \
				echo "warning: failed to re-enable the extension after uninstall rollback" >&2; \
			exit 1; \
		fi; \
	fi

enable-user-theme:
	@command -v gjs >/dev/null || { echo "error: gjs is required to enable the Shell extension" >&2; exit 1; }
	@gjs -m scripts/configure-extension.js enable

disable-user-theme:
	@command -v gjs >/dev/null || { echo "error: gjs is required to disable the Shell extension" >&2; exit 1; }
	@gjs -m scripts/configure-extension.js disable

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
		'make update-upstream [UPSTREAM_REF=VERSION]  Refresh the pinned GNOME source' \
		'make            Compile SCSS and the self-contained theme resource' \
		'make check      Verify generated CSS and the theme resource' \
		'make install-user    Install and enable the Shell/lock-screen theme and GTK overrides' \
		'make uninstall-user  Remove project-managed user theme files' \
		'make enable-user-theme   Enable the installed Shell/lock-screen extension' \
		'make disable-user-theme  Disable the Shell/lock-screen extension' \
		'sudo make install    Install and select the GDM theme' \
		'sudo make uninstall  Remove it and return to the remaining alternative' \
		'make clean      Remove generated files'
