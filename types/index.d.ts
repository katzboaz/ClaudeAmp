export type PlayerStatus = 'playing' | 'stopped'

export type Player = {
  status: PlayerStatus
  /** The running turn's id, what the Stop button aborts. */
  turnId: string | null
  /** Seconds since the turn started. */
  elapsed: number
  /** What the marquee scrolls: the current tool call, or the prompt. */
  track: string
}

export type TrackStatus = 'running' | 'done' | 'error'

export type Track = {
  id: string
  n: number
  tool: string
  title: string
  status: TrackStatus
  /** Milliseconds the call took, once done. */
  ms: number
}

export type Stats = {
  turns: number
  /** Output tokens of the session, as the turns reported them. */
  tokens: number
  /** Output tokens per second of the last turn: the "kbps". */
  tps: number
}

declare module 'claude-code' {
  interface PluginState {
    claudeamp: {
      player: Player
      playlist: Track[]
      stats: Stats
      skin: string
      /** Playlist row the prev/next buttons moved to; -1 follows the newest. */
      cursor: number
      /** The Pause button: the visualizer holds its frame. */
      isFrozen: boolean
    }
  }
}
