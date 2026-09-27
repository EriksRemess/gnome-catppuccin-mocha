# Catppuccin Mocha for GDM

A self-contained Catppuccin Mocha theme for the GNOME Display Manager. The
project follows GNOME Shell's default theme instead of maintaining a detached
copy of its generated CSS.

The current snapshot is GNOME Shell 50.1 and has been built and checked against
GNOME Shell 50.1 on Ubuntu 26.04.

## How the source is organized

- `vendor/gnome-shell-theme/` is an unmodified snapshot of GNOME Shell's
  `data/theme` directory.
- `upstream.json` records the requested ref, resolved commit, archive checksum,
  and checksum of every vendored file.
- `theme/scss/gdm.scss` imports GNOME's complete theme and inserts the
  Catppuccin overlay before GNOME's drawing and widget partials.
- `theme/scss/_catppuccin.scss` is the maintained color overlay. It is the
  normal place to change the theme.
- `scripts/build-theme.js` compiles the Catppuccin GDM stylesheet and all stock
  stylesheets used by the resource.

This means new GNOME selectors and component changes are inherited on an
upstream refresh. The custom source remains small enough to review directly.

## Build and verify

The build requires Node.js 20 or newer, GNU Make, `gresource`, and
`glib-compile-resources`. Dart Sass is pinned in `package-lock.json`.

```sh
npm ci
make check
```

Normal builds do not use the network. `make check` verifies that:

- the vendored source exactly matches `upstream.json`;
- generated CSS is current;
- Catppuccin and stock GNOME dark CSS have the same selector structure;
- old GNOME palette colors did not leak into the custom stylesheet; and
- every file in the compiled resource matches its source.

Generated files are written below `build/` and are not committed.

## Refresh the GNOME source

Choose a GNOME Shell release compatible with the system where GDM will use the
theme. Do not update blindly to GNOME's development branch.

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
diff before accepting it; `make check` then exposes missing selectors and
unmapped colors that require changes to `_catppuccin.scss`.

## Palette

The overlay uses the official Catppuccin Mocha palette. Its main colors are:

- Base `#1e1e2e` for the login background
- Surface colors `#313244`, `#45475a`, and `#585b70` for controls
- Text `#cdd6f4` and the Mocha subtext colors for labels
- Mauve `#cba6f7` for focus and selection
- Red, peach, and yellow for destructive and warning states

## Install

Ubuntu exposes GDM's Shell theme through the `gdm-theme.gresource`
`update-alternatives` group. Build as your normal user, then install the
already-built resource as root:

```sh
make check
sudo make install
```

Installation copies the resource to
`/usr/local/share/gnome-shell/catppuccin-mocha.gresource`, registers it with
`update-alternatives`, and selects it. The installer does not restart GDM
because that would terminate graphical sessions. Save your work and reboot to
see the result.

After updating GNOME Shell, refresh this repository to the matching release,
rebuild, review the checks, and reinstall the generated resource.

## Uninstall

```sh
sudo make uninstall
```

This unregisters and removes the custom resource. `update-alternatives` then
selects the remaining default resource. Reboot after saving your work.

For packaging or installer testing, `DESTDIR` stages the resource without
calling `update-alternatives`:

```sh
make install DESTDIR=/tmp/gdm-catppuccin-stage
make uninstall DESTDIR=/tmp/gdm-catppuccin-stage
```

## Licensing

The theme is derived from GNOME Shell's default theme. Original copyright and
license notices are preserved in the vendored source. The relevant Debian
package copyright record is included as `COPYING.GNOME`, and the LGPL 2.1 text
as `COPYING.LGPL-2.1`. `gnome-shell-start.svg` contains its original Creative
Commons Attribution-ShareAlike 4.0 license metadata.
