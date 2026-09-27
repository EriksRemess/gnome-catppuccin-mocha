# Catppuccin Mocha for GNOME and GDM

A maintainable Catppuccin Mocha recoloring of GNOME Shell 50.1, GDM, GTK 3,
and GTK 4/libadwaita. GNOME Shell and GDM are compiled from the same pinned
upstream source and share one Catppuccin palette with the GTK overrides.

The current snapshot has been built and checked against GNOME Shell 50.1 on
Ubuntu 26.04.

## How the source is organized

- `vendor/gnome-shell-theme/` is an unmodified snapshot of GNOME Shell's
  `data/theme` directory.
- `upstream.json` records the requested ref, resolved commit, archive checksum,
  and checksum of every vendored file.
- `theme/scss/_mocha.scss` is the shared Catppuccin Mocha palette.
- `theme/scss/_catppuccin.scss` maps that palette onto GNOME Shell's semantic
  theme variables.
- `theme/scss/gnome-shell.scss` imports GNOME's complete theme and inserts the
  Catppuccin overlay before GNOME's drawing and widget partials.
- `theme/scss/gtk-3.0.scss` and `gtk-4.0.scss` contain the user-level GTK
  overrides.
- `scripts/build-theme.js` compiles every generated stylesheet.

New GNOME selectors and component changes are inherited when the snapshot is
refreshed. The custom source remains small enough to review directly.

## Build and verify

The build requires Node.js 20 or newer, GNU Make, `gresource`, and
`glib-compile-resources`. Dart Sass is pinned in `package-lock.json`.

```sh
npm ci
make check
```

Normal builds do not use the network. They produce:

- `build/catppuccin-mocha.gresource` for GDM;
- `build/user-theme/catppuccin-mocha/gnome-shell/gnome-shell.css` for the User
  Themes extension; and
- `build/desktop/gtk-{3,4}.0/gtk.css` for application overrides.

`make check` verifies the vendored source hashes, generated output, identical
GDM/user-theme CSS, the complete upstream selector sequence, recolored GNOME
values, and every file within the GDM resource.

## Install the desktop theme

Install GNOME Shell and both GTK overrides for the current user:

```sh
make install-user
```

This installs only user-owned files:

```text
~/.local/share/themes/catppuccin-mocha/gnome-shell/gnome-shell.css
~/.config/gtk-3.0/gtk.css
~/.config/gtk-4.0/gtk.css
```

Installation runs the complete validation suite first. The installer refuses
to replace unmanaged files. Managed installations carry a manifest covering
every directory and file, so an update or uninstall also refuses to overwrite
changes made after installation. Shell and GTK changes are committed as one
transaction and rolled back together if an installation step fails.

Select `catppuccin-mocha` in the User Themes extension. The GTK overrides are
loaded by newly started applications. For a consistently dark GTK 3 base,
select GNOME's dark appearance or run:

```sh
gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita-dark'
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
```

Log out and back in to ensure every Shell and application process reloads its
theme.

To remove only files managed by this project:

```sh
make uninstall-user
```

Then select `Default` in the User Themes extension and reset GNOME's appearance
settings if desired:

```sh
gsettings reset org.gnome.desktop.interface gtk-theme
gsettings reset org.gnome.desktop.interface color-scheme
```

## Install the GDM theme

Ubuntu exposes GDM's Shell theme through the `gdm-theme.gresource`
`update-alternatives` group. Build as your normal user, then install the
already-built resource as root:

```sh
make check
sudo make install
```

The installer copies the resource to
`/usr/local/share/gnome-shell/catppuccin-mocha.gresource`, registers it with
`update-alternatives`, and selects it. It does not restart GDM because that
would terminate graphical sessions. Save your work and reboot to see it.

Remove the GDM theme with:

```sh
sudo make uninstall
```

For packaging or installer testing, `DESTDIR` stages the GDM resource without
calling `update-alternatives`:

```sh
make install DESTDIR=/tmp/gdm-catppuccin-stage
make uninstall DESTDIR=/tmp/gdm-catppuccin-stage
```

## Refresh the GNOME source

Choose a GNOME Shell release compatible with the target system. Do not update
blindly to GNOME's development branch.

```sh
gnome-shell --version
make update-upstream UPSTREAM_REF=50.1
git diff -- upstream.json vendor/gnome-shell-theme
make clean
make check
```

The updater resolves the ref through GNOME's read-only GitHub mirror, downloads
that commit, and replaces only the vendored `data/theme` snapshot. It refuses
to overwrite local edits within the existing snapshot. Review the upstream
diff before accepting it; the checks expose missing selectors and unmapped
colors that require changes to `_catppuccin.scss`.

## Licensing

The Shell theme is derived from GNOME Shell's default theme. Original copyright
and license notices are preserved in the vendored source. The relevant Debian
package copyright record is included as `COPYING.GNOME`, and the LGPL 2.1 text
as `COPYING.LGPL-2.1`. `gnome-shell-start.svg` retains its original Creative
Commons Attribution-ShareAlike 4.0 license metadata.
