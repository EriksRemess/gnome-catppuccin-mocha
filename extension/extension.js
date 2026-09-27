import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const THEME_NAME = 'catppuccin-mocha';

export default class CatppuccinMochaTheme extends Extension {
    enable() {
        const path = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'themes',
            THEME_NAME,
            'gnome-shell',
            'gnome-shell.css',
        ]);

        this._stylesheet = Gio.File.new_for_path(path);
        if (!this._stylesheet.query_exists(null))
            throw new Error(`Theme stylesheet does not exist: ${path}`);

        this._sessionModeChangedId = Main.sessionMode.connect('updated', () => {
            this._scheduleApply();
        });
        this._apply();
    }

    disable() {
        if (this._sessionModeChangedId) {
            Main.sessionMode.disconnect(this._sessionModeChangedId);
            this._sessionModeChangedId = 0;
        }

        if (this._applySourceId) {
            GLib.Source.remove(this._applySourceId);
            this._applySourceId = 0;
        }

        this._stylesheet = null;
        Main.setThemeStylesheet(null);
        Main.loadTheme();
    }

    _scheduleApply() {
        if (this._applySourceId)
            return;

        this._applySourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._applySourceId = 0;
            this._apply();
            return GLib.SOURCE_REMOVE;
        });
    }

    _apply() {
        if (!this._stylesheet)
            return;

        Main.setThemeStylesheet(this._stylesheet.get_path());
        Main.loadTheme();
    }
}
