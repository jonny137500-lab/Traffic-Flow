local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Config = require(ReplicatedStorage.Shared.Config)
local RoadGraph = require(ReplicatedStorage.Shared.RoadGraph)

local root = Instance.new("Folder")
root.Name = "TrafficFlow"
root.Parent = workspace

local roadsFolder = Instance.new("Folder")
roadsFolder.Name = "Roads"
roadsFolder.Parent = root

local vehiclesFolder = Instance.new("Folder")
vehiclesFolder.Name = "Vehicles"
vehiclesFolder.Parent = root

local graph = RoadGraph.new()
local vehicles = {}
local nextVehicleId = 0

local function part(name, size, cf, material)
 local p = Instance.new("Part")
 p.Name = name
 p.Size = size
 p.CFrame = cf
 p.Anchored = true
 p.CanCollide = false
 p.Material = material or Enum.Material.SmoothPlastic
 p.TopSurface = Enum.SurfaceType.Smooth
 p.BottomSurface = Enum.SurfaceType.Smooth
 p.Parent = roadsFolder
 return p
end

local function buildDemoMap()
 local positions = {
  Vector3.new(-80, 0, -40), Vector3.new(0, 0, -40), Vector3.new(80, 0, -40),
  Vector3.new(-80, 0, 40), Vector3.new(0, 0, 40), Vector3.new(80, 0, 40),
  Vector3.new(-40, 0, 0), Vector3.new(40, 0, 0),
 }
 local ids = {}
 for _, pos in ipairs(positions) do table.insert(ids, graph:addNode(pos)) end
 local links = {{1,2},{2,3},{4,5},{5,6},{1,4},{2,5},{3,6},{2,7},{2,8},{5,7},{5,8}}
 for _, link in ipairs(links) do graph:addRoad(ids[link[1]], ids[link[2]]) end

 for a,b in pairs(graph.edges) do
  for c in pairs(b) do
   if a < c then
    local pa, pb = graph.nodes[a].position, graph.nodes[c].position
    local mid = (pa + pb) / 2
    local delta = pb - pa
    local length = Vector3.new(delta.X, 0, delta.Z).Magnitude
    part(("Road_%d_%d"):format(a,c), Vector3.new(10, 0.35, length), CFrame.lookAt(mid, Vector3.new(pb.X, mid.Y, pb.Z)), Enum.Material.Asphalt)
   end
  end
 end
end

local function makeVehicle()
 nextVehicleId += 1
 local start = graph.nearest(Vector3.new(-80, 0, -40))
 local goal = graph.nearest(Vector3.new(80, 0, 40))
 if not start or not goal then return end
 local path = graph:findPath(start, goal)
 if not path or #path < 2 then return end

 local model = Instance.new("Part")
 model.Name = "Vehicle_" .. nextVehicleId
 model.Size = Vector3.new(Config.VehicleWidth, 1.4, Config.VehicleLength)
 model.Anchored = true
 model.CanCollide = false
 model.Material = Enum.Material.SmoothPlastic
 model.Parent = vehiclesFolder

 vehicles[nextVehicleId] = {
  id = nextVehicleId,
  part = model,
  path = path,
  segment = 1,
  t = 0,
  speed = 0,
  lastPosition = model.Position,
  stuckTime = 0,
  createdAt = os.clock(),
 }
end

local function removeVehicle(v)
 if v.part then v.part:Destroy() end
 vehicles[v.id] = nil
end

local function occupiedAhead(v)
 local p = v.part.Position
 local forward = v.part.CFrame.LookVector
 local nearest, distance
 for _, other in pairs(vehicles) do
  if other ~= v and other.part then
   local offset = other.part.Position - p
   local along = offset:Dot(forward)
   local lateral = math.abs(offset:Dot(v.part.CFrame.RightVector))
   if along > 0 and along < 30 and lateral < 3 then
    if not distance or along < distance then nearest, distance = other, along end
   end
  end
 end
 return nearest, distance
end

local function replan(v)
 local currentNode = v.path[v.segment]
 local goalNode = v.path[#v.path]
 if not currentNode or not goalNode then return false end
 local newPath = graph:findPath(currentNode, goalNode)
 if newPath and #newPath >= 2 then
  v.path = newPath
  v.segment = 1
  v.t = 0
  return true
 end
 return false
end

local function updateVehicle(v, dt)
 if not v.part.Parent then return end
 local a = graph.nodes[v.path[v.segment]]
 local b = graph.nodes[v.path[v.segment + 1]]
 if not a or not b then
  if not replan(v) then removeVehicle(v) end
  return
 end

 local target = b.position
 local delta = target - a.position
 local length = delta.Magnitude
 if length < 0.01 then
  v.segment += 1
  v.t = 0
  return
 end

 local direction = delta.Unit
 local ahead, gap = occupiedAhead(v)
 local desired = Config.CruiseSpeed
 if ahead and gap then
  desired = math.min(desired, math.max(0, (gap - Config.VehicleLength - Config.MinGap) * 3))
 end
 local accel = desired > v.speed and Config.MaxAcceleration or -Config.MaxBraking
 v.speed = math.clamp(v.speed + accel * dt, 0, desired)

 v.t += (v.speed * dt) / length
 if v.t >= 1 then
  v.t -= 1
  v.segment += 1
  if v.segment >= #v.path then
   removeVehicle(v)
   return
  end
  a = graph.nodes[v.path[v.segment]]
  b = graph.nodes[v.path[v.segment + 1]]
  if not a or not b then removeVehicle(v); return end
 end

 local pos = a.position:Lerp(b.position, v.t) + Vector3.new(0, 1.2, 0)
 local look = (b.position - a.position)
 if look.Magnitude > 0.01 then
  v.part.CFrame = CFrame.lookAt(pos, pos + look.Unit)
 end

 if (v.part.Position - v.lastPosition).Magnitude < Config.StuckDistance and v.speed > 5 then
  v.stuckTime += dt
 else
  v.stuckTime = 0
 end
 v.lastPosition = v.part.Position

 if v.stuckTime > Config.StuckSeconds then
  v.speed = 0
  replan(v)
  v.stuckTime = 0
 end
end

buildDemoMap()

local accumulator = 0
local spawnAccumulator = 0
RunService.Heartbeat:Connect(function(dt)
 accumulator += dt
 spawnAccumulator += dt
 local step = 1 / Config.SimulationHz
 while accumulator >= step do
  accumulator -= step
  if spawnAccumulator >= Config.SpawnInterval then
   spawnAccumulator -= Config.SpawnInterval
   local count = 0
   for _ in pairs(vehicles) do count += 1 end
   if count < Config.MaxVehicles then makeVehicle() end
  end
  local snapshot = {}
  for _, v in pairs(vehicles) do table.insert(snapshot, v) end
  for _, v in ipairs(snapshot) do updateVehicle(v, step) end
 end
end)