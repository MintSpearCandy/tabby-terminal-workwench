import { Injectable } from '@angular/core'
import { ComponentRef, Injector } from '@angular/core'
import { HotkeysService } from 'tabby-core'
import { PaletteModalComponent } from '../components/paletteModal.component'
import { SidebarHostService } from './sidebarHost.service'

/** Dotted hotkey id under the global `hotkeys` config section. */
export const PALETTE_HOTKEY_ID = 'terminal-workwench.quick-search'

/**
 * Owns the quick-search palette lifecycle so both the sidebar header button
 * and the (default-unbound) hotkey go through one place.  Instantiated at
 * app start by the HotkeyProvider constructor.
 *
 * The hotkey subscription must be deferred: HotkeysService instantiates the
 * HotkeyProviders inside its own constructor, so resolving HotkeysService
 * synchronously from here is a DI creation cycle (the token comes back
 * undefined and kills the whole plugin at bootstrap).
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
    private ref: ComponentRef<PaletteModalComponent> | null = null

    constructor (
        private host: SidebarHostService,
        injector: Injector,
    ) {
        queueMicrotask(() => {
            injector.get(HotkeysService).hotkey$.subscribe(hotkey => {
                if (hotkey === PALETTE_HOTKEY_ID) {
                    this.toggle()
                }
            })
        })
    }

    get isOpen (): boolean {
        return this.ref !== null
    }

    toggle (): void {
        this.isOpen ? this.close() : this.open()
    }

    open (): void {
        if (this.ref) {
            return
        }
        this.ref = this.host.openModal(PaletteModalComponent)
        const subscription = this.ref.instance.done.subscribe(() => {
            subscription.unsubscribe()
            this.close()
        })
    }

    close (): void {
        if (!this.ref) {
            return
        }
        this.host.closeModal(this.ref)
        this.ref = null
    }
}
