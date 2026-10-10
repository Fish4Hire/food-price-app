# One-time setup: tells Windows Task Scheduler to run run_collect.bat every day at 7:00 AM.
# If the computer is off or asleep at 7:00, it runs as soon as it's back on.
#
# Run once with:   powershell -ExecutionPolicy Bypass -File schedule_daily.ps1
# To remove later: Unregister-ScheduledTask -TaskName "FoodPriceApp Daily Collect"

$folder = $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "$folder\run_collect.bat" -WorkingDirectory $folder
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Run as you, only while you're logged in, with normal (non-admin) rights.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName "FoodPriceApp Daily Collect" `
    -Description "Collects Kroger grocery prices into Supabase (food-price-app)" `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force |
    Select-Object TaskName, State
