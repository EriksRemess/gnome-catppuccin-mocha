# Catppuccin Mocha for GDM

A self-contained Catppuccin Mocha theme for the GNOME Display Manager. It was
created from GNOME Shell 50.1's default GDM theme and now keeps its own SCSS,
resource manifest, and assets in this repository. Building does not read or
patch the theme currently installed on the system.

The current project has been built and checked against GNOME Shell 50.1 on
Ubuntu 26.04.

## Palette

The theme uses the official Catppuccin Mocha palette:

- Base `#1e1e2e` for the login background
- Surface colors `#313244`, `#45475a`, and `#585b70` for controls
- Text `#cdd6f4` and subtext colors for labels
- Mauve `#cba6f7` for focus and selection
- Red, peach, and yellow for destructive and warning states

## Build and verify

The build uses Node.js 20 or newer and the pinned Dart Sass package. GNU Make,
`gresource`, and `glib-compile-resources` are also required. On Debian and
Ubuntu, the latter two are provided by GLib packages and are normally already
present on a GNOME installation.

```sh
npm ci
make
make check
```

`theme/scss/gdm.scss` is the maintained theme source and
`theme/scss/_palette.scss` contains the named Catppuccin colors. The ESM
compiler in `scripts/build-theme.mjs` writes `build/theme/gdm.css`; Make then
packages it with the static theme assets as
`build/catppuccin-mocha.gresource`. Generated output and `node_modules` are
ignored by Git.

## Install

Ubuntu exposes GDM's Shell theme through the `gdm-theme.gresource`
`update-alternatives` group. Build as your normal user, then install the already
built resource as root:

```sh
make check
sudo make install
```

Installation copies the resource to
`/usr/local/share/gnome-shell/catppuccin-mocha.gresource`, registers it with
`update-alternatives`, and selects it. The installer deliberately does not
restart GDM because doing so terminates graphical sessions. Save your work and
reboot to see the result.

After a GNOME Shell update, rebuild and reinstall normally. If GNOME changes
GDM's CSS API, this independent theme may need to be updated against the new
upstream default before it is compatible:

```sh
make clean
make check
sudo make install
```

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
license notices remain in the source files; the relevant Debian package
copyright record is included as `COPYING.GNOME`, and the LGPL 2.1 text as
`COPYING.LGPL-2.1`. `gnome-shell-start.svg` contains its original Creative
Commons Attribution-ShareAlike 4.0 license metadata.
