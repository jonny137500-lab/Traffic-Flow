local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Config = require(ReplicatedStorage.Shared.Config)

local TrafficController = {}
TrafficController.__index = TrafficController

local function getNumberedNodes(folder)
	local nodes = {}
	for _, child in ipairs(folder:GetChildren()) do
		if child:IsA("BasePart") and tonumber(child.Name) ~= nil then
			table.insert(nodes, child)
		end
	end
	table.sort(nodes, function(a, b)
		return tonumber(a.Name) < tonumber(b.Name)
	end)
	return nodes
end

function TrafficController.new(stateEvent)
	local self = setmetatable({}, TrafficController)
	self.StateEvent = stateEvent
	self.Routes = {}
	self.TrafficLights = {}
	self.Cars = {}
	self.Score = 0
	self.IsGameOver = false
	self._spawnTimer = 0
	self._lightTimer = 0
	self._lightIsGreen = true
	self:_discoverWorld()
	return self
end

function TrafficController:_discoverWorld()
	local routeRoot = workspace:FindFirstChild("Routes")
	if routeRoot then
		for _, routeFolder in ipairs(routeRoot:GetChildren()) do
			if routeFolder:IsA("Folder") then
				local nodes = getNumberedNodes(routeFolder)
				if #nodes >= 2 then
					table.insert(self.Routes, nodes)
				end
			end
		end
	end

	local lightRoot = workspace:FindFirstChild("TrafficLights")
	if lightRoot then
		for _, light in ipairs(lightRoot:GetChildren()) do
			if light:IsA("BasePart") then
				self.TrafficLights[light.Name] = light
			end
		end
	end
	self:_setLights(true)
end

function TrafficController:_setLights(isGreen)
	for _, light in pairs(self.TrafficLights) do
		light.Color = isGreen and Color3.fromRGB(0, 255, 0) or Color3.fromRGB(255, 0, 0)
	end
	self._lightIsGreen = isGreen
end

function TrafficController:_chooseRoute()
	if #self.Routes == 0 then
		return nil
	end
	return self.Routes[math.random(1, #self.Routes)]
end

function TrafficController:_spawnCar()
	if #self.Cars >= Config.MaxActiveCars or self.IsGameOver then
		return
	end

	local route = self:_chooseRoute()
	if not route then
		return
	end

	local car = Instance.new("Part")
	car.Name = "Car"
	car.Size = Config.CarSize
	car.Anchored = true
	car.CanCollide = true
	car.Color = Config.CarColor
	car.CFrame = route[1].CFrame
	car.Parent = workspace

	table.insert(self.Cars, {
		Part = car,
		Route = route,
		Segment = 1,
		SegmentProgress = 0,
	})
end

function TrafficController:_awardScore(points)
	self.Score += points
	for _, player in ipairs(Players:GetPlayers()) do
		local leaderstats = player:FindFirstChild("leaderstats")
		if leaderstats then
			local scoreValue = leaderstats:FindFirstChild("Score")
			if scoreValue then
				scoreValue.Value = self.Score
			end
		end
	end
end

function TrafficController:_broadcastState()
	self.StateEvent:FireAllClients({
		Score = self.Score,
		ActiveCars = #self.Cars,
		LightGreen = self._lightIsGreen,
		GameOver = self.IsGameOver,
	})
end

function TrafficController:_removeCar(index)
	local carState = self.Cars[index]
	if carState and carState.Part then
		carState.Part:Destroy()
	end
	table.remove(self.Cars, index)
end

function TrafficController:_updateCars(deltaTime)
	for i = #self.Cars, 1, -1 do
		local carState = self.Cars[i]
		local route = carState.Route
		local fromNode = route[carState.Segment]
		local toNode = route[carState.Segment + 1]

		if not fromNode or not toNode then
			self:_removeCar(i)
			self:_awardScore(Config.ScorePerCar)
		else
			local holdOnRed = fromNode:GetAttribute("StopOnRed") == true and not self._lightIsGreen
			if not holdOnRed then
				local segmentDistance = (toNode.Position - fromNode.Position).Magnitude
				if segmentDistance <= 0.001 then
					carState.Segment += 1
				else
					carState.SegmentProgress += (Config.CarSpeedStudsPerSecond * deltaTime) / segmentDistance
					if carState.SegmentProgress >= 1 then
						carState.Segment += 1
						carState.SegmentProgress = 0
					end
				end
			end

			fromNode = route[carState.Segment]
			toNode = route[carState.Segment + 1]
			if fromNode and toNode then
				local targetPosition = fromNode.Position:Lerp(toNode.Position, carState.SegmentProgress)
				local lookAt = targetPosition + (toNode.Position - fromNode.Position)
				carState.Part.CFrame = CFrame.lookAt(targetPosition, lookAt)
			end
		end
	end
end

function TrafficController:_ensureLeaderstats(player)
	local existing = player:FindFirstChild("leaderstats")
	if existing then
		return
	end

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local scoreValue = Instance.new("IntValue")
	scoreValue.Name = "Score"
	scoreValue.Value = self.Score
	scoreValue.Parent = leaderstats
end

function TrafficController:Start()
	Players.PlayerAdded:Connect(function(player)
		self:_ensureLeaderstats(player)
	end)

	for _, player in ipairs(Players:GetPlayers()) do
		self:_ensureLeaderstats(player)
	end

	RunService.Heartbeat:Connect(function(deltaTime)
		if self.IsGameOver then
			return
		end

		self._spawnTimer += deltaTime
		self._lightTimer += deltaTime

		if self._lightTimer >= Config.LightCycleSeconds then
			self._lightTimer = 0
			self:_setLights(not self._lightIsGreen)
		end

		if self._spawnTimer >= Config.SpawnIntervalSeconds then
			self._spawnTimer = 0
			self:_spawnCar()
		end

		self:_updateCars(deltaTime)
		if #self.Cars >= Config.JamFailThreshold then
			self.IsGameOver = true
		end
		self:_broadcastState()
	end)
end

return TrafficController
