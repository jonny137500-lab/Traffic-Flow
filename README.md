# Traffic-Flow

This repository now contains a Roblox starter implementation for a **Traffic Flow-style** game loop:
- cars spawn on route nodes
- traffic lights cycle between green/red
- cars stop on red at marked nodes
- players earn score for each completed car route
- game ends when traffic congestion exceeds a threshold

## Roblox project structure

- `default.project.json` - Rojo mapping
- `src/shared/Config.lua` - gameplay tuning values
- `src/server/Main.server.lua` - bootstraps the game controller
- `src/server/TrafficController.lua` - core simulation logic
- `src/client/UI.client.lua` - simple HUD for state/score

## How to use in Roblox Studio

1. Create your place layout in `Workspace`:
   - Add a `Folder` named `Routes`.
   - Inside `Routes`, add one or more route folders (`RouteA`, `RouteB`, ...).
   - In each route folder, add numbered `Part` nodes (`1`, `2`, `3`, ...).
   - Optional: set `StopOnRed` attribute to `true` on any node where cars should wait on red.
2. Add a `Folder` named `TrafficLights` in `Workspace` and place one or more light parts in it.
3. Sync this repository into Studio with Rojo (recommended) or copy scripts into equivalent services:
   - `ReplicatedStorage/Shared`
   - `ServerScriptService/TrafficFlow`
   - `StarterPlayer/StarterPlayerScripts/TrafficFlow`
4. Press Play.

## Tuning gameplay

Edit `src/shared/Config.lua` to tune:
- spawn rate
- car speed
- light cycle time
- max active cars
- game-over congestion threshold
