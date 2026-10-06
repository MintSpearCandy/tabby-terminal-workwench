import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'
import { PALETTE_HOTKEY_ID, PaletteService } from './services/palette.service'

/**
 * Declares the plugin hotkeys for the Settings → Hotkeys page.  Bindings
 * live in the global `hotkeys` config section under the dotted id; the
 * palette search hotkey ships unbound (empty default) — the user opts in.
 * Injecting PaletteService here (providers are instantiated at app start by
 * the HotkeysService) makes its hotkey subscription live.
 */
@Injectable()
export class WorkwenchHotkeyProvider extends HotkeyProvider {
    constructor (private palette: PaletteService) {
        super()
    }

    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: PALETTE_HOTKEY_ID, name: 'Terminal Workwench：快捷搜索片段' },
        ]
    }
}
