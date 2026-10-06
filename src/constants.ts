export const DEFAULT_SIDEBAR_WIDTH = 390
export const MIN_SIDEBAR_WIDTH = 300
export const MAX_SIDEBAR_WIDTH = 760
export const MIN_TERMINAL_WIDTH = 240
export const RESIZE_SAVE_DELAY_MS = 250
export const SCRATCH_SAVE_DELAY_MS = 250
export const STATUS_VISIBLE_MS = 1800
export const LAYOUT_REFRESH_DELAY_MS = 180
export const MAX_SEQUENCE_DELAY_MS = 60000
export const MAX_SEQUENCE_STEPS = 40
export const SEQUENCE_SEND_GAP_MS = 30
export const DRAG_ACTIVATION_PX = 4
export const DRAG_CLICK_SUPPRESS_MS = 250
export const SELF_SAVE_SUPPRESS_MS = 800

/** {{js:}} evaluation guard: sync scripts are hard-killed after this. */
export const JS_EXECUTION_TIMEOUT_MS = 500
/** Session output snapshot: viewport + this many scrollback lines. */
export const SESSION_SNAPSHOT_LINES = 50
/** FileRef.text lazy read cap. */
export const FILE_TEXT_MAX_BYTES = 256 * 1024

/** Reserved id of the virtual "无组别" scene: created on demand for buttons
 *  without a group, pruned again once it holds nothing. */
export const UNGROUPED_SCENE_ID = 'ungrouped'
export const UNGROUPED_SCENE_NAME = '无组别'
export const UNGROUPED_SCENE_COLOR = '#94a3b8'
