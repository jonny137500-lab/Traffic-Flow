local RoadGraph = {}
RoadGraph.__index = RoadGraph

export type Node = {
 id: number,
 position: Vector3,
 neighbors: {[number]: number},
}

export type Graph = {
 nodes: {[number]: Node},
 edges: {[number]: {[number]: number}},
 nextId: number,
 version: number,
}

function RoadGraph.new(): Graph
 return {nodes = {}, edges = {}, nextId = 0, version = 0}
end

function RoadGraph:addNode(position: Vector3): number
 self.nextId += 1
 local id = self.nextId
 self.nodes[id] = {id = id, position = position, neighbors = {}}
 self.edges[id] = {}
 self.version += 1
 return id
end

function RoadGraph:addRoad(a: number, b: number, cost: number?)
 if not self.nodes[a] or not self.nodes[b] or a == b then return false end
 local c = cost or (self.nodes[a].position - self.nodes[b].position).Magnitude
 self.edges[a][b] = c
 self.edges[b][a] = c
 self.nodes[a].neighbors[b] = b
 self.nodes[b].neighbors[a] = a
 self.version += 1
 return true
end

function RoadGraph:removeRoad(a: number, b: number)
 if self.edges[a] then self.edges[a][b] = nil end
 if self.edges[b] then self.edges[b][a] = nil end
 if self.nodes[a] then self.nodes[a].neighbors[b] = nil end
 if self.nodes[b] then self.nodes[b].neighbors[a] = nil end
 self.version += 1
end

function RoadGraph:nearest(position: Vector3): number?
 local best, bestD
 for id, node in pairs(self.nodes) do
  local d = (node.position - position).Magnitude
  if not bestD or d < bestD then best, bestD = id, d end
 end
 return best
end

local function heuristic(a: Node, b: Node): number
 return (a.position - b.position).Magnitude
end

function RoadGraph:findPath(startId: number, goalId: number, blocked: {[number]: boolean}?): {number}?
 if not self.nodes[startId] or not self.nodes[goalId] then return nil end
 if startId == goalId then return {startId} end
 local open = {[startId] = true}
 local cameFrom: {[number]: number} = {}
 local g: {[number]: number} = {[startId] = 0}
 local f: {[number]: number} = {[startId] = heuristic(self.nodes[startId], self.nodes[goalId])}

 while next(open) do
  local current, currentF
  for id in pairs(open) do
   if not currentF or (f[id] or math.huge) < currentF then
    current, currentF = id, f[id]
   end
  end
  if current == goalId then
   local path = {current}
   while cameFrom[current] do
    current = cameFrom[current]
    table.insert(path, 1, current)
   end
   return path
  end
  open[current] = nil
  for neighbor, edgeCost in pairs(self.edges[current] or {}) do
   if not (blocked and blocked[neighbor]) then
    local tentative = (g[current] or math.huge) + edgeCost
    if tentative < (g[neighbor] or math.huge) then
     cameFrom[neighbor] = current
     g[neighbor] = tentative
     f[neighbor] = tentative + heuristic(self.nodes[neighbor], self.nodes[goalId])
     open[neighbor] = true
    end
   end
  end
 end
 return nil
end

return RoadGraph