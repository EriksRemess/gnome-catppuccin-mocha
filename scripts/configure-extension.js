import Gio from 'gi://Gio';

const extensionUuid = 'catppuccin-mocha@gnome-catppuccin-mocha';
const action = ARGV.shift();

if (!['enable', 'disable'].includes(action) || ARGV.length > 0)
    throw new Error('usage: configure-extension.js <enable|disable>');

const settings = new Gio.Settings({schema_id: 'org.gnome.shell'});
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
