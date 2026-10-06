import { Component, EventEmitter, Input, Output } from '@angular/core'

/** 16 preset snippet colours (covers every default/seed colour in the codebase). */
export const PRESET_COLORS: readonly string[] = [
    '#dc2626', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#38bdf8', '#0ea5e9', '#2563eb',
    '#6366f1', '#a855f7', '#ec4899', '#94a3b8',
]

/**
 * Colour field used by the snippet and scene editors: a row of preset
 * swatches plus an eye-dropper button that opens the native colour panel
 * through a hidden input[type=color].  Two-way `[(color)]`.
 */
@Component({
    selector: 'twx-color-swatches',
    template: `
        <div class="twx-swatches">
            <button *ngFor="let preset of colors" type="button"
                    class="twx-swatch"
                    [class.is-selected]="matches(preset)"
                    [style.background]="preset"
                    [title]="preset"
                    (click)="select(preset)"></button>
            <button type="button"
                    class="twx-swatch is-custom"
                    [class.is-selected]="isCustom()"
                    title="自定义颜色"
                    (click)="picker.click()">
                <i class="fas fa-eye-dropper"></i>
            </button>
            <input #picker type="color"
                   class="twx-color-native"
                   [value]="safeValue()"
                   (input)="onNative($event)"
                   (change)="onNative($event)" />
        </div>
    `,
})
export class ColorSwatchesComponent {
    @Input() colors: readonly string[] = PRESET_COLORS
    @Input() color = ''
    @Output() colorChange = new EventEmitter<string>()

    select (value: string): void {
        this.colorChange.emit(value)
    }

    matches (preset: string): boolean {
        return !!this.color && this.color.toLowerCase() === preset.toLowerCase()
    }

    isCustom (): boolean {
        return !!this.color && !this.colors.some(preset => this.matches(preset))
    }

    onNative (event: Event): void {
        const value = (event.target as HTMLInputElement).value
        if (value) {
            this.colorChange.emit(value)
        }
    }

    /** input[type=color] only accepts #rrggbb; fall back when malformed. */
    safeValue (): string {
        return /^#[0-9a-f]{6}$/i.test(this.color) ? this.color : '#22c55e'
    }
}
