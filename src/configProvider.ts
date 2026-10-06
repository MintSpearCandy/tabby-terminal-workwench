import { ConfigProvider } from 'tabby-core'
import { createDefaultConfig } from './model'
import { CONFIG_KEY, WORKBENCH_SOURCE_KEY } from './configKeys'

export class TerminalWorkwenchConfigProvider extends ConfigProvider {
    defaults = {
        [CONFIG_KEY]: createDefaultConfig(),
        // Keep the workbench key visible to the config writer so an unrelated
        // save performed by this plugin cannot drop the import source before
        // the one-time import has run.
        [WORKBENCH_SOURCE_KEY]: null,
        // Declare our hotkey subtree so ConfigProxy keeps bindings written to
        // it (undeclared keys vanish on load/save).  Empty default = the
        // palette hotkey ships unbound; see hotkeys.ts.
        hotkeys: {
            'terminal-workwench': {
                'quick-search': [],
            },
        },
    }
}
