export interface WallPreferences {
  density: "cinematic" | "compact"
  rememberServer: boolean
  rememberUsername: boolean
  rememberPasswordRequested: boolean
}

export interface WallHandoff {
  selectedLibraryIds: string[]
  preferences: WallPreferences
}
