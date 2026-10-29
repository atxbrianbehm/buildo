$ErrorActionPreference = 'Continue'
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\behmb\AppData\Local\ms-playwright'
$out = 'test-results/t8-shadow-fit-2026-10-27/checks'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$results = [ordered]@{}
foreach ($name in @('typecheck','lint','test','build','test:e2e')) {
  Write-Output "START $name"
  & npm run $name *> "$out/$($name.Replace(':','-')).log"
  $results[$name] = $LASTEXITCODE
  Write-Output "END $name exit=$LASTEXITCODE"
  $results | ConvertTo-Json | Set-Content "$out/results.json"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
