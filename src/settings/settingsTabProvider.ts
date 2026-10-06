import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { WorkwenchSettingsComponent } from './workwenchSettings.component'
import { CONFIG_KEY } from '../configKeys'

@Injectable()
export class TerminalWorkwenchSettingsTabProvider extends SettingsTabProvider {
    id = CONFIG_KEY
    icon = 'screwdriver-wrench'
    title = 'Terminal Workwench'
    prioritized = true

    getComponentType (): any {
        return WorkwenchSettingsComponent
    }
}
