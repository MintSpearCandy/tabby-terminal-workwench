import { Injectable } from '@angular/core'

export interface ContextMenuItem {
    label: string
    danger?: boolean
    action: () => void
}

/**
 * Right-click context menu, ported from tabby-command-workbench's
 * battle-tested openContextMenuAt: a fixed-position element on document.body,
 * clamped to the viewport, closed by an outside pointerdown (deferred so the
 * opening gesture cannot close it), by Escape, or by picking an item.
 */
@Injectable({ providedIn: 'root' })
export class ContextMenuService {
    private menu: HTMLElement | null = null
    private closeListener: ((event: Event) => void) | null = null
    private closeTimer: ReturnType<typeof setTimeout> | null = null

    /** Consume a contextmenu event and show the menu at the cursor. */
    open (event: MouseEvent, items: ContextMenuItem[]): void {
        event.preventDefault()
        event.stopPropagation()
        this.openAt(event.clientX, event.clientY, items)
    }

    openAt (x: number, y: number, items: ContextMenuItem[]): void {
        this.close()
        const menu = document.createElement('div')
        menu.className = 'twx-context-menu'
        menu.setAttribute('role', 'menu')
        for (const item of items) {
            const button = document.createElement('button')
            button.type = 'button'
            button.setAttribute('role', 'menuitem')
            button.textContent = item.label
            button.className = item.danger ? 'is-danger' : ''
            button.addEventListener('click', clickEvent => {
                clickEvent.preventDefault()
                clickEvent.stopPropagation()
                this.close()
                item.action()
            })
            menu.appendChild(button)
        }
        document.body.appendChild(menu)
        this.menu = menu

        const rect = menu.getBoundingClientRect()
        menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`
        menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`

        const close = (event: Event): void => {
            if (event instanceof KeyboardEvent) {
                if (event.key === 'Escape') {
                    this.close()
                }
                return
            }
            if (menu.contains(event.target as Node)) {
                return
            }
            this.close()
        }
        this.closeListener = close
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null
            document.addEventListener('pointerdown', close, { capture: true })
            document.addEventListener('keydown', close, { capture: true })
        })
        menu.querySelector<HTMLButtonElement>('button')?.focus()
    }

    close (): void {
        if (this.closeTimer !== null) {
            clearTimeout(this.closeTimer)
            this.closeTimer = null
        }
        if (this.closeListener) {
            document.removeEventListener('pointerdown', this.closeListener, { capture: true })
            document.removeEventListener('keydown', this.closeListener, { capture: true })
            this.closeListener = null
        }
        this.menu?.remove()
        this.menu = null
    }
}
