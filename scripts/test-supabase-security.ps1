$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$harnessRoot = Join-Path $projectRoot 'test-harness'
$fixturePath = Join-Path $projectRoot 'supabase\tests\fixtures\security_base.sql'
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260807001129_harden_authorization_and_push_webhook.sql'
$testPath = Join-Path $projectRoot 'supabase\tests\authorization_hardening.test.sql'
$preflightPath = Join-Path $projectRoot 'supabase\verification\security_preflight.sql'
$postflightPath = Join-Path $projectRoot 'supabase\verification\security_postflight.sql'
$excludedServices = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [switch]$SuppressOutput
    )

    if ($SuppressOutput) {
        & npx @Arguments | Out-Null
    }
    else {
        & npx @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: npx $($Arguments -join ' ')"
    }
}

Push-Location $projectRoot
try {
    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'start',
        '--exclude', $excludedServices
    )

    Invoke-CheckedCommand -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'db', 'reset', '--local',
        '--sql-paths', $fixturePath,
        '--sql-paths', $migrationPath
    )

    Invoke-CheckedCommand -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'test', 'db', '--local',
        $testPath
    )

    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'db', 'query', '--local',
        '--file', $preflightPath
    )
    Write-Output 'Read-only preflight query: PASS'

    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'db', 'query', '--local',
        '--file', $postflightPath
    )
    Write-Output 'Read-only postflight checks: PASS'

    Invoke-CheckedCommand -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'db', 'lint', '--local',
        '--schema', 'public,private', '--level', 'warning',
        '--fail-on', 'error'
    )

    Invoke-CheckedCommand -Arguments @(
        'supabase', '--workdir', $harnessRoot, 'db', 'advisors', '--local',
        '--type', 'security'
    )
}
finally {
    Pop-Location
}
