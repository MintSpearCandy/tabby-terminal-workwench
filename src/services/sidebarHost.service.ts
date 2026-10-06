import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, Type, createComponent } from '@angular/core'
import { GLOBAL_STYLES } from '../styles'
import { THEME_TOKENS } from '../theme'

/**
 * Hosts Angular components outside the app-root component tree, directly
 * under document.body — the same mechanism Tabby's own ng-bootstrap modals
 * use: createComponent + ApplicationRef.attachView, then move the host node
 * into the DOM.  This keeps full Angular templating/binding for the sidebar
 * without needing Tabby to provide a component slot.
 *
 * The sidebar component type is passed in by the boot service on purpose:
 * importing a component that (transitively) injects this service creates a
 * module cycle whose decorator metadata evaluates before class
 * initialization.
 */
@Injectable({ providedIn: 'root' })
export class SidebarHostService {
    private sidebarRef: ComponentRef<unknown> | null = null
    private modalRefs: ComponentRef<unknown>[] = []
    private styleElement: HTMLStyleElement | null = null

    constructor (
        private appRef: ApplicationRef,
    ) { }

    ensureStyles (): void {
        if (this.styleElement) {
            return
        }
        this.styleElement = document.createElement('style')
        this.styleElement.textContent = THEME_TOKENS + GLOBAL_STYLES
        document.head.appendChild(this.styleElement)
    }

    mountSidebar (componentType: Type<unknown>): void {
        this.ensureStyles()
        if (this.sidebarRef) {
            return
        }
        this.sidebarRef = createComponent(componentType, {
            environmentInjector: this.appRef.injector as EnvironmentInjector,
        })
        this.appRef.attachView(this.sidebarRef.hostView)
        document.body.appendChild(this.sidebarRef.location.nativeElement)
        this.sidebarRef.changeDetectorRef.detectChanges()
    }

    openModal<T> (componentType: Type<T>, inputs?: Record<string, unknown>): ComponentRef<T> {
        this.ensureStyles()
        const ref = createComponent(componentType, {
            environmentInjector: this.appRef.injector as EnvironmentInjector,
        })
        for (const [key, value] of Object.entries(inputs || {})) {
            ref.setInput(key, value)
        }
        this.appRef.attachView(ref.hostView)
        document.body.appendChild(ref.location.nativeElement)
        ref.changeDetectorRef.detectChanges()
        this.modalRefs.push(ref as ComponentRef<unknown>)
        return ref
    }

    closeModal<T> (ref: ComponentRef<T>): void {
        this.appRef.detachView(ref.hostView)
        ref.destroy()
        this.modalRefs = this.modalRefs.filter(candidate => candidate !== (ref as ComponentRef<unknown>))
    }

    closeAllModals (): void {
        for (const ref of [...this.modalRefs]) {
            this.closeModal(ref)
        }
    }
}
