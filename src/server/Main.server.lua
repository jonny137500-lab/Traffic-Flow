local ReplicatedStorage = game:GetService("ReplicatedStorage")

local stateEvent = Instance.new("RemoteEvent")
stateEvent.Name = "TrafficFlowState"
stateEvent.Parent = ReplicatedStorage

local TrafficController = require(script.Parent.TrafficController)
local controller = TrafficController.new(stateEvent)
controller:Start()
