# ============================================================
# Export meaningful project source/config/docs into TXT files
# ============================================================

$folders = @(
    "apps\backend",
    "apps\ml-service",
    "apps\ml-worker",
    "apps\mobile-student",
    "apps\mobile-teacher",
    "apps\web-admin",
    "scripts"
)

# Source/config/document extensions worth exporting
$includeExtensions = @(
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".java",
    ".kt",
    ".kts",
    ".dart",
    ".go",
    ".rs",
    ".rb",
    ".php",

    ".json",
    ".yml",
    ".yaml",
    ".xml",
    ".toml",
    ".ini",
    ".conf",

    ".sql",
    ".prisma",
    ".graphql",
    ".gql",
    ".proto",

    ".html",
    ".css",
    ".scss",
    ".sass",

    ".md",

    ".sh",
    ".bash",
    ".bat",
    ".cmd",
    ".ps1"
)

# Files without useful extensions, plus important special files
$includeNames = @(
    "Dockerfile",
    "Dockerfile.dev",
    "Dockerfile.prod",
    "Makefile",
    "Procfile",

    ".gitignore",
    ".dockerignore",

    ".env.example",
    ".env.template",

    "README",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "SYSTEM_GUIDE.md",

    "requirements.txt",
    "requirements-dev.txt",
    "requirements-test.txt"
)

# Directories that should NOT be exported
$excludeDirs = @(
    "node_modules",
    ".git",
    ".expo",
    ".next",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".cache",
    ".turbo",
    ".gradle",
    ".idea",
    ".dart_tool",
    "Pods",
    "DerivedData",
    "target",
    "venv",
    ".venv",
    "env",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".parcel-cache",
    ".vite",
    "vendor"
)

# Files that should NOT be exported
$excludeNames = @(
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",

    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",

    "project-structure.txt"
)

# Binary/generated file extensions to skip
$excludeExtensions = @(
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".tiff",

    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",

    ".onnx",
    ".pt",
    ".pth",
    ".bin",
    ".so",
    ".dll",
    ".dylib",

    ".zip",
    ".7z",
    ".rar",
    ".tar",
    ".gz",

    ".woff",
    ".woff2",
    ".ttf",
    ".otf",

    ".map",
    ".pyc",
    ".class"
)

function Test-ExcludedPath {
    param (
        [string]$Path
    )

    $parts = $Path -split '[\\/]'

    foreach ($excluded in $excludeDirs) {
        if ($parts -contains $excluded) {
            return $true
        }
    }

    return $false
}

foreach ($folder in $folders) {

    if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
        Write-Warning "Folder not found: $folder"
        continue
    }

    $folderName = Split-Path $folder -Leaf
    $outputFile = Join-Path (Get-Location) "$folderName-code.txt"

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "Processing: $folder"
    Write-Host "Output:    $outputFile"
    Write-Host "============================================================"

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $writer = New-Object System.IO.StreamWriter($outputFile, $false, $utf8NoBom)

    try {

        $writer.WriteLine("============================================================")
        $writer.WriteLine("PROJECT CODE EXPORT")
        $writer.WriteLine("Folder: $folder")
        $writer.WriteLine("Generated: $(Get-Date)")
        $writer.WriteLine("============================================================")
        $writer.WriteLine("")

        $files = Get-ChildItem `
            -LiteralPath $folder `
            -Recurse `
            -File `
            -Force `
            -ErrorAction SilentlyContinue |
            Where-Object {

                # Skip excluded directories
                -not (Test-ExcludedPath $_.FullName) -and

                # Skip explicitly excluded filenames
                ($excludeNames -notcontains $_.Name) -and

                # Skip binary/generated extensions
                ($excludeExtensions -notcontains $_.Extension.ToLowerInvariant()) -and

                # Include useful extensions OR special filenames
                (
                    ($includeExtensions -contains $_.Extension.ToLowerInvariant()) -or
                    ($includeNames -contains $_.Name)
                )
            } |
            Sort-Object FullName

        $count = 0

        foreach ($file in $files) {

            $count++

            # Create readable relative path
            $relativePath = $file.FullName.Substring(
                (Resolve-Path $folder).Path.Length
            ).TrimStart('\','/')

            Write-Host "[$count] $relativePath"

            $writer.WriteLine("")
            $writer.WriteLine("")
            $writer.WriteLine("############################################################")
            $writer.WriteLine("# FILE: $relativePath")
            $writer.WriteLine("############################################################")
            $writer.WriteLine("")

            try {

                $content = [System.IO.File]::ReadAllText(
                    $file.FullName,
                    [System.Text.Encoding]::UTF8
                )

                $writer.WriteLine($content)

            }
            catch {

                $writer.WriteLine("[Could not read file: $($_.Exception.Message)]")

            }

        }

        $writer.WriteLine("")
        $writer.WriteLine("")
        $writer.WriteLine("============================================================")
        $writer.WriteLine("END OF EXPORT")
        $writer.WriteLine("Total files exported: $count")
        $writer.WriteLine("============================================================")

    }
    finally {
        $writer.Dispose()
    }

    Write-Host ""
    Write-Host "DONE: $outputFile" -ForegroundColor Green
    Write-Host "Files exported: $count" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "============================================================"
Write-Host "ALL EXPORTS COMPLETE"
Write-Host "============================================================"
Write-Host ""
Write-Host "Created files:"
Write-Host "  backend-code.txt"
Write-Host "  ml-service-code.txt"
Write-Host "  ml-worker-code.txt"
Write-Host "  mobile-student-code.txt"
Write-Host "  mobile-teacher-code.txt"
Write-Host "  web-admin-code.txt"
Write-Host "  scripts-code.txt"
Write-Host ""