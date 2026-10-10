@echo off
rem Runs collect_prices.py and appends its output to logs\collect.log.
rem Windows Task Scheduler runs this file once a day (task name: FoodPriceApp Daily Collect).

cd /d "%~dp0"
if not exist logs mkdir logs
set PYTHONIOENCODING=utf-8

echo ===== %date% %time% ===== >> logs\collect.log
python collect_prices.py >> logs\collect.log 2>&1
echo Exit code: %errorlevel% >> logs\collect.log
