local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local stateEvent = ReplicatedStorage:WaitForChild("TrafficFlowState")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TrafficFlowHUD"
screenGui.ResetOnSpawn = false
screenGui.Parent = player:WaitForChild("PlayerGui")

local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(420, 64)
label.Position = UDim2.fromOffset(24, 24)
label.BackgroundTransparency = 0.25
label.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
label.TextColor3 = Color3.fromRGB(255, 255, 255)
label.TextScaled = true
label.Font = Enum.Font.GothamBold
label.Text = "Traffic Flow loading..."
label.Parent = screenGui

stateEvent.OnClientEvent:Connect(function(state)
	local lightState = state.LightGreen and "GREEN" or "RED"
	local gameState = state.GameOver and "GAME OVER" or "RUNNING"
	label.Text = string.format("Score: %d  Cars: %d  Light: %s  State: %s", state.Score, state.ActiveCars, lightState, gameState)
end)
