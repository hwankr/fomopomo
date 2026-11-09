$ErrorActionPreference = 'Stop'

# Pin the exact Supabase CLI release this harness was verified with. Major
# releases change flags and defaults (3.0 made local the default target and
# deprecated --local for removal in 4.0), so an unpinned latest can silently
# change what runs. Every subcommand below targets the local stack by default.
# When bumping this version, rerun the whole harness and confirm it passes.
$supabaseCliPackage = 'supabase@3.0.0'

$projectRoot = Split-Path -Parent $PSScriptRoot
$harnessRoot = Join-Path $projectRoot 'test-harness'
$fixturePath = Join-Path $projectRoot 'supabase\tests\fixtures\security_base.sql'
$baseMigrationPath = Join-Path $projectRoot 'supabase\migrations\20260807001129_harden_authorization_and_push_webhook.sql'
# Historical migrations before this baseline cannot be replayed together. Every
# timestamped migration after it is forward-only and must be tested, including
# group deletion, long-term tasks, their privilege correction, and account cleanup.
$baseMigrationName = Split-Path -Leaf $baseMigrationPath
$migrationPaths = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'supabase\migrations') -File |
    Where-Object { $_.Name -match '^\d{14}_.+\.sql$' -and $_.Name -gt $baseMigrationName } |
    Sort-Object Name | Select-Object -ExpandProperty FullName)
$testPaths = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'supabase\tests') -Filter '*.test.sql' -File |
    Sort-Object Name | Select-Object -ExpandProperty FullName)
$preflightPath = Join-Path $projectRoot 'supabase\verification\security_preflight.sql'
$postflightPath = Join-Path $projectRoot 'supabase\verification\security_postflight.sql'
$concurrencyPath = Join-Path $projectRoot 'supabase\tests\concurrency\delete_study_subject_concurrency.sql'
$excludedServices = 'gotrue,realtime,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
$databaseContainer = 'supabase_db_fomopomo-security-test'
$stagedTestDirectory = $null
$stagedTestPaths = @()
$harnessConfig = Get-Content -Raw -LiteralPath (Join-Path $harnessRoot 'supabase\config.toml')
if ($harnessConfig -notmatch '(?m)^project_id\s*=\s*"fomopomo-security-test"\s*$') {
    throw 'Refusing to reset a database outside the fomopomo-security-test harness.'
}
if ($migrationPaths.Count -eq 0 -or $testPaths.Count -eq 0) {
    throw 'The security harness requires forward migrations and database tests.'
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [switch]$SuppressOutput
    )

    # --yes lets npx fetch the pinned CLI without an install prompt.
    if ($SuppressOutput) {
        & npx --yes @Arguments | Out-Null
    }
    else {
        & npx --yes @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: npx --yes $($Arguments -join ' ')"
    }
}

function Invoke-LocalSqlFile {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    Get-Content -Raw -LiteralPath $Path |
        & docker exec --interactive $databaseContainer psql `
            --username postgres `
            --dbname postgres `
            --set ON_ERROR_STOP=1

    if ($LASTEXITCODE -ne 0) {
        throw "Local SQL apply failed: $Path"
    }
}

Push-Location $projectRoot
try {
    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'start',
        '--exclude', $excludedServices
    )

    Invoke-CheckedCommand -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'db', 'reset',
        '--sql-paths', $fixturePath,
        '--sql-paths', $baseMigrationPath
    )

    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'db', 'query',
        '--file', $preflightPath
    )
    Write-Output 'Read-only preflight query: PASS'

    foreach ($path in $migrationPaths) {
        Invoke-LocalSqlFile -Path $path
        Write-Output "Forward-only migration apply: PASS ($(Split-Path -Leaf $path))"
    }

    # The CLI mounts individual test files, so psql cannot follow a migration
    # include outside those mounts. Expand the actual migration source into a
    # temporary test, retaining its filename and pgTAP assertions. No copied
    # migration fixture needs to be maintained alongside the implementation.
    $migrationDirectory = [System.IO.Path]::GetFullPath(
        (Join-Path $projectRoot 'supabase\migrations')
    ) + [System.IO.Path]::DirectorySeparatorChar
    $effectiveTestPaths = @(foreach ($path in $testPaths) {
        $testSql = Get-Content -Raw -LiteralPath $path
        $includes = [regex]::Matches($testSql, '(?m)^\\ir[ \t]+([^\r\n]+)\r?$')
        if ($includes.Count -eq 0) {
            $path
            continue
        }
        foreach ($include in $includes) {
            $relativeIncludePath = Join-Path (Split-Path -Parent $path) ($include.Groups[1].Value.Trim())
            $includePath = [System.IO.Path]::GetFullPath($relativeIncludePath)
            if (-not $includePath.StartsWith($migrationDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Test migration include is outside supabase/migrations: $includePath"
            }
            $testSql = $testSql.Replace($include.Value, (Get-Content -Raw -LiteralPath $includePath))
        }
        if ($null -eq $stagedTestDirectory) {
            $stagedTestDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
                'fomopomo-security-tests-' + [guid]::NewGuid().ToString('N')
            )
            New-Item -ItemType Directory -Path $stagedTestDirectory | Out-Null
        }
        $stagedPath = Join-Path $stagedTestDirectory (Split-Path -Leaf $path)
        $stagedTestPaths += $stagedPath
        Set-Content -LiteralPath $stagedPath -Value $testSql -Encoding utf8
        $stagedPath
    })

    Invoke-CheckedCommand -Arguments (@(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'test', 'db'
    ) + $effectiveTestPaths)

    # pgTAP runs each file in one session, so it cannot show one transaction
    # waiting for another. This file drives two real sessions through dblink,
    # fails unless each scenario actually blocks, and removes its fixtures.
    Invoke-LocalSqlFile -Path $concurrencyPath
    Write-Output 'Concurrency checks: PASS'

    Invoke-CheckedCommand -SuppressOutput -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'db', 'query',
        '--file', $postflightPath
    )
    Write-Output 'Read-only postflight checks: PASS'

    Invoke-CheckedCommand -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'db', 'lint',
        '--schema', 'public,private', '--level', 'warning',
        '--fail-on', 'error'
    )

    Invoke-CheckedCommand -Arguments @(
        $supabaseCliPackage, '--workdir', $harnessRoot, 'db', 'advisors',
        '--type', 'security', '--fail-on', 'error'
    )
}
finally {
    foreach ($path in $stagedTestPaths) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $stagedTestDirectory) {
        Remove-Item -LiteralPath $stagedTestDirectory -ErrorAction SilentlyContinue
    }
    Pop-Location
}
