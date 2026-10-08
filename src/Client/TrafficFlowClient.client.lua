local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer

local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable
camera.CFrame = CFrame.new(Vector3.new(0, 150, 130), Vector3.new(0, 0, 0))

local gui = Instance.new("ScreenGui")
gui.Name = "TrafficFlowUI"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(360, 54)
label.Position = UDim2.fromOffset(20, 20)
label.BackgroundTransparency = 0.2
label.TextScaled = true
label.Text = "TRAFFIC FLOW  •  SIMULATION"
label.Parent = gui

RunService.RenderStepped:Connect(function()
 local root = workspace:FindFirstChild("TrafficFlow")
 local folder = root and root:FindFirstChild("Vehicles")
 if folder then
  label.Text = ("TRAFFIC FLOW  •  VEHICLES: %d"):format(#folder:GetChildren())
 end
end)