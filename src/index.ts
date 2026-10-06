import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider, ToolbarButtonProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { TerminalWorkwenchConfigProvider } from './configProvider'
import { TerminalWorkwenchSettingsTabProvider } from './settings/settingsTabProvider'
import { TerminalWorkwenchToolbarButtonProvider } from './providers/toolbarButtonProvider'
import { TerminalWorkwenchTerminalDecorator } from './providers/terminalDecorator'
import { WorkwenchHotkeyProvider } from './hotkeys'

import { SidebarRootComponent } from './components/sidebarRoot.component'
import { SceneTabsComponent } from './components/sceneTabs.component'
import { QuickGridComponent } from './components/quickGrid.component'
import { ScratchpadComponent } from './components/scratchpad.component'
import { ParamsModalComponent } from './components/paramsModal.component'
import { ConfirmModalComponent } from './components/confirmModal.component'
import { ButtonEditModalComponent } from './components/buttonEditModal.component'
import { PaletteModalComponent } from './components/paletteModal.component'
import { ColorSwatchesComponent } from './components/colorSwatches.component'
import { StatusToastComponent } from './components/statusToast.component'
import { SortableDirective } from './directives/sortable.directive'
import { WorkwenchSettingsComponent } from './settings/workwenchSettings.component'
import { ButtonListComponent } from './settings/buttonList.component'
import { ButtonEditorComponent } from './settings/buttonEditor.component'
import { SceneEditModalComponent } from './settings/sceneEditModal.component'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: TerminalWorkwenchConfigProvider, multi: true },
        { provide: SettingsTabProvider, useClass: TerminalWorkwenchSettingsTabProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: TerminalWorkwenchToolbarButtonProvider, multi: true },
        { provide: TerminalDecorator, useClass: TerminalWorkwenchTerminalDecorator, multi: true },
        { provide: HotkeyProvider, useClass: WorkwenchHotkeyProvider, multi: true },
    ],
    declarations: [
        SidebarRootComponent,
        SceneTabsComponent,
        QuickGridComponent,
        ScratchpadComponent,
        ParamsModalComponent,
        ConfirmModalComponent,
        ButtonEditModalComponent,
        PaletteModalComponent,
        ColorSwatchesComponent,
        StatusToastComponent,
        SortableDirective,
        WorkwenchSettingsComponent,
        ButtonListComponent,
        ButtonEditorComponent,
        SceneEditModalComponent,
    ],
})
export default class TerminalWorkwenchModule { }
