export const CONFIG_KEY = 'terminalWorkwench'

/**
 * Top-level key of tabby-command-workbench, used only as a read-only import
 * source.  Declaring it as a null default in our ConfigProvider keeps the key
 * visible to the config writer so an unrelated save from this plugin cannot
 * drop workbench's data before the import has run.
 */
export const WORKBENCH_SOURCE_KEY = 'commandWorkbench'
