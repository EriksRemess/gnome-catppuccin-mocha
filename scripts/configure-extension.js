import Gio from 'gi://Gio';

const extensionUuid = 'catppuccin-mocha@gnome-catppuccin-mocha';
const action = ARGV.shift();
const shellSchemaId = 'org.gnome.shell';

function findShellSchema() {
    let source = Gio.SettingsSchemaSource.get_default();
    let schema = source?.lookup(shellSchemaId, true);

    if (schema)
        return schema;

    // Remote and non-graphical shells sometimes inherit an XDG_DATA_DIRS that
    // omits /usr/share. Fall back to the standard compiled schema locations so
    // installing the extension does not depend on the caller's desktop env.
    for (const directory of [
        '/usr/local/share/glib-2.0/schemas',
        '/usr/share/glib-2.0/schemas',
    ]) {
        try {
            source = Gio.SettingsSchemaSource.new_from_directory(
                directory,
                source,
                false,
            );
        } catch (_error) {
            continue;
        }

        schema = source.lookup(shellSchemaId, true);
        if (schema)
            return schema;
    }

    throw new Error(
        `GSettings schema ${shellSchemaId} was not found in the default or system schema directories`,
    );
}

if (!['enable', 'disable'].includes(action) || ARGV.length > 0)
    throw new Error('usage: configure-extension.js <enable|disable>');

const settings = new Gio.Settings({settings_schema: findShellSchema()});
const enabledExtensions = settings.get_strv('enabled-extensions');
const enabled = new Set(enabledExtensions);
const disabledExtensions = settings.get_strv('disabled-extensions');
const disabled = new Set(disabledExtensions);

if (action === 'enable') {
    enabled.add(extensionUuid);
    disabled.delete(extensionUuid);
} else {
    enabled.delete(extensionUuid);
    disabled.delete(extensionUuid);
}

const updatedExtensions = [...enabled];
if (updatedExtensions.length !== enabledExtensions.length ||
    updatedExtensions.some((uuid, index) => uuid !== enabledExtensions[index])) {
    if (!settings.set_strv('enabled-extensions', updatedExtensions))
        throw new Error('GNOME rejected the enabled-extensions update');
    Gio.Settings.sync();
}

const updatedDisabledExtensions = [...disabled];
if (updatedDisabledExtensions.length !== disabledExtensions.length ||
    updatedDisabledExtensions.some((uuid, index) => uuid !== disabledExtensions[index])) {
    if (!settings.set_strv('disabled-extensions', updatedDisabledExtensions))
        throw new Error('GNOME rejected the disabled-extensions update');
    Gio.Settings.sync();
}

print(`${action === 'enable' ? 'Enabled' : 'Disabled'} ${extensionUuid}`);
